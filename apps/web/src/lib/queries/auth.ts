import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, clearGuestSessionToken, getGuestSessionToken, isSessionGoneError, shouldProbeAuthSession } from "../api";
import { useAuthStore } from "@/stores/auth";

type QueryClient = ReturnType<typeof useQueryClient>;

async function runPostAuthEffects(
  queryClient: QueryClient,
  setUser: (user: any) => void,
  user?: any,
) {
  if (user) {
    setUser(user);
  }
  // Refetch the canonical /auth/me (the login response omits enriched
  // fields) so the store/cache carry the full user immediately after login.
  queryClient.invalidateQueries({ queryKey: ["auth", "me"] });

  // Merge the pre-login guest cart into the user's account. This is the one
  // call that needs BOTH identities: the access token (attached by the axios
  // interceptor) and the guest session it merges from. The interceptor only
  // adds `x-guest-session` when there is no access-token cookie, which is
  // never the case right after login, so it is passed explicitly here.
  const guestToken = getGuestSessionToken();
  if (guestToken) {
    const results = await Promise.allSettled([
      api.post("/cart/merge", {}, { headers: { "x-guest-session": guestToken } }),
    ]);
    // Only clear the token when the merge succeeds. If it fails, preserve the
    // token so a subsequent login/request can retry without losing the cart.
    if (results.every((r) => r.status === "fulfilled")) {
      clearGuestSessionToken();
    }
  }
  queryClient.invalidateQueries({ queryKey: ["cart"] });
}

export function useMe(enabled = true) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const logout = useAuthStore((s) => s.logout);
  // Known guests (a previous probe 401'd) skip /auth/me entirely — it can only
  // 401 again and drag a refresh-400 behind it. Anyone we haven't classified
  // yet still gets probed, so a valid refresh cookie can restore the session.
  const shouldProbe = shouldProbeAuthSession();

  useEffect(() => {
    if (enabled && !shouldProbe) logout();
  }, [enabled, shouldProbe, logout]);

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.data.user);
        return data.data.user;
      } catch (error) {
        if (isSessionGoneError(error)) {
          // Definitive: /auth/me 401'd and the interceptor's refresh failed
          // too (400 MISSING_REFRESH_TOKEN for a guest, 401 for a dead
          // session). logout() writes the guest hint so later views skip this.
          logout();
        } else {
          // Transient (network/5xx): resolve loading but keep the session
          // hint so the next load retries hydration.
          setLoading(false);
        }
        throw error;
      }
    },
    enabled: enabled && shouldProbe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }): Promise<LoginResult> => {
      const { data } = await api.post("/auth/login", credentials);
      return data.data;
    },
    onSuccess: async (data) => {
      // Accounts with two-step verification get a challenge, not a session:
      // the cart merge and /auth/me refetch wait for useVerifyTwoFactor.
      if (data?.requires_2fa) return;
      await runPostAuthEffects(queryClient, setUser, data?.user);
    },
  });
}

export type LoginResult =
  | { requires_2fa: true; challenge_token: string; user?: undefined }
  | { requires_2fa?: false; user: any };

export type TwoFactorMethod = "totp" | "backup";

export function twoFactorVerifyPath(method: TwoFactorMethod): string {
  return method === "backup" ? "/auth/2fa/backup-verify" : "/auth/2fa/login-verify";
}

/** The challenge is single-use and short-lived; once it's gone the user logs in again. */
export function isExpiredTwoFactorChallenge(error: unknown): boolean {
  return (
    (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code ===
    "INVALID_2FA_CHALLENGE"
  );
}

/** Second login step: a TOTP or backup code for the challenge returned by /auth/login. */
export function useVerifyTwoFactor() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vals: { challenge_token: string; code: string; method: TwoFactorMethod }) => {
      await api.post(twoFactorVerifyPath(vals.method), {
        challenge_token: vals.challenge_token,
        code: vals.code,
      });
      // The verify endpoints set the session cookies but don't return the user.
      const { data } = await api.get("/auth/me");
      return data.data.user;
    },
    onSuccess: async (user) => {
      await runPostAuthEffects(queryClient, setUser, user);
    },
  });
}

export function useStartPhoneAuth() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { data } = await api.post("/auth/phone/start", { phone });
      return data.data as { phone: string };
    },
  });
}

export function useVerifyPhoneAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { phone: string; code: string }) => {
      const { data } = await api.post("/auth/phone/verify", payload);
      return data.data as {
        requires_registration?: boolean;
        phone?: string;
        registration_token?: string;
        user?: any;
      };
    },
    onSuccess: async (data) => {
      if (data.user) {
        await runPostAuthEffects(queryClient, setUser, data.user);
      }
    },
  });
}

export function useRegisterPhoneAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      phone: string;
      registration_token: string;
      first_name: string;
      last_name: string;
      email: string;
    }) => {
      const { data } = await api.post("/auth/phone/register", payload);
      return data.data as { user: any };
    },
    onSuccess: async (data) => {
      await runPostAuthEffects(queryClient, setUser, data.user);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      first_name: string;
      last_name: string;
    }) => {
      const { data } = await api.post("/auth/register", payload);
      return data.data;
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Cookie-based auth: the server reads the refresh token from the cookie
      await api.post("/auth/logout", {});
    },
    onSuccess: () => {
      logout();
      queryClient.clear();
    },
  });
}
