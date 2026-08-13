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
  fetchUnreadBidNotifications,
  markBidNotificationsRead,
  type BidNotification,
} from "@/lib/notifications";
import { canAccessPath, getDefaultDashboardPath } from "@/lib/roles";

const NOTIFICATION_POLL_MS = 5000;

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
    const desktop = new Notification(title, {
      body,
      tag: options.tag,
      renotify: true,
      requireInteraction: false,
    });

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

function showDesktopBidNotification(
  alert: BidNotification,
  extraCount: number,
  onOpen: () => void,
): boolean {
  const body =
    extraCount > 0
      ? `${alert.actor_name} submitted a new bid (+${extraCount} more).`
      : `${alert.actor_name} submitted a new bid.`;

  return showDesktopNotification("New bid", body, {
    tag: `bid-alert-${alert.id}`,
    onOpen,
  });
}

function bidAlertPathForRole(role: string): string {
  return role === "BigBoss" ? "/dashboard/team-bid" : "/dashboard/bid";
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bidAlerts, setBidAlerts] = useState<BidNotification[]>([]);
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [desktopHint, setDesktopHint] = useState<string | null>(null);
  const desktopNotifiedIds = useRef(new Set<number>());
  /** IDs already present on first successful poll — do not desktop-notify these. */
  const preloadNotificationIds = useRef<Set<number> | null>(null);

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

      // First successful poll: remember existing IDs so refresh does not spam.
      if (preloadNotificationIds.current == null) {
        preloadNotificationIds.current = new Set(mine.map((item) => item.id));
        for (const item of mine) {
          desktopNotifiedIds.current.add(item.id);
        }
        return;
      }

      const fresh = mine.filter(
        (item) =>
          !desktopNotifiedIds.current.has(item.id) &&
          !preloadNotificationIds.current?.has(item.id),
      );
      for (const item of fresh) {
        desktopNotifiedIds.current.add(item.id);
      }

      if (
        fresh.length > 0 &&
        isSecureNotificationContext() &&
        Notification.permission === "granted"
      ) {
        const latest = fresh[0]!;
        showDesktopBidNotification(latest, fresh.length - 1, () => {
          go(bidAlertPathForRole(user.role), router);
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
    void pollBidNotifications();
    const timer = window.setInterval(() => {
      void pollBidNotifications();
    }, NOTIFICATION_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
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
    const ids = bidAlerts.map((item) => item.id);
    setBidAlerts([]);
    if (ids.length === 0) return;
    try {
      await markBidNotificationsRead(ids);
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
    <div className="flex min-h-full flex-1 bg-[#f4f6f8]">
      <Sidebar
        userName={user.name}
        userRole={user.role}
        userEmail={user.email}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 lg:hidden"
          >
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              Welcome, {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.role}</p>
          </div>
          <ThemeToggle className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-slate-50" />
          {showDesktopEnableButton && (
            <button
              type="button"
              onClick={() => {
                void enableDesktopNotifications();
              }}
              className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
            >
              Enable desktop alerts
            </button>
          )}
        </header>

        {desktopHint && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:px-8">
            <p className="min-w-0 flex-1">{desktopHint}</p>
            {!isSecureNotificationContext() && (
              <a
                href={httpsAppUrl()}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-950 hover:bg-amber-100"
              >
                Open HTTPS
              </a>
            )}
          </div>
        )}

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {latestAlert && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-sky-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                New bid
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {latestAlert.actor_name} submitted a new bid
                {bidAlerts.length > 1 ? ` (+${bidAlerts.length - 1} more)` : ""}.
              </p>
              {showDesktopEnableButton && (
                <button
                  type="button"
                  onClick={() => {
                    void enableDesktopNotifications();
                  }}
                  className="mt-2 text-xs font-medium text-sky-700 hover:text-sky-800"
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
                  go(bidAlertPathForRole(user.role), router);
                }}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => {
                  void dismissBidAlerts();
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
