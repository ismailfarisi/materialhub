import { AppDataSource } from "@materialhub/database";
import {
  type AccessJwtSigner,
  type UserRole,
  loadActiveMemberships,
  signAccessToken,
} from "@materialhub/guards";

interface UserLite {
  id: string;
  email: string;
  role: UserRole | string;
}

export async function issueAccessToken(
  accessJwt: AccessJwtSigner,
  user: UserLite,
): Promise<string> {
  const [tvRows, memberships] = await Promise.all([
    AppDataSource.query("SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL", [
      user.id,
    ]) as Promise<Array<{ token_version: number }>>,
    loadActiveMemberships(user.id),
  ]);
  const tv = tvRows[0]?.token_version ?? 1;
  return signAccessToken(accessJwt, {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    token_version: tv,
    memberships,
  });
}
