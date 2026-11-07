/** What a moderator can do with a review row, mirroring ReviewService. */
export interface ReviewModeration {
  canApprove: boolean;
  canReject: boolean;
  /** "Approve" for a new or hidden review; "Keep published" dismisses reports on a live one. */
  approveLabel: "Approve" | "Keep published";
}

export function reviewModeration(r: { status: string; flag_count?: number | null }): ReviewModeration {
  const reported = (r.flag_count ?? 0) > 0;
  if (r.status === "pending" || r.status === "flagged") {
    return { canApprove: true, canReject: true, approveLabel: "Approve" };
  }
  if (r.status === "approved" && reported) {
    return { canApprove: true, canReject: true, approveLabel: "Keep published" };
  }
  return { canApprove: false, canReject: false, approveLabel: "Approve" };
}
