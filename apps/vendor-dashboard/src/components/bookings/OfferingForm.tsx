"use client";

import { api } from "@/lib/api";
import {
	depositValueToFormUnits,
	depositValueToPayloadUnits,
} from "./OfferingForm.helpers";
import {
	type CancellationRefundPolicy,
	type DepositType,
	type LocationMode,
	type PaymentMode,
	type ServiceOffering,
	type ServiceOfferingInput,
	useCreateService,
	useUpdateService,
} from "@/lib/queries/offerings";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	cn,
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	Textarea,
	toast,
} from "@materialhub/ui";
import { Plus, Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ─── Payment/policy trade-off copy (plan-critical, task-4-brief.md) ────────
// Exact one-line copy per payment_mode option, verbatim from the brief. Do
// not paraphrase — the plan calls this out as load-bearing.
const PAYMENT_MODE_OPTIONS: Array<{
	value: PaymentMode;
	label: string;
	description: string;
}> = [
	{
		value: "prepay",
		label: "Prepay",
		description:
			"customer's card is verified now, charged when the service is delivered; strongest booking commitment",
	},
	{
		value: "deposit",
		label: "Deposit",
		description:
			"you keep the deposit on late cancels; card fees aren't returned on refunds",
	},
	{
		value: "pay_at_venue",
		label: "Pay at venue",
		description: "no online payment; no-show protection is strikes only",
	},
];

// The brief only specified verbatim copy for payment_mode — this cancellation
// copy is written to the same one-line trade-off standard from the recon's
// cancel/no-show forfeit semantics, not lifted from the plan text.
const CANCELLATION_POLICY_OPTIONS: Array<{
	value: CancellationRefundPolicy;
	label: string;
	description: string;
}> = [
	{
		value: "full",
		label: "Full refund",
		description:
			"customer always gets a full refund on cancellation; most customer-friendly, no protection for you against late cancels",
	},
	{
		value: "deposit_forfeit",
		label: "Deposit forfeit",
		description:
			"customer forfeits the deposit on a late cancellation, the rest is refunded; only bites if the payment mode actually collects a deposit",
	},
	{
		value: "percent",
		label: "Percentage penalty",
		description:
			"a percentage you set is forfeited on a late cancellation; you choose the exact penalty below",
	},
];

const LOCATION_MODE_OPTIONS: Array<{ value: LocationMode; label: string }> = [
	{ value: "at_premises", label: "At premises" },
	{ value: "home_visit", label: "Home visit" },
	{ value: "either", label: "Either" },
];

const DEPOSIT_TYPE_OPTIONS: Array<{ value: DepositType; label: string }> = [
	{ value: "percent", label: "Percent of price" },
	{ value: "fixed", label: "Fixed amount (AED)" },
];

const NO_CATEGORY = "__none__";

// These render as public media on the storefront once published — validate
// format client-side (task-4-review.md M-2). Blank rows are allowed (dropped
// before the payload is built) and don't produce an error.
const mediaUrlSchema = z.string().trim().url("Enter a valid URL, e.g. https://example.com/photo.jpg");

const offeringFormSchema = z
	.object({
		name: z.string().min(1, "Name is required").max(255),
		description: z.string().max(5000).optional(),
		category_id: z.string().optional(),
		duration_minutes: z.coerce
			.number({ invalid_type_error: "Duration is required" })
			.int("Whole minutes only")
			.min(1, "Duration must be at least 1 minute"),
		buffer_before_minutes: z.coerce.number().int().min(0, "Must be 0 or more"),
		buffer_after_minutes: z.coerce.number().int().min(0, "Must be 0 or more"),
		slot_step_minutes: z.coerce
			.number()
			.int()
			.min(5, "Minimum slot step is 5 minutes"),
		location_mode: z.enum(["at_premises", "home_visit", "either"]),
		price_aed: z.coerce
			.number({ invalid_type_error: "Price is required" })
			.min(0.01, "Price must be greater than zero"),
		vat_rate: z.coerce.number().min(0, "Must be 0 or more").max(100, "Must be 100 or less"),
		min_notice_minutes: z.coerce.number().int().min(0, "Must be 0 or more"),
		max_advance_days: z.coerce.number().int().min(1, "Must be at least 1 day"),
		cancellation_window_hours: z.coerce.number().int().min(0, "Must be 0 or more"),
		reschedule_window_hours: z.coerce.number().int().min(0, "Must be 0 or more"),
		auto_approve: z.boolean(),
		// Explicit-selection fields (plan-critical): no default, superRefine below
		// blocks submit until both are chosen.
		payment_mode: z.enum(["prepay", "deposit", "pay_at_venue"]).optional(),
		deposit_type: z.enum(["percent", "fixed", "none"]),
		// AED-facing for `fixed` (decimals allowed — converted to fils in
		// buildPayload), whole percent for `percent` (enforced in superRefine).
		deposit_value: z.coerce.number().min(0, "Must be 0 or more"),
		cancellation_refund_policy: z.enum(["full", "deposit_forfeit", "percent"]).optional(),
		cancellation_penalty_percent: z.coerce.number().int().min(0).max(100),
	})
	.superRefine((val, ctx) => {
		if (!val.payment_mode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["payment_mode"],
				message: "Choose a payment mode before saving.",
			});
		}
		if (val.payment_mode === "deposit") {
			if (!val.deposit_type || val.deposit_type === "none") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["deposit_type"],
					message: "Choose how the deposit is calculated.",
				});
			}
			if (!val.deposit_value || val.deposit_value <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["deposit_value"],
					message: "Enter a deposit amount greater than zero.",
				});
			}
			if (val.deposit_type === "percent") {
				if (val.deposit_value > 100) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["deposit_value"],
						message: "Deposit percentage cannot exceed 100.",
					});
				}
				if (!Number.isInteger(val.deposit_value)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["deposit_value"],
						message: "Whole percentages only.",
					});
				}
			}
			// Fixed deposits are entered in AED and stored in fils — reject
			// sub-fils precision rather than silently rounding the vendor's number.
			if (
				val.deposit_type === "fixed" &&
				Math.abs(val.deposit_value * 100 - Math.round(val.deposit_value * 100)) > 1e-9
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["deposit_value"],
					message: "Use at most 2 decimal places (fils).",
				});
			}
		}
		if (!val.cancellation_refund_policy) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["cancellation_refund_policy"],
				message: "Choose a cancellation & refund policy before saving.",
			});
		}
		if (val.cancellation_refund_policy === "percent" && !val.cancellation_penalty_percent) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["cancellation_penalty_percent"],
				message: "Enter a penalty percentage greater than zero.",
			});
		}
	});

