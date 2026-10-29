"use client";

import {
	type AvailableProvider,
	type VendorIntegration,
	useCreateIntegration,
	useUpdateIntegration,
	useVerifyIntegration,
} from "@/lib/queries/shipping-integrations";
import { Button, Card, Input, Label, Textarea } from "@materialhub/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Props {
	provider: AvailableProvider;
	integration?: VendorIntegration;
}

export function IntegrationForm({ provider, integration }: Props) {
	const router = useRouter();
	const create = useCreateIntegration();
	const update = useUpdateIntegration(integration?.id ?? "");
	const verify = useVerifyIntegration();
	const [displayName, setDisplayName] = useState(
		integration?.display_name ?? "",
	);
	const [creds, setCreds] = useState<Record<string, string>>({});
	const [rotating, setRotating] = useState(!integration);
	const [lastVerifyMessage, setLastVerifyMessage] = useState<string | null>(
		integration?.last_verify_error ?? null,
	);

	const fields = useMemo(
		() => Object.entries(provider.credential_schema.properties),
		[provider],
	);

	async function submit(runVerify: boolean) {
		if (!displayName.trim()) {
			alert("Label is required");
			return;
		}
		let saved: VendorIntegration;
		if (integration) {
			const payload: {
				display_name: string;
				credentials?: Record<string, string>;
			} = { display_name: displayName };
			if (rotating) payload.credentials = creds;
			saved = await update.mutateAsync(payload);
		} else {
			saved = await create.mutateAsync({
				provider_id: provider.id,
				display_name: displayName,
				credentials: creds,
			});
		}
		if (runVerify) {
			const result = await verify.mutateAsync(saved.id);
			if (!result.ok) {
				setLastVerifyMessage(result.message ?? "Verification failed");
				return;
			}
			setLastVerifyMessage(null);
		}
		router.push("/settings/shipping-integrations");
	}

	const isBusy = create.isPending || update.isPending || verify.isPending;

	return (
		<div className="p-6 max-w-2xl space-y-4">
			<Card className="p-4">
				<h2 className="font-semibold">{provider.display_name}</h2>
				<p className="text-xs text-slate-500">{provider.description}</p>
			</Card>

			<Card className="p-4 space-y-2">
				<Label>Label</Label>
				<Input
					placeholder="e.g. Dubai Warehouse"
					value={displayName}
					onChange={(e) => setDisplayName(e.target.value)}
				/>
				<p className="text-xs text-slate-500">
					A name to help you tell multiple accounts apart.
				</p>
			</Card>

			<Card className="p-4 space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold">Credentials</h2>
					{integration && !rotating && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setRotating(true)}
						>
							Rotate credentials
						</Button>
					)}
				</div>

				{integration && !rotating ? (
					<p className="text-sm text-slate-600">
						Credentials currently set (last 4:{" "}
						<code>{integration.credentials_last4 ?? "—"}</code>). Click
						&ldquo;Rotate credentials&rdquo; to replace them.
					</p>
				) : (
					fields.map(([key, schema]) => {
						const required = provider.credential_schema.required.includes(key);
						const isPassword = schema.format === "password";
						const isLongDesc =
							!!schema.description && schema.description.length > 80;
						return (
							<div key={key}>
								<Label>
									{schema.title}
									{required && <span className="text-red-500 ml-1">*</span>}
								</Label>
								{isLongDesc ? (
									<Textarea
										value={creds[key] ?? ""}
										onChange={(e) =>
											setCreds((c) => ({ ...c, [key]: e.target.value }))
										}
									/>
								) : (
									<Input
										type={isPassword ? "password" : "text"}
										value={creds[key] ?? ""}
										onChange={(e) =>
											setCreds((c) => ({ ...c, [key]: e.target.value }))
										}
										pattern={schema.pattern}
									/>
								)}
								{schema.description && (
									<p className="text-xs text-slate-500 mt-1">
										{schema.description}
									</p>
								)}
							</div>
						);
					})
				)}

				{lastVerifyMessage && (
					<div className="p-2 bg-red-50 border border-red-300 rounded text-sm text-red-700">
						Last verification failed: {lastVerifyMessage}
					</div>
				)}
			</Card>

			<div className="flex gap-2">
				<Button onClick={() => submit(true)} disabled={isBusy}>
					Save &amp; Verify
				</Button>
				<Button
					variant="outline"
					onClick={() => submit(false)}
					disabled={isBusy}
				>
					Save without verifying
				</Button>
			</div>
		</div>
	);
}
