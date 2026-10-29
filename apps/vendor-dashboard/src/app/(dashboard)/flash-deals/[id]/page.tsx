"use client";

import {
	useUpdateVendorFlashDeal,
	useVendorFlashDeal,
} from "@/lib/queries/promotions";
import { Button, toast } from "@materialhub/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
	FlashDealForm,
	type FlashDealFormInitial,
	type FlashDealFormSubmit,
} from "../_components/FlashDealForm";

function mapServerError(msg: string): string {
	if (/already exists/i.test(msg) || /CONFLICT/i.test(msg)) {
		return "This product already has a flash deal in the selected time window. Adjust the dates or disable the existing deal.";
	}
	if (/different vendor/i.test(msg) || /VENDOR_MISMATCH/i.test(msg)) {
		return "This product belongs to another vendor.";
	}
	if (/doesn't belong/i.test(msg) || /VARIANT_MISMATCH/i.test(msg)) {
		return "Selected variant doesn't belong to this product.";
	}
	if (/Product .* not found/i.test(msg) || /PRODUCT_NOT_FOUND/i.test(msg)) {
		return "Product no longer exists. Pick a different one.";
	}
	return msg || "Failed to save flash deal.";
}

export default function EditFlashDealPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const { data: deal, isLoading } = useVendorFlashDeal(params.id);
	const { mutate: updateFlashDeal, isPending } = useUpdateVendorFlashDeal();
	const [serverError, setServerError] = useState<string | null>(null);

	if (isLoading || !deal) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const initial: FlashDealFormInitial = {
		product_id: deal.product_id,
		variant_id: deal.variant_id ?? null,
		title: deal.title ?? "",
		original_price: deal.original_price,
		deal_price: deal.deal_price,
		starts_at:
			typeof deal.starts_at === "string"
				? deal.starts_at
				: new Date(deal.starts_at).toISOString(),
		expires_at:
			typeof deal.expires_at === "string"
				? deal.expires_at
				: new Date(deal.expires_at).toISOString(),
		quantity_limit: deal.quantity_limit ?? null,
	};

	function handleSubmit(payload: FlashDealFormSubmit) {
		setServerError(null);
		// Strip product_id / variant_id — backend update doesn't accept them
		const { product_id: _p, variant_id: _v, ...patch } = payload;
		updateFlashDeal(
			{ id: params.id, payload: patch as unknown as Record<string, unknown> },
			{
				onSuccess: () => {
					toast({ title: "Flash deal updated" });
					router.push("/flash-deals");
				},
				onError: (err: unknown) => {
					const raw =
						(err as { response?: { data?: { message?: string } } })?.response
							?.data?.message ?? "";
					const msg = mapServerError(raw);
					setServerError(msg);
					toast({ title: "Error", description: msg, variant: "destructive" });
				},
			},
		);
	}

	return (
		<div className="space-y-6 max-w-6xl">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" asChild className="p-2">
					<Link href="/flash-deals">
						<ArrowLeft size={18} />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-bold">Edit Flash Deal</h1>
					<p className="text-sm text-muted-foreground">
						{deal.title || "Untitled deal"}
					</p>
				</div>
			</div>

			<FlashDealForm
				mode="edit"
				initial={initial}
				isSubmitting={isPending}
				serverError={serverError}
				onSubmit={handleSubmit}
				onCancel={() => router.push("/flash-deals")}
				submitLabel="Save changes"
			/>
		</div>
	);
}