type OfferingFormValues = z.infer<typeof offeringFormSchema>;

interface CategoryNode {
	id: string;
	name: string;
	children?: CategoryNode[];
}

function flattenCategories(
	nodes: CategoryNode[],
	depth = 0,
): Array<{ id: string; label: string }> {
	return nodes.flatMap((n) => [
		{ id: n.id, label: `${"— ".repeat(depth)}${n.name}` },
		...(n.children ? flattenCategories(n.children, depth + 1) : []),
	]);
}

function defaultsFor(offering?: ServiceOffering): OfferingFormValues {
	if (!offering) {
		return {
			name: "",
			description: "",
			category_id: NO_CATEGORY,
			duration_minutes: 60,
			buffer_before_minutes: 0,
			buffer_after_minutes: 0,
			slot_step_minutes: 15,
			location_mode: "at_premises",
			price_aed: 0,
			vat_rate: 5,
			min_notice_minutes: 0,
			max_advance_days: 60,
			cancellation_window_hours: 24,
			reschedule_window_hours: 24,
			auto_approve: true,
			payment_mode: undefined,
			deposit_type: "none",
			deposit_value: 0,
			cancellation_refund_policy: undefined,
			cancellation_penalty_percent: 100,
		};
	}
	return {
		name: offering.name,
		description: offering.description ?? "",
		category_id: offering.category_id ?? NO_CATEGORY,
		duration_minutes: offering.duration_minutes,
		buffer_before_minutes: offering.buffer_before_minutes,
		buffer_after_minutes: offering.buffer_after_minutes,
		slot_step_minutes: offering.slot_step_minutes,
		location_mode: offering.location_mode,
		price_aed: offering.price_fils / 100,
		vat_rate: Number(offering.vat_rate),
		min_notice_minutes: offering.min_notice_minutes,
		max_advance_days: offering.max_advance_days,
		cancellation_window_hours: offering.cancellation_window_hours,
		reschedule_window_hours: offering.reschedule_window_hours,
		auto_approve: offering.auto_approve,
		// Existing offerings already have a payment_mode/policy on the backend
		// (DB defaults), but we still show them as real selections here rather
		// than inventing new UI state — editing an existing offering doesn't
		// need the "force a choice" guard re-applied to values it already has.
		payment_mode: offering.payment_mode,
		deposit_type: offering.deposit_type,
		// Stored fils → AED for `fixed`; unscaled for `percent`. See
		// OfferingForm.helpers.ts.
		deposit_value: depositValueToFormUnits(
			offering.deposit_type,
			offering.deposit_value ?? 0,
		),
		cancellation_refund_policy: offering.cancellation_refund_policy,
		cancellation_penalty_percent: offering.cancellation_penalty_percent ?? 100,
	};
}

