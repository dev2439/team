"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchCurrentUser,
  getToken,
  logout,
  type PublicUser,
} from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  alertPathForNotification,
  fetchUnreadBidNotifications,
  markBidNotificationsRead,
  notificationKey,
  type BidNotification,
} from "@/lib/notifications";
import { canAccessPath, getDefaultDashboardPath } from "@/lib/roles";
import { startBackgroundPoll } from "@/lib/poll";

const NOTIFICATION_POLL_MS = 10_000;

function go(path: string, router: ReturnType<typeof useRouter>) {
  router.replace(path);
  window.setTimeout(() => {
    if (window.location.pathname !== path) {
      window.location.replace(path);
    }
  }, 250);
}

function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function isSecureNotificationContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

function httpsAppUrl(): string {
  const { hostname, port, pathname, search, hash } = window.location;
  const nextPort = port && port !== "80" && port !== "443" ? port : "3000";
  return `https://${hostname}:${nextPort}${pathname}${search}${hash}`;
}

/** Ask the browser to show the Allow / Block notification dialog. */
async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  try {
    const result = Notification.requestPermission();
    if (typeof result === "string") {
      return result;
    }
    return await result;
  } catch {
    return Notification.permission;
  }
}

function showDesktopNotification(
  title: string,
  body: string,
  options: {
    tag?: string;
    onOpen?: () => void;
  } = {},
): boolean {
  if (!desktopNotificationsSupported()) return false;
  if (!isSecureNotificationContext()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const tabHidden =
      typeof document !== "undefined" && document.visibilityState === "hidden";
    const notificationOptions = {
      body,
      tag: options.tag,
      renotify: true,
      requireInteraction: tabHidden,
    } as NotificationOptions;
    const desktop = new Notification(title, notificationOptions);

    desktop.onclick = () => {
      window.focus();
      options.onOpen?.();
      desktop.close();
    };
    return true;
  } catch {
    return false;
  }
}

function alertCopy(alert: BidNotification): { title: string; action: string } {
  if (alert.kind === "bid_test") {
    return {
      title: "New bid test",
      action: "submitted a new bid test",
    };
  }
  if (alert.kind === "event") {
    const title = alert.event_title.trim() || "an event";
    return {
      title: "Event starts in 30 minutes",
      action: `scheduled “${title}” — starts in 30 minutes`,
    };
  }
  if (alert.kind === "birthday") {
    return {
      title: "Birthday today (JST)",
      action: "has a birthday today",
    };
  }
  return {
    title: "New bid",
    action: "submitted a new bid",
  };
}

