"use client";

import { useSiteSettings, useUpdateSiteSetting } from "@/lib/queries/cms";
import { useAuthStore } from "@/stores/auth";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Skeleton,
} from "@materialhub/ui";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import {
	DEFAULT_SAMPLE_SHIPPING_FILS,
	SAMPLE_SHIPPING_KEY,
	filsSettingToAed,
	parseAedToFils,
} from "./sample-shipping";

/**
 * Samples: the flat shipping rate checkout charges a supplier's shipment when
 * every line from that supplier is a sample. It caps each shipping method for
 * that supplier (a cheaper or free rate still wins).
 */
export default function SampleSettingsPage() {
	const { data, isLoading } = useSiteSettings("samples");
	const update = useUpdateSiteSetting();
	const role = useAuthStore((s) => s.user?.role);
	const canEdit = role === "super_admin";

	// biome-ignore lint/suspicious/noExplicitAny: settings rows are untyped here
	const row = (data as any[] | undefined)?.find(
		(s) => s.key === SAMPLE_SHIPPING_KEY,
	);
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (row) setValue(filsSettingToAed(row.value));
	}, [row]);

	function save() {
		setError(null);
		setSaved(false);
		const fils = parseAedToFils(value);
		if (fils == null) {
			setError("Enter an amount in AED between 0 and 500, e.g. 10 or 7.50.");
			return;
		}
		update.mutate(
			{ key: SAMPLE_SHIPPING_KEY, value: String(fils) },
			{
				onSuccess: () => setSaved(true),
				onError: () => setError("Could not save the rate. Try again."),
			},
		);
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold text-cacao">Samples</h1>
				<p className="mt-1 text-sm text-stone-600">
					Buyers order samples before a run. Vendors turn on a sample per
					product; this rate decides what a sample shipment costs at checkout.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Package size={18} /> Sample shipping rate
					</CardTitle>
					<CardDescription>
						Charged per supplier when everything that supplier ships in an order
						is samples. If the supplier&apos;s normal rate is lower, or shipping
						is free, the lower amount applies. A shipment with any regular line
						pays the supplier&apos;s normal shipping.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{isLoading ? (
						<Skeleton className="h-10 w-48" />
					) : !row ? (
						<p className="text-sm text-red-600">
							The {SAMPLE_SHIPPING_KEY} setting is missing. Run the database
							migrations; until then checkout charges AED{" "}
							{DEFAULT_SAMPLE_SHIPPING_FILS / 100}.
						</p>
					) : (
						<>
							<div>
								<Label htmlFor="sample-rate">Rate per supplier (AED)</Label>
								<div className="mt-1 flex items-center gap-3">
									<Input
										id="sample-rate"
										inputMode="decimal"
										value={value}
										disabled={!canEdit}
										onChange={(e) => {
											setValue(e.target.value);
											setSaved(false);
										}}
										className="w-36 font-mono"
										aria-invalid={!!error}
										aria-describedby="sample-rate-help"
									/>
									<Button
										onClick={save}
										disabled={!canEdit || update.isPending}
									>
										{update.isPending ? "Saving…" : "Save"}
									</Button>
									{saved && (
										<span className="text-sm text-green-700">Saved</span>
									)}
								</div>
								<p
									id="sample-rate-help"
									className="mt-1 text-xs text-stone-500"
								>
									{canEdit
										? "Changing the rate refreshes open checkout quotes."
										: "Only super admins can change this rate."}
								</p>
							</div>
							{error && <p className="text-sm text-red-600">{error}</p>}
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
