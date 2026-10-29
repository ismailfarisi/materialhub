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

export function useLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await api.post("/auth/login", credentials);
      return data.data;
    },
    onSuccess: (data) => {
      // Set user in store immediately so navigation guards see authenticated state
      if (data?.user) {
        setUser(data.user);
      }
      queryClient.setQueryData(["auth", "me"], data?.user);
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
