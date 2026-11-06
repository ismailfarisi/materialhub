"use client";

import {
	fetchEcoCertificateUrl,
	uploadEcoCertificate,
	useEcoDeclaration,
	useSaveEcoDeclaration,
	useWithdrawEcoDeclaration,
} from "@/lib/queries/eco-declaration";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Checkbox,
	Label,
	Skeleton,
	Textarea,
	toast,
} from "@materialhub/ui";
import { AlertCircle, FileText, Loader2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	type CertificateDraft,
	DECLARATION_TEXT,
	MAX_STATEMENT_LENGTH,
	REVIEW_DISCLAIMER,
	STATUS_META,
	buildDeclarationPayload,
	declarationErrorMessage,
	validateCertificateFile,
	willResetApproval,
} from "./eco-declaration.helpers";

const TONE_VARIANT = {
	warning: "warning",
	success: "success",
	error: "destructive",
	neutral: "secondary",
} as const;

function formatDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Shown on the new-product page, where there is no product id yet. */
export function EcoDeclarationNotice() {
	return (
		<p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
			Selling paper, moulded-fibre or wooden food-service packaging? After you save the product, open
			its <span className="font-medium text-gray-900">Plastic-ban ready</span> tab to declare it and
			attach a certificate for MaterialHub to review.
		</p>
	);
}

