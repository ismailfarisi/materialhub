"use client";

import { useCreateVendorFlashDeal } from "@/lib/queries/promotions";
import { Button, toast } from "@materialhub/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	FlashDealForm,
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
	return msg || "Failed to create flash deal.";
}

export default function NewFlashDealPage() {
	const router = useRouter();
	const { mutate: createFlashDeal, isPending } = useCreateVendorFlashDeal();
	const [serverError, setServerError] = useState<string | null>(null);

	function handleSubmit(payload: FlashDealFormSubmit) {
		setServerError(null);
		createFlashDeal(payload as unknown as Record<string, unknown>, {
			onSuccess: () => {
				toast({
					title: "Flash deal created",
					description: "The flash deal has been created successfully.",
				});
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
		});
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
					<h1 className="text-2xl font-bold">New Flash Deal</h1>
					<p className="text-sm text-muted-foreground">
						Create a time-limited flash sale.
					</p>
				</div>
			</div>

			<FlashDealForm
				mode="create"
				isSubmitting={isPending}
				serverError={serverError}
				onSubmit={handleSubmit}
				onCancel={() => router.push("/flash-deals")}
			/>
		</div>
	);
}
