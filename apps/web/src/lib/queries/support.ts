import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_URL, COOKIE_ACCESS_TOKEN, getCookie, getGuestSessionToken } from "../api";
import { openMessageStream } from "../sse";

export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: string;
  message: string;
  attachment_urls: string[];
  is_internal: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  category: string | null;
  created_at: string;
  messages?: TicketMessage[];
}

export interface CreateTicketPayload {
  subject: string;
  category: "order" | "payment" | "product" | "account" | null;
  message: string;
  order_id?: string | null;
  guest_email?: string;
  guest_name?: string;
}

export function useMyTickets(params: { page?: number; status?: TicketStatus } = {}) {
  return useQuery({
    queryKey: ["support-tickets", params],
    queryFn: async () => {
      const { data } = await api.get("/support/tickets", { params });
      return data.data as { data: Ticket[]; total: number; page: number; limit: number };
    },
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ["support-ticket", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get(`/support/tickets/${id}`);
      return data.data as Ticket;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTicketPayload) => {
      const { data } = await api.post("/support/tickets", payload);
      return data.data as Ticket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });
}

export function useSendMessage(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const { data } = await api.post(`/support/tickets/${ticketId}/messages`, { message });
      return data.data as TicketMessage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    },
  });
}

// Live message delivery. Pushes streamed messages into the ticket's cache.
export function useTicketStream(ticketId: string | undefined, enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ticketId || !enabled) return;
    const ctrl = new AbortController();
    let stopped = false;

    async function run() {
      let attempt = 0;

      while (!stopped) {
        // Rebuild auth headers on every reconnect attempt — not once outside
        // the loop — so a token that expired/refreshed between reconnects is
        // picked up. Same guest-vs-logged-in rule as the axios client: a
        // logged-in user (access-token cookie present) sends ONLY the Bearer
        // token; a guest sends ONLY the x-guest-session header + query param.
        // A logged-in user must never stream as a guest.
        const token = getCookie(COOKIE_ACCESS_TOKEN);
        const guest = token ? null : getGuestSessionToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (guest) headers["x-guest-session"] = guest;
        const qs = guest ? `?guest_session=${encodeURIComponent(guest)}` : "";

        try {
          await openMessageStream({
            url: `${API_URL}/support/tickets/${ticketId}/stream${qs}`,
            headers,
            signal: ctrl.signal,
            onMessage: (msg) => {
              attempt = 0; // reset backoff on successful message delivery
              qc.setQueryData<Ticket>(["support-ticket", ticketId], (prev) => {
                if (!prev) return prev;
                const m = msg as TicketMessage;
                if (prev.messages?.some((x) => x.id === m.id)) return prev;
                return { ...prev, messages: [...(prev.messages ?? []), m] };
              });
            },
          });
          attempt = 0; // stream ended/resolved normally — reset backoff
        } catch {
          if (stopped) break;
          // Exponential backoff capped at 30s, plus jitter, so a persistently
          // failing stream (e.g. a stale/expired token) doesn't hammer the
          // server with fixed-interval reconnects forever.
          const delay = Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
          attempt++;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    run();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [ticketId, enabled, qc]);
}
