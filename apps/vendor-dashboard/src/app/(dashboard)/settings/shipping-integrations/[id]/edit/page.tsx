"use client";

import {
	useAvailableProviders,
	useIntegration,
} from "@/lib/queries/shipping-integrations";
import { useParams } from "next/navigation";
import { IntegrationForm } from "../../form";

export default function EditIntegrationPage() {
	const { id } = useParams<{ id: string }>();
	const { data: integration, isLoading } = useIntegration(id);
	const { data: providers } = useAvailableProviders();

	if (isLoading || !integration || !providers)
		return <div className="p-6">Loading&hellip;</div>;

	const provider = providers.find((p) => p.id === integration.provider_id);
	if (!provider)
		return (
			<div className="p-6 text-red-600">Provider no longer available.</div>
		);

	return <IntegrationForm provider={provider} integration={integration} />;
}
