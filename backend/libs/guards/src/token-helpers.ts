import { AppDataSource } from "@materialhub/database";
import type { UserRole } from "./types.ts";

export interface AccessJwtSigner {
  // biome-ignore lint/suspicious/noExplicitAny: structural compat with @elysiajs/jwt's typed sign
  sign: (payload: any) => Promise<string>;
}

export interface VendorMembershipClaim {
  vid: string;
  r: "owner" | "manager" | "staff" | "viewer";
}

export interface SignAccessTokenInput {
  id: string;
  email: string;
  role: UserRole;
  token_version: number;
  memberships: VendorMembershipClaim[];
}

interface MinimalDataSource {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

let dataSourceOverride: MinimalDataSource | null = null;

function ds(): MinimalDataSource {
  return dataSourceOverride ?? (AppDataSource as unknown as MinimalDataSource);
}

export async function signAccessToken(
  jwt: AccessJwtSigner,
  input: SignAccessTokenInput,
): Promise<string> {
  const payload: Record<string, unknown> = {
    sub: input.id,
    email: input.email,
    role: input.role,
    tv: input.token_version,
  };
  if (input.memberships.length > 0) {
    payload.vm = input.memberships;
  }
  return jwt.sign(payload);
}

export async function loadActiveMemberships(userId: string): Promise<VendorMembershipClaim[]> {
  const rows = (await ds().query(
    `SELECT vendor_id, role
     FROM vendor_members
     WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL`,
    [userId],
  )) as Array<{ vendor_id: string; role: string }>;
  return rows.map((r) => ({
    vid: r.vendor_id,
    r: r.role as VendorMembershipClaim["r"],
  }));
}

export function __setDataSourceForTests(d: MinimalDataSource | null): void {
  dataSourceOverride = d;
}
