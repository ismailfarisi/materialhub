"use client";

import { useUpdateVendorTax, useVendorProfile } from "@/lib/queries/settings";
import { type TrnState, trnState, validateTrn } from "@/lib/trn";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Skeleton,
	toast,
} from "@materialhub/ui";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const STATE_COPY: Record<TrnState, { label: string; className: string }> = {
	missing: {
		label: "Not provided",
		className: "bg-pearl/20 text-taupe border border-pearl/30",
	},
	invalid: {
		label: "Not 15 digits",
		className: "bg-russet/10 text-russet border border-russet/30",
	},
	unverified: {
		label: "Awaiting check by MaterialHub",
		className: "bg-caramel/10 text-caramel border border-caramel/30",
	},
	verified: {
		label: "Verified",
		className: "bg-amber/10 text-amber border border-amber/30",
	},
};

function errorMessage(err: unknown): string {
	const e = err as {
		response?: { status?: number; data?: { code?: string; message?: string } };
	};
	if (e?.response?.data?.code === "TRN_INVALID")
		return "The TRN must be 15 digits.";
	if (e?.response?.status === 403)
		return "Your role can't change the store's tax details.";
	return e?.response?.data?.message ?? "Could not save the TRN. Try again.";
}

export function TaxRegistrationPanel() {
	const { data: profile, isLoading } = useVendorProfile();
	const { mutate: saveTax, isPending } = useUpdateVendorTax();
	const [value, setValue] = useState("");
	const [touched, setTouched] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	useEffect(() => {
		if (profile) setValue(profile.trn ?? "");
	}, [profile]);

	if (isLoading) return <Skeleton className="h-56 rounded-xl max-w-2xl" />;

	const current: string | null = profile?.trn ?? null;
	const state = trnState(profile ?? {});
	const check = validateTrn(value);
	const changed = check.ok ? check.value !== current : true;
	const showError = touched && !check.ok;
	const badge = STATE_COPY[state];

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (!check.ok || !changed) return;
		setServerError(null);
		saveTax(
			{ trn: check.value },
			{
				onSuccess: () => {
					setTouched(false);
					toast({
						title: check.value ? "TRN saved" : "TRN removed",
						description: check.value
							? "MaterialHub will check it before marking it verified."
							: undefined,
					});
				},
				onError: (err) => setServerError(errorMessage(err)),
			},
		);
	}

	return (
		<Card className="max-w-2xl">
			<CardHeader className="pb-3">
				<CardTitle className="text-base font-semibold">
					Tax registration (TRN)
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Your TRN is printed on the VAT tax invoices MaterialHub issues for
					your sales, and is needed for e-invoicing from 2027.
				</p>
			</CardHeader>
			<CardContent className="space-y-5">
				<dl className="grid gap-4 sm:grid-cols-2">
					<div>
						<dt className="text-xs text-muted-foreground mb-1">Current TRN</dt>
						<dd className="font-mono text-sm tabular-nums">
							{current ? (
								<bdi dir="ltr">{current}</bdi>
							) : (
								<span className="font-sans text-muted-foreground">None</span>
							)}
						</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground mb-1">Status</dt>
						<dd>
							<span
								className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
							>
								{state === "verified" && (
									<CheckCircle size={12} weight="bold" aria-hidden />
								)}
								{state === "invalid" && (
									<Warning size={12} weight="bold" aria-hidden />
								)}
								{badge.label}
							</span>
						</dd>
					</div>
				</dl>

				<form onSubmit={onSubmit} className="space-y-3" noValidate>
					<div className="space-y-1.5">
						<Label htmlFor="vendor-trn">TRN</Label>
						<Input
							id="vendor-trn"
							inputMode="numeric"
							autoComplete="off"
							dir="ltr"
							className="font-mono tabular-nums max-w-xs"
							placeholder="15 digits, e.g. 100234567800003"
							value={value}
							onChange={(e) => {
								setValue(e.target.value);
								setServerError(null);
							}}
							onBlur={() => setTouched(true)}
							aria-invalid={showError}
							aria-describedby="vendor-trn-help"
						/>
						<p
							id="vendor-trn-help"
							className={`text-xs ${showError ? "text-destructive" : "text-muted-foreground"}`}
						>
							{showError && !check.ok
								? check.error
								: state === "verified"
									? "Changing it sends it back for checking."
									: "Leave empty if your business is not VAT-registered."}
						</p>
					</div>
					{serverError && (
						<p role="alert" className="text-sm text-destructive">
							{serverError}
						</p>
					)}
					<Button type="submit" disabled={isPending || !changed || !check.ok}>
						{isPending ? "Saving…" : "Save TRN"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
