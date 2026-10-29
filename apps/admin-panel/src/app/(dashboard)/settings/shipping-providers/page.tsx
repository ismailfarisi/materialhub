"use client";

import {
	type ShippingProvider,
	useShippingProviders,
	useUpdateShippingProvider,
} from "@/lib/queries/shipping-providers";
import { Badge, Button, Switch } from "@materialhub/ui";
import { Plug } from "lucide-react";
import Link from "next/link";

export default function ShippingProvidersPage() {
	const {
		data: providers,
		isLoading,
		isError,
		error,
		refetch,
	} = useShippingProviders();

	return (
		<div className="p-6 max-w-7xl">
			<div className="mb-6 flex items-center gap-3">
				<Plug className="h-6 w-6 text-primary" />
				<div>
					<h1 className="text-2xl font-bold">Shipping Providers</h1>
					<p className="text-sm text-muted-foreground">
						Providers are registered by the backend. Toggle them on to make them
						available to vendors.
					</p>
				</div>
			</div>

			<div className="overflow-x-auto border rounded-lg">
				<table className="min-w-full divide-y text-sm" data-stack="md">
					<thead className="bg-muted/40">
						<tr>
							<Th>Provider</Th>
							<Th>Code</Th>
							<Th>Regions</Th>
							<Th>Vendors</Th>
							<Th>Webhook</Th>
							<Th>Active</Th>
							<Th>Actions</Th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{isLoading &&
							[1, 2, 3].map((i) => (
								<tr key={i}>
									{["n", "c", "r", "v", "w", "a", "act"].map((col) => (
										<td key={col} className="px-4 py-4">
											<div className="h-4 w-20 bg-muted animate-pulse rounded" />
										</td>
									))}
								</tr>
							))}
						{isError && (
							<tr>
								<td colSpan={7} className="px-4 py-8 text-center">
									<p className="text-destructive mb-2">
										Failed to load providers: {(error as Error).message}
									</p>
									<button
										type="button"
										onClick={() => refetch()}
										className="text-primary hover:underline text-sm"
									>
										Retry
									</button>
								</td>
							</tr>
						)}
						{!isLoading &&
							!isError &&
							(!providers || providers.length === 0) && (
								<tr>
									<td
										colSpan={7}
										className="px-4 py-8 text-center text-muted-foreground"
									>
										No providers registered. Check the backend adapter registry
										in <code>container.ts</code>.
									</td>
								</tr>
							)}
						{providers?.map((p) => (
							<ProviderRow key={p.id} provider={p} />
						))}
					</tbody>
				</table>
				{providers && providers.length > 0 && (
					<div className="border-t px-4 py-3 text-xs text-muted-foreground">
						Total: {providers.length} shipping provider
						{providers.length === 1 ? "" : "s"}
					</div>
				)}
			</div>
		</div>
	);
}

function Th({ children }: { children: React.ReactNode }) {
	return (
		<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
			{children}
		</th>
	);
}

function ProviderRow({ provider }: { provider: ShippingProvider }) {
	const update = useUpdateShippingProvider(provider.id);
	return (
		<tr className="hover:bg-muted/20">
			<td className="px-4 py-3" data-card-title>
				<div className="flex items-center gap-2">
					{provider.logo_url && (
						<img
							src={provider.logo_url}
							alt=""
							className="h-6 w-6 rounded object-contain"
						/>
					)}
					<span className="font-medium">{provider.display_name}</span>
				</div>
			</td>
			<td className="px-4 py-3" data-label="Code">
				<code className="text-xs bg-muted rounded px-1.5 py-0.5">
					{provider.code}
				</code>
			</td>
			<td className="px-4 py-3" data-label="Regions">
				{provider.supported_regions.length === 0 ? (
					<span className="text-muted-foreground">—</span>
				) : (
					<div className="flex flex-wrap gap-1">
						{provider.supported_regions.map((r) => (
							<Badge key={r} variant="outline">
								{r}
							</Badge>
						))}
					</div>
				)}
			</td>
			<td className="px-4 py-3" data-label="Vendors">{provider.vendor_account_count ?? 0}</td>
			<td className="px-4 py-3" data-label="Webhook">
				{provider.webhook_secret_encrypted ? (
					<Badge variant="success">Configured</Badge>
				) : (
					<Badge variant="warning">Missing</Badge>
				)}
			</td>
			<td className="px-4 py-3" data-label="Active">
				<Switch
					checked={provider.is_active}
					onCheckedChange={(v) => update.mutate({ is_active: v })}
					disabled={update.isPending}
				/>
			</td>
			<td className="px-4 py-3">
				<Link href={`/settings/shipping-providers/${provider.id}`}>
					<Button variant="outline" size="sm">
						Configure
					</Button>
				</Link>
			</td>
		</tr>
	);
}
