"use client";

import {
	useRotateWebhookSecret,
	useShippingProvider,
	useSyncPlatformCarrierAccount,
	useUpdateShippingProvider,
} from "@/lib/queries/shipping-providers";
import {
	Badge,
	Button,
	Card,
	CardContent,
	Input,
	Label,
	Switch,
	Textarea,
} from "@materialhub/ui";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function EditProviderPage() {
	const { id } = useParams<{ id: string }>();
	const { data: provider, isLoading, isError } = useShippingProvider(id);
	const update = useUpdateShippingProvider(id);
	const rotate = useRotateWebhookSecret(id);
	const syncPlatformAccount = useSyncPlatformCarrierAccount(id);
	const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
	const [platformSyncMessage, setPlatformSyncMessage] = useState<string | null>(
		null,
	);
	const [regionsInput, setRegionsInput] = useState<string | null>(null);

	if (isLoading) {
		return (
			<div className="p-6 max-w-3xl space-y-4">
				{[1, 2, 3, 4].map((i) => (
					<div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
				))}
			</div>
		);
	}

	if (isError || !provider) {
		return (
			<div className="p-6 text-destructive">
				Failed to load provider. It may not exist or has been deleted.
			</div>
		);
	}

	const effectiveRegions =
		regionsInput !== null
			? regionsInput
			: provider.supported_regions.join(", ");

	return (
		<div className="p-6 max-w-3xl space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">{provider.display_name}</h1>
				<p className="text-muted-foreground text-sm">
					<code>{provider.code}</code>
				</p>
			</div>

			{/* Identity */}
			<Card>
				<CardContent className="p-4 space-y-4">
					<h2 className="font-semibold">Identity</h2>
					<div className="space-y-1">
						<Label htmlFor="display_name">Display name</Label>
						<Input
							id="display_name"
							defaultValue={provider.display_name}
							onBlur={(e) => {
								if (e.target.value !== provider.display_name) {
									update.mutate({ display_name: e.target.value });
								}
							}}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							defaultValue={provider.description ?? ""}
							onBlur={(e) =>
								update.mutate({ description: e.target.value || null })
							}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="logo_url">Logo URL</Label>
						<Input
							id="logo_url"
							defaultValue={provider.logo_url ?? ""}
							onBlur={(e) =>
								update.mutate({ logo_url: e.target.value || null })
							}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="sort_order">Sort order</Label>
						<Input
							id="sort_order"
							type="number"
							defaultValue={provider.sort_order}
							onBlur={(e) =>
								update.mutate({ sort_order: Number(e.target.value) })
							}
						/>
					</div>
					<div className="space-y-1">
						<Label>Credential schema (read-only)</Label>
						<pre className="text-xs bg-muted p-3 rounded border overflow-auto max-h-64">
							{JSON.stringify(provider.credential_schema, null, 2)}
						</pre>
					</div>
				</CardContent>
			</Card>

			{/* Regions & Availability */}
			<Card>
				<CardContent className="p-4 space-y-4">
					<h2 className="font-semibold">Regions & Availability</h2>
					<div className="space-y-1">
						<Label htmlFor="regions">
							Supported regions (comma-separated ISO codes)
						</Label>
						<div className="flex gap-2">
							<Input
								id="regions"
								placeholder="AE, SA, KW"
								value={effectiveRegions}
								onChange={(e) => setRegionsInput(e.target.value)}
							/>
							<Button
								disabled={update.isPending}
								onClick={() =>
									update.mutate({
										supported_regions: effectiveRegions
											.split(",")
											.map((r) => r.trim())
											.filter(Boolean),
									})
								}
							>
								Save
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Switch
							checked={provider.is_active}
							onCheckedChange={(v) => update.mutate({ is_active: v })}
							disabled={update.isPending}
						/>
						<span className="text-sm">
							{provider.is_active
								? "Active — vendors can configure"
								: "Inactive — hidden from vendors"}
						</span>
					</div>
					{provider.is_active && !provider.webhook_secret_encrypted && (
						<p className="text-sm text-amber-600">
							Webhook secret missing — tracking updates from this provider will
							be rejected.
						</p>
					)}
				</CardContent>
			</Card>

			{/* Webhook */}
			<Card>
				<CardContent className="p-4 space-y-4">
					<h2 className="font-semibold">Webhook</h2>
					<div>
						<Label>Inbound webhook URL</Label>
						<code className="block text-xs bg-muted px-2 py-1.5 rounded break-all mt-1">
							POST {process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}
							/webhooks/shipping/{provider.code}
						</code>
					</div>
					<div className="flex items-center gap-3">
						<Badge
							variant={
								provider.webhook_secret_encrypted ? "success" : "warning"
							}
						>
							{provider.webhook_secret_encrypted
								? "Configured"
								: "Not configured"}
						</Badge>
						<Button
							variant="outline"
							disabled={rotate.isPending}
							onClick={async () => {
								if (
									!window.confirm(
										"Rotate the webhook secret? The old one will stop working immediately.",
									)
								)
									return;
								const result = await rotate.mutateAsync();
								setRevealedSecret(result.webhook_secret);
							}}
						>
							Rotate secret
						</Button>
					</div>
					{revealedSecret && (
						<div className="p-3 bg-amber-50 border border-amber-300 rounded">
							<p className="text-sm font-medium mb-1">
								New secret — copy this now. It won't be shown again.
							</p>
							<code className="text-xs break-all">{revealedSecret}</code>
						</div>
					)}
				</CardContent>
			</Card>

			{provider.code === "postaplus" && (
				<Card>
					<CardContent className="p-4 space-y-4">
						<h2 className="font-semibold">Platform default account</h2>
						<p className="text-sm text-muted-foreground">
							Syncs MaterialHub's PostaPlus credentials from server environment
							settings. Vendors without their own default account use this
							account for automatic shipment booking.
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<Button
								disabled={syncPlatformAccount.isPending}
								onClick={async () => {
									setPlatformSyncMessage(null);
									const result = await syncPlatformAccount.mutateAsync();
									setPlatformSyncMessage(
										`${result.created ? "Created" : "Updated"} ${result.account.display_name} (${result.account.id}); key ending ${result.account.credentials_last4 ?? "unknown"}.`,
									);
								}}
							>
								{syncPlatformAccount.isPending
									? "Syncing..."
									: "Sync platform credentials"}
							</Button>
							{platformSyncMessage && (
								<Badge variant="success">{platformSyncMessage}</Badge>
							)}
							{syncPlatformAccount.isError && (
								<Badge variant="destructive">
									{(syncPlatformAccount.error as Error).message}
								</Badge>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Usage */}
			<Card>
				<CardContent className="p-4">
					<h2 className="font-semibold mb-2">Usage</h2>
					<p className="text-sm">
						{provider.vendor_account_count ?? 0} vendor account(s) configured
						for this provider.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
