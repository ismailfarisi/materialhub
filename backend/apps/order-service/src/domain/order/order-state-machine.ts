import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { HttpError } from "@materialhub/plugins";

type Role = "buyer" | "vendor" | "admin" | "system";

interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  roles: Role[];
}

interface TransitionResult {
  noop?: boolean;
}

const MASTER_TRANSITIONS: Transition[] = [
  {
    from: OrderStatus.draft,
    to: OrderStatus.pending_payment,
    roles: ["system"],
  },
  {
    from: OrderStatus.pending_payment,
    to: OrderStatus.confirmed,
    roles: ["system"],
  },
  {
    from: OrderStatus.pending_payment,
    to: OrderStatus.payment_failed,
    roles: ["system"],
  },
  {
    from: OrderStatus.pending_payment,
    to: OrderStatus.cancelled,
    roles: ["buyer", "admin", "system"],
  },
  {
    from: OrderStatus.payment_failed,
    to: OrderStatus.pending_payment,
    roles: ["system"],
  },
  {
    from: OrderStatus.confirmed,
    to: OrderStatus.cancelled,
    roles: ["buyer", "admin"],
  },
  {
    from: OrderStatus.confirmed,
    to: OrderStatus.processing,
    roles: ["system"],
  },
  {
    from: OrderStatus.processing,
    to: OrderStatus.partially_shipped,
    roles: ["system"],
  },
  { from: OrderStatus.processing, to: OrderStatus.shipped, roles: ["system"] },
  {
    from: OrderStatus.partially_shipped,
    to: OrderStatus.shipped,
    roles: ["system"],
  },
  {
    from: OrderStatus.shipped,
    to: OrderStatus.partially_delivered,
    roles: ["system"],
  },
  { from: OrderStatus.shipped, to: OrderStatus.delivered, roles: ["system"] },
  {
    from: OrderStatus.partially_delivered,
    to: OrderStatus.delivered,
    roles: ["system"],
  },
  {
    from: OrderStatus.delivered,
    to: OrderStatus.refund_requested,
    roles: ["system"],
  },
  { from: OrderStatus.delivered, to: OrderStatus.disputed, roles: ["system"] },
  {
    from: OrderStatus.refund_requested,
    to: OrderStatus.refunded,
    roles: ["system"],
  },
  {
    from: OrderStatus.refund_requested,
    to: OrderStatus.partially_refunded,
    roles: ["system"],
  },
  {
    from: OrderStatus.disputed,
    to: OrderStatus.refund_requested,
    roles: ["admin"],
  },
  { from: OrderStatus.disputed, to: OrderStatus.delivered, roles: ["admin"] },
  {
    from: OrderStatus.partially_refunded,
    to: OrderStatus.refunded,
    roles: ["system"],
  },
];

const VENDOR_ORDER_TRANSITIONS: Transition[] = [
  {
    from: OrderStatus.confirmed,
    to: OrderStatus.processing,
    roles: ["vendor"],
  },
  {
    from: OrderStatus.confirmed,
    to: OrderStatus.cancelled,
    roles: ["vendor", "system"],
  },
  {
    from: OrderStatus.processing,
    to: OrderStatus.ready_to_ship,
    roles: ["vendor"],
  },
  {
    // "system" is required for auto-booked shipments: createShipment defers
    // this hop to the carrier webhook, which transitions the vendor_order as
    // the system actor when the parcel is picked up / in transit. Without it
    // the transition threw and was swallowed, freezing auto-booked orders at
    // ready_to_ship. Vendors still trigger it manually via createShipment.
    from: OrderStatus.ready_to_ship,
    to: OrderStatus.shipped,
    roles: ["vendor", "system"],
  },
  {
    from: OrderStatus.shipped,
    to: OrderStatus.out_for_delivery,
    roles: ["system"],
  },
  {
    from: OrderStatus.out_for_delivery,
    to: OrderStatus.delivered,
    roles: ["system"],
  },
  { from: OrderStatus.shipped, to: OrderStatus.delivered, roles: ["system"] },
];

// Admin sees the broadest privilege: any transition that exists in the
// table for any role is allowed, plus the long-standing "cancel from
// anywhere" + "deliver from anywhere" bypasses (so terminal targets are
// reachable even from earlier statuses without an existing path). This
// makes admin the support layer that can unstick orders manually.
const ADMIN_BYPASS_TARGETS = new Set<OrderStatus>([
  OrderStatus.cancelled,
  OrderStatus.delivered,
  OrderStatus.partially_refunded,
  OrderStatus.refunded,
]);

function isAdminAllowed(from: OrderStatus, to: OrderStatus, table: Transition[]): boolean {
  if (ADMIN_BYPASS_TARGETS.has(to)) return true;
  // Any path that any other role could take.
  return table.some((t) => t.from === from && t.to === to);
}

export class OrderStateMachine {
  validateMasterTransition(from: OrderStatus, to: OrderStatus, role: Role): TransitionResult {
    if (from === to) return { noop: true };
    if (role === "admin" && isAdminAllowed(from, to, MASTER_TRANSITIONS)) return {};
    const valid = MASTER_TRANSITIONS.find(
      (t) => t.from === from && t.to === to && t.roles.includes(role),
    );
    if (!valid)
      throw new HttpError(
        400,
        `Invalid transition: ${from} → ${to} by ${role}`,
        "INVALID_STATUS_TRANSITION",
      );
    return {};
  }

  validateVendorTransition(from: OrderStatus, to: OrderStatus, role: Role): TransitionResult {
    if (from === to) return { noop: true };
    if (role === "admin" && isAdminAllowed(from, to, VENDOR_ORDER_TRANSITIONS)) return {};
    const valid = VENDOR_ORDER_TRANSITIONS.find(
      (t) => t.from === from && t.to === to && t.roles.includes(role),
    );
    if (!valid)
      throw new HttpError(
        400,
        `Invalid transition: ${from} → ${to} by ${role}`,
        "INVALID_STATUS_TRANSITION",
      );
    return {};
  }

  getValidMasterTransitions(from: OrderStatus, role: Role): OrderStatus[] {
    if (role === "admin") {
      // Admin sees every target reachable from `from`, plus the bypass set.
      const reachable = MASTER_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
      return [...new Set([...reachable, ...ADMIN_BYPASS_TARGETS])];
    }
    const transitions = MASTER_TRANSITIONS.filter((t) => t.from === from && t.roles.includes(role));
    return [...new Set(transitions.map((t) => t.to))];
  }

  getValidVendorTransitions(from: OrderStatus, role: Role): OrderStatus[] {
    if (role === "admin") {
      const reachable = VENDOR_ORDER_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
      return [...new Set([...reachable, ...ADMIN_BYPASS_TARGETS])];
    }
    const transitions = VENDOR_ORDER_TRANSITIONS.filter(
      (t) => t.from === from && t.roles.includes(role),
    );
    return [...new Set(transitions.map((t) => t.to))];
  }
}
