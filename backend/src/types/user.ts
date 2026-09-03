export const USER_ROLES = ["Member", "SubBoss", "BigBoss", "Tester"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type User = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  balance: number;
  phone: string;
  job_title: string;
  location: string;
  bio: string;
  birthday: string | null;
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
