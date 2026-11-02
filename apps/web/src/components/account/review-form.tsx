"use client";

import { apiErrorMessage } from "./types";
import { Button } from "@/components/swatch";
import { useCreateReview } from "@/lib/queries/reviews";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, FieldError, Input, Textarea } from "./account-ui";

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
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (rating === 0) {
			setError(t("reviewRatingRequired"));
			return;
		}
		try {
			await createReview.mutateAsync({
				order_item_id: orderItemId,
				rating,
				title: title || undefined,
				body: body || undefined,
			});
			onClose();
		} catch (err) {
			setError(apiErrorMessage(err, tCommon("error")));
		}
	}

	const shown = hoverRating || rating;

	return (
		<form onSubmit={handleSubmit} className="grid gap-4 rounded-md bg-nl-linen/70 p-4 md:p-5">
			<fieldset className="m-0 grid gap-1.5 border-0 p-0">
				<legend className="mb-1.5 text-[13px] font-medium text-nl-cacao">{t("reviewRating")}</legend>
				<div className="flex gap-0.5" onMouseLeave={() => setHoverRating(0)}>
					{[1, 2, 3, 4, 5].map((star) => (
						<button
							key={star}
							type="button"
							aria-label={t("reviewStars", { count: star })}
							aria-pressed={rating === star}
							onClick={() => setRating(star)}
							onMouseEnter={() => setHoverRating(star)}
							className="grid h-11 w-11 place-items-center rounded-md transition-colors hover:bg-nl-cacao/[0.05]"
						>
							<Star
								className={cn(
									"h-6 w-6 transition-colors",
									star <= shown ? "fill-nl-cacao text-nl-cacao" : "fill-transparent text-nl-cacao/30",
								)}
								strokeWidth={1.5}
								aria-hidden="true"
							/>
						</button>
					))}
				</div>
			</fieldset>
			<Field label={t("reviewTitleLabel")} optional>
				{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />}
			</Field>
			<Field label={t("reviewBodyLabel")} optional hint={t("reviewBodyHint")}>
				{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={createReview.isPending}>
					{createReview.isPending ? tCommon("loading") : t("submitReview")}
				</Button>
				<Button type="button" variant="ghost" onClick={onClose}>
					{tCommon("cancel")}
				</Button>
			</div>
		</form>
	);
}
