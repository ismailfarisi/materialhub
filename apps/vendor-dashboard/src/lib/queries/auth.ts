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
        logout();
        throw error;
      }
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await api.post("/auth/login", credentials);
      return data.data;
    },
    onSuccess: (data) => {
      if (data?.user) {
        setUser(data.user);
      }
      queryClient.setQueryData(["auth", "me"], data?.user);
    },
  });
}

/** The 2FA challenge is single-use and short-lived; once it's gone the user must sign in again. */
export function isExpiredTwoFactorChallenge(error: unknown): boolean {
  return (
    (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code ===
    "INVALID_2FA_CHALLENGE"
  );
}

export function twoFactorVerifyPath(method: "totp" | "backup"): string {
  return method === "backup" ? "/auth/2fa/backup-verify" : "/auth/2fa/login-verify";
}

/** Second login step: a TOTP code or a backup code for the challenge from /auth/login. */
export function useVerifyTwoFactor() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vals: { challenge_token: string; code: string; method: "totp" | "backup" }) => {
      await api.post(twoFactorVerifyPath(vals.method), {
        challenge_token: vals.challenge_token,
        code: vals.code,
      });
      // The verify endpoints set the session cookies but don't return the user.
      const { data } = await api.get("/auth/me");
      return data.data.user;
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
