"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBadge,
  Skeleton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Textarea,
} from "@materialhub/ui";
import { ArrowLeft, Truck } from "@phosphor-icons/react";
import { useVendorOrder, useCreateShipment, useUpdateShipmentStatus, type ShipTo } from "@/lib/queries/orders";

const shipmentSchema = z.object({
  carrier: z.string().min(1, "Carrier is required"),
  tracking_number: z.string().min(1, "Tracking number is required"),
});

type ShipmentFormValues = z.infer<typeof shipmentSchema>;

const CARRIERS = [
  { label: "Aramex", value: "aramex" },
  { label: "DHL", value: "dhl" },
  { label: "FedEx", value: "fedex" },
  { label: "Emirates Post", value: "emirates_post" },
  { label: "Fetchr", value: "fetchr" },
  { label: "Other", value: "other" },
];

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed_delivery: "Failed Delivery",
  returned: "Returned",
};

const VENDOR_NEXT_STATUSES: Record<string, string[]> = {
  pending: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["out_for_delivery", "delivered", "failed_delivery"],
  out_for_delivery: ["delivered", "failed_delivery"],
};

const TERMINAL_SHIPMENT_STATUSES = new Set(["delivered", "returned"]);

function ShipmentStatusDialog({
  shipment,
  orderId,
  open,
  onClose,
}: {
  shipment: any;
  orderId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const { mutate: updateStatus, isPending } = useUpdateShipmentStatus();

  const nextStatuses = VENDOR_NEXT_STATUSES[shipment.status] || [];

  function handleSubmit() {
    if (!status || !reason.trim()) return;
    updateStatus(
      { orderId, shipmentId: shipment.id, status, reason: reason.trim() },
      {
        onSuccess: () => {
          setStatus("");
          setReason("");
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Shipment Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              Current: <span className="font-medium capitalize">{shipment.status?.replace(/_/g, " ")}</span>
            </p>
          </div>
          <div>
            <Label className="mb-1 block">New Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {nextStatuses.filter(s => s && s !== "").map((s: string) => (
                  <SelectItem key={s} value={s}>
                    {SHIPMENT_STATUS_LABELS[s] || s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for status change (required)"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !status || !reason.trim()}>
            {isPending ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_ORDER = [
  "pending",
  "confirmed",
  "processing",
  "ready_to_ship",
  "shipped",
  "delivered",
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = useVendorOrder(id);
  const { mutate: createShipment, isPending: shipmentPending } = useCreateShipment();

  const form = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: { carrier: "", tracking_number: "" },
  });

  const [statusDialogShipment, setStatusDialogShipment] = useState<any>(null);

  function onCreateShipment(values: ShipmentFormValues) {
    createShipment(
      { orderId: id, ...values },
      { onSuccess: () => form.reset() }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!order) {
    return <p className="text-muted-foreground">Order not found.</p>;
  }

  // Map API fields
  const orderNumber = order.vendor_order_number || order.order_number;
  const orderTotal = order.vendor_total ?? order.subtotal ?? order.total ?? 0;
  const items = order.items ?? [];
  const shipTo: ShipTo | undefined = order.ship_to;
  const addr = order.shipping_address || (order.order?.shipping_address) || {};
  const addrName = addr.full_name || `${addr.first_name || ""} ${addr.last_name || ""}`.trim();
  const currentStatusIndex = STATUS_ORDER.indexOf(order.status);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders">
            <ArrowLeft size={16} className="mr-1" /> Orders
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">{orderNumber}</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Order Info */}
      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Order Date</span>
            <p className="font-medium">{formatDate(order.created_at)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-medium">{formatCurrency(orderTotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="font-medium capitalize">{order.status?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Items</span>
            <p className="font-medium">{items.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {items.map((item: any) => (
              <div key={item.id} className="py-3">
                <div className="flex items-center gap-4">
                  {item.product_image_url && (
                    <img
                      src={item.product_image_url}
                      alt={item.product_name}
                      className="w-10 h-10 rounded-md object-cover flex-shrink-0 border"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.product_name}</p>
                    {item.variant_name && (
                      <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                    )}
                    {item.external_id && (
                      <p className="text-xs text-muted-foreground">Ref: {item.external_id}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">x{item.quantity}</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(item.line_total ?? item.unit_price * item.quantity)}
                  </span>
                </div>
                {item.refunded_quantity > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {item.refunded_quantity} unit(s) cancelled (out of stock) — commission adjusted
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shipping Destination */}
      {shipTo ? (
        <Card>
          <CardHeader>
            <CardTitle>Ship To</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{shipTo.name}</p>
            <p>{shipTo.address_line_1}</p>
            {shipTo.address_line_2 && <p>{shipTo.address_line_2}</p>}
            <p>
              {shipTo.city}{shipTo.emirate ? `, ${shipTo.emirate}` : ""}
              {shipTo.country_code ? ` ${shipTo.country_code}` : ""}
            </p>
            {shipTo.phone && (
              <p className="text-muted-foreground">{shipTo.phone}</p>
            )}
          </CardContent>
        </Card>
      ) : (addr.city || addr.address_line_1 || addr.street) ? (
        <Card>
          <CardHeader>
            <CardTitle>Shipping Address</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {addrName && <p className="font-medium">{addrName}</p>}
            <p>{addr.address_line_1 || addr.street}</p>
            {(addr.address_line_2 || addr.area) && <p>{addr.address_line_2 || addr.area}</p>}
            <p>
              {addr.city}{addr.state || addr.emirate ? `, ${addr.state || addr.emirate}` : ""}
              {addr.postal_code ? ` ${addr.postal_code}` : ""}
            </p>
            {addr.phone && (
              <p className="text-muted-foreground">{addr.phone}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Status Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Status Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative border-l border-border ml-3 space-y-4">
            {STATUS_ORDER.map((s, i) => {
              const isPast = i <= currentStatusIndex;
              return (
                <li key={s} className="ml-4">
                  <span
                    className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 ${
                      isPast
                        ? "bg-primary border-primary"
                        : "bg-background border-muted-foreground"
                    }`}
                  />
                  <p
                    className={`text-sm capitalize ${
                      isPast ? "font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {s.replace(/_/g, " ")}
                  </p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Create Shipment */}
      {["processing", "ready_to_ship"].includes(order.status) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck size={18} />
              Create Shipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onCreateShipment)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="carrier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Carrier</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select carrier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARRIERS.filter(c => c.value && c.value !== "").map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tracking_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tracking Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 1Z999AA10123456784" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={shipmentPending}>
                  {shipmentPending ? "Creating…" : "Create Shipment"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Shipments */}
      {order.shipments?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck size={18} />
              Shipments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.shipments.map((shipment: any) => (
                <div
                  key={shipment.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium capitalize">
                        {shipment.carrier?.replace(/_/g, " ") || "Unknown carrier"}
                      </span>
                      <StatusBadge status={shipment.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {shipment.tracking_number || "No tracking number"}
                    </p>
                    {shipment.shipped_at && (
                      <p className="text-xs text-muted-foreground">
                        Shipped {formatDate(shipment.shipped_at)}
                      </p>
                    )}
                  </div>
                  {!TERMINAL_SHIPMENT_STATUSES.has(shipment.status) &&
                    VENDOR_NEXT_STATUSES[shipment.status]?.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStatusDialogShipment(shipment)}
                      >
                        Update Status
                      </Button>
                    )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {statusDialogShipment && (
        <ShipmentStatusDialog
          shipment={statusDialogShipment}
          orderId={id}
          open={!!statusDialogShipment}
          onClose={() => setStatusDialogShipment(null)}
        />
      )}
    </div>
  );
}
