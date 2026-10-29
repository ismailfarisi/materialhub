"use client";

import { useAvailableProviders } from "@/lib/queries/shipping-integrations";
import { useSearchParams } from "next/navigation";
import { IntegrationForm } from "../form";

export default function NewIntegrationPage() {
	const sp = useSearchParams();
	const providerId = sp.get("provider");
	const { data: providers, isLoading } = useAvailableProviders();

	if (isLoading) return <div className="p-6">Loading&hellip;</div>;

	const provider = providers?.find((p) => p.id === providerId);
	if (!provider)
		return (
			<div className="p-6 text-red-600">
				Provider not found or not available.
			</div>
		);

	return <IntegrationForm provider={provider} />;
}
