"use client";

import { QueryError } from "@/components/query-error";
import { formatDateTime, formatFils } from "@/lib/booking-format";
import { useAdminBooking } from "@/lib/queries/bookings";
import { Button, Separator, Skeleton, StatusBadge } from "@materialhub/ui";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { BookingActions } from "./components/BookingActions";
import { StatusTimeline } from "./components/StatusTimeline";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-taupe text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-cacao text-sm mt-0.5">{value}</dd>
    </div>
  );
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const { data: booking, isLoading, isError, error, refetch } = useAdminBooking(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // A failed request is not a missing booking — saying "not found" for a 500 or
  // a gateway misroute sends the admin looking for a record that exists.
  if (isError) {
    return (
      <QueryError
        title="Could not load this booking."
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-taupe">Booking not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft size={16} /> Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-cacao">{booking.booking_number}</h1>
            <StatusBadge status={booking.status} />
          </div>
          <p className="text-taupe text-sm">{booking.service_name}</p>
        </div>
        <BookingActions bookingId={id} status={booking.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-pearl/30 p-4">
          <h2 className="text-sm font-semibold text-cacao mb-3">Appointment</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Vendor" value={booking.vendor_name ?? "—"} />
            <Field label="Starts" value={formatDateTime(booking.starts_at)} />
            <Field label="Ends" value={formatDateTime(booking.ends_at)} />
            <Field label="Duration" value={`${booking.duration_minutes} min`} />
            <Field label="Source" value={booking.source ?? "—"} />
            <Field label="Customer" value={booking.customer_name ?? "—"} />
            <Field label="Phone" value={booking.customer_phone ?? "—"} />
          </dl>
        </section>

        <section className="rounded-lg border border-pearl/30 p-4">
          <h2 className="text-sm font-semibold text-cacao mb-3">Money</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Price" value={formatFils(booking.price_fils)} />
            <Field label="VAT" value={formatFils(booking.vat_fils)} />
            <Field label="Deposit" value={formatFils(booking.deposit_fils)} />
            <Field label="Paid" value={formatFils(booking.amount_paid_fils)} />
            <Field label="Balance Due" value={formatFils(booking.balance_due_fils)} />
            <Field label="Commission" value={formatFils(booking.commission_fils)} />
            <Field label="Payment Mode" value={booking.payment_mode ?? "—"} />
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-pearl/30 p-4">
        <h2 className="text-sm font-semibold text-cacao mb-3">Status history</h2>
        <StatusTimeline history={booking.status_history ?? []} />
      </section>
    </div>
  );
}
