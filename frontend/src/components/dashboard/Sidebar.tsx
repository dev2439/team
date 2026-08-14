"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavHrefsForRole } from "@/lib/roles";

const NAV_ITEMS = [
  { href: "/dashboard/overview", label: "Overview" },
  { href: "/dashboard/bid", label: "Bid" },
  { href: "/dashboard/team-bid", label: "Team Bid" },
  { href: "/dashboard/report", label: "Report" },
  { href: "/dashboard/team-report", label: "Team Report" },
  { href: "/dashboard/financial", label: "Financial" },
  { href: "/dashboard/deposit", label: "Deposit" },
  { href: "/dashboard/my-projects", label: "My Projects" },
  { href: "/dashboard/eta", label: "ETA" },
  { href: "/dashboard/plan", label: "Plan" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

type SidebarProps = {
  userName: string;
  userRole: string;
  userEmail: string;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  userName,
  userRole,
  userEmail,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const allowedHrefs = new Set(getNavHrefsForRole(userRole));
  const navItems = NAV_ITEMS.filter((item) => allowedHrefs.has(item.href));

  return (
    <>
      <div
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-[#0f172a] text-slate-100 transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link
            href="/dashboard/overview"
            onClick={onCloseMobile}
            className="text-xl font-semibold tracking-tight text-white"
          >
            Team
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10 lg:hidden"
          >
            Close
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-slate-300 hover:bg-white/8 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="truncate text-xs text-slate-400">{userEmail}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              {userRole}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
