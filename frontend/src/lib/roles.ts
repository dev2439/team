export type AppRole = "Member" | "SubBoss" | "BigBoss";

const MEMBER_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid",
  "/dashboard/report",
  "/dashboard/financial",
  "/dashboard/deposit",
  "/dashboard/settings",
] as const;

const SUB_BOSS_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid",
  "/dashboard/report",
  "/dashboard/financial",
  "/dashboard/deposit",
  "/dashboard/settings",
] as const;

const BIG_BOSS_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/team-bid",
  "/dashboard/team-report",
  "/dashboard/financial",
  "/dashboard/plan",
  "/dashboard/users",
  "/dashboard/settings",
] as const;

export function getNavHrefsForRole(role: string): readonly string[] {
  if (role === "BigBoss") return BIG_BOSS_NAV_HREFS;
  if (role === "SubBoss") return SUB_BOSS_NAV_HREFS;
  return MEMBER_NAV_HREFS;
}

export function canAccessPath(role: string, pathname: string): boolean {
  const allowed = getNavHrefsForRole(role);
  return allowed.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export function getDefaultDashboardPath(role: string): string {
  return getNavHrefsForRole(role)[0] ?? "/dashboard/overview";
}
