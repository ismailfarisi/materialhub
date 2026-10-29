import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type BeautyProfile = {
  id: string;
  user_id: string;
  skin_type: string | null;
  skin_concerns: string[] | null;
  skin_tone_depth: string | null;
  undertone: string | null;
  hair_type: string | null;
  fragrance_families: string[] | null;
  completed_at: string | null;
};

export type BeautyProfilePayload = {
  skin_type?: string | null;
  skin_concerns?: string[] | null;
  skin_tone_depth?: string | null;
  undertone?: string | null;
  hair_type?: string | null;
  fragrance_families?: string[] | null;
  completed?: boolean;
};

export function useBeautyProfile() {
  return useQuery({
    queryKey: ["beauty-profile"],
    queryFn: async () => {
      const { data } = await api.get("/auth/me/beauty-profile");
      return data.data as BeautyProfile | null;
    },
  });
}

export function useUpdateBeautyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BeautyProfilePayload) => {
      const { data } = await api.put("/auth/me/beauty-profile", payload);
      return data.data as BeautyProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beauty-profile"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
