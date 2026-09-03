export type AppRole = "Member" | "SubBoss" | "BigBoss" | "Tester";

export const ALL_NAV_ITEMS = [
  { href: "/dashboard/overview", label: "Overview" },
  { href: "/dashboard/bid", label: "Bid" },
  { href: "/dashboard/freelancer", label: "Freelancer" },
  { href: "/dashboard/bid-test", label: "Bid Test" },
  { href: "/dashboard/test-bid", label: "Test Bid" },
  { href: "/dashboard/test-result", label: "Test Result" },
  { href: "/dashboard/team-bid", label: "Team Bid" },
  { href: "/dashboard/team-freelancer", label: "Team Freelancer" },
  { href: "/dashboard/report", label: "Report" },
  { href: "/dashboard/team-report", label: "Team Report" },
  { href: "/dashboard/financial", label: "Financial" },
  { href: "/dashboard/deposit", label: "Deposit" },
  { href: "/dashboard/my-projects", label: "My Projects" },
  { href: "/dashboard/eta", label: "ETA" },
  { href: "/dashboard/plan", label: "Plan" },
  { href: "/dashboard/event", label: "Event" },
  { href: "/dashboard/profile-generator", label: "Profile Generator" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

const ALL_NAV_HREFS = ALL_NAV_ITEMS.map((item) => item.href);

const MEMBER_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid",
  "/dashboard/freelancer",
  "/dashboard/test-bid",
  "/dashboard/test-result",
  "/dashboard/report",
  "/dashboard/financial",
  "/dashboard/deposit",
  "/dashboard/my-projects",
  "/dashboard/eta",
  "/dashboard/plan",
  "/dashboard/event",
  "/dashboard/profile-generator",
  "/dashboard/settings",
] as const;

const SUB_BOSS_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid",
  "/dashboard/freelancer",
  "/dashboard/test-bid",
  "/dashboard/test-result",
  "/dashboard/report",
  "/dashboard/financial",
  "/dashboard/deposit",
  "/dashboard/my-projects",
  "/dashboard/eta",
  "/dashboard/plan",
  "/dashboard/event",
  "/dashboard/profile-generator",
  "/dashboard/settings",
] as const;

const BIG_BOSS_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid-test",
  "/dashboard/test-result",
  "/dashboard/team-bid",
  "/dashboard/team-freelancer",
  "/dashboard/team-report",
  "/dashboard/financial",
  "/dashboard/eta",
  "/dashboard/plan",
  "/dashboard/event",
  "/dashboard/profile-generator",
  "/dashboard/users",
  "/dashboard/settings",
] as const;

/** Tester: same as full nav except Bid Test and Team Freelancer (BigBoss-only). */
const TESTER_NAV_HREFS = ALL_NAV_HREFS.filter(
  (href) =>
    href !== "/dashboard/bid-test" && href !== "/dashboard/team-freelancer",
);

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

export function getNavHrefsForRole(role: string): readonly string[] {
  const normalized = normalizeRole(role);
  if (normalized === "tester") return TESTER_NAV_HREFS;
  if (normalized === "bigboss") return BIG_BOSS_NAV_HREFS;
  if (normalized === "subboss") return SUB_BOSS_NAV_HREFS;
  return MEMBER_NAV_HREFS;
}

export function canAccessPath(role: string, pathname: string): boolean {
  if (normalizeRole(role) === "tester") {
    if (
      pathname === "/dashboard/bid-test" ||
      pathname.startsWith("/dashboard/bid-test/") ||
      pathname === "/dashboard/team-freelancer" ||
      pathname.startsWith("/dashboard/team-freelancer/")
    ) {
      return false;
    }
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }

  const allowed = getNavHrefsForRole(role);
  return allowed.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export function getDefaultDashboardPath(role: string): string {
  return getNavHrefsForRole(role)[0] ?? "/dashboard/overview";
}
