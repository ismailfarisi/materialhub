"use client";

import {
	aed,
	buyerName,
	day,
	historyLines,
} from "@/components/quotes/quote-format";
import {
	type AdminQuoteResponse,
	type AdminQuoteSupplier,
	openAdminQuoteAttachment,
	useAdminQuote,
} from "@/lib/queries/quotes";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Skeleton,
	StatusBadge,
} from "@materialhub/ui";
import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function AdminQuoteDetailPage() {
	const { id } = useParams<{ id: string }>();
	const { data: q, isLoading, isError, refetch } = useAdminQuote(id);

	if (isLoading) return <Skeleton className="h-64 w-full" />;
	if (isError || !q) {
		return (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					This quote request couldn't be loaded.
				</p>
				<Button size="sm" variant="outline" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<Link
					href="/quotes"
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft size={16} /> Quote requests
				</Link>
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-bold">{q.title}</h1>
					<StatusBadge status={q.status} />
				</div>
				<p className="font-mono text-sm tabular-nums text-muted-foreground">
					{q.request_number} · sent {day(q.created_at)}
					{q.accepted_at ? ` · accepted ${day(q.accepted_at)}` : ""}
					{q.cancelled_at ? ` · cancelled ${day(q.cancelled_at)}` : ""}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Request</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-5">
						<Fact label="Buyer" value={buyerName(q.buyer)} />
						<Fact
							label="Quantity"
							value={`${q.quantity.toLocaleString("en-AE")} ${q.unit}`}
							mono
						/>
						<Fact
							label="Needed by"
							value={q.need_by ? day(q.need_by) : "No date"}
							mono
						/>
						<Fact label="Deliver to" value={q.delivery_emirate} />
						<Fact
							label="Listing"
							value={
								q.product
									? `${q.product.name}${q.variant ? ` · ${q.variant.name}` : ""}`
									: "Any"
							}
						/>
					</dl>
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Specification
						</p>
						<p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-[13px] leading-relaxed">
							{q.specification}
						</p>
					</div>
					{q.attachments.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{q.attachments.map((a) => (
								<Button
									key={a.key}
									size="sm"
									variant="outline"
									onClick={() => openAdminQuoteAttachment(q.id, a.key)}
								>
									<Paperclip size={14} /> {a.filename}
								</Button>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Quotes by supplier</CardTitle>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full min-w-[720px] text-sm">
						<thead>
							<tr className="border-b text-start text-xs uppercase tracking-wide text-muted-foreground">
								<th className="py-2 pe-3 text-start font-semibold">Supplier</th>
								<th className="py-2 pe-3 text-start font-semibold">Status</th>
								<th className="py-2 pe-3 text-end font-semibold">Per unit</th>
								<th className="py-2 pe-3 text-end font-semibold">MOQ</th>
								<th className="py-2 pe-3 text-end font-semibold">Lead</th>
								<th className="py-2 pe-3 text-start font-semibold">
									Valid until
								</th>
								<th className="py-2 pe-3 text-end font-semibold">Total</th>
								<th className="py-2 text-start font-semibold">Listing</th>
							</tr>
						</thead>
						<tbody>
							{q.suppliers.flatMap((s) => [
								<SupplierRow
									key={s.id}
									supplier={s}
									response={s.current_response}
									unit={q.unit}
									accepted={q.accepted_response_id}
								/>,
								...s.previous_responses.map((r) => (
									<SupplierRow
										key={r.id}
										supplier={s}
										response={r}
										unit={q.unit}
										accepted={q.accepted_response_id}
										previous
									/>
								)),
							])}
						</tbody>
					</table>
				</CardContent>
			</Card>

			<div className="grid gap-5 lg:grid-cols-2">
				{q.suppliers.map((s) => (
					<Card key={s.id}>
						<CardHeader>
							<CardTitle className="text-base">
								Messages with {s.vendor?.name ?? "supplier"}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{s.messages.length === 0 ? (
								<p className="text-sm text-muted-foreground">No messages.</p>
							) : (
								<ol className="space-y-3 text-sm">
									{s.messages.map((m) => (
										<li key={m.id}>
											<p className="text-xs text-muted-foreground">
												<span className="capitalize">{m.sender_role}</span> ·{" "}
												<time className="font-mono tabular-nums">
													{new Date(m.created_at).toLocaleString("en-AE", {
														timeZone: "Asia/Dubai",
													})}
												</time>
											</p>
											<p className="whitespace-pre-wrap">{m.body}</p>
										</li>
									))}
								</ol>
							)}
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Status history</CardTitle>
				</CardHeader>
				<CardContent>
					<ol className="space-y-1.5 text-sm">
						{historyLines(q).map((h) => (
							<li
								key={h.id}
								className="flex items-baseline justify-between gap-4"
							>
								<span>{h.text}</span>
								<time className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
									{new Date(h.at).toLocaleString("en-AE", {
										timeZone: "Asia/Dubai",
									})}
								</time>
							</li>
						))}
					</ol>
				</CardContent>
			</Card>
		</div>
	);
}

function Fact({
	label,
	value,
	mono,
}: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="min-w-0">
			<dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd
				className={`mt-0.5 break-words ${mono ? "font-mono tabular-nums" : ""}`}
			>
				{value}
			</dd>
		</div>
	);
}

function SupplierRow({
	supplier,
	response,
	unit,
	accepted,
	previous = false,
}: {
	supplier: AdminQuoteSupplier;
	response: AdminQuoteResponse | null;
	unit: string;
	accepted: string | null;
	previous?: boolean;
}) {
	return (
		<tr
			className={`border-b last:border-0 ${previous ? "text-muted-foreground" : ""} ${response && response.id === accepted ? "bg-muted/40" : ""}`}
		>
			<td className="py-2 pe-3">
				{previous ? (
					<span className="ps-3">↳ earlier</span>
				) : (
					(supplier.vendor?.name ?? "—")
				)}
			</td>
			<td className="py-2 pe-3">
				{previous ? (
					<span className="text-xs">{response?.status}</span>
				) : (
					<span className="inline-flex flex-wrap items-center gap-1.5">
						<StatusBadge status={supplier.status} />
						{response && (
							<span className="text-xs text-muted-foreground">
								{response.display_state}
							</span>
						)}
					</span>
				)}
				{!previous && supplier.decline_reason && (
					<p className="mt-1 text-xs text-muted-foreground">
						“{supplier.decline_reason}”
					</p>
				)}
			</td>
			<td className="py-2 pe-3 text-end font-mono tabular-nums">
				{response ? `${aed(response.unit_price)} / ${unit}` : "—"}
			</td>
			<td className="py-2 pe-3 text-end font-mono tabular-nums">
				{response ? response.moq.toLocaleString("en-AE") : "—"}
			</td>
			<td className="py-2 pe-3 text-end font-mono tabular-nums">
				{response ? `${response.lead_time_days} d` : "—"}
			</td>
			<td className="py-2 pe-3 font-mono tabular-nums">
				{response ? day(response.valid_until) : "—"}
			</td>
			<td className="py-2 pe-3 text-end font-mono tabular-nums">
				{response ? aed(response.total) : "—"}
			</td>
			<td className="py-2">{response?.product?.name ?? "—"}</td>
		</tr>
	);
}
