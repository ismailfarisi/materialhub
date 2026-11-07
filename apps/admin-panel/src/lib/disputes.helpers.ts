import { parseAedInput } from "./money";

/** Backend DisputeStatus values. */
export const DISPUTE_STATUSES = [
  "opened",
  "under_review",
  "escalated",
  "resolved_buyer",
  "resolved_seller",
  "closed",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  opened: "Opened",
  under_review: "Under review",
  escalated: "Escalated",
  resolved_buyer: "Resolved for buyer",
  resolved_seller: "Resolved for supplier",
  closed: "Closed",
};

/** StatusBadge colours, from the panel's palette (see packages/ui status-badge). */
export const DISPUTE_STATUS_COLORS: Record<string, string> = {
  opened: "bg-caramel/10 text-caramel border border-caramel/30",
  under_review: "bg-caramel/10 text-caramel border border-caramel/30",
  escalated: "bg-russet/10 text-russet border border-russet/30",
  resolved_buyer: "bg-amber/10 text-amber border border-amber/30",
  resolved_seller: "bg-amber/10 text-amber border border-amber/30",
  closed: "bg-pearl/20 text-taupe border border-pearl/30",
};

/** OpenDisputeBody categories (libs/dto order.dto.ts). */
export const DISPUTE_CATEGORY_LABELS: Record<string, string> = {
  item_not_received: "Item not received",
  not_as_described: "Not as described",
  counterfeit: "Counterfeit",
  seller_unresponsive: "Supplier unresponsive",
  other: "Other",
};

export function disputeCategoryLabel(category: string | null | undefined): string {
  if (!category) return "—";
  return (
    DISPUTE_CATEGORY_LABELS[category] ??
    category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export interface DisputeActions {
  canAssign: boolean;
  canEscalate: boolean;
  canResolve: boolean;
  canClose: boolean;
  canMessage: boolean;
}

/** What the admin can do next, mirroring the backend's state checks. */
export function disputeActions(status: string): DisputeActions {
  const open = status === "opened" || status === "under_review" || status === "escalated";
  return {
    canAssign: open,
    canEscalate: status === "under_review",
    canResolve: status === "under_review" || status === "escalated",
    canClose: status === "resolved_buyer" || status === "resolved_seller",
    canMessage: status !== "closed",
  };
}

export type DisputeDecision = "buyer" | "seller";
export type DisputeRefundMethod = "wallet" | "original_payment";

export interface ResolveDisputePayload {
  decision: DisputeDecision;
  resolution: string;
  /** Fils. Only for a buyer decision with a refund. */
  resolution_amount?: number;
  refund_method?: DisputeRefundMethod;
}

export interface ResolveDisputeForm {
  decision: DisputeDecision;
  resolution: string;
  /** Whole AED as typed, e.g. "125.50". Empty = no refund. */
  amountAed: string;
  refundMethod: DisputeRefundMethod;
}

/**
 * Turn the resolve form into the body PATCH /admin/disputes/:id/resolve
 * validates (`decision` + `resolution`, amount in fils). Returns an error
 * message instead when the form cannot be sent.
 */
export function buildResolvePayload(
  form: ResolveDisputeForm,
  maxRefundFils?: number | null,
): { payload: ResolveDisputePayload } | { error: string } {
  const resolution = form.resolution.trim();
  if (!resolution) return { error: "Write the decision the buyer and supplier will see." };

  if (form.decision === "seller") return { payload: { decision: "seller", resolution } };

  if (!form.amountAed.trim()) return { payload: { decision: "buyer", resolution } };
  const fils = parseAedInput(form.amountAed);
  if (fils == null) return { error: "Enter the refund in AED, e.g. 125.50." };
  if (maxRefundFils != null && fils > maxRefundFils) {
    return { error: "The refund is more than the buyer paid for this supplier's items." };
  }
  if (fils === 0) return { payload: { decision: "buyer", resolution } };
  return {
    payload: {
      decision: "buyer",
      resolution,
      resolution_amount: fils,
      refund_method: form.refundMethod,
    },
  };
}

export function senderLabel(role: string | null | undefined): string {
  switch (role) {
    case "admin":
    case "super_admin":
      return "MaterialHub";
    case "vendor":
      return "Supplier";
    case "customer":
      return "Buyer";
    default:
      return role ? role.replace(/_/g, " ") : "Unknown";
  }
}
