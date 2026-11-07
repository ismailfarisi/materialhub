"use client";

import {
	useAvailableProviders,
	useDeleteIntegration,
	useMyIntegrations,
	useSetDefaultIntegration,
	useVerifyIntegration,
} from "@/lib/queries/shipping-integrations";
import { Badge, Button, Card } from "@materialhub/ui";
import Link from "next/link";

export default function ShippingIntegrationsPage() {
	const integrations = useMyIntegrations();
	const providers = useAvailableProviders();
	const setDefault = useSetDefaultIntegration();
	const verify = useVerifyIntegration();
	const del = useDeleteIntegration();

	if (integrations.isLoading || providers.isLoading)
		return <div className="p-6">Loading&hellip;</div>;

	const myProviderIds = new Set(
		(integrations.data ?? []).map((i) => i.provider_id),
	);
	const unused = (providers.data ?? []).filter((p) => !myProviderIds.has(p.id));

	return (
		<div className="p-6 space-y-8">
			<div>
				<h1 className="text-2xl font-semibold">Shipping Integrations</h1>
				<p className="text-slate-500 text-sm">
					Connect a 3PL so paid orders auto-push to the carrier.
				</p>
			</div>

			<Card className="p-4">
				<h2 className="font-semibold mb-3">Your Integrations</h2>
				{(integrations.data ?? []).length === 0 ? (
					<p className="text-sm text-slate-500">
						No integrations yet. Connect a provider below to auto-push paid
						orders.
					</p>
				) : (
					<>
						<table className="min-w-full text-sm" data-stack="md">
							<thead>
								<tr className="text-left text-xs uppercase border-b">
									<th className="py-2">Provider</th>
									<th>Label</th>
									<th>Status</th>
									<th>Default</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{(integrations.data ?? []).map((i) => (
									<tr key={i.id} className="border-b">
										<td className="py-2" data-card-title>
											{i.provider?.display_name ?? i.provider_id}
										</td>
										<td data-label="Label">{i.display_name}</td>
										<td data-label="Status">
											{!i.is_active ? (
												<Badge variant="secondary">Disabled</Badge>
											) : i.is_verified ? (
												<Badge variant="success">Verified</Badge>
											) : (
												<Badge
													variant="warning"
													title={i.last_verify_error ?? undefined}
												>
													Unverified
												</Badge>
											)}
										</td>
										<td data-label="Default">
											<input
												type="radio"
												name="default"
												disabled={!i.is_verified || !i.is_active}
												onChange={() => setDefault.mutate(i.id)}
											/>
										</td>
										<td className="space-x-2">
											<Button
												size="sm"
												variant="outline"
												onClick={() => verify.mutate(i.id)}
											>
												Re-verify
											</Button>
											<Link href={`/settings/shipping-integrations/${i.id}/edit`}>
												<Button size="sm" variant="outline">
													Edit
												</Button>
											</Link>
											<Button
												size="sm"
												variant="destructive"
												onClick={() =>
													confirm("Delete this integration?") && del.mutate(i.id)
												}
											>
												Delete
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{(integrations.data ?? []).length > 0 && (
							<div className="border-t p-3 text-xs text-slate-500">
								Total: {(integrations.data ?? []).length}{" "}
								{(integrations.data ?? []).length === 1
									? "integration"
									: "integrations"}
							</div>
						)}
					</>
				)}
			</Card>

			{unused.length > 0 && (
				<div>
					<h2 className="font-semibold mb-3">Available Providers</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{unused.map((p) => (
							<Card key={p.id} className="p-4">
								<div className="flex items-start gap-3">
									{p.logo_url && (
										<img
											src={p.logo_url}
											alt=""
											className="h-10 w-10 rounded"
										/>
									)}
									<div className="flex-1">
										<div className="font-medium">{p.display_name}</div>
										{p.description && (
											<p className="text-xs text-slate-500">{p.description}</p>
										)}
										<div className="mt-1 flex gap-1 flex-wrap">
											{p.supported_regions.map((r) => (
												<Badge key={r} variant="outline">
													{r}
												</Badge>
											))}
										</div>
									</div>
									<Link
										href={`/settings/shipping-integrations/new?provider=${p.id}`}
									>
										<Button size="sm">Connect</Button>
									</Link>
								</div>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
