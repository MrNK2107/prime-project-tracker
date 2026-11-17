import type { UserRole } from "@/lib/routing";

export type NavItem = { href: string; label: string; icon: "inbox" | "check" | "plus" | "review" | "users" | "link" | "chart" | "list" };

/** Primary navigation per role. Paths beyond each role's home are added as Tasks 8 to 11 land. */
export const NAV: Record<UserRole, NavItem[]> = {
  student: [{ href: "/student", label: "My items", icon: "inbox" }],
  faculty: [{ href: "/faculty", label: "Items", icon: "list" }],
  admin: [{ href: "/admin", label: "Accounts", icon: "users" }],
  principal: [{ href: "/overview", label: "Overview", icon: "chart" }],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  student: "Student",
  faculty: "Faculty",
  admin: "Admin",
  principal: "Principal",
};
