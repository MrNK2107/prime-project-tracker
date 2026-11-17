export type UserRole = "student" | "faculty" | "admin" | "principal";

const HOME: Record<UserRole, string> = {
  student: "/student",
  faculty: "/faculty",
  admin: "/admin",
  principal: "/overview",
};

export function homeFor(role: UserRole): string {
  return HOME[role];
}

const PUBLIC_PATHS = ["/login", "/auth/callback"];

function inSection(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(section + "/");
}

/**
 * Where a request should be redirected, or null to let it through. Optimistic check only:
 * the database (RLS) is what actually enforces access.
 */
export function resolveRedirect(pathname: string, session: { role: UserRole } | null): string | null {
  if (!session) {
    return PUBLIC_PATHS.some((p) => inSection(pathname, p)) ? null : "/login";
  }
  const home = HOME[session.role];
  if (pathname === "/" || inSection(pathname, "/login")) return home;
  if (inSection(pathname, "/auth/callback")) return null;
  if (inSection(pathname, home)) return null;
  // Shared read-only pages: the principal and admin read everything; faculty read their own students.
  if (session.role !== "student" && inSection(pathname, "/students")) return null;
  // The admin also reads the school-wide overview.
  if (session.role === "admin" && inSection(pathname, "/overview")) return null;
  return home;
}

/** True when the address belongs to the single allowed college domain (exact match). */
export function isAllowedEmail(email: string, domain: string | undefined): boolean {
  if (!domain) return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0]) return false;
  return parts[1] === domain.trim().toLowerCase().replace(/^@/, "");
}
