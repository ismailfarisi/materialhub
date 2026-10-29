"use client";

import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import type { TicketMessage } from "@/lib/queries/support";

export function MessageThread({ messages }: { messages: TicketMessage[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map((m) => {
        const isCustomer = m.sender_role === "customer";
        return (
          <div
            key={m.id}
            style={{
              alignSelf: isCustomer ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "8px 12px",
              borderRadius: 12,
              fontFamily: MAISON_SANS,
              fontSize: 14,
              background: isCustomer ? "hsl(var(--nl-amber))" : "hsl(var(--nl-linen))",
              color: isCustomer ? "hsl(var(--nl-espresso))" : "hsl(var(--nl-cacao))",
            }}
          >
            {m.message}
          </div>
        );
      })}
    </div>
  );
}
