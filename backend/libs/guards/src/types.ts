// Leaf module for shared auth types. Kept dependency-free so the guard
// implementation files (jwt-auth, token-helpers, bulk-job-access) can import
// these WITHOUT importing the ./index.ts barrel — importing the barrel from a
// file the barrel re-exports creates a load-order circular import that surfaces
// as "Export named 'jwtAuth' not found" when bun loads a whole suite at once.

export type UserRole = "super_admin" | "admin" | "customer" | "guest";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
