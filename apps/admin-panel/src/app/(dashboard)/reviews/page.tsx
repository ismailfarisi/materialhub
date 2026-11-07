"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FiltersBar,
  Label,
  StatusBadge,
  Textarea,
  toast,
} from "@materialhub/ui";
import { Flag, Star } from "lucide-react";
import { apiErrorMessage } from "@/lib/business.helpers";
import {
  useAdminReviews,
  useApproveReview,
  useRejectReview,
  type Review,
} from "@/lib/queries/reviews";
import { reviewModeration } from "@/lib/reviews.helpers";

const STATUS_OPTIONS = [
  { label: "Needs moderation", value: "needs_moderation" },
  { label: "Reported by buyers", value: "reported" },
  { label: "Pending", value: "pending" },
  { label: "Hidden (flagged)", value: "flagged" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed five-star row
          key={i}
          size={14}
          aria-hidden="true"
          className={i < rating ? "fill-amber text-amber" : "fill-pearl text-pearl"}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-taupe">{rating}/5</span>
    </div>
  );
}

function RejectDialog({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutate: reject, isPending } = useRejectReview();

  function handleSubmit() {
    if (!review) return;
    const rejection_reason = reason.trim();
    if (!rejection_reason) {
      setError("Give a reason. The reviewer sees it.");
      return;
    }
    reject(
      { id: review.id, rejection_reason },
      {
        onSuccess: () => {
          toast({ title: "Review rejected" });
          setReason("");
          setError(null);
          onClose();
        },
        onError: (err) => setError(apiErrorMessage(err, "The review could not be rejected. Try again.")),
      },
    );
  }

  return (
    <Dialog open={!!review} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject review</DialogTitle>
          <DialogDescription>
            {review?.product_name ? `On ${review.product_name}. ` : ""}
            {review?.status === "approved"
              ? "It is published now; rejecting takes it down and removes it from the rating."
              : "It will not be published."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Describes a different product, not this kraft mailer."
            className="mt-1"
          />
          {error && (
            <p role="alert" className="m-0 mt-2 text-sm text-russet">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Rejecting…" : "Reject review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "needs_moderation";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);
  const [rejectTarget, setRejectTarget] = useState<Review | null>(null);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        // "__all__" must survive in the URL: no param means the moderation queue.
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const { data, isLoading, isError } = useAdminReviews({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    page,
    limit: pagination.pageSize,
  });

  const { mutate: approve, isPending: approving, variables: approvingId } = useApproveReview();

  const reviews = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleApprove(r: Review) {
    const { approveLabel } = reviewModeration(r);
    approve(r.id, {
      onSuccess: () =>
        toast({ title: approveLabel === "Keep published" ? "Reports dismissed" : "Review approved" }),
      onError: (err) =>
        toast({
          title: "Could not approve",
          description: apiErrorMessage(err, "Try again."),
          variant: "destructive",
        }),
    });
  }

  const columns: ColumnDef<Review>[] = [
    {
      accessorKey: "product_name",
      header: "Product",
      cell: ({ row }) => (
        <span className="block max-w-[200px] truncate font-medium text-cacao" title={row.original.product_name ?? ""}>
          {row.original.product_name ?? "—"}
          {row.original.vendor_name && (
            <span className="block truncate text-xs font-normal text-taupe">{row.original.vendor_name}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "rating",
      header: "Rating",
      cell: ({ row }) => <StarRating rating={row.original.rating} />,
    },
    {
      accessorKey: "body",
      header: "Review",
      cell: ({ row }) => {
        const text = [row.original.title, row.original.body].filter(Boolean).join(" — ");
        return (
          <span className="block max-w-xs truncate text-sm text-taupe" title={text}>
            {text || <span className="italic">Rating only</span>}
          </span>
        );
      },
    },
    {
      accessorKey: "reviewer_name",
      header: "Reviewer",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">{row.original.reviewer_name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.original.status} />
          {row.original.flag_count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-russet">
              <Flag size={12} aria-hidden="true" />
              {row.original.flag_count} {row.original.flag_count === 1 ? "report" : "reports"}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Submitted",
      cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.created_at)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        const m = reviewModeration(r);
        if (!m.canApprove && !m.canReject) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            {m.canApprove && (
              <Button
                size="sm"
                variant="outline"
                disabled={approving && approvingId === r.id}
                onClick={() => handleApprove(r)}
              >
                {m.approveLabel}
              </Button>
            )}
            {m.canReject && (
              <Button
                size="sm"
                variant="outline"
                className="border-russet/30 text-russet hover:bg-russet/5"
                onClick={() => setRejectTarget(r)}
              >
                Reject
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Review Moderation</h1>
        <p className="text-taupe text-sm">
          New reviews wait here for approval. A published review that buyers report stays live and
          appears here too; after three reports it is hidden until you decide.
        </p>
      </div>

      <FiltersBar
        filters={[
          {
            key: "status",
            label: "Status",
            options: STATUS_OPTIONS,
            value: statusFilter,
            onChange: (v) => updateParam({ status: v }),
          },
        ]}
      />

      {isError ? (
        <p role="alert" className="rounded-lg border border-russet/30 bg-russet/5 px-4 py-3 text-sm text-russet">
          Reviews could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={reviews}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="reviews"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}

      <RejectDialog review={rejectTarget} onClose={() => setRejectTarget(null)} />
    </div>
  );
}
