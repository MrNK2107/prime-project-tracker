import type { UserRole } from "@/lib/routing";

export type NavItem = { href: string; label: string; icon: "inbox" | "check" | "plus" | "review" | "users" | "link" | "chart" | "list" | "years" };

/** Primary navigation per role. Paths beyond each role's home are added as Tasks 8 to 11 land. */
export const NAV: Record<UserRole, NavItem[]> = {
  student: [{ href: "/student", label: "My items", icon: "inbox" }],
  faculty: [
    { href: "/faculty", label: "Items", icon: "list" },
    { href: "/faculty/review", label: "Review", icon: "review" },
    { href: "/students", label: "Students", icon: "users" },
  ],
  admin: [
    { href: "/admin", label: "Accounts", icon: "users" },
    { href: "/admin/links", label: "Links", icon: "link" },
    { href: "/admin/years", label: "Years", icon: "years" },
    { href: "/students", label: "Students", icon: "inbox" },
    { href: "/overview", label: "Overview", icon: "chart" },
  ],
  principal: [
    { href: "/overview", label: "Overview", icon: "chart" },
    { href: "/students", label: "Students", icon: "users" },
  ],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  student: "Student",
  faculty: "Faculty",
  admin: "Admin",
  principal: "Principal",
};
