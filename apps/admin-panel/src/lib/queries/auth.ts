import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, clearAccessTokenCookie } from "../api";
import { useAuthStore } from "@/stores/auth";

export function clearAuthSession(queryClient: QueryClient) {
  // Drop the access-token cookie first so the useMe refetch triggered by
  // queryClient.clear() can't re-authenticate against a stale token.
  clearAccessTokenCookie();
  useAuthStore.getState().logout();
  queryClient.clear();
}

export function useMe(enabled = true) {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.data.user);
        return data.data.user;
      } catch (error) {
        // Clear loading state on failure so guards can redirect
        logout();
        throw error;
      }
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

/** Only platform staff may use the admin panel. */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

export const NO_ADMIN_ACCESS_MESSAGE = "This account doesn't have admin access.";

/** Thrown when valid credentials belong to an account that isn't platform staff. */
export class NoAdminAccessError extends Error {
  constructor() {
    super(NO_ADMIN_ACCESS_MESSAGE);
    this.name = "NoAdminAccessError";
  }
}

/** Drop the session the login just created (server cookies + local cookie). */
async function endNonAdminSession(): Promise<never> {
  try {
    await api.post("/auth/logout", {});
  } catch {
    // Best effort: the local cookie is cleared below either way.
  }
  clearAccessTokenCookie();
  throw new NoAdminAccessError();
}

/** Readable message for a failed login / 2FA step. */
export function loginErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NoAdminAccessError) return error.message;
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  return typeof message === "string" && message ? message : fallback;
}

/** The 2FA challenge is single-use and short-lived; once it's gone the user must sign in again. */
export function isExpiredTwoFactorChallenge(error: unknown): boolean {
  return (
    (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code ===
    "INVALID_2FA_CHALLENGE"
  );
}

type AdminUser = NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>;
export type LoginResult =
  | { requires_2fa: true; challenge_token: string; user?: undefined }
  | { requires_2fa?: false; user: AdminUser };

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }): Promise<LoginResult> => {
      const { data } = await api.post("/auth/login", credentials);
      const result = data.data;
      if (result?.requires_2fa) {
        return { requires_2fa: true, challenge_token: result.challenge_token };
      }
      // Check the role before anything marks the session as signed in, so a
      // customer or vendor account never reaches the dashboard shell.
      if (!isAdminRole(result?.user?.role)) await endNonAdminSession();
      return { user: result.user };
    },
    onSuccess: (data) => {
      // Set user in store immediately so navigation guards see authenticated state
      if (data.user) {
        setUser(data.user);
        queryClient.setQueryData(["auth", "me"], data.user);
      }
    },
  });
}

/** Second login step: a TOTP code or a backup code for the challenge from /auth/login. */
export function useVerifyTwoFactor() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vals: {
      challenge_token: string;
      code: string;
      method: "totp" | "backup";
    }): Promise<AdminUser> => {
      const path = vals.method === "backup" ? "/auth/2fa/backup-verify" : "/auth/2fa/login-verify";
      await api.post(path, { challenge_token: vals.challenge_token, code: vals.code });
      // The verify endpoints set the session cookies but don't return the user.
      const { data } = await api.get("/auth/me");
      const user = data.data.user as AdminUser;
      if (!isAdminRole(user?.role)) await endNonAdminSession();
      return user;
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(["auth", "me"], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout", {});
    },
    onSettled: () => {
      clearAuthSession(queryClient);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (vals: { current_password: string; new_password: string }) => {
      const { data } = await api.post("/auth/change-password", vals);
      return data.data;
    },
  });
}
