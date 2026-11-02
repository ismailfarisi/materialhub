"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { useCreateReview } from "@/lib/queries/reviews";
import {
  Eyebrow,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

export function ReviewForm({
  orderItemId,
  onClose,
}: {
  orderItemId: string;
  onClose: () => void;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const createReview = useCreateReview();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const inputStyle = {
    border: "1px solid rgba(15,18,24,0.2)",
    background: "rgba(255,255,255,0.55)",
    fontFamily: MAISON_SANS,
    fontSize: 13,
    color: "hsl(var(--nl-cacao))",
  } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    await createReview.mutateAsync({
      order_item_id: orderItemId,
      rating,
      title: title || undefined,
      body: body || undefined,
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 space-y-3"
      style={{
        border: "1px solid rgba(15,18,24,0.10)",
        background: "rgba(15,18,24,0.02)",
      }}
    >
      <Eyebrow>{t("leaveReview")}</Eyebrow>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
          >
            <Star
              className="h-6 w-6"
              style={{
                fill:
                  star <= (hoverRating || rating)
                    ? "hsl(var(--nl-amber))"
                    : "transparent",
                color:
                  star <= (hoverRating || rating)
                    ? "hsl(var(--nl-amber))"
                    : "rgba(15,18,24,0.25)",
              }}
            />
          </button>
        ))}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("reviewTitlePlaceholder")}
        className="w-full px-3 py-2"
        style={inputStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("reviewBodyPlaceholder")}
        rows={3}
        className="w-full px-3 py-2"
        style={inputStyle}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={rating === 0 || createReview.isPending}
          className="uppercase disabled:opacity-50"
          style={{
            background: "hsl(var(--nl-amber))",
            color: "hsl(var(--nl-espresso))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "11px 24px",
            border: "none",
            borderRadius: 0,
          }}
        >
          {createReview.isPending ? tCommon("loading") : tCommon("submit")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="uppercase"
          style={{
            background: "transparent",
            border: "1px solid rgba(15,18,24,0.4)",
            color: "hsl(var(--nl-cacao))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "11px 24px",
            borderRadius: 0,
          }}
        >
          {tCommon("cancel")}
        </button>
      </div>
    </form>
  );
}
