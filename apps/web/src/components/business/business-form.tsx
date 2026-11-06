"use client";

import {
	Field,
	FieldError,
	FormMessage,
	Input,
	Select,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { apiErrorCode } from "@/lib/business/net-terms";
import { normalizeTrn, trnState } from "@/lib/business/trn";
import type { BusinessAccount, BusinessInput } from "@/lib/business/types";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useUploadLicence } from "@/lib/queries/business";
import { cn } from "@/lib/utils";
import { Check, FileText, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";

const LICENCE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const LICENCE_MAX_BYTES = 10 * 1024 * 1024;

/** Server error codes the form knows how to explain, keyed to the field they belong to. */
const CODE_FIELD: Record<string, keyof FormState | "form"> = {
	TRN_INVALID: "trn",
	TRN_REQUIRED: "trn",
	LICENCE_EXPIRED: "trade_licence_expiry",
	LICENCE_KEY_INVALID: "licence",
	ALREADY_IN_BUSINESS: "form",
	BUSINESS_ROLE_REQUIRED: "form",
};

interface FormState {
	legal_name: string;
	trade_name: string;
	trade_licence_number: string;
	trade_licence_issuer: string;
	trade_licence_expiry: string;
	vat_registered: boolean;
	trn: string;
	line1: string;
	line2: string;
	city: string;
	emirate: string;
	po_box: string;
	licence: string;
}

function initialState(a?: BusinessAccount | null): FormState {
	return {
		legal_name: a?.legal_name ?? "",
		trade_name: a?.trade_name ?? "",
		trade_licence_number: a?.trade_licence_number ?? "",
		trade_licence_issuer: a?.trade_licence_issuer ?? "",
		trade_licence_expiry: a?.trade_licence_expiry?.slice(0, 10) ?? "",
		vat_registered: a?.vat_registered ?? true,
		trn: a?.trn ?? "",
		line1: a?.billing_address?.line1 ?? "",
		line2: a?.billing_address?.line2 ?? "",
		city: a?.billing_address?.city ?? "",
		emirate: a?.billing_address?.emirate ?? "",
		po_box: a?.billing_address?.po_box ?? "",
		licence: "",
	};
}

function toInput(f: FormState, licenceKey: string | null): BusinessInput {
	const blank = (v: string) => (v.trim() === "" ? null : v.trim());
	return {
		legal_name: f.legal_name.trim(),
		trade_name: blank(f.trade_name),
		trade_licence_number: f.trade_licence_number.trim(),
		trade_licence_issuer: blank(f.trade_licence_issuer),
		trade_licence_expiry: f.trade_licence_expiry,
		...(licenceKey ? { trade_licence_document_key: licenceKey } : {}),
		vat_registered: f.vat_registered,
		trn: f.vat_registered ? normalizeTrn(f.trn) : null,
		billing_address: {
			line1: f.line1.trim(),
			...(f.line2.trim() ? { line2: f.line2.trim() } : {}),
			city: f.city.trim(),
			emirate: f.emirate,
			...(f.po_box.trim() ? { po_box: f.po_box.trim() } : {}),
			country_code: "AE",
		},
	};
}

type Errors = Partial<Record<keyof FormState | "form", string>>;

/**
 * Company details, as on the trade licence. Used to create the account and,
 * with `initial`, to edit it (admins only).
 */
export function BusinessForm({
	initial,
	submitLabel,
	busyLabel,
	onSubmit,
	onCancel,
	busy,
}: {
	initial?: BusinessAccount | null;
	submitLabel: string;
	busyLabel: string;
	onSubmit: (input: BusinessInput) => Promise<void>;
	onCancel?: () => void;
	busy: boolean;
}) {
	const t = useTranslations("business");
	const tEmirates = useTranslations("emirates");
	const [form, setForm] = useState<FormState>(() => initialState(initial));
	const [errors, setErrors] = useState<Errors>({});
	const [licenceKey, setLicenceKey] = useState<string | null>(null);
	const [licenceName, setLicenceName] = useState<string | null>(null);
	const upload = useUploadLicence();
	const fileRef = useRef<HTMLInputElement>(null);
	const ids = useId();
	const today = new Date().toISOString().slice(0, 10);

	const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
		setForm((f) => ({ ...f, [key]: value }));
		if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
	};

	const trn = trnState(form.trn);
	const trnLive =
		trn.state === "valid"
			? t("form.trnValid")
			: trn.state === "long"
				? t("form.trnTooLong", { count: trn.digits })
				: trn.state === "short"
					? t("form.trnCount", { count: trn.digits })
					: t("form.trnHint");

	async function onFile(file: File | undefined) {
		if (!file) return;
		if (!LICENCE_TYPES.includes(file.type))
			return setErrors((e) => ({ ...e, licence: t("errors.fileType") }));
		if (file.size > LICENCE_MAX_BYTES)
			return setErrors((e) => ({ ...e, licence: t("errors.fileSize") }));
		setErrors((e) => ({ ...e, licence: undefined }));
		try {
			const key = await upload.mutateAsync(file);
			setLicenceKey(key);
			setLicenceName(file.name);
		} catch {
			setErrors((e) => ({ ...e, licence: t("errors.upload") }));
		} finally {
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	function validate(): Errors {
		const e: Errors = {};
		const req = t("errors.required");
		if (!form.legal_name.trim()) e.legal_name = req;
		if (!form.trade_licence_number.trim()) e.trade_licence_number = req;
		if (!form.trade_licence_expiry) e.trade_licence_expiry = req;
		else if (form.trade_licence_expiry <= today)
			e.trade_licence_expiry = t("errors.LICENCE_EXPIRED");
		if (form.vat_registered) {
			if (trn.state === "empty") e.trn = t("errors.TRN_REQUIRED");
			else if (trn.state !== "valid") e.trn = t("errors.TRN_INVALID");
		}
		if (!form.line1.trim()) e.line1 = req;
		if (!form.city.trim()) e.city = req;
		if (!form.emirate) e.emirate = req;
		return e;
	}

	async function handleSubmit(ev: FormEvent) {
		ev.preventDefault();
		const e = validate();
		setErrors(e);
		if (Object.values(e).some(Boolean)) return;
		try {
			await onSubmit(toInput(form, licenceKey));
		} catch (err) {
			const code = apiErrorCode(err);
			const field = code ? CODE_FIELD[code] : undefined;
			const msg =
				code && field
					? t(`errors.${code}` as "errors.generic")
					: t("errors.generic");
			setErrors({ [field ?? "form"]: msg });
		}
	}

	const hasDoc = !!licenceKey || !!initial?.has_licence_document;

	return (
		<form onSubmit={handleSubmit} noValidate className="grid gap-6">
			<FieldGroup>
				<Field
					label={t("form.legalName")}
					hint={t("form.legalNameHint")}
					error={errors.legal_name}
					className="sm:col-span-2"
				>
					{(p) => (
						<Input
							{...p}
							value={form.legal_name}
							onChange={(e) => set("legal_name", e.target.value)}
							autoComplete="organization"
						/>
					)}
				</Field>
				<Field label={t("form.tradeName")} optional error={errors.trade_name}>
					{(p) => (
						<Input
							{...p}
							value={form.trade_name}
							onChange={(e) => set("trade_name", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label={t("form.licenceNumber")}
					error={errors.trade_licence_number}
				>
					{(p) => (
						<Input
							{...p}
							dir="ltr"
							className="font-mono tabular-nums rtl:text-end"
							value={form.trade_licence_number}
							onChange={(e) => set("trade_licence_number", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label={t("form.licenceIssuer")}
					hint={t("form.licenceIssuerHint")}
					optional
				>
					{(p) => (
						<Input
							{...p}
							value={form.trade_licence_issuer}
							onChange={(e) => set("trade_licence_issuer", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label={t("form.licenceExpiry")}
					error={errors.trade_licence_expiry}
				>
					{(p) => (
						<Input
							{...p}
							type="date"
							min={today}
							className="font-mono tabular-nums"
							value={form.trade_licence_expiry}
							onChange={(e) => set("trade_licence_expiry", e.target.value)}
						/>
					)}
				</Field>
			</FieldGroup>

			{/* Licence document */}
			<div className="grid gap-1.5">
				<span
					id={`${ids}-doc`}
					className="text-[13px] font-medium text-nl-cacao"
				>
					{t("form.licenceDoc")}
				</span>
				<div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-nl-cacao/25 bg-nl-linen/50 p-3">
					<FileText
						className="h-5 w-5 shrink-0 text-nl-russet"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<p className="m-0 min-w-0 flex-1 basis-40 break-words text-[13.5px] text-nl-cacao">
						{licenceName ? (
							<span className="inline-flex items-center gap-1.5">
								<Check
									className="h-4 w-4 shrink-0 text-status-success"
									strokeWidth={2}
									aria-hidden="true"
								/>
								{t("form.uploaded", { name: licenceName })}
							</span>
						) : hasDoc ? (
							t("form.onFile")
						) : (
							<span className="text-nl-russet">{t("form.licenceDocHint")}</span>
						)}
					</p>
					<input
						ref={fileRef}
						type="file"
						accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
						className="sr-only"
						id={`${ids}-file`}
						aria-labelledby={`${ids}-doc`}
						onChange={(e) => onFile(e.target.files?.[0])}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={upload.isPending}
						onClick={() => fileRef.current?.click()}
					>
						<Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
						{upload.isPending
							? t("form.uploading")
							: hasDoc
								? t("form.replaceFile")
								: t("form.chooseFile")}
					</Button>
				</div>
				{errors.licence && <FieldError>{errors.licence}</FieldError>}
			</div>

			{/* VAT */}
			<div className="grid gap-4 rounded-md border border-nl-cacao/12 p-4">
				<label className="flex cursor-pointer items-start gap-3">
					<input
						type="checkbox"
						checked={form.vat_registered}
						onChange={(e) => set("vat_registered", e.target.checked)}
						className="mt-0.5 h-5 w-5 shrink-0 rounded-sm accent-nl-cacao"
					/>
					<span className="grid gap-0.5">
						<span className="text-[14px] font-medium text-nl-cacao">
							{t("form.vatRegistered")}
						</span>
						<span className="text-[13px] text-nl-russet">
							{t("form.vatRegisteredHint")}
						</span>
					</span>
				</label>
				{form.vat_registered && (
					<TrnField
						value={form.trn}
						onChange={(v) => set("trn", v)}
						error={errors.trn}
						live={trnLive}
						valid={trn.state === "valid"}
						label={t("form.trn")}
					/>
				)}
			</div>

			<fieldset className="m-0 grid gap-4 border-0 p-0">
				<legend className="mb-3 p-0 font-display text-[15.5px] font-semibold text-nl-cacao">
					{t("form.billingTitle")}
				</legend>
				<FieldGroup>
					<Field
						label={t("form.line1")}
						error={errors.line1}
						className="sm:col-span-2"
					>
						{(p) => (
							<Input
								{...p}
								value={form.line1}
								onChange={(e) => set("line1", e.target.value)}
								autoComplete="address-line1"
							/>
						)}
					</Field>
					<Field label={t("form.line2")} optional className="sm:col-span-2">
						{(p) => (
							<Input
								{...p}
								value={form.line2}
								onChange={(e) => set("line2", e.target.value)}
								autoComplete="address-line2"
							/>
						)}
					</Field>
					<Field label={t("form.city")} error={errors.city}>
						{(p) => (
							<Input
								{...p}
								value={form.city}
								onChange={(e) => set("city", e.target.value)}
								autoComplete="address-level2"
							/>
						)}
					</Field>
					<Field label={t("form.emirate")} error={errors.emirate}>
						{(p) => (
							<Select
								{...p}
								value={form.emirate}
								onChange={(e) => set("emirate", e.target.value)}
							>
								<option value="">{t("form.emiratePlaceholder")}</option>
								{UAE_EMIRATES.map((em) => (
									<option key={em.value} value={em.value}>
										{tEmirates(em.labelKey)}
									</option>
								))}
							</Select>
						)}
					</Field>
					<Field label={t("form.poBox")} optional>
						{(p) => (
							<Input
								{...p}
								dir="ltr"
								inputMode="numeric"
								className="font-mono tabular-nums rtl:text-end"
								value={form.po_box}
								onChange={(e) => set("po_box", e.target.value)}
							/>
						)}
					</Field>
				</FieldGroup>
			</fieldset>

			{initial && (
				<p className="m-0 text-[13px] text-nl-russet">
					{t("form.reverifyNote")}
				</p>
			)}
			{errors.form && <FormMessage tone="error">{errors.form}</FormMessage>}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					variant="primary"
					disabled={busy || upload.isPending}
				>
					{busy ? busyLabel : submitLabel}
				</Button>
				{onCancel && (
					<Button type="button" variant="ghost" onClick={onCancel}>
						{t("form.cancel")}
					</Button>
				)}
			</div>
		</form>
	);
}

function FieldGroup({ children }: { children: ReactNode }) {
	return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/**
 * TRN input with a live digit count. Digits only, always left to right; the
 * count turns into a check at 15.
 */
export function TrnField({
	value,
	onChange,
	error,
	live,
	valid,
	label,
}: {
	value: string;
	onChange: (v: string) => void;
	error?: string;
	live: string;
	valid: boolean;
	label: string;
}) {
	const id = useId();
	const msgId = `${id}-msg`;
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-[13px] font-medium text-nl-cacao">
				{label}
			</label>
			<Input
				id={id}
				dir="ltr"
				inputMode="numeric"
				autoComplete="off"
				maxLength={24}
				className="font-mono tracking-[0.04em] tabular-nums rtl:text-end"
				value={value}
				onChange={(e) =>
					onChange(e.target.value.replace(/[^\d\s\-٠-٩۰-۹]/g, ""))
				}
				aria-invalid={error ? true : undefined}
				aria-describedby={msgId}
			/>
			{error ? (
				<FieldError id={msgId}>{error}</FieldError>
			) : (
				<p
					id={msgId}
					aria-live="polite"
					className={cn(
						"m-0 flex items-center gap-1.5 text-[13px]",
						valid ? "text-status-success" : "text-nl-russet",
					)}
				>
					{valid && (
						<Check
							className="h-4 w-4 shrink-0"
							strokeWidth={2}
							aria-hidden="true"
						/>
					)}
					{live}
				</p>
			)}
		</div>
	);
}
