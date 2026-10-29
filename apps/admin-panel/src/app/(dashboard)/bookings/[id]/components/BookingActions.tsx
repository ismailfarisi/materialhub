"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from "@materialhub/ui";
import { useState } from "react";
import { useCancelBooking, useCompleteBooking, useNoShowBooking } from "@/lib/queries/bookings";
import { type BookingActionKey, availableActions } from "./booking-actions.helpers";

const COPY: Record<
  BookingActionKey,
  { title: string; body: string; confirm: string; reasonRequired: boolean }
> = {
  complete: {
    title: "Complete this booking",
    body: "This captures the customer's payment and accrues the vendor's commission. It cannot be undone.",
    confirm: "Complete booking",
    reasonRequired: false,
  },
  cancel: {
    title: "Cancel this booking",
    body: "Cancelling as an admin bypasses the customer cancellation window. If a payment was captured or held, this refunds or releases it per the booking's snapshotted policy — for pay-at-venue bookings, nothing was ever collected, so nothing is refunded.",
    confirm: "Cancel booking",
    reasonRequired: true,
  },
  no_show: {
    title: "Mark as no-show",
    body: "This forfeits the customer's payment per the snapshotted policy and adds a strike against the customer with this vendor.",
    confirm: "Mark no-show",
    reasonRequired: false,
  },
};

export function BookingActions({ bookingId, status }: { bookingId: string; status: string }) {
  const [open, setOpen] = useState<BookingActionKey | null>(null);
  const [reason, setReason] = useState("");

  const { mutate: complete, isPending: completing } = useCompleteBooking();
  const { mutate: cancel, isPending: cancelling } = useCancelBooking();
  const { mutate: noShow, isPending: markingNoShow } = useNoShowBooking();
  const busy = completing || cancelling || markingNoShow;

  const actions = availableActions(status);
  if (actions.length === 0) return null;

  function close() {
    setOpen(null);
    setReason("");
  }

  function onError(err: unknown) {
    const e = err as { response?: { data?: { message?: string } } };
    toast({
      title: "Action failed",
      description: e?.response?.data?.message ?? "Please try again.",
      variant: "destructive",
    });
  }

  function submit() {
    if (!open) return;
    const trimmed = reason.trim();
    const handlers = { onSuccess: () => { close(); toast({ title: "Booking updated" }); }, onError };

    if (open === "complete") complete({ id: bookingId, reason: trimmed || undefined }, handlers);
    if (open === "cancel") cancel({ id: bookingId, reason: trimmed }, handlers);
    if (open === "no_show") noShow({ id: bookingId, reason: trimmed || undefined }, handlers);
  }

  const copy = open ? COPY[open] : null;
  const blocked = copy?.reasonRequired ? !reason.trim() : false;

  return (
    <>
      <div className="flex gap-2">
        {actions.includes("complete") && (
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setOpen("complete")}
            disabled={busy}
          >
            Complete
          </Button>
        )}
        {actions.includes("no_show") && (
          <Button
            variant="outline"
            className="border-orange-300 text-orange-600 hover:bg-orange-50"
            onClick={() => setOpen("no_show")}
            disabled={busy}
          >
            Mark No-show
          </Button>
        )}
        {actions.includes("cancel") && (
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setOpen("cancel")}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-taupe text-sm">{copy?.body}</p>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">
              Reason {copy?.reasonRequired ? "*" : "(optional)"}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded in the booking's status history..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Back
            </Button>
            <Button variant="destructive" onClick={submit} disabled={blocked || busy}>
              {busy ? "Working..." : copy?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
