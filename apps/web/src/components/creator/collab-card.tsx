"use client";

import { CalendarClock, Gift, type LucideIcon, Megaphone } from "lucide-react";
import type { ReactNode } from "react";
import {
  MAISON_SANS,
  MAISON_SERIF,
} from "@/components/checkout/maison-primitives";
import type { CollabOpportunity, CollabType } from "@/lib/api/collab";

const TYPE_ICON: Record<CollabType, LucideIcon> = {
  product_seeding: Gift,
  paid_campaign: Megaphone,
  event_appearance: CalendarClock,
};

interface CollabCardProps {
  opportunity: CollabOpportunity;
  /** Small uppercase line under the title/vendor — type, deadline, slots, status, whatever the caller needs. */
  metaLine: ReactNode;
  children?: ReactNode;
}

export function CollabCard({ opportunity, metaLine, children }: CollabCardProps) {
  const thumbnailUrl = opportunity.seeded_product_image_url ?? opportunity.vendor_logo_url;
  const Icon = TYPE_ICON[opportunity.type];

  return (
    <li
      className="flex gap-4 p-3"
      style={{
        border: "1px solid rgba(44,24,16,0.10)",
        background: "rgba(44,24,16,0.02)",
      }}
    >
      <div
        className="w-16 h-16 shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: "rgba(44,24,16,0.07)" }}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon
            className="h-6 w-6"
            style={{ color: "hsl(var(--nl-russet))" }}
            strokeWidth={1.25}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="line-clamp-1"
          style={{ fontFamily: MAISON_SERIF, fontSize: 16, color: "hsl(var(--nl-cacao))" }}
        >
          {opportunity.title}
        </div>
        {opportunity.vendor_name && (
          <div
            className="mt-0.5"
            style={{ fontFamily: MAISON_SANS, fontSize: 11, color: "hsl(var(--nl-russet))" }}
          >
            {opportunity.vendor_name}
          </div>
        )}
        <div
          className="mt-1"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "hsl(var(--nl-russet))",
          }}
        >
          {metaLine}
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}
