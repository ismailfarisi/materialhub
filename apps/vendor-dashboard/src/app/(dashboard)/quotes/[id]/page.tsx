"use client";

import {
	type RespondFormValues,
	addDays,
	aedToFils,
	dubaiToday,
	filsToAed,
	formatDay,
	respondSchema,
} from "@/components/quotes/quote-helpers";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import {
	EntityCombobox,
	type LookupItem,
} from "@/components/ui/entity-combobox";
import { api } from "@/lib/api";
import {
	type VendorQuoteDetail,
	openVendorQuoteAttachment,
	useDeclineQuote,
	useRespondToQuote,
	useSendVendorQuoteMessage,
	useVendorQuote,
} from "@/lib/queries/quotes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Skeleton,
	Textarea,
	cn,
} from "@materialhub/ui";
import { ArrowLeft, PaperPlaneRight, Paperclip } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

function errorMessage(err: unknown): string {
	const message = (err as { response?: { data?: { message?: unknown } } })
		?.response?.data?.message;
	return typeof message === "string"
		? message
		: "Something went wrong. Try again.";
}

export default function VendorQuoteDetailPage() {
	const { id } = useParams<{ id: string }>();
	const { data: quote, isLoading, isError, refetch } = useVendorQuote(id);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}
	if (isError || !quote) {
		return (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					This quote request couldn't be loaded.
				</p>
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}
	return <QuoteDetail quote={quote} />;
}

function QuoteDetail({ quote }: { quote: VendorQuoteDetail }) {
	const r = quote.request;
	const current =
		quote.responses.find((x) => x.id === quote.current_response_id) ?? null;
	const [editing, setEditing] = useState(false);
	const showForm = quote.can_respond && (editing || !current);

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
					<h1 className="text-2xl font-bold text-gray-900">{r.title}</h1>
					<QuoteStatusBadge status={quote.status} />
				</div>
				<p className="font-mono text-sm tabular-nums text-muted-foreground">
					{r.request_number} · received {formatDay(r.created_at)} · from{" "}
					{r.buyer?.display_name ?? "a buyer"}
				</p>
			</div>

			{r.outcome && (
				<div
					className={cn(
						"rounded-md border p-4 text-sm",
						r.outcome === "won"
							? "border-amber/40 bg-amber/10"
							: "border-pearl bg-pearl/20",
					)}
				>
					{r.outcome === "won"
						? "The buyer accepted your quote. It's in their cart at your quoted price; you'll get the order when they check out."
						: "The buyer accepted another supplier's quote."}
				</div>
			)}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
				<div className="min-w-0 space-y-5">
					<Card>
						<CardHeader>
							<CardTitle>What the buyer needs</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
								<Fact
									label="Quantity"
									value={`${r.quantity.toLocaleString("en-AE")} ${r.unit}`}
									mono
								/>
								<Fact
									label="Needed by"
									value={r.need_by ? formatDay(r.need_by) : "No date"}
									mono
								/>
								<Fact label="Deliver to" value={r.delivery_emirate} />
								<Fact
									label="Listing"
									value={
										r.product
											? `${r.product.name}${r.variant ? ` · ${r.variant.name}` : ""}`
											: "Any"
									}
								/>
							</dl>
							<div>
								<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Specification
								</p>
								<p className="whitespace-pre-wrap rounded-md bg-pearl/20 p-3 font-mono text-[13px] leading-relaxed">
									{r.specification}
								</p>
							</div>
							{r.attachments.length > 0 && (
								<div>
									<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Attachments
									</p>
									<ul className="flex flex-wrap gap-2">
										{r.attachments.map((a) => (
											<li key={a.key}>
												<Button
													size="sm"
													variant="outline"
													onClick={() =>
														openVendorQuoteAttachment(quote.id, a.key)
													}
												>
													<Paperclip size={14} /> {a.filename}
												</Button>
											</li>
										))}
									</ul>
								</div>
							)}
						</CardContent>
					</Card>

					<Thread quote={quote} />
				</div>

				<div className="min-w-0 space-y-5">
					{showForm ? (
						<RespondForm
							quote={quote}
							onDone={() => setEditing(false)}
							onCancel={current ? () => setEditing(false) : undefined}
						/>
					) : current ? (
						<Card>
							<CardHeader className="flex-row items-center justify-between space-y-0">
								<CardTitle>Your quote</CardTitle>
								{quote.can_respond && (
									<Button
										size="sm"
										variant="outline"
										onClick={() => setEditing(true)}
									>
										Revise
									</Button>
								)}
							</CardHeader>
							<CardContent>
								<ResponseFacts response={current} unit={r.unit} />
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardContent className="pt-6 text-sm text-muted-foreground">
								{quote.status === "vendor_declined"
									? `You declined this request${quote.decline_reason ? `: “${quote.decline_reason}”` : "."}`
									: "This request is closed."}
							</CardContent>
						</Card>
					)}

					{quote.can_decline && <DeclineBox quote={quote} />}

					{quote.responses.length > 1 && (
						<Card>
							<CardHeader>
								<CardTitle>Earlier quotes</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="divide-y divide-pearl text-sm">
									{quote.responses
										.filter((x) => x.id !== quote.current_response_id)
										.map((x) => (
											<li
												key={x.id}
												className="flex items-center justify-between gap-3 py-2"
											>
												<span className="font-mono tabular-nums">
													AED {filsToAed(x.unit_price)} / {r.unit} · MOQ{" "}
													{x.moq.toLocaleString("en-AE")}
												</span>
												<span className="text-xs text-muted-foreground">
													{x.status} · {formatDay(x.created_at)}
												</span>
											</li>
										))}
								</ul>
							</CardContent>
						</Card>
					)}

					<Card>
						<CardHeader>
							<CardTitle>Activity</CardTitle>
						</CardHeader>
						<CardContent>
							<ol className="space-y-2 text-sm">
								{quote.history.map((h) => (
									<li
										key={h.id}
										className="flex items-baseline justify-between gap-3"
									>
										<span>
											<span className="capitalize">{h.subject}</span>:{" "}
											{h.to_status.replace(/_/g, " ")}
											<span className="text-muted-foreground">
												{" "}
												by {h.actor_role}
											</span>
										</span>
										<time className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
											{formatDay(h.created_at)}
										</time>
									</li>
								))}
							</ol>
						</CardContent>
					</Card>
				</div>
			</div>
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
			<dd className={cn("mt-0.5 truncate", mono && "font-mono tabular-nums")}>
				{value}
			</dd>
		</div>
	);
}

