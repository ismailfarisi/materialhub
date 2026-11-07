"use client";

import type { Integration } from "@/lib/integrations/api";
import {
	useDeleteIntegration,
	useIntegration,
	useUpdateIntegration,
} from "@/lib/integrations/hooks";
import { Button, Input, Label, Skeleton, Switch, toast } from "@materialhub/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsClockwise, Copy } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { AuthoritySelector } from "./AuthoritySelector";
import { HelpDrawer } from "./HelpDrawer";
import { IpAllowlistEditor } from "./IpAllowlistEditor";
import { SecretRotationDialog } from "./SecretRotationDialog";
import { inboundIntegrationUrl } from "@/lib/urls";

// ─── Schema ───────────────────────────────────────────────────────────────────

const setupSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required.")
		.max(255, "Name must be 255 characters or fewer."),
	is_active: z.boolean(),
	outbound_url: z
		.string()
		.optional()
		.refine(
			(v) => !v || /^https?:\/\/.+/.test(v),
			"Outbound URL must start with http:// or https://.",
		),
	inbound_ip_allowlist: z.array(z.object({ value: z.string() })),
	inventory_authority: z.enum(["authoritative", "advisory"]),
	pricing_authority: z.enum(["authoritative", "advisory"]),
});

export type SetupFormValues = z.infer<typeof setupSchema>;

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
	label,
	danger,
}: {
	label: string;
	danger?: boolean;
}) {
	return (
		<div className="mb-4">
			<p
				className={[
					"text-xs font-semibold uppercase tracking-widest",
					danger ? "text-russet" : "text-taupe",
				].join(" ")}
			>
				{label}
			</p>
			{!danger && <div className="mt-1 h-px w-6 bg-amber" />}
		</div>
	);
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function Divider() {
	return <div className="border-t border-pearl/14 mt-8 pt-8" />;
}

// ─── Read-only secret row ─────────────────────────────────────────────────────

function SecretRow({
	label,
	last4,
	onRotate,
}: {
	label: string;
	last4: string | null;
	onRotate: () => void;
}) {
	const masked = last4 ? `••••${last4}` : "••••••••";
	return (
		<div className="space-y-1.5">
			<Label className="text-sm font-medium text-cacao">{label}</Label>
			<div className="flex items-center gap-3">
				<code className="flex-1 rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2 font-mono text-sm text-cacao">
					{masked}
				</code>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onRotate}
					className="shrink-0 gap-1.5"
				>
					<ArrowsClockwise size={13} />
					Rotate
				</Button>
			</div>
		</div>
	);
}

// ─── Inbound URL row ──────────────────────────────────────────────────────────

function InboundUrlRow({ id }: { id: string }) {
	// The API serves this (not the dashboard origin); the event type is the
	// last path segment.
	const url = inboundIntegrationUrl(id);

	function handleCopy() {
		navigator.clipboard.writeText(url).then(() => {
			toast({ title: "Copied to clipboard" });
		});
	}

	return (
		<div className="space-y-1.5">
			<Label className="text-sm font-medium text-cacao">Inbound URL</Label>
			<div className="flex items-center gap-3">
				<code className="flex-1 rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2 font-mono text-sm text-cacao break-all">
					{url}
				</code>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleCopy}
					className="shrink-0 gap-1.5"
				>
					<Copy size={13} />
					Copy
				</Button>
			</div>
		</div>
	);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function integrationToFormValues(i: Integration): SetupFormValues {
	return {
		name: i.name,
		is_active: i.is_active,
		outbound_url: i.outbound_url ?? "",
		inbound_ip_allowlist: i.inbound_ip_allowlist.map((v) => ({ value: v })),
		inventory_authority: i.inventory_authority,
		pricing_authority: i.pricing_authority,
	};
}

// ─── Inner form (rendered after data loads) ───────────────────────────────────

interface InnerFormProps {
	id: string;
	integration: Integration;
}

