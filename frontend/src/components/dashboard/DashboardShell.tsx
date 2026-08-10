"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchCurrentUser,
  getToken,
  logout,
  type PublicUser,
} from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { isMemberRole, MEMBER_NAV_HREFS } from "@/lib/roles";

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const currentUser = await fetchCurrentUser(token);
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
      setLoading(false);
    }

    void load();
  }, [router]);

  useEffect(() => {
    if (!user || !isMemberRole(user.role)) return;

    const allowed = (MEMBER_NAV_HREFS as readonly string[]).some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    );

    if (!allowed) {
      router.replace("/dashboard/overview");
    }
  }, [user, pathname, router]);

  function onLogout() {
    logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#f4f6f8] px-6">
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      </div>
    );
  }

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
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              Welcome, {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.role}</p>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
