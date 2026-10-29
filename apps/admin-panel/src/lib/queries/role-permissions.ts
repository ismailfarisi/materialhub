import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Role } from "../permissions";

interface MatrixResponse {
  matrix: Record<Role, string[]>;
  catalog: string[];
  lastUpdatedAt: string | null;
  lastUpdatedBy: { userId: string; name: string } | null;
}

export function useRolePermissionsMatrix() {
  return useQuery<MatrixResponse>({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const res = await api.get<{ data: MatrixResponse }>("/admin/role-permissions");
      return res.data.data;
    },
  });
}

export function useUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { role: Role; permissions: string[] }) => {
      await api.put(`/admin/role-permissions/${input.role}`, {
        permissions: input.permissions,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-permissions"] }),
  });
}