function InnerForm({ id, integration }: InnerFormProps) {
	const router = useRouter();
	const { mutateAsync: updateAsync } = useUpdateIntegration(id);
	const { mutateAsync: deleteAsync, isPending: isDeleting } =
		useDeleteIntegration();

	const defaultValues = integrationToFormValues(integration);

	const methods = useForm<SetupFormValues>({
		resolver: zodResolver(setupSchema),
		defaultValues,
	});

	const {
		register,
		handleSubmit,
		reset,
		watch,
		setValue,
		control,
		formState: { errors, isDirty, isSubmitting },
	} = methods;

	// Reset when integration data changes (e.g. after a save)
	useEffect(() => {
		reset(integrationToFormValues(integration));
	}, [integration, reset]);

	// Delete two-click state
	const [deleteArmed, setDeleteArmed] = useState(false);
	const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function armDelete() {
		setDeleteArmed(true);
		deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
	}

	async function handleDelete() {
		if (!deleteArmed) {
			armDelete();
			return;
		}
		if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
		await deleteAsync(id);
		router.push("/integrations");
	}

	// Secret rotation dialog state
	const [rotateDir, setRotateDir] = useState<"outbound" | "inbound" | null>(
		null,
	);

	// HMAC help drawer state
	const [helpOpen, setHelpOpen] = useState(false);

	async function onSubmit(values: SetupFormValues) {
		const ipList = values.inbound_ip_allowlist
			.map((e) => e.value.trim())
			.filter(Boolean);

		await updateAsync({
			name: values.name,
			is_active: values.is_active,
			outbound_url: values.outbound_url?.trim() || null,
			inbound_ip_allowlist: ipList,
			inventory_authority: values.inventory_authority,
			pricing_authority: values.pricing_authority,
		});

		toast({ title: "Integration saved" });
	}

	const inventoryAuthority = watch("inventory_authority");
	const pricingAuthority = watch("pricing_authority");
	const isActive = watch("is_active");

	return (
		<FormProvider {...methods}>
			<form onSubmit={handleSubmit(onSubmit)} noValidate>
				{/* ── GENERAL ──────────────────────────────────────── */}
				<SectionHeader label="General" />

				<div className="space-y-5">
					{/* Name */}
					<div className="space-y-1.5">
						<Label
							htmlFor="setup-name"
							className="text-sm font-medium text-cacao"
						>
							Name <span className="text-russet">*</span>
						</Label>
						<Input
							id="setup-name"
							placeholder="e.g. Acme Fulfillment"
							{...register("name")}
						/>
						{errors.name ? (
							<p className="text-xs text-russet">{errors.name.message}</p>
						) : (
							<p className="text-xs text-taupe">
								Display name for this integration.
							</p>
						)}
					</div>

					{/* Active */}
					<div className="flex items-center gap-3">
						<Switch
							id="setup-active"
							checked={isActive}
							onCheckedChange={(checked) =>
								setValue("is_active", checked, { shouldDirty: true })
							}
						/>
						<div>
							<Label
								htmlFor="setup-active"
								className="text-sm font-medium text-cacao"
							>
								Active
							</Label>
							<p className="text-xs text-taupe mt-0.5">
								When off, deliveries pause and the inbound URL returns 503.
							</p>
						</div>
					</div>
				</div>

				<Divider />

				{/* ── OUTBOUND ─────────────────────────────────────── */}
				<SectionHeader label="Outbound" />

				<p className="text-sm text-taupe mb-5">
					Where events are pushed when they occur in your store. Leave blank to
					disable outbound.
				</p>

				<div className="space-y-5">
					{/* Outbound URL */}
					<div className="space-y-1.5">
						<Label
							htmlFor="setup-outbound-url"
							className="text-sm font-medium text-cacao"
						>
							Outbound webhook URL
						</Label>
						<Input
							id="setup-outbound-url"
							placeholder="https://partner.example.com/webhooks/materialhub"
							{...register("outbound_url")}
						/>
						{errors.outbound_url ? (
							<p className="text-xs text-russet">
								{errors.outbound_url.message}
							</p>
						) : (
							<p className="text-xs text-taupe">
								POST endpoint that receives signed webhooks.
							</p>
						)}
						<button
							type="button"
							onClick={() => setHelpOpen(true)}
							className="text-xs uppercase tracking-wide text-taupe hover:text-cacao transition-colors duration-200 underline-offset-4 hover:underline"
						>
							How to verify our signature
						</button>
					</div>

					{/* Outbound secret */}
					<SecretRow
						label="Outbound secret"
						last4={integration.outbound_secret_last4}
						onRotate={() => setRotateDir("outbound")}
					/>
				</div>

				<Divider />

				{/* ── INBOUND ──────────────────────────────────────── */}
				<SectionHeader label="Inbound" />

				<p className="text-sm text-taupe mb-5">
					Receive signed webhooks from this partner. The URL and secret are
					issued at creation; rotate the secret if it leaks.
				</p>

				<div className="space-y-5">
					{/* Inbound URL */}
					<InboundUrlRow id={id} />

					{/* Inbound secret */}
					<SecretRow
						label="Inbound secret"
						last4={integration.inbound_secret_last4}
						onRotate={() => setRotateDir("inbound")}
					/>

					{/* IP allowlist */}
					<div className="space-y-1.5">
						<Label className="text-sm font-medium text-cacao">
							Inbound IP allowlist
						</Label>
						<IpAllowlistEditor control={control} />
						<p className="text-xs text-taupe mt-1">
							Optional. If set, only requests from these IPs/CIDRs are accepted.
						</p>
					</div>
				</div>

				<Divider />

				{/* ── AUTHORITY ────────────────────────────────────── */}
				<SectionHeader label="Authority" />

				<p className="text-sm text-taupe mb-5">
					When this partner pushes inventory or price updates, should they be
					authoritative (apply directly) or advisory (queued for admin review)?
				</p>

				<div className="space-y-6">
					<AuthoritySelector
						label="Inventory authority"
						value={inventoryAuthority}
						onChange={(v) =>
							setValue("inventory_authority", v, { shouldDirty: true })
						}
					/>
					<AuthoritySelector
						label="Pricing authority"
						value={pricingAuthority}
						onChange={(v) =>
							setValue("pricing_authority", v, { shouldDirty: true })
						}
					/>
				</div>

				<Divider />

				{/* ── DANGER ZONE ──────────────────────────────────── */}
				<SectionHeader label="Danger zone" danger />

				<Button
					type="button"
					variant="destructive"
					disabled={isDeleting}
					onClick={handleDelete}
					className="transition-all duration-300"
				>
					{deleteArmed ? "Click again to confirm" : "Delete integration"}
				</Button>

				{/* ── ACTION ROW ───────────────────────────────────── */}
				<div className="mt-8 flex items-center gap-3">
					<Button
						type="button"
						variant="outline"
						disabled={!isDirty}
						onClick={() => reset(integrationToFormValues(integration))}
					>
						Discard changes
					</Button>
					<Button type="submit" disabled={!isDirty || isSubmitting}>
						{isSubmitting ? "Saving…" : "Save"}
					</Button>
				</div>
			</form>

			{/* Secret rotation dialog */}
			{rotateDir !== null && (
				<SecretRotationDialog
					id={id}
					direction={rotateDir}
					open={rotateDir !== null}
					onOpenChange={(open) => {
						if (!open) setRotateDir(null);
					}}
				/>
			)}

			{/* HMAC verification help drawer */}
			<HelpDrawer open={helpOpen} onOpenChange={setHelpOpen} />
		</FormProvider>
	);
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SetupFormSkeleton() {
	return (
		<div className="space-y-5 animate-pulse">
			<Skeleton className="h-4 w-16" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-4 w-32" />
			<div className="border-t border-pearl/14 mt-8 pt-8 space-y-5">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

// ─── Public export ────────────────────────────────────────────────────────────

interface SetupFormProps {
	id: string;
}

export function SetupForm({ id }: SetupFormProps) {
	const { data: integration, isLoading, isError, error } = useIntegration(id);

	if (isLoading) {
		return <SetupFormSkeleton />;
	}

	if (isError) {
		return (
			<p className="text-sm text-russet py-6">
				Could not load integration settings.{" "}
				{error instanceof Error ? error.message : "Unknown error"}
			</p>
		);
	}

	if (!integration) return null;

	return <InnerForm id={id} integration={integration} />;
}