function ResponseFacts({
	response,
	unit,
}: { response: VendorQuoteDetail["responses"][number]; unit: string }) {
	return (
		<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
			<Fact
				label="Price per unit"
				value={`AED ${filsToAed(response.unit_price)} / ${unit}`}
				mono
			/>
			<Fact label="Total" value={`AED ${filsToAed(response.total)}`} mono />
			<Fact
				label="Minimum order"
				value={`${response.moq.toLocaleString("en-AE")} ${unit}`}
				mono
			/>
			<Fact label="Lead time" value={`${response.lead_time_days} days`} mono />
			<Fact label="Valid until" value={formatDay(response.valid_until)} mono />
			<Fact label="State" value={response.display_state} />
			<div className="col-span-2">
				<Fact
					label="Listing"
					value={
						response.product
							? `${response.product.name}${response.variant ? ` · ${response.variant.name}` : ""}`
							: "—"
					}
				/>
			</div>
			{response.notes && (
				<div className="col-span-2">
					<dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Notes
					</dt>
					<dd className="mt-0.5 whitespace-pre-wrap">{response.notes}</dd>
				</div>
			)}
		</dl>
	);
}

/* ------------------------------------------------------------------ */
/*  Respond                                                            */
/* ------------------------------------------------------------------ */

function RespondForm({
	quote,
	onDone,
	onCancel,
}: {
	quote: VendorQuoteDetail;
	onDone: () => void;
	onCancel?: () => void;
}) {
	const r = quote.request;
	const current =
		quote.responses.find((x) => x.id === quote.current_response_id) ?? null;
	const respond = useRespondToQuote(quote.id);
	const [serverError, setServerError] = useState<string | null>(null);
	const schema = useMemo(() => respondSchema(), []);
	const form = useForm<RespondFormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			product_id: current?.product?.id ?? r.product?.id ?? "",
			variant_id: current?.variant?.id ?? r.variant?.id ?? "",
			unit_price: current
				? filsToAed(current.unit_price).replace(/,/g, "")
				: "",
			moq: (current?.moq ?? "") as unknown as number,
			lead_time_days: (current?.lead_time_days ?? "") as unknown as number,
			valid_until:
				current && current.valid_until >= dubaiToday()
					? current.valid_until
					: addDays(dubaiToday(), 14),
			notes: current?.notes ?? "",
		},
	});
	const productId = form.watch("product_id");
	const price = aedToFils(form.watch("unit_price") ?? "");
	const moq = Number(form.watch("moq")) || 0;
	const orderQty = Math.max(r.quantity, moq);

	const productDetail = useQuery({
		queryKey: ["vendor", "quotes", "product", productId],
		enabled: !!productId,
		queryFn: async () => {
			const { data } = await api.get(`/products/${productId}`);
			// biome-ignore lint/suspicious/noExplicitAny: untyped product payload
			return data.data as any;
		},
	});
	const variants: { id: string; name: string; price: number }[] =
		productDetail.data?.variants ?? [];

	const searchProducts = useCallback(
		async (q: string): Promise<LookupItem[]> => {
			const { data } = await api.get("/products/mine", {
				params: { search: q || undefined, status: "published", limit: 20 },
			});
			// biome-ignore lint/suspicious/noExplicitAny: untyped product payload
			return ((data.data?.items ?? []) as any[]).map((p) => ({
				id: p.id,
				label: p.name,
				sublabel: p.sku ? `SKU ${p.sku}` : `AED ${filsToAed(p.price)}`,
			}));
		},
		[],
	);
	const getProduct = useCallback(
		async (pid: string): Promise<LookupItem | null> => {
			try {
				const { data } = await api.get(`/products/${pid}`);
				return { id: data.data.id, label: data.data.name };
			} catch {
				return null;
			}
		},
		[],
	);

	const submit = form.handleSubmit(async (values) => {
		setServerError(null);
		try {
			await respond.mutateAsync({
				product_id: values.product_id,
				variant_id: values.variant_id || null,
				unit_price: aedToFils(values.unit_price) as number,
				moq: Number(values.moq),
				lead_time_days: Number(values.lead_time_days),
				valid_until: values.valid_until,
				notes: values.notes?.trim() || null,
			});
			onDone();
		} catch (err) {
			setServerError(errorMessage(err));
		}
	});

	const err = form.formState.errors;
	const field = (name: keyof RespondFormValues) =>
		err[name] ? { "aria-invalid": true } : {};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{current ? "Revise your quote" : "Send a quote"}</CardTitle>
				<p className="text-sm text-muted-foreground">
					Price per {r.unit}. The buyer compares it side by side with up to two
					other suppliers and can accept it until the valid-until date.
				</p>
			</CardHeader>
			<CardContent>
				<form onSubmit={submit} className="space-y-4" noValidate>
					<div className="space-y-1.5">
						<Label>Listing that fulfils this quote</Label>
						<EntityCombobox
							value={productId || null}
							onChange={(v) => {
								form.setValue("product_id", v ?? "", { shouldValidate: true });
								form.setValue("variant_id", "");
							}}
							search={searchProducts}
							getById={getProduct}
							placeholder="Search your published listings"
							emptyMessage="No published listings match"
						/>
						<p className="text-xs text-muted-foreground">
							Accepting adds this listing to the buyer's cart at your price.
						</p>
						{err.product_id && (
							<p className="text-xs text-russet">{err.product_id.message}</p>
						)}
					</div>

					{variants.length > 0 && (
						<div className="space-y-1.5">
							<Label htmlFor="variant_id">Option</Label>
							<select
								id="variant_id"
								className="h-10 w-full rounded-md border border-pearl bg-transparent px-3 text-sm"
								{...form.register("variant_id")}
							>
								<option value="">No specific option</option>
								{variants.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name} · AED {filsToAed(v.price)}
									</option>
								))}
							</select>
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="unit_price">Price per {r.unit} (AED)</Label>
							<Input
								id="unit_price"
								inputMode="decimal"
								className="font-mono tabular-nums"
								{...field("unit_price")}
								{...form.register("unit_price")}
							/>
							{err.unit_price && (
								<p className="text-xs text-russet">{err.unit_price.message}</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="moq">Minimum order ({r.unit})</Label>
							<Input
								id="moq"
								inputMode="numeric"
								className="font-mono tabular-nums"
								{...field("moq")}
								{...form.register("moq")}
							/>
							{err.moq && (
								<p className="text-xs text-russet">{err.moq.message}</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="lead_time_days">Lead time (days)</Label>
							<Input
								id="lead_time_days"
								inputMode="numeric"
								className="font-mono tabular-nums"
								{...field("lead_time_days")}
								{...form.register("lead_time_days")}
							/>
							{err.lead_time_days && (
								<p className="text-xs text-russet">
									{err.lead_time_days.message}
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="valid_until">Valid until</Label>
							<Input
								id="valid_until"
								type="date"
								min={dubaiToday()}
								className="font-mono tabular-nums"
								{...field("valid_until")}
								{...form.register("valid_until")}
							/>
							{err.valid_until && (
								<p className="text-xs text-russet">{err.valid_until.message}</p>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="notes">Notes for the buyer (optional)</Label>
						<Textarea
							id="notes"
							rows={3}
							placeholder="Grain direction, packing, delivery terms"
							{...form.register("notes")}
						/>
					</div>

					<div className="rounded-md bg-pearl/20 p-3 text-sm">
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-muted-foreground">Order quantity</span>
							<span className="font-mono tabular-nums">
								{orderQty.toLocaleString("en-AE")} {r.unit}
								{moq > r.quantity ? " (raised to your MOQ)" : ""}
							</span>
						</div>
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-muted-foreground">Buyer's total</span>
							<span className="font-mono font-semibold tabular-nums">
								{price ? `AED ${filsToAed(price * orderQty)}` : "—"}
							</span>
						</div>
					</div>

					{serverError && (
						<p role="alert" className="text-sm text-russet">
							{serverError}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={respond.isPending}>
							<PaperPlaneRight size={16} />{" "}
							{respond.isPending
								? "Sending…"
								: current
									? "Send revised quote"
									: "Send quote"}
						</Button>
						{onCancel && (
							<Button type="button" variant="ghost" onClick={onCancel}>
								Cancel
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function DeclineBox({ quote }: { quote: VendorQuoteDetail }) {
	const decline = useDeclineQuote(quote.id);
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	if (!open) {
		return (
			<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
				Can't quote this
			</Button>
		);
	}
	return (
		<Card>
			<CardContent className="space-y-3 pt-6">
				<Label htmlFor="decline-reason">Tell the buyer why (optional)</Label>
				<Textarea
					id="decline-reason"
					rows={2}
					value={reason}
					maxLength={1000}
					placeholder="e.g. Out of 2.0 mm greyboard until next month"
					onChange={(e) => setReason(e.target.value)}
				/>
				{error && <p className="text-sm text-russet">{error}</p>}
				<div className="flex gap-2">
					<Button
						variant="destructive"
						size="sm"
						disabled={decline.isPending}
						onClick={async () => {
							setError(null);
							try {
								await decline.mutateAsync(reason.trim());
								setOpen(false);
							} catch (err) {
								setError(errorMessage(err));
							}
						}}
					>
						Decline request
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Back
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

/* ------------------------------------------------------------------ */
/*  Thread                                                             */
/* ------------------------------------------------------------------ */

function Thread({ quote }: { quote: VendorQuoteDetail }) {
	const send = useSendVendorQuoteMessage(quote.id);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					Messages with {quote.request.buyer?.display_name ?? "the buyer"}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{quote.messages.length === 0 ? (
					<p className="text-sm text-muted-foreground">No messages yet.</p>
				) : (
					<ol className="flex flex-col gap-3">
						{quote.messages.map((m) => {
							const mine = m.sender_role === "vendor";
							return (
								<li
									key={m.id}
									className={cn(
										"grid max-w-[85%] gap-1",
										mine
											? "justify-items-end self-end"
											: "justify-items-start self-start",
									)}
								>
									<span className="text-xs text-muted-foreground">
										{mine
											? "You"
											: m.sender_role === "system"
												? "MaterialHub"
												: "Buyer"}{" "}
										·{" "}
										<time className="font-mono tabular-nums">
											{new Date(m.created_at).toLocaleString("en-AE", {
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
												timeZone: "Asia/Dubai",
											})}
										</time>
									</span>
									<div
										className={cn(
											"whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm",
											mine ? "bg-cacao text-linen" : "bg-pearl/30 text-cacao",
										)}
									>
										{m.body}
									</div>
								</li>
							);
						})}
					</ol>
				)}
				{quote.can_message ? (
					<form
						className="space-y-2"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!text.trim()) return;
							const value = text;
							setText("");
							setError(null);
							try {
								await send.mutateAsync(value.trim());
							} catch (err) {
								setText(value);
								setError(errorMessage(err));
							}
						}}
					>
						<Label htmlFor="vendor-reply">Reply</Label>
						<Textarea
							id="vendor-reply"
							rows={3}
							value={text}
							maxLength={4000}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
									e.currentTarget.form?.requestSubmit();
							}}
						/>
						<div className="flex items-center justify-between gap-2">
							<span
								className={cn(
									"text-xs",
									error ? "text-russet" : "text-muted-foreground",
								)}
							>
								{error ?? "Ctrl + Enter to send"}
							</span>
							<Button
								type="submit"
								size="sm"
								variant="outline"
								disabled={send.isPending || !text.trim()}
							>
								Send
							</Button>
						</div>
					</form>
				) : (
					<p className="text-sm text-muted-foreground">
						This conversation is closed.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
