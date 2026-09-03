"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALL_NAV_ITEMS, getNavHrefsForRole } from "@/lib/roles";

type SidebarProps = {
  userName: string;
  userRole: string;
  userEmail: string;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navInitial(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function Sidebar({
  userName,
  userRole,
  userEmail,
  onLogout,
  mobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const allowedHrefs = new Set(getNavHrefsForRole(userRole));
  const navItems = ALL_NAV_ITEMS.filter((item) => allowedHrefs.has(item.href));

  return (
    <>
      <div
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px] transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
      />

      <aside
        className={`sidebar-panel fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 text-slate-100 transition-[width,transform] duration-300 ease-out ${
          collapsed ? "lg:w-16" : "lg:w-64"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-white/10 ${
            collapsed ? "justify-center px-1" : "justify-between gap-2 px-4"
          }`}
        >
          {!collapsed ? (
            <Link
              href="/dashboard/overview"
              onClick={onCloseMobile}
              className="sidebar-brand min-w-0 truncate text-xl font-semibold tracking-tight"
            >
              Team
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10 lg:hidden"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-slate-200 shadow-sm transition hover:bg-white/10 lg:inline-flex"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>

        <nav
          className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3 ${
            collapsed ? "px-1.5" : "px-3"
          }`}
        >
          {navItems.map((item, index) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                title={item.label}
                style={{ animationDelay: `${index * 36}ms` }}
                className={`nav-enter rounded-xl text-sm font-medium transition ${
                  collapsed
                    ? "flex items-center justify-center px-0 py-2.5"
                    : "px-3 py-2.5"
                } ${
                  active
                    ? "sidebar-nav-active text-white"
                    : "border-l-2 border-transparent text-slate-300 hover:bg-white/8 hover:text-white"
                }`}
              >
                {collapsed ? (
                  <span className="text-[11px] font-semibold tracking-wide">
                    {navInitial(item.label)}
                  </span>
                ) : (
                  item.label
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={`shrink-0 border-t border-white/10 bg-black/20 backdrop-blur-sm ${
            collapsed ? "p-2" : "p-4"
          }`}
        >
          {!collapsed ? (
            <>
              <div className="mb-3">
                <p className="truncate text-sm font-medium text-white">
                  {userName}
                </p>
                <p className="truncate text-xs text-slate-400">{userEmail}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  {userRole}
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:bg-white/10"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-semibold text-slate-200 shadow-sm transition hover:bg-white/10"
            >
              Out
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      {collapsed ? (
        <path d="M9 6l6 6-6 6M4 5v14" />
      ) : (
        <path d="M15 6l-6 6 6 6M20 5v14" />
      )}
    </svg>
  );
}
