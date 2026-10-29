"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, StatusBadge, Skeleton } from "@materialhub/ui";
import {
  useCreatorApplication,
  useApproveCreatorApplication,
  useRejectCreatorApplication,
  useRequestInfoCreatorApplication,
} from "@/lib/queries/creators";

export default function CreatorApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const { data: app, isLoading } = useCreatorApplication(id);
  const { mutate: approve, isPending: approving } = useApproveCreatorApplication();
  const { mutate: reject, isPending: rejecting } = useRejectCreatorApplication();
  const { mutate: requestInfo, isPending: requesting } = useRequestInfoCreatorApplication();

  const [mode, setMode] = useState<null | "reject" | "request">(null);
  const [notes, setNotes] = useState("");

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (!app) return <p className="text-taupe">Application not found.</p>;

  const isOpen = app.status === "pending" || app.status === "needs_info";

  function submitNotes() {
    if (mode === "reject") {
      reject(
        { id, notes },
        {
          onSuccess: () => {
            setMode(null);
            setNotes("");
          },
        },
      );
    } else if (mode === "request") {
      requestInfo(
        { id, notes },
        {
          onSuccess: () => {
            setMode(null);
            setNotes("");
          },
        },
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">{app.display_name}</h1>
          <StatusBadge status={app.status} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          {isOpen && (
            <>
              <Button variant="outline" onClick={() => setMode("request")} disabled={requesting}>
                Request info
              </Button>
              <Button variant="outline" onClick={() => setMode("reject")} disabled={rejecting}>
                Reject
              </Button>
              <Button onClick={() => approve(id)} disabled={approving}>
                {approving ? "Approving..." : "Approve"}
              </Button>
            </>
          )}
        </div>
      </div>

      {mode && (
        <div className="rounded-md border p-4 space-y-3">
          <label className="block text-sm font-medium">
            {mode === "reject" ? "Rejection notes" : "What info is needed?"}
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMode(null);
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitNotes} disabled={!notes.trim()}>
              Submit
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Niche" value={app.primary_category} />
        <Field label="Follower estimate" value={String(app.follower_estimate ?? "—")} />
        <Field label="Bio" value={app.bio} full />
        <Field label="Motivation" value={app.motivation ?? "—"} full />
        <Field
          label="Social links"
          value={
            Object.entries(app.social_links ?? {})
              .filter(([, v]) => !!v)
              .map(([k, v]) => `${k}: ${v}`)
              .join("  •  ") || "—"
          }
          full
        />
        <Field label="Samples" value={(app.sample_urls ?? []).join("\n") || "—"} full />
        {app.review_notes && <Field label="Review notes" value={app.review_notes} full />}
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase text-taupe">{label}</div>
      <div className="whitespace-pre-wrap text-sm text-cacao">{value}</div>
    </div>
  );
}
