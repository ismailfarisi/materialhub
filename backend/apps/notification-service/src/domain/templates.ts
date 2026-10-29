export interface NotificationTemplate {
  title: string;
  bodyTemplate: string;
  actionUrlTemplate?: string;
  // Phase 5 Task 8 escape hatch: booking types need CONDITIONAL wording the
  // plain `{key}` interpolation below can't express — e.g. booking_cancelled's
  // void-vs-refund phrasing (a never-charged customer must never be told
  // they were "refunded AED X"), booking_no_show's penalty breakdown,
  // booking_payment_failed's pay-now CTA, vendor_booking_conflict naming the
  // colliding engagements, and booking_reminder's .ics download link (email
  // only — `emailHtmlExtra` is appended to the EMAIL body only, never shown
  // in-app, so raw HTML there never leaks into the in-app notification's
  // plain-text body). `data` is the raw (non-string) event.data payload the
  // emitter attached — `variables` is flat strings only, so anything
  // structured (the ics fields, etc) comes from here. When present, `render`
  // takes over title/body ENTIRELY for this type (bodyTemplate/title above
  // become unused fallbacks/documentation); `actionUrl` optionally overrides
  // actionUrlTemplate (useful when the right link — e.g. a fully-formed
  // dispute/pay-now URL — was already built by the emitter and handed to us
  // via `variables`, not assembled from a `{token}` in a static template
  // string).
  render?: (
    variables: Record<string, string>,
    data: Record<string, unknown>,
  ) => { title: string; body: string; actionUrl?: string; emailHtmlExtra?: string };
}

// ─── Small render helpers (booking templates only — order-email-templates.ts
// has its own richer copies for the standalone OrderEmailService; these are
// deliberately minimal duplicates rather than a shared import, keeping this
// file's only dependency the same as the rest of templates.ts: none). ───────

/** Minimal HTML entity escaping for interpolated, potentially external text
 * (Stripe failure reasons, freeform cancellation reasons, etc). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** fils -> "AED 129.00". All money in the system is stored in the minor unit. */
