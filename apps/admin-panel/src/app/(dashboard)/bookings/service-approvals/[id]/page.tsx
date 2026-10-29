"use client";

import { QueryError } from "@/components/query-error";
import { formatFils } from "@/lib/booking-format";
import {
  useAdminOffering,
  useApproveOffering,
  useRejectOffering,
} from "@/lib/queries/service-offerings";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
} from "@materialhub/ui";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-taupe text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-cacao text-sm mt-0.5">{value}</dd>
    </div>
  );
}

export default function ServiceApprovalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { data: offering, isLoading, isError, error, refetch } = useAdminOffering(id);
  const { mutate: approve, isPending: approving } = useApproveOffering();
  const { mutate: reject, isPending: rejecting } = useRejectOffering();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  function onError(err: unknown) {
    const e = err as { response?: { data?: { message?: string } } };
    toast({
      title: "Action failed",
      description: e?.response?.data?.message ?? "Please try again.",
      variant: "destructive",
    });
  }

  function handleApprove() {
    approve(id, {
      onSuccess: () => {
        setApproveOpen(false);
        toast({ title: "Service approved" });
      },
      onError,
    });
  }

  function handleReject() {
    if (!reason.trim()) return;
    reject(
      { id, reason: reason.trim() },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setReason("");
          toast({ title: "Service rejected" });
        },
        onError,
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <QueryError
        title="Could not load this service."
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (!offering) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-taupe">Service not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const pending = offering.status === "pending_review";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft size={16} /> Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-cacao">{offering.name}</h1>
            <StatusBadge status={offering.status} />
          </div>
          <p className="text-taupe text-sm">Vendor ID: {offering.vendor_id}</p>
        </div>
        {pending && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setRejectOpen(true)}
              disabled={approving || rejecting}
            >
              Reject
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setApproveOpen(true)}
              disabled={approving || rejecting}
            >
              Approve
            </Button>
          </div>
        )}
      </div>

      {offering.rejection_reason && (
        <div className="rounded-lg border border-russet/30 bg-russet/10 px-4 py-3">
          <p className="text-cacao text-sm">
            <span className="font-medium">Previously rejected:</span>{" "}
            {offering.rejection_reason}
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-pearl/30 p-4">
          <h2 className="text-sm font-semibold text-cacao mb-3">Service</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Price" value={formatFils(offering.price_fils)} />
            <Field label="Duration" value={`${offering.duration_minutes} min`} />
            <Field label="Buffer before" value={`${offering.buffer_before_minutes} min`} />
            <Field label="Buffer after" value={`${offering.buffer_after_minutes} min`} />
            <Field label="Location mode" value={offering.location_mode} />
            <Field label="Payment mode" value={offering.payment_mode} />
            <Field label="Deposit type" value={offering.deposit_type} />
            <Field label="VAT rate" value={`${offering.vat_rate}%`} />
          </dl>
          {offering.description && (
            <>
              <h3 className="text-xs uppercase tracking-wide text-taupe mt-4 mb-1">
                Description
              </h3>
              <p className="text-cacao text-sm whitespace-pre-wrap">{offering.description}</p>
            </>
          )}
        </section>

        <section className="rounded-lg border border-pearl/30 p-4">
          <h2 className="text-sm font-semibold text-cacao mb-3">Policies</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Cancellation window" value={`${offering.cancellation_window_hours} h`} />
            <Field label="Refund policy" value={offering.cancellation_refund_policy} />
            <Field label="Penalty" value={`${offering.cancellation_penalty_percent}%`} />
            <Field label="Reschedule window" value={`${offering.reschedule_window_hours} h`} />
            <Field label="Min notice" value={`${offering.min_notice_minutes} min`} />
            <Field label="Max advance" value={`${offering.max_advance_days} days`} />
          </dl>
        </section>
      </div>

      {offering.media_urls?.length > 0 && (
        <section className="rounded-lg border border-pearl/30 p-4">
          <h2 className="text-sm font-semibold text-cacao mb-3">Media</h2>
          <div className="flex flex-wrap gap-3">
            {offering.media_urls.map((url: string) => (
              // biome-ignore lint/performance/noImgElement: admin review of vendor-supplied URLs
              <img
                key={url}
                src={url}
                alt=""
                className="h-32 w-32 rounded-lg object-cover border border-pearl/30"
              />
            ))}
          </div>
        </section>
      )}

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve this service</DialogTitle>
          </DialogHeader>
          <p className="text-taupe text-sm">
            This publishes the service immediately <strong>and</strong> trusts this vendor —
            every service they submit from now on goes live without review.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={approving}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? "Approving..." : "Approve and trust vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this service</DialogTitle>
          </DialogHeader>
          <p className="text-taupe text-sm">
            The vendor sees this reason and can edit and resubmit.
          </p>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Reason *</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to change before this can go live..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!reason.trim() || rejecting}
            >
              {rejecting ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
