"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { useReviewBooking } from "@/lib/queries/booking";
import { Eyebrow, MAISON_SANS } from "@/components/checkout/maison-primitives";

/**
 * Review form — completed bookings only (task-3-brief.md's review
 * addendum). Star rating (required) + optional title/body, mirrors
 * `components/account/review-form.tsx`'s (order-item review) shape and
 * inline-panel pattern for visual consistency. No media upload: apps/web has
 * no reusable upload component (S3ImageUploadField/ImageUploader live in
 * @materialhub/ui but are consumed by vendor-dashboard/admin-panel product
 * forms, not the storefront) — adding one is out of scope for this task, so
 * `media_urls` is simply never sent.
 *
 * One review per booking: a 409 from the mutation means someone already
 * reviewed it (there is no GET to detect this ahead of time) — the parent
 * (detail page) is told via `onAlreadyReviewed` and flips to the
 * "already reviewed" state; every other outcome is handled locally.
 */
export function BookingReviewForm({
  bookingId,
  onSubmitted,
  onAlreadyReviewed,
}: {
  bookingId: string;
  onSubmitted: () => void;
  onAlreadyReviewed: () => void;
}) {
  const t = useTranslations("booking.myBookings.review");
  const tCommon = useTranslations("common");
  const reviewMutation = useReviewBooking();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputStyle = {
    border: "1px solid rgba(44,24,16,0.2)",
    background: "rgba(255,255,255,0.55)",
    fontFamily: MAISON_SANS,
    fontSize: 13,
    color: "hsl(var(--nl-cacao))",
  } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setErrorMessage(null);
    try {
      await reviewMutation.mutateAsync({
        bookingId,
        body: { rating, title: title.trim() || undefined, body: body.trim() || undefined },
      });
      onSubmitted();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (error.response?.status === 409) {
        onAlreadyReviewed();
        return;
      }
      setErrorMessage(error.response?.data?.message || error.message || t("genericError"));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 space-y-3"
      style={{ border: "1px solid rgba(44,24,16,0.10)", background: "rgba(44,24,16,0.02)" }}
    >
      <Eyebrow>{t("title")}</Eyebrow>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={t("ratingLabel", { star })}
          >
            <Star
              className="h-6 w-6"
              style={{
                fill: star <= (hoverRating || rating) ? "hsl(var(--nl-amber))" : "transparent",
                color: star <= (hoverRating || rating) ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.25)",
              }}
            />
          </button>
        ))}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        className="w-full px-3 py-2"
        style={inputStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("bodyPlaceholder")}
        rows={3}
        className="w-full px-3 py-2"
        style={inputStyle}
      />

      {errorMessage && (
        <p style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--destructive))" }}>{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={rating === 0 || reviewMutation.isPending}
        className="uppercase disabled:opacity-50"
        style={{
          background: "hsl(var(--nl-amber))",
          color: "hsl(var(--nl-espresso))",
          fontFamily: MAISON_SANS,
          fontSize: 11,
          letterSpacing: "0.22em",
          padding: "11px 24px",
          border: "none",
        }}
      >
        {reviewMutation.isPending ? tCommon("loading") : t("submit")}
      </button>
    </form>
  );
}