export function EcoDeclarationPanel({ productId }: { productId: string }) {
	const { data: current, isLoading, isError, refetch } = useEcoDeclaration(productId);
	const save = useSaveEcoDeclaration(productId);
	const withdraw = useWithdrawEcoDeclaration(productId);

	const [statement, setStatement] = useState("");
	const [confirm, setConfirm] = useState(false);
	const [certificate, setCertificate] = useState<CertificateDraft>({ kind: "keep" });
	const [uploading, setUploading] = useState<number | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const ids = { statement: useId(), confirm: useId(), file: useId() };

	// Hydrate the draft whenever the stored declaration changes.
	useEffect(() => {
		setStatement(current?.statement ?? "");
		setCertificate({ kind: "keep" });
		setConfirm(false);
	}, [current]);

	if (isLoading) {
		return (
			<div className="space-y-3 py-4" aria-busy="true">
				<Skeleton className="h-6 w-64" />
				<Skeleton className="h-40 rounded-xl" />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="py-4">
				<div role="alert" className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					<AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
					<span>Could not load the declaration.</span>
					<Button size="sm" variant="outline" className="ms-auto" onClick={() => refetch()}>
						Try again
					</Button>
				</div>
			</div>
		);
	}

	const status = current && current.status !== "withdrawn" ? current.status : null;
	const meta = current ? STATUS_META[current.status] : null;
	const draft = { statement, confirm, certificate };
	const resetsApproval = willResetApproval(current, draft);
	const storedCertificate =
		certificate.kind === "keep" && current?.has_certificate
			? (current.certificate_filename ?? "Certificate")
			: null;
	const newCertificate = certificate.kind === "new" ? certificate.filename : null;
	const busy = save.isPending || uploading !== null;

	async function onFile(file: File | undefined) {
		if (!file) return;
		const err = validateCertificateFile(file);
		setFileError(err);
		if (err) return;
		setUploading(0);
		try {
			const key = await uploadEcoCertificate(file, setUploading);
			setCertificate({ kind: "new", key, filename: file.name });
		} catch {
			setFileError("Upload failed. Check your connection and try again.");
		} finally {
			setUploading(null);
			if (fileInput.current) fileInput.current.value = "";
		}
	}

	async function onViewCertificate() {
		try {
			const url = await fetchEcoCertificateUrl(productId);
			window.open(url, "_blank", "noopener,noreferrer");
		} catch {
			toast({ title: "Could not open the certificate", variant: "destructive" });
		}
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFormError(null);
		if (!confirm) {
			setFormError("Tick the declaration to submit it.");
			return;
		}
		if (statement.length > MAX_STATEMENT_LENGTH) {
			setFormError(`Keep the note under ${MAX_STATEMENT_LENGTH} characters.`);
			return;
		}
		try {
			const saved = await save.mutateAsync(buildDeclarationPayload(draft));
			toast({
				title: saved.status === "approved" ? "No changes to review" : "Declaration sent for review",
			});
		} catch (err) {
			setFormError(declarationErrorMessage(err));
		}
	}

	async function onWithdraw() {
		try {
			await withdraw.mutateAsync();
			toast({ title: "Declaration withdrawn" });
		} catch (err) {
			setFormError(declarationErrorMessage(err));
		}
	}

	return (
		<div className="max-w-3xl space-y-4 py-4">
			<Card className="border-gray-200 shadow-sm">
				<CardHeader className="space-y-2">
					<div className="flex flex-wrap items-center gap-3">
						<CardTitle className="text-base">Plastic-ban ready declaration</CardTitle>
						{meta && (
							<Badge variant={TONE_VARIANT[meta.tone]} data-testid="eco-status">
								{meta.label}
							</Badge>
						)}
					</div>
					<p className="text-sm text-gray-600">
						Since 1 January 2026 the UAE federal ban covers single-use cups, lids, cutlery, plates,
						straws, stirrers and foam food containers, and single-use bags under 50 microns of any
						material. Declare products that are not covered so buyers can filter for them.
					</p>
				</CardHeader>
				<CardContent className="space-y-5">
					{meta && current && (
						<div
							className={
								current.status === "rejected"
									? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
									: "rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
							}
							role={current.status === "rejected" ? "alert" : undefined}
						>
							<p>{meta.help}</p>
							{current.status === "rejected" && current.rejection_reason && (
								<p className="mt-2">
									<span className="font-medium">Reviewer’s reason: </span>
									{current.rejection_reason}
								</p>
							)}
							<p className="mt-2 text-xs text-gray-500">
								Submitted {formatDate(current.submitted_at) ?? "—"}
								{current.reviewed_at && ` · Reviewed ${formatDate(current.reviewed_at)}`}
							</p>
						</div>
					)}

					<form onSubmit={onSubmit} className="space-y-5" noValidate>
						<div className="space-y-1.5">
							<Label htmlFor={ids.statement} className="text-sm font-medium text-gray-700">
								Note for the reviewer <span className="font-normal text-gray-500">(optional)</span>
							</Label>
							<Textarea
								id={ids.statement}
								value={statement}
								onChange={(e) => setStatement(e.target.value)}
								rows={4}
								maxLength={MAX_STATEMENT_LENGTH}
								placeholder="For example: 90 gsm kraft paper bag, water-based glue, no plastic lining or film."
								aria-describedby={`${ids.statement}-count`}
							/>
							<p id={`${ids.statement}-count`} className="text-xs text-gray-500 tabular-nums">
								{statement.length} / {MAX_STATEMENT_LENGTH}
							</p>
						</div>

						<div className="space-y-1.5">
							<span className="block text-sm font-medium text-gray-700" id={`${ids.file}-label`}>
								Certificate <span className="font-normal text-gray-500">(optional)</span>
							</span>
							<p className="text-xs text-gray-500">
								FSC or PEFC chain of custody, compostability certificate or test report. PDF, JPG or
								PNG, up to 10 MB. Only you and MaterialHub reviewers can open it.
							</p>
							{(storedCertificate || newCertificate) && (
								<div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
									<FileText className="h-4 w-4 text-gray-500" aria-hidden />
									<span className="min-w-0 flex-1 truncate">{newCertificate ?? storedCertificate}</span>
									{newCertificate && <span className="text-xs text-gray-500">Uploaded, not yet submitted</span>}
									{storedCertificate && (
										<Button type="button" size="sm" variant="ghost" onClick={onViewCertificate}>
											View
										</Button>
									)}
									<Button
										type="button"
										size="sm"
										variant="ghost"
										aria-label="Remove certificate"
										onClick={() =>
											setCertificate(
												newCertificate && current?.has_certificate ? { kind: "keep" } : { kind: "remove" },
											)
										}
									>
										<X className="h-4 w-4" aria-hidden />
									</Button>
								</div>
							)}
							{certificate.kind === "remove" && current?.has_certificate && (
								<p className="text-xs text-gray-600">
									The stored certificate will be removed when you submit.{" "}
									<button
										type="button"
										className="underline underline-offset-2"
										onClick={() => setCertificate({ kind: "keep" })}
									>
										Keep it
									</button>
								</p>
							)}
							<input
								ref={fileInput}
								id={ids.file}
								type="file"
								accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
								className="sr-only"
								aria-labelledby={`${ids.file}-label`}
								onChange={(e) => onFile(e.target.files?.[0])}
							/>
							<div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={() => fileInput.current?.click()}
								>
									{uploading !== null ? (
										<>
											<Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
											Uploading {uploading}%
										</>
									) : (
										<>
											<Upload className="me-2 h-4 w-4" aria-hidden />
											{storedCertificate || newCertificate ? "Replace certificate" : "Upload certificate"}
										</>
									)}
								</Button>
							</div>
							{fileError && (
								<p role="alert" className="flex items-center gap-1.5 text-xs text-red-600">
									<AlertCircle className="h-3.5 w-3.5" aria-hidden />
									{fileError}
								</p>
							)}
						</div>

						<div className="flex items-start gap-3 rounded-md border border-gray-200 p-4">
							<Checkbox
								id={ids.confirm}
								checked={confirm}
								onCheckedChange={(c) => setConfirm(c === true)}
								aria-required="true"
								className="mt-0.5"
							/>
							<Label htmlFor={ids.confirm} className="text-sm font-normal leading-relaxed text-gray-800">
								{DECLARATION_TEXT} <span className="text-gray-600">{REVIEW_DISCLAIMER}</span>
							</Label>
						</div>

						{resetsApproval && (
							<output className="block text-sm text-amber-700">
								This declaration is approved. Submitting changes sends it back to review and hides the
								storefront badge until a reviewer approves it again.
							</output>
						)}

						{formError && (
							<p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
								<AlertCircle className="h-4 w-4" aria-hidden />
								{formError}
							</p>
						)}

						<div className="flex flex-wrap items-center gap-3">
							<Button type="submit" disabled={busy}>
								{save.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />}
								{status ? "Submit changes" : "Submit for review"}
							</Button>
							{status && (
								<Button
									type="button"
									variant="outline"
									disabled={withdraw.isPending || busy}
									onClick={onWithdraw}
								>
									Withdraw declaration
								</Button>
							)}
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