// `isEdit` controls whether an emptied/inapplicable field is OMITTED (create —
// unchanged semantics, server-side defaults apply) or sent as an explicit
// CLEARING value (edit — omission is a no-op against the backend's
// Object.assign(offering, body) partial-update, so a vendor who empties a
// field and saves would otherwise see the stale value persist and reappear on
// next load; task-4-review.md I-2). description/category_id/media_urls clear
// via null/[] (backend DTO declares them nullable-or-array); deposit and
// penalty fields are non-nullable columns with real defaults, so they clear
// via the semantic "off" value instead of null (deposit_type "none" +
// deposit_value 0; cancellation_penalty_percent 0) — this also closes the
// deposit→prepay stale-value leak onto the public GET /services/:slug read.
function buildPayload(
	values: OfferingFormValues,
	mediaUrls: string[],
	isEdit: boolean,
): ServiceOfferingInput {
	if (!values.payment_mode || !values.cancellation_refund_policy) {
		// Unreachable in practice — zodResolver blocks handleSubmit before this
		// runs — but keeps the payload builder's types honest.
		throw new Error("payment_mode and cancellation_refund_policy are required");
	}
	const payload: ServiceOfferingInput = {
		name: values.name.trim(),
		duration_minutes: values.duration_minutes,
		buffer_before_minutes: values.buffer_before_minutes,
		buffer_after_minutes: values.buffer_after_minutes,
		slot_step_minutes: values.slot_step_minutes,
		location_mode: values.location_mode,
		payment_mode: values.payment_mode,
		price_fils: Math.round(values.price_aed * 100),
		vat_rate: values.vat_rate,
		min_notice_minutes: values.min_notice_minutes,
		max_advance_days: values.max_advance_days,
		cancellation_window_hours: values.cancellation_window_hours,
		cancellation_refund_policy: values.cancellation_refund_policy,
		reschedule_window_hours: values.reschedule_window_hours,
		auto_approve: values.auto_approve,
	};
	if (values.description?.trim()) {
		payload.description = values.description.trim();
	} else if (isEdit) {
		payload.description = null;
	}
	if (values.category_id && values.category_id !== NO_CATEGORY) {
		payload.category_id = values.category_id;
	} else if (isEdit) {
		payload.category_id = null;
	}
	if (mediaUrls.length > 0) {
		payload.media_urls = mediaUrls;
	} else if (isEdit) {
		payload.media_urls = [];
	}
	if (values.payment_mode === "deposit") {
		payload.deposit_type = values.deposit_type;
		// AED → fils for `fixed` (the backend reads deposit_value as fils
		// unconditionally in the fixed branch); percent stays literal.
		payload.deposit_value = depositValueToPayloadUnits(
			values.deposit_type,
			values.deposit_value,
		);
	} else if (isEdit) {
		payload.deposit_type = "none";
		payload.deposit_value = 0;
	}
	if (values.cancellation_refund_policy === "percent") {
		payload.cancellation_penalty_percent = values.cancellation_penalty_percent;
	} else if (isEdit) {
		payload.cancellation_penalty_percent = 0;
	}
	return payload;
}

interface OfferingFormProps {
	offering?: ServiceOffering;
	canWrite: boolean;
}

