"use client";

import {
	EmptyState,
	ErrorState,
	FormMessage,
	ListSkeleton,
	PageHeader,
	Panel,
	PanelHead,
	StatusBadge,
} from "@/components/account/account-ui";
import { QuoteComparison } from "@/components/rfq/quote-comparison";
import { QuoteThread } from "@/components/rfq/quote-thread";
import { formatQuoteDate, requestTone } from "@/components/rfq/status";
import { Button } from "@/components/swatch";
import {
	type QuoteRequestDetail,
	openQuoteAttachment,
	useAcceptQuote,
	useCancelQuoteRequest,
	useDeclineQuote,
	useQuoteRequest,
	useSendQuoteMessage,
} from "@/lib/queries/rfq";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function QuoteRequestDetailPage() {
	const t = useTranslations("rfq.detail");
	const tStatus = useTranslations("rfq.status");
	const locale = useLocale();
	const { id } = useParams<{ id: string }>();
	const { data: request, isLoading, isError, refetch } = useQuoteRequest(id);
	const accept = useAcceptQuote(id);
	const decline = useDeclineQuote(id);
	const cancel = useCancelQuoteRequest(id);
	const send = useSendQuoteMessage(id);
	const [justAccepted, setJustAccepted] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [confirmCancel, setConfirmCancel] = useState(false);

	if (isLoading) return <ListSkeleton rows={3} />;
	if (isError) return <ErrorState onRetry={() => refetch()} />;
	if (!request) {
		return (
			<EmptyState
				icon={FileText}
				title={t("notFound")}
				action={{ label: t("backToList"), href: `/${locale}/account/quotes` }}
			/>
		);
	}

	const errorText = (err: unknown) =>
		// biome-ignore lint/suspicious/noExplicitAny: axios error shape
		((err as any)?.response?.data?.message as string | undefined) ??
		t("actionFailed");

	const actions = {
		busy: accept.isPending || decline.isPending,
		onAccept: async (supplierId: string) => {
			setActionError(null);
			try {
				await accept.mutateAsync(supplierId);
				setJustAccepted(true);
			} catch (err) {
				setActionError(errorText(err));
				refetch();
			}
		},
		onDecline: async (supplierId: string, reason: string) => {
			setActionError(null);
			try {
				await decline.mutateAsync({ supplierId, reason });
			} catch (err) {
				setActionError(errorText(err));
			}
		},
	};

	return (
		<div>
			<Link
				href={`/${locale}/account/quotes`}
				className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-nl-russet hover:text-nl-cacao"
			>
				<ArrowLeft
					className="h-4 w-4 rtl:rotate-180"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
				{t("backToList")}
			</Link>
			<PageHeader
				title={request.title}
				description={
					<span className="inline-flex flex-wrap items-center gap-2">
						<span className="font-mono tabular-nums">
							{request.request_number}
						</span>
						<StatusBadge tone={requestTone(request.status)}>
							{tStatus(request.status)}
						</StatusBadge>
						<span>
							{t("created", { date: formatDate(request.created_at, locale) })}
						</span>
					</span>
				}
			/>

			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
				{(justAccepted || actionError) && (
					<div
						className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-nl-pearl p-4 shadow-card"
						aria-live="polite"
					>
						{actionError ? (
							<FormMessage tone="error">{actionError}</FormMessage>
						) : (
							<FormMessage tone="success">{t("accepted")}</FormMessage>
						)}
						{justAccepted && !actionError && (
							<Button asChild variant="signal">
								<Link href={`/${locale}/cart`}>{t("goToCart")}</Link>
							</Button>
						)}
					</div>
				)}

				<RequestSummary request={request} />

				<Panel>
					<PanelHead title={t("compare")} />
					<div className="p-4 md:p-5">
						{request.suppliers.some(
							(s) => s.current_response || s.status === "vendor_declined",
						) ? (
							<QuoteComparison request={request} actions={actions} />
						) : (
							<p className="m-0 text-sm text-nl-russet">{t("compareEmpty")}</p>
						)}
					</div>
				</Panel>

				<Panel>
					<PanelHead title={t("thread")} />
					<QuoteThread
						suppliers={request.suppliers}
						sending={send.isPending}
						onSend={(supplierId, body) =>
							send.mutateAsync({ supplierId, body })
						}
						onOpenAttachment={(a) => openQuoteAttachment(request.id, a.key)}
					/>
				</Panel>

				{request.can_cancel && (
					<div className="flex flex-wrap items-center gap-3">
						{confirmCancel ? (
							<>
								<p className="m-0 text-sm text-nl-cacao">
									{t("cancelConfirm")}
								</p>
								<Button
									variant="outline"
									size="sm"
									disabled={cancel.isPending}
									onClick={() =>
										cancel.mutate(undefined, {
											onSettled: () => setConfirmCancel(false),
										})
									}
								>
									{t("cancelYes")}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setConfirmCancel(false)}
								>
									{t("cancelNo")}
								</Button>
							</>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setConfirmCancel(true)}
							>
								{t("cancelRequest")}
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function RequestSummary({ request }: { request: QuoteRequestDetail }) {
	const t = useTranslations("rfq.detail");
	const tCount = useTranslations("rfq.unitsCount");
	const tEmirates = useTranslations("emirates");
	const locale = useLocale();
	const emirateKey = request.delivery_emirate
		.toLowerCase()
		.replace(/\s+/g, "_");
	const emirate = tEmirates.has(emirateKey)
		? tEmirates(emirateKey)
		: request.delivery_emirate;

	const rows: { label: string; value: React.ReactNode }[] = [
		{
			label: t("quantity"),
			value: (
				<bdi className="font-mono tabular-nums">
					{tCount(request.unit, { count: request.quantity })}
				</bdi>
			),
		},
		{
			label: t("needBy"),
			value: request.need_by ? (
				<time dateTime={request.need_by} className="font-mono tabular-nums">
					{formatQuoteDate(request.need_by, locale)}
				</time>
			) : (
				t("noDate")
			),
		},
		{ label: t("deliverTo"), value: emirate },
		{
			label: t("suppliers"),
			value: request.suppliers
				.map((s) => s.vendor?.name)
				.filter(Boolean)
				.join(", "),
		},
	];

	return (
		<Panel>
			<PanelHead title={t("summary")} />
			<div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8 md:p-5">
				<div className="grid content-start gap-3">
					<dl className="m-0 grid border-t-2 border-nl-cacao">
						{rows.map((r) => (
							<div
								key={r.label}
								className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-nl-cacao/10 py-2.5"
							>
								<dt className="mill-label pt-0.5 text-nl-russet">{r.label}</dt>
								<dd className="m-0 min-w-0 text-[13.5px] text-nl-cacao">
									{r.value}
								</dd>
							</div>
						))}
					</dl>
					{request.product && (
						<Link
							href={`/${locale}/product/${request.product.slug}`}
							className="text-[13.5px] text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao"
						>
							{request.product.name}
							{request.variant ? ` · ${request.variant.name}` : ""}
						</Link>
					)}
				</div>
				<div className="grid content-start gap-4">
					<div className="grid gap-1.5">
						<h3 className="mill-label m-0 text-nl-russet">
							{t("specification")}
						</h3>
						<p className="m-0 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-nl-cacao">
							{request.specification}
						</p>
					</div>
					{request.attachments.length > 0 && (
						<div className="grid gap-1.5">
							<h3 className="mill-label m-0 text-nl-russet">
								{t("attachments")}
							</h3>
							<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
								{request.attachments.map((a) => (
									<li key={a.key}>
										<button
											type="button"
											onClick={() => openQuoteAttachment(request.id, a.key)}
											className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-nl-linen px-2.5 text-[12.5px] text-nl-cacao hover:bg-nl-cacao/[0.08]"
											aria-label={t("openAttachment", { name: a.filename })}
										>
											<Paperclip
												className="h-3.5 w-3.5"
												strokeWidth={1.75}
												aria-hidden="true"
											/>
											<span className="max-w-[22ch] truncate">
												{a.filename}
											</span>
										</button>
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>
		</Panel>
	);
}
