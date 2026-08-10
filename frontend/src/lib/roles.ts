export type AppRole = "Member" | "SubBoss" | "BigBoss";

export const MEMBER_NAV_HREFS = [
  "/dashboard/overview",
  "/dashboard/bid",
  "/dashboard/report",
  "/dashboard/financial",
  "/dashboard/settings",
] as const;

export function isMemberRole(role: string): boolean {
  return role === "Member";
}

export function canAccessUsersPage(role: string): boolean {
  return role === "SubBoss" || role === "BigBoss";
}

export function canAccessTargetSettings(role: string): boolean {
  return role === "SubBoss" || role === "BigBoss";
}
