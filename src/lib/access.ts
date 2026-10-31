// Role-based section access. Roles listed here are restricted to the given
// path prefixes (pages and the internal APIs those pages call); roles not
// listed (admin, manager, ...) see everything. Enforced in middleware and
// mirrored by the sidebar, which only shows allowed sections.

export type UserRole = "admin" | "warehouse" | "finance" | "cs" | "manager";

const ROLE_PATHS: Partial<Record<UserRole, string[]>> = {
  // CS / support accounts only work the Support board
  cs: ["/support", "/api/support"],
};

export function isPathAllowed(role: string | null | undefined, pathname: string): boolean {
  const prefixes = ROLE_PATHS[role as UserRole];
  if (!prefixes) return true;
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Where a restricted role lands by default (e.g. after login or when hitting
// a page it cannot see).
export function homePath(role: string | null | undefined): string {
  const prefixes = ROLE_PATHS[role as UserRole];
  return prefixes ? prefixes[0] : "/dashboard";
}
