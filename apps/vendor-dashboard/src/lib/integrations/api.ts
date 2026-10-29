import { api } from "../api";
import type { Direction, EventType, MappingSpec } from "./spec-types";

export interface Integration {
  id: string;
  vendor_id: string;
  name: string;
  outbound_url: string | null;
  inbound_secret_last4: string | null;
  outbound_secret_last4: string | null;
  inbound_ip_allowlist: string[];
  inventory_authority: "authoritative" | "advisory";
  pricing_authority: "authoritative" | "advisory";
  is_active: boolean;
  degraded_until: string | null;
  last_outbound_success_at: string | null;
  last_inbound_success_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrationResult extends Integration {
  inbound_secret_plaintext: string;
  outbound_secret_plaintext: string;
  inbound_url: string;
}

export interface Mapping {
  id: string;
  integration_id: string;
  event_type: EventType;
  direction: Direction;
  spec: MappingSpec;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface Delivery {
  id: string;
  integration_id: string;
  event_type: EventType;
  direction: Direction;
  status: "pending" | "delivered" | "failed" | "dlq" | "skipped";
  status_code: number | null;
  request_body: unknown;
  response_body: string | null;
  signed_headers: Record<string, string> | null;
  attempts: number;
  error_message: string | null;
  created_at: string;
}

export const integrationsApi = {
  list: async (): Promise<Integration[]> => {
    const { data } = await api.get("/vendor/integrations");
    return data.data as Integration[];
  },

  get: async (id: string): Promise<Integration> => {
    const { data } = await api.get(`/vendor/integrations/${id}`);
    return data.data as Integration;
  },

  create: async (payload: {
    name: string;
    outbound_url?: string;
  }): Promise<CreateIntegrationResult> => {
    const { data } = await api.post("/vendor/integrations", payload);
    return data.data as CreateIntegrationResult;
  },

  update: async (
    id: string,
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
  ): Promise<Integration> => {
    const { data } = await api.patch(`/vendor/integrations/${id}`, patch);
    return data.data as Integration;
  },

  remove: async (id: string): Promise<{ id: string }> => {
    const { data } = await api.delete(`/vendor/integrations/${id}`);
    return data.data as { id: string };
  },

  rotateSecret: async (
    id: string,
    direction: "outbound" | "inbound",
  ): Promise<{ plaintext: string }> => {
    const { data } = await api.post(`/vendor/integrations/${id}/rotate-secret`, { direction });
    return data.data as { plaintext: string };
  },

  listMappings: async (id: string): Promise<Mapping[]> => {
    const { data } = await api.get(`/vendor/integrations/${id}/mappings`);
    return data.data as Mapping[];
  },

  upsertMapping: async (
    id: string,
    direction: Direction,
    event_type: EventType,
    payload: { spec: MappingSpec; is_enabled?: boolean },
  ): Promise<{ mapping: Mapping; preview: unknown }> => {
    const { data } = await api.post(
      `/vendor/integrations/${id}/mappings/${direction}/${event_type}`,
      payload,
    );
    return data.data as { mapping: Mapping; preview: unknown };
  },

  getSourceSchema: async (
    id: string,
    event_type: EventType | string,
  ): Promise<Record<string, unknown>> => {
    const { data } = await api.get(`/vendor/integrations/${id}/source-schema/${event_type}`);
    return data.data as Record<string, unknown>;
  },

  listDeliveries: async (
    id: string,
    params?: {
      event_type?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: Delivery[]; next_cursor: string | null }> => {
    const { data } = await api.get(`/vendor/integrations/${id}/deliveries`, {
      params,
    });
    return data.data as { items: Delivery[]; next_cursor: string | null };
  },

  testFire: async (
    id: string,
    payload: { event_type: EventType | string; sample_payload?: unknown },
  ): Promise<{ delivery_id: string }> => {
    const { data } = await api.post(`/vendor/integrations/${id}/test-fire`, payload);
    return data.data as { delivery_id: string };
  },
};
