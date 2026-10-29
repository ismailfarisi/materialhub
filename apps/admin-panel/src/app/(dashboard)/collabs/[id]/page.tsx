"use client";

import { QueryError } from "@/components/query-error";
import { useAdminCollab } from "@/lib/queries/collabs";
import { Button, Separator, Skeleton, StatusBadge } from "@materialhub/ui";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-taupe text-xs uppercase tracking-wide">{label}</dt>
			<dd className="text-cacao text-sm mt-0.5">{value}</dd>
		</div>
	);
}

function formatDate(iso: string | null) {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("en-AE");
}

const TYPE_LABEL: Record<string, string> = {
	product_seeding: "Product Seeding",
	paid_campaign: "Paid Campaign",
	event_appearance: "Event Appearance",
};

export default function CollabDetailPage() {
	const params = useParams();
	const router = useRouter();
	const id = String(params.id);
	const { data, isLoading, isError, error, refetch } = useAdminCollab(id);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-full rounded-lg" />
				<Skeleton className="h-64 w-full rounded-lg" />
			</div>
		);
	}

	if (isError) {
		return (
			<QueryError title="Could not load this collab." error={error} onRetry={() => refetch()} />
		);
	}

	const opportunity = data?.opportunity;
	const applications = data?.applications ?? [];

	if (!opportunity) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-4">
				<p className="text-taupe">Collab not found.</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go Back
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="icon" onClick={() => router.back()}>
					<ArrowLeft size={18} />
				</Button>
				<div>
					<h1 className="text-2xl font-bold text-cacao">{opportunity.title}</h1>
					<p className="text-taupe text-sm">{opportunity.vendor_name ?? opportunity.vendor_id}</p>
				</div>
				<StatusBadge status={opportunity.status} />
			</div>

			<div className="rounded-lg border p-5 space-y-5">
				<dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<Field label="Type" value={TYPE_LABEL[opportunity.type] ?? opportunity.type} />
					<Field label="Visibility" value={opportunity.visibility} />
					<Field label="Slots" value={`${opportunity.slots_filled} / ${opportunity.slots_total}`} />
					<Field label="Created" value={formatDate(opportunity.created_at)} />
					{opportunity.type === "product_seeding" && (
						<>
							<Field
								label="Seeded Product"
								value={opportunity.seeded_product_name ?? opportunity.seeded_product_id ?? "—"}
							/>
							<Field label="Qty per Creator" value={opportunity.seeded_qty ?? "—"} />
						</>
					)}
					{(opportunity.type === "paid_campaign" || opportunity.type === "event_appearance") && (
						<Field
							label="Fee"
							value={
								opportunity.fee_fils
									? `AED ${(Number(opportunity.fee_fils) / 100).toFixed(2)}`
									: "—"
							}
						/>
					)}
					<Field label="Applications Close" value={formatDate(opportunity.applications_close_at)} />
					<Field label="Content Due" value={formatDate(opportunity.deliver_by)} />
				</dl>
				<Separator />
				<p className="text-sm text-cacao whitespace-pre-wrap">{opportunity.description}</p>
			</div>

			<div className="rounded-lg border p-5 space-y-3">
				<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
					Applications ({applications.length})
				</h2>
				{applications.length === 0 ? (
					<p className="text-taupe text-sm">No applications yet.</p>
				) : (
					<div className="divide-y">
						{applications.map(
							(app: {
								id: string;
								creator_id: string;
								creator_name: string | null;
								status: string;
								created_at: string;
							}) => (
								<div key={app.id} className="flex items-center justify-between py-2.5 text-sm">
									<span className="text-cacao">{app.creator_name ?? app.creator_id}</span>
									<div className="flex items-center gap-3">
										<StatusBadge status={app.status} />
										<span className="text-taupe">{formatDate(app.created_at)}</span>
									</div>
								</div>
							),
						)}
					</div>
				)}
			</div>
		</div>
	);
}