function formatMoneyFils(fils: string | number | undefined): string {
  const n = Number(fils ?? 0) || 0;
  return `AED ${(n / 100).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function offsetLabel(offset: string | undefined): string {
  if (offset === "24h") return "24 hours";
  if (offset === "1h") return "1 hour";
  return offset ?? "soon";
}

/** Base64-encodes UTF-8 text (Bun/Node global `btoa` is Latin1-only). */
function base64Utf8(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  order_confirmed: {
    title: "Order Confirmed",
    bodyTemplate: "Your order {order_number} has been confirmed",
    actionUrlTemplate: "/orders/{orderId}",
  },
  order_shipped: {
    title: "Order Shipped",
    bodyTemplate: "Your order has shipped. Track: {tracking_url}",
    actionUrlTemplate: "/orders/{orderId}/tracking",
  },
  order_delivered: {
    title: "Order Delivered",
    bodyTemplate: "Your order has been delivered",
    actionUrlTemplate: "/orders/{orderId}",
  },
  payment_received: {
    title: "Payment Received",
    bodyTemplate: "Payment of {amount} AED received",
    actionUrlTemplate: "/orders/{orderId}",
  },
  payout_sent: {
    title: "Payout Sent",
    bodyTemplate: "Payout of {amount} AED sent to your account",
    actionUrlTemplate: "/vendor/payouts",
  },
  vendor_new_order: {
    title: "New Order Received",
    bodyTemplate: "New order {order_number} ({amount})",
    actionUrlTemplate: "/vendor/orders/{vendorOrderId}",
  },
  new_review: {
    title: "New Review",
    bodyTemplate: "New {rating} star review on {product_name}",
    actionUrlTemplate: "/vendor/products/{productId}/reviews",
  },
  low_stock: {
    title: "Low Stock Alert",
    bodyTemplate: "{product_name} has only {quantity} left",
    actionUrlTemplate: "/vendor/products/{productId}/inventory",
  },
  vendor_approved: {
    title: "Vendor Approved",
    bodyTemplate: "Your vendor account has been approved",
    actionUrlTemplate: "/vendor/dashboard",
  },
  return_requested: {
    title: "Return Requested",
    bodyTemplate: "Return requested for order {order_number}",
    actionUrlTemplate: "/vendor/returns/{returnId}",
  },
  dispute_opened: {
    title: "Dispute Opened",
    bodyTemplate: "Dispute opened for order {order_number}",
    actionUrlTemplate: "/disputes/{disputeId}",
  },
  dispute_resolved: {
    title: "Dispute Resolved",
    bodyTemplate: "Dispute resolved: {resolution}",
    actionUrlTemplate: "/disputes/{disputeId}",
  },

  // ─── Booking-service (Phase 5, spec §7) — 11 types, both audiences where
  // applicable. Emitters: booking-service's booking-status.service.ts
  // (confirm), reschedule.service.ts, cancel.service.ts, no-show.service.ts,
  // booking-auth.service.ts (payment failure), booking-completion.service.ts
  // (completion), reminders/reminder-scheduler.ts. vendor_booking_conflict has
  // no emitter yet (Phase 6's iCal-import conflict hook) — template only. ────

  booking_confirmed: {
    title: "Booking Confirmed",
    bodyTemplate:
      "Your booking for {service_name} on {starts_at} is confirmed. Booking #{booking_number}.",
    actionUrlTemplate: "/bookings/{bookingId}",
  },

  vendor_new_booking: {
    title: "New Booking",
    bodyTemplate:
      "You have a new booking for {service_name} on {starts_at}. Booking #{booking_number}.",
    actionUrlTemplate: "/vendor/bookings/{bookingId}",
  },

  booking_completed: {
    title: "Booking Completed",
    bodyTemplate: "Your booking for {service_name} is complete. Thank you for choosing MaterialHub!",
    actionUrlTemplate: "/bookings/{bookingId}",
  },

  booking_review_request: {
    title: "How was your service?",
    bodyTemplate:
      "Tell other customers about your {service_name} experience — leave a quick review.",
    actionUrlTemplate: "/bookings/{bookingId}/review",
  },

  // Reused for BOTH the customer and the vendor owner (reschedule.service.ts
  // emits this SAME type to both — the vendor payload is distinguished only
  // by carrying an extra `customerUserId` field on `data`, which the
  // customer's own payload never has). No bookingId in variables (Task 3
  // never added one) — no actionUrl.
  booking_rescheduled: {
    title: "Booking Rescheduled",
    bodyTemplate:
      "Your booking for {service_name} has been rescheduled to {starts_at}. Booking #{booking_number}.",
    render: (v, data) => {
      const isVendorCopy = typeof data.customerUserId === "string";
      return isVendorCopy
        ? {
            title: "Customer Booking Rescheduled",
            body: `A customer's booking for ${esc(v.service_name)} was rescheduled to ${esc(v.starts_at)}. Booking #${esc(v.booking_number)}.`,
          }
        : {
            title: "Booking Rescheduled",
            body: `Your booking for ${esc(v.service_name)} has been rescheduled to ${esc(v.starts_at)}. Booking #${esc(v.booking_number)}.`,
          };
    },
  },

  // Task 8 fix: `action` (void/partial_capture/refund/none — cancel.service.ts
  // now carries this on both variables and data) drives the money wording so
  // a never-charged customer (void — an authorization hold released, no
  // capture ever happened) is never told they were "refunded AED X".
  booking_cancelled: {
    title: "Booking Cancelled",
    bodyTemplate: "Your booking for {service_name} has been cancelled.",
    render: (v) => {
      const service = esc(v.service_name);
      const moneyLine = ((): string => {
        switch (v.action) {
          case "refund":
            return `You'll be refunded ${formatMoneyFils(v.refund_fils)}.`;
          case "partial_capture":
            return `A cancellation fee of ${formatMoneyFils(v.forfeit_fils)} applies; ${formatMoneyFils(v.refund_fils)} will be released.`;
          case "void":
            return "No charge was made — the payment authorization hold has been released.";
          default:
            return "No payment was collected for this booking.";
        }
      })();
      return {
        title: "Booking Cancelled",
        body: `Your booking for ${service} (#${esc(v.booking_number)}) has been cancelled. ${moneyLine}`,
      };
    },
  },

  vendor_booking_cancelled: {
    title: "Booking Cancelled",
    bodyTemplate: "A customer cancelled their booking for {service_name}.",
    render: (v) => {
      const service = esc(v.service_name);
      const moneyLine = ((): string => {
        switch (v.action) {
          case "refund":
            return `The customer will be refunded ${formatMoneyFils(v.refund_fils)}.`;
          case "partial_capture":
            return `A ${formatMoneyFils(v.forfeit_fils)} cancellation fee was retained; ${formatMoneyFils(v.refund_fils)} will be released to the customer.`;
          case "void":
            return "No charge was made — the customer's payment authorization hold has been released.";
          default:
            return "No payment had been collected for this booking.";
        }
      })();
      return {
        title: "Customer Booking Cancelled",
        body: `A customer cancelled their booking for ${service} (#${esc(v.booking_number)}). ${moneyLine}`,
      };
    },
  },

  // Amended spec: penalty breakdown + dispute link.
  booking_no_show: {
    title: "Booking Marked No-Show",
    bodyTemplate: "Your booking for {service_name} was marked as a no-show.",
    render: (v) => {
      const service = esc(v.service_name);
      const forfeit = formatMoneyFils(v.forfeit_fils);
      const refund = Number(v.refund_fils) > 0 ? formatMoneyFils(v.refund_fils) : null;
      const breakdown = refund
        ? `Under our ${esc(v.policy)} policy, ${forfeit} was forfeited and ${refund} was refunded.`
        : `Under our ${esc(v.policy)} policy, ${forfeit} was forfeited.`;
      return {
        title: "Booking Marked No-Show",
        body: `Your booking for ${service} (#${esc(v.booking_number)}) was marked as a no-show. ${breakdown} If you believe this is a mistake, contact us: ${esc(v.dispute_url)}`,
        actionUrl: v.dispute_url,
      };
    },
  },

  // Amended spec: pay-now link.
  booking_payment_failed: {
    title: "Booking Payment Failed",
    bodyTemplate: "We couldn't process payment for your booking of {service_name}.",
    render: (v) => ({
      title: "We couldn't process your booking payment",
      body: `We couldn't process payment for your booking of ${esc(v.service_name)} (#${esc(v.booking_number)}) — ${esc(v.reason)}. Please update your payment details to keep your booking: ${esc(v.pay_now_url)}`,
      actionUrl: v.pay_now_url,
    }),
  },

  // Phase 6 emits this (iCal-import conflict hook) — template only for now
  // (test-rendered by Task 8). Amended spec: names the colliding engagements.
  vendor_booking_conflict: {
    title: "Booking Conflict",
    bodyTemplate: "A scheduling conflict was detected for {staff_name}.",
    render: (v) => ({
      title: "Scheduling conflict needs your attention",
      body: `${esc(v.staff_name)} has two overlapping engagements: "${esc(v.existing_summary)}" (${esc(v.existing_starts_at)} – ${esc(v.existing_ends_at)}) conflicts with "${esc(v.conflicting_summary)}" (${esc(v.conflicting_starts_at)} – ${esc(v.conflicting_ends_at)}). Please resolve this on your calendar.`,
    }),
  },

  // Amended spec: .ics attachment if the email pipeline supports it, else a
  // fallback. Gap: EmailService/EmailDispatcher (SES) has no attachment
  // parameter today (verified — see email.service.ts's sendEmail, a plain
  // SendEmailCommand with only Text/Html Body parts; attachments need
  // SendRawEmailCommand with a MIME-multipart body, which this task does NOT
  // build — out of scope per the brief's "do not rebuild the SES sender").
  // Fallback used instead: a `data:text/calendar` download link built from
  // the emitter's already-rendered `data.ics.text` — a fully self-contained
  // "Add to calendar" link that needs no server-side attachment support at
  // all, appended to the EMAIL body only via emailHtmlExtra (never shown
  // in-app, where a raw link/markup would be out of place).
  booking_reminder: {
    title: "Upcoming Booking Reminder",
    bodyTemplate: "Reminder: your booking for {service_name} is coming up.",
    render: (v, data) => {
      const when = offsetLabel(v.offset);
      const place = v.location_name || (v.vendor_name ? `at ${v.vendor_name}` : "");
      const body = `Reminder: your booking for ${esc(v.service_name)} (#${esc(v.booking_number)}) is in ${when}, at ${esc(v.starts_at)}${place ? ` ${esc(place)}` : ""}.`;

      const ics = (data as { ics?: { text?: string } }).ics;
      let emailHtmlExtra: string | undefined;
      if (ics?.text) {
        // Inline (not wrapped in its own <p>) — this string is appended
        // INSIDE renderHtmlEmail's existing single <p>...</p> body element
        // (see NotificationDispatcherService.dispatch's email step), so a
        // nested block element here would be invalid HTML.
        const href = `data:text/calendar;charset=utf-8;base64,${base64Utf8(ics.text)}`;
        emailHtmlExtra = `<br /><br /><a href="${href}" download="booking-${esc(v.booking_number)}.ics">Add to calendar (.ics)</a>`;
      }

      return { title: "Upcoming Booking Reminder", body, emailHtmlExtra };
    },
  },

  // A vendor invited this creator to a collab. Uses a `render` hook for two
  // reasons: the vendor's optional note must be quoted when present and left
  // out entirely when absent (`{note}` would otherwise render as an empty pair
  // of quotes, or as the literal "{note}" — renderTemplate leaves unknown keys
  // in place), and every value here is vendor-authored free text.
  //
  // esc() is not optional: renderHtmlEmail interpolates `body` straight into
  // the email HTML with no escaping of its own, so unescaped vendor text would
  // be injected markup. Same reason the booking templates escape.
  //
  // The note is a one-way message, not a channel: the reply lives in the app,
  // behind the action URL, and the email carries no address for either side.
  collab_invited: {
    title: "Collab Invitation",
    bodyTemplate: "{vendor_name} invited you to {opportunity_title}",
    actionUrlTemplate: "/account/creator?tab=mine",
    render: (v) => {
      const vendor = esc(v.vendor_name) || "A brand";
      const opportunity = esc(v.opportunity_title) || "a collaboration";
      const note = esc((v.invite_note || "").trim());
      const headline = `${vendor} invited you to ${opportunity}`;
      return {
        title: "Collab Invitation",
        body: note ? `${headline} — “${note}”` : headline,
      };
    },
  },
};

export function getTemplate(eventType: string): NotificationTemplate | null {
  return TEMPLATES[eventType] || null;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`);
}

export function renderHtmlEmail(title: string, body: string, actionUrl?: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">${title}</h2>
  <p style="color: #666; font-size: 16px;">${body}</p>
  ${actionUrl ? `<a href="${actionUrl}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">View Details</a>` : ""}
  <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
  <p style="color: #999; font-size: 12px;">MaterialHub</p>
</body></html>`;
}