function showDesktopBidNotification(
  alert: BidNotification,
  extraCount: number,
  onOpen: () => void,
): boolean {
  const copy = alertCopy(alert);
  const body =
    extraCount > 0
      ? `${alert.actor_name} ${copy.action} (+${extraCount} more).`
      : `${alert.actor_name} ${copy.action}.`;

  return showDesktopNotification(copy.title, body, {
    tag: `alert-${notificationKey(alert)}`,
    onOpen,
  });
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bidAlerts, setBidAlerts] = useState<BidNotification[]>([]);
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [desktopHint, setDesktopHint] = useState<string | null>(null);
  const desktopNotifiedIds = useRef(new Set<string>());
  /** Keys already present on first successful poll — do not desktop-notify these. */
  const preloadNotificationIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    async function load() {
      const token = getToken();
      if (!token) {
        go("/login", router);
        return;
      }

      const currentUser = await fetchCurrentUser(token);
      if (!currentUser) {
        go("/login", router);
        return;
      }

      setUser(currentUser);
      setLoading(false);
    }

    void load();
  }, [router]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("team.sidebarCollapsed");
      if (saved === "1") setSidebarCollapsed(true);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dashboard-scroll-lock");
    document.body.classList.add("dashboard-scroll-lock");
    return () => {
      root.classList.remove("dashboard-scroll-lock");
      document.body.classList.remove("dashboard-scroll-lock");
    };
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("team.sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  useEffect(() => {
    if (!isSecureNotificationContext() || !desktopNotificationsSupported()) {
      setDesktopPermission("unsupported");
      return;
    }
    setDesktopPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      go(getDefaultDashboardPath(user.role), router);
      return;
    }
    if (!canAccessPath(user.role, pathname)) {
      go(getDefaultDashboardPath(user.role), router);
    }
  }, [user, pathname, router]);

  const pollBidNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchUnreadBidNotifications();
      const mine = data.recipient_user_ids.includes(user.id)
        ? data.notifications.filter(
            (item) => item.recipient_user_id === user.id,
          )
        : [];
      setBidAlerts(mine);

      // First successful poll: remember existing keys so refresh does not spam.
      if (preloadNotificationIds.current == null) {
        preloadNotificationIds.current = new Set(
          mine.map((item) => notificationKey(item)),
        );
        for (const item of mine) {
          desktopNotifiedIds.current.add(notificationKey(item));
        }
        return;
      }

      const fresh = mine.filter(
        (item) =>
          !desktopNotifiedIds.current.has(notificationKey(item)) &&
          !preloadNotificationIds.current?.has(notificationKey(item)),
      );
      for (const item of fresh) {
        desktopNotifiedIds.current.add(notificationKey(item));
      }

      if (
        fresh.length > 0 &&
        isSecureNotificationContext() &&
        Notification.permission === "granted"
      ) {
        const latest = fresh[0]!;
        showDesktopBidNotification(latest, fresh.length - 1, () => {
          go(alertPathForNotification(latest, user.role), router);
        });
      }
    } catch {
      // Ignore transient poll errors while signed in.
    }
  }, [user, router]);

  useEffect(() => {
    if (!user) return;

    preloadNotificationIds.current = null;
    desktopNotifiedIds.current = new Set();
    return startBackgroundPoll(
      () => pollBidNotifications(),
      NOTIFICATION_POLL_MS,
      { pollWhenHidden: true },
    );
  }, [user, pollBidNotifications]);

  async function enableDesktopNotifications() {
    setDesktopHint(null);

    // Browsers never show Allow/Block on plain http:// LAN IPs.
    if (!isSecureNotificationContext()) {
      setDesktopPermission("unsupported");
      const secureUrl = httpsAppUrl();
      setDesktopHint(
        `Desktop alerts need HTTPS. Open ${secureUrl}, accept the certificate warning, then click Enable desktop alerts again.`,
      );
      return;
    }

    if (!desktopNotificationsSupported()) {
      setDesktopPermission("unsupported");
      setDesktopHint(
        "This browser does not support desktop notifications on this page.",
      );
      return;
    }

    // Always call from this click so the browser shows Allow / Block.
    const permission = await requestBrowserNotificationPermission();
    setDesktopPermission(permission);

    if (permission === "granted") {
      const shown = showDesktopNotification(
        "Desktop alerts enabled",
        "You will get a desktop notification when a new bid is submitted.",
        { tag: "bid-alerts-enabled" },
      );
      setDesktopHint(
        shown
          ? "Desktop alerts enabled. A test notification was sent."
          : "Permission granted, but the browser blocked showing a notification. Check OS notification settings for this browser.",
      );
      window.setTimeout(() => setDesktopHint(null), 4000);
      return;
    }

    if (permission === "denied") {
      setDesktopHint(
        "Notifications are blocked for this site. Open the lock/info icon next to the URL → Site settings → Notifications → Allow, then click the button again.",
      );
      return;
    }

    setDesktopHint("Choose Allow in the browser prompt.");
  }

  async function dismissBidAlerts() {
    const items = bidAlerts.map((item) => ({
      id: item.id,
      kind: item.kind,
    }));
    setBidAlerts([]);
    if (items.length === 0) return;
    try {
      await markBidNotificationsRead(items);
    } catch {
      // Keep UI dismissed even if mark-read fails; next poll can retry.
    }
  }

  function onLogout() {
    logout();
    go("/login", router);
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#f4f6f8] px-6">
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      </div>
    );
  }

  if (!canAccessPath(user.role, pathname) && pathname !== "/dashboard") {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#f4f6f8] px-6">
        <p className="text-sm text-slate-500">Redirecting…</p>
      </div>
    );
  }

  const latestAlert = bidAlerts[0] ?? null;
  // Show when not set (default), blocked (denied), or unsupported — hide only when allowed.
  const showDesktopEnableButton =
    desktopPermission === "default" ||
    desktopPermission === "denied" ||
    desktopPermission === "unsupported";

  return (
    <div className="dashboard-shell flex h-dvh max-h-dvh min-h-0 overflow-hidden">
      <Sidebar
        userName={user.name}
        userRole={user.role}
        userEmail={user.email}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <div
        className={`dashboard-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-300 ease-out ${
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
        }`}
      >
        <header className="glass-header z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur lg:hidden"
          >
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              Welcome, {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.role}</p>
          </div>
          <ThemeToggle className="shrink-0" />
          {showDesktopEnableButton && (
            <button
              type="button"
              onClick={() => {
                void enableDesktopNotifications();
              }}
              className="shrink-0 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-1.5 text-xs font-medium text-sky-800 shadow-sm backdrop-blur hover:bg-sky-100"
            >
              Enable desktop alerts
            </button>
          )}
        </header>

        {desktopHint && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200/80 bg-amber-50/80 px-4 py-2 text-xs text-amber-900 backdrop-blur lg:px-8">
            <p className="min-w-0 flex-1">{desktopHint}</p>
            {!isSecureNotificationContext() && (
              <a
                href={httpsAppUrl()}
                className="shrink-0 rounded-md border border-amber-300 bg-white/80 px-2.5 py-1 font-medium text-amber-950 shadow-sm hover:bg-amber-100"
              >
                Open HTTPS
              </a>
            )}
          </div>
        )}

        <main
          key={pathname}
          className="page-enter min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>

      {latestAlert && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="alert-enter glass-alert pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-sky-200/70 px-4 py-3 dark:border-sky-400/45">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {alertCopy(latestAlert).title}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                {latestAlert.actor_name} {alertCopy(latestAlert).action}
                {bidAlerts.length > 1 ? ` (+${bidAlerts.length - 1} more)` : ""}.
              </p>
              {showDesktopEnableButton && (
                <button
                  type="button"
                  onClick={() => {
                    void enableDesktopNotifications();
                  }}
                  className="mt-2 text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Also show desktop notifications
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void dismissBidAlerts();
                  go(alertPathForNotification(latestAlert, user.role), router);
                }}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => {
                  void dismissBidAlerts();
                }}
                className="rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-600 backdrop-blur hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700/90 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
