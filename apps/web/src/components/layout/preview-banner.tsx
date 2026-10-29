"use client";

interface PreviewBannerProps {
  status: "active" | "expired" | "not_found" | "wrong_page";
  bidIdShort?: string;
  expiresAt?: string;
}

export function PreviewBanner({ status, bidIdShort, expiresAt }: PreviewBannerProps) {
  const message =
    status === "active"
      ? `Preview mode — viewing bid ${bidIdShort ?? ""}${expiresAt ? ` · token expires ${new Date(expiresAt).toLocaleTimeString("en-AE")}` : ""}`
      : status === "expired"
        ? "Preview token expired — refresh from the dashboard."
        : status === "not_found"
          ? "Bid not found — showing live page."
          : "Bid is on a different page — showing live page.";

  const tone = status === "active" ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-yellow-50 text-yellow-900 border-yellow-200";

  return (
    <div className={`border-b ${tone} px-4 py-2 text-sm text-center`}>
      <strong className="mr-2">⚠ Preview</strong>
      {message}
    </div>
  );
}
