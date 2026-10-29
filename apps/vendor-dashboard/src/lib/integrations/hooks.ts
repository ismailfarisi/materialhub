import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Delivery, type Integration, type Mapping, integrationsApi } from "./api";
import type { Direction, EventType, MappingSpec } from "./spec-types";

const KEYS = {
  all: ["vendor", "integrations"] as const,
  list: () => [...KEYS.all, "list"] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  mappings: (id: string) => [...KEYS.all, "mappings", id] as const,
  sourceSchema: (id: string, eventType: string) =>
    [...KEYS.all, "source-schema", id, eventType] as const,
  deliveries: (id: string, params?: Record<string, unknown>) =>
    [...KEYS.all, "deliveries", id, params ?? {}] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: integrationsApi.list,
    staleTime: 30_000,
  });
}

export function useIntegration(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => integrationsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; outbound_url?: string }) =>
      integrationsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  });
}

export function useUpdateIntegration(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<
        Pick<
          Integration,
          | "name"
          | "outbound_url"
          | "inbound_ip_allowlist"
          | "inventory_authority"
          | "pricing_authority"
          | "is_active"
        >
      >,
    ) => integrationsApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  });
}

export function useRotateSecret(id: string) {
  return useMutation({
    mutationFn: (direction: "outbound" | "inbound") => integrationsApi.rotateSecret(id, direction),
  });
}

export function useMappings(id: string) {
  return useQuery({
    queryKey: KEYS.mappings(id),
    queryFn: () => integrationsApi.listMappings(id),
    enabled: !!id,
  });
}

export function useUpsertMapping(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      direction,
      event_type,
      spec,
      is_enabled,
    }: {
      direction: Direction;
      event_type: EventType;
      spec: MappingSpec;
      is_enabled?: boolean;
    }) => integrationsApi.upsertMapping(id, direction, event_type, { spec, is_enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.mappings(id) }),
  });
}

export function useSourceSchema(id: string, eventType: string | null) {
  return useQuery({
    queryKey: KEYS.sourceSchema(id, eventType ?? ""),
    queryFn: () => integrationsApi.getSourceSchema(id, eventType as string),
    enabled: !!id && !!eventType,
  });
}

export function useDeliveries(
  id: string,
  params?: {
    event_type?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  },
) {
  return useQuery({
    queryKey: KEYS.deliveries(id, params as Record<string, unknown> | undefined),
    queryFn: () => integrationsApi.listDeliveries(id, params),
    enabled: !!id,
  });
}

export function useTestFire(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      event_type: EventType | string;
      sample_payload?: unknown;
    }) => integrationsApi.testFire(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.deliveries(id) }),
  });
}

export type { Integration, Mapping, Delivery };