export function OfferingForm({ offering, canWrite }: OfferingFormProps) {
	const router = useRouter();
	const isEdit = !!offering;

	const { mutateAsync: createService, isPending: creating } = useCreateService();
	const { mutateAsync: updateService, isPending: updating } = useUpdateService();
	const isPending = creating || updating;

	const [mediaUrls, setMediaUrls] = useState<string[]>(offering?.media_urls ?? []);
	const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);

	useEffect(() => {
		let cancelled = false;
		api
			.get("/categories/tree")
			.then((res) => {
				if (cancelled) return;
				setCategories(flattenCategories(res.data.data ?? []));
			})
			.catch(() => {
				if (!cancelled) setCategories([]);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const form = useForm<OfferingFormValues>({
		resolver: zodResolver(offeringFormSchema),
		defaultValues: defaultsFor(offering),
	});

	// Tracks which offering id the form currently reflects. Resetting on every
	// reference change of `offering` (the old behavior) silently wiped unsaved
	// edits: a status-action PATCH (Publish/Pause/Archive) on this same page
	// invalidates the shared ["vendor","services"] query, the refetch produces
	// a brand-new array/object for the *same* offering, and the effect used to
	// fire and clobber the in-progress edit (task-4-review.md I-1). Keying the
	// reset to the offering *id* changing — rather than object identity — means
	// a same-id refetch is a no-op here, while navigating to a genuinely
	// different offering still populates the form correctly.
	const loadedOfferingIdRef = useRef<string | undefined>(offering?.id);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only the offering identity (id) should trigger a reset; `form` is a stable object from useForm.
	useEffect(() => {
		if (!offering || loadedOfferingIdRef.current === offering.id) return;
		loadedOfferingIdRef.current = offering.id;
		form.reset(defaultsFor(offering));
		setMediaUrls(offering.media_urls ?? []);
	}, [offering]);

	const paymentMode = form.watch("payment_mode");
	const cancellationPolicy = form.watch("cancellation_refund_policy");
	const depositType = form.watch("deposit_type");

	const missingPolicySelection = !paymentMode || !cancellationPolicy;

	const mediaUrlErrors = useMemo(
		() =>
			mediaUrls.map((url) => {
				const trimmed = url.trim();
				if (!trimmed) return null;
				const result = mediaUrlSchema.safeParse(trimmed);
				return result.success ? null : (result.error.issues[0]?.message ?? "Enter a valid URL");
			}),
		[mediaUrls],
	);
	const hasInvalidMediaUrl = mediaUrlErrors.some(Boolean);

	async function onSubmit(values: OfferingFormValues) {
		try {
			const payload = buildPayload(
				values,
				mediaUrls.map((u) => u.trim()).filter(Boolean),
				isEdit,
			);
			if (isEdit && offering) {
				await updateService({ id: offering.id, payload });
				toast({ title: "Service updated" });
			} else {
				const created = await createService(payload);
				toast({ title: "Service created", description: "Saved as a draft." });
				router.push(`/services/${created.id}/edit`);
				return;
			}
			router.push("/services");
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not save service",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	const categoryOptions = useMemo(
		() => [{ id: NO_CATEGORY, label: "No category" }, ...categories],
		[categories],
	);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
				{!canWrite && (
					<div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-cacao">
						You have read-only access to Services. Ask an owner or manager to make
						changes.
					</div>
				)}

				{/* display:contents removes the fieldset's own box (default border/padding)
				    while keeping native disabled-cascade to every descendant control;
				    space-y-6 still applies because the Cards remain real DOM children
				    of this element. */}
				<fieldset disabled={!canWrite} className="contents space-y-6">
					{/* ─── Basics ─────────────────────────────────────────── */}
					<Card>
						<CardHeader>
							<CardTitle>Basics</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name *</FormLabel>
										<Input placeholder="e.g. Signature Facial" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<Textarea
											rows={4}
											placeholder="Describe what's included…"
											{...field}
										/>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="category_id"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Category</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger>
												<SelectValue placeholder="Select a category" />
											</SelectTrigger>
											<SelectContent>
												{categoryOptions.map((c) => (
													<SelectItem key={c.id} value={c.id}>
														{c.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div>
								<Label className="mb-2 block">Media URLs</Label>
								<div className="space-y-2">
									{mediaUrls.map((url, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: list is append/remove only, no reordering
										<div key={i} className="space-y-1">
											<div className="flex gap-2">
												<Input
													placeholder="https://…"
													value={url}
													onChange={(e) => {
														const next = [...mediaUrls];
														next[i] = e.target.value;
														setMediaUrls(next);
													}}
												/>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() =>
														setMediaUrls(mediaUrls.filter((_, j) => j !== i))
													}
												>
													<Trash size={16} />
												</Button>
											</div>
											{mediaUrlErrors[i] && (
												<p className="text-sm font-medium text-destructive">
													{mediaUrlErrors[i]}
												</p>
											)}
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setMediaUrls([...mediaUrls, ""])}
									>
										<Plus size={14} className="mr-1" /> Add media URL
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* ─── Duration, buffers, slot step ──────────────────────── */}
					<Card>
						<CardHeader>
							<CardTitle>Duration &amp; Scheduling</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="duration_minutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Duration (minutes) *</FormLabel>
										<Input type="number" min={1} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="slot_step_minutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Slot step (minutes)</FormLabel>
										<Input type="number" min={5} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="buffer_before_minutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Buffer before (minutes)</FormLabel>
										<Input type="number" min={0} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="buffer_after_minutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Buffer after (minutes)</FormLabel>
										<Input type="number" min={0} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* ─── Location ───────────────────────────────────────── */}
					<Card>
						<CardHeader>
							<CardTitle>Location</CardTitle>
						</CardHeader>
						<CardContent>
							<FormField
								control={form.control}
								name="location_mode"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Where is this delivered?</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{LOCATION_MODE_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* ─── Pricing ────────────────────────────────────────── */}
					<Card>
						<CardHeader>
							<CardTitle>Pricing</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="price_aed"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Price (AED) *</FormLabel>
										<Input type="number" min={0} step="0.01" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="vat_rate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>VAT rate (%)</FormLabel>
										<Input type="number" min={0} max={100} step="0.01" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* ─── Booking rules ──────────────────────────────────── */}
					<Card>
						<CardHeader>
							<CardTitle>Booking Rules</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="min_notice_minutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Minimum notice (minutes)</FormLabel>
										<Input type="number" min={0} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="max_advance_days"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Max advance booking (days)</FormLabel>
										<Input type="number" min={1} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="cancellation_window_hours"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Cancellation window (hours)</FormLabel>
										<Input type="number" min={0} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="reschedule_window_hours"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Reschedule window (hours)</FormLabel>
										<Input type="number" min={0} {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="auto_approve"
								render={({ field }) => (
									<FormItem className="col-span-2 flex items-center justify-between rounded-lg border border-pearl/28 p-3">
										<div>
											<FormLabel>Auto-approve bookings</FormLabel>
											<p className="text-xs text-muted-foreground">
												Off means every booking needs manual confirmation.
											</p>
										</div>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* ─── Payment & policy (plan-critical: no default selection) ── */}
					<Card>
						<CardHeader>
							<CardTitle>Payment &amp; Cancellation Policy</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<FormField
								control={form.control}
								name="payment_mode"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Payment mode *</FormLabel>
										<div className="space-y-2">
											{PAYMENT_MODE_OPTIONS.map((opt) => (
												<label
													key={opt.value}
													className={cn(
														"flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
														field.value === opt.value
															? "border-amber bg-amber/10"
															: "border-pearl/28",
													)}
												>
													<input
														type="radio"
														name="payment_mode"
														className="mt-1"
														checked={field.value === opt.value}
														onChange={() => field.onChange(opt.value)}
													/>
													<span>
														<span className="block text-sm font-medium">
															{opt.label}
														</span>
														<span className="block text-xs text-muted-foreground">
															{opt.description}
														</span>
													</span>
												</label>
											))}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>

							{paymentMode === "deposit" && (
								<div className="grid grid-cols-2 gap-4 rounded-lg border border-pearl/28 p-3">
									<FormField
										control={form.control}
										name="deposit_type"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Deposit type</FormLabel>
												<Select
													value={field.value}
													onValueChange={field.onChange}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{DEPOSIT_TYPE_OPTIONS.map((opt) => (
															<SelectItem key={opt.value} value={opt.value}>
																{opt.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="deposit_value"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{depositType === "percent"
														? "Deposit (%)"
														: "Deposit (AED)"}
												</FormLabel>
												<Input
													type="number"
													min={0}
													step={depositType === "percent" ? "1" : "0.01"}
													{...field}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)}

							<FormField
								control={form.control}
								name="cancellation_refund_policy"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Cancellation &amp; refund policy *</FormLabel>
										<div className="space-y-2">
											{CANCELLATION_POLICY_OPTIONS.map((opt) => (
												<label
													key={opt.value}
													className={cn(
														"flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
														field.value === opt.value
															? "border-amber bg-amber/10"
															: "border-pearl/28",
													)}
												>
													<input
														type="radio"
														name="cancellation_refund_policy"
														className="mt-1"
														checked={field.value === opt.value}
														onChange={() => field.onChange(opt.value)}
													/>
													<span>
														<span className="block text-sm font-medium">
															{opt.label}
														</span>
														<span className="block text-xs text-muted-foreground">
															{opt.description}
														</span>
													</span>
												</label>
											))}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>

							{cancellationPolicy === "percent" && (
								<FormField
									control={form.control}
									name="cancellation_penalty_percent"
									render={({ field }) => (
										<FormItem className="max-w-xs">
											<FormLabel>Penalty (%)</FormLabel>
											<Input type="number" min={0} max={100} {...field} />
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</CardContent>
					</Card>
				</fieldset>

				{canWrite && (
					<div className="flex gap-2">
						<Button
							type="submit"
							disabled={isPending || missingPolicySelection || hasInvalidMediaUrl}
						>
							{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Service"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => router.push("/services")}
							disabled={isPending}
						>
							Cancel
						</Button>
					</div>
				)}
			</form>
		</Form>
	);
}
