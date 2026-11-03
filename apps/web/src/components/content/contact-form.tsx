"use client";

import { Button } from "@/components/swatch";
import { ensureGuestSessionToken } from "@/lib/api";
import { type CreateTicketPayload, useCreateTicket } from "@/lib/queries/support";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

type Topic = "order" | "product" | "payment" | "account" | "trade";
const TOPICS: Topic[] = ["order", "product", "payment", "account", "trade"];
type Field = "name" | "email" | "subject" | "message";
type Errors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const fieldClass =
	"w-full rounded-md border border-nl-cacao/15 bg-nl-pearl px-3.5 text-[15px] text-nl-cacao placeholder:text-nl-russet/80 transition-colors hover:border-nl-cacao/35 focus:border-nl-cacao focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber aria-[invalid=true]:border-red-700";

function FormField({
	id,
	label,
	hint,
	error,
	children,
}: {
	id: string;
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="grid gap-1.5 content-start">
			<label htmlFor={id} className="text-[13px] font-medium text-nl-cacao">
				{label}
			</label>
			{children}
			{error ? (
				<p id={`${id}-error`} className="m-0 flex items-center gap-1.5 text-[13px] text-red-700">
					<AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
					{error}
				</p>
			) : hint ? (
				<p id={`${id}-hint`} className="m-0 text-[13px] text-nl-russet">
					{hint}
				</p>
			) : null}
		</div>
	);
}

/**
 * Contact form. Posts a support ticket (guests get a guest session first), so
 * the message lands in the same queue customer care already works from.
 */
export function ContactForm() {
	const t = useTranslations("content.contact");
	const uid = useId();
	const ids = {
		name: `${uid}-name`,
		email: `${uid}-email`,
		topic: `${uid}-topic`,
		subject: `${uid}-subject`,
		message: `${uid}-message`,
	};
	const user = useAuthStore((s) => s.user);
	const create = useCreateTicket();

	const [values, setValues] = useState({ name: "", email: "", subject: "", message: "" });
	const [topic, setTopic] = useState<Topic>("order");
	const [errors, setErrors] = useState<Errors>({});
	const [sent, setSent] = useState<{ number?: string; email: string } | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!user) return;
		setValues((v) => ({
			...v,
			name: v.name || [user.first_name, user.last_name].filter(Boolean).join(" "),
			email: v.email || user.email,
		}));
	}, [user]);

	function set(field: Field, value: string) {
		setValues((v) => ({ ...v, [field]: value }));
		if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
	}

	function validate(): Errors {
		const e: Errors = {};
		if (!values.name.trim()) e.name = t("errorRequired");
		if (!values.email.trim()) e.email = t("errorRequired");
		else if (!EMAIL_RE.test(values.email.trim())) e.email = t("errorEmail");
		if (!values.subject.trim()) e.subject = t("errorRequired");
		if (!values.message.trim()) e.message = t("errorRequired");
		return e;
	}

	async function onSubmit(ev: FormEvent) {
		ev.preventDefault();
		if (create.isPending) return;
		const e = validate();
		setErrors(e);
		setFailed(false);
		const first = (Object.keys(e) as Field[])[0];
		if (first) {
			document.getElementById(ids[first])?.focus();
			return;
		}
		const subject = values.subject.trim();
		const payload: CreateTicketPayload = {
			subject: topic === "trade" ? `Trade enquiry: ${subject}` : subject,
			category: topic === "trade" ? null : topic,
			message: values.message.trim(),
		};
		if (!user) {
			payload.guest_name = values.name.trim();
			payload.guest_email = values.email.trim();
		}
		try {
			if (!user) await ensureGuestSessionToken();
			const ticket = await create.mutateAsync(payload);
			setSent({ number: ticket?.ticket_number, email: values.email.trim() });
		} catch {
			setFailed(true);
		}
	}

	if (sent) {
		return (
			<output aria-live="polite" className="grid gap-3 rounded-md bg-nl-pearl shadow-card p-5 md:p-6">
				<div className="flex items-center gap-2.5">
					<span className="grid place-items-center h-6 w-6 rounded-sm bg-nl-cacao text-nl-pearl">
						<Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
					</span>
					<h3 className="m-0 font-display text-[18px] font-semibold">{t("sentTitle")}</h3>
				</div>
				<p className="m-0 text-[15px] text-nl-cacao/85">
					{sent.number
						? t("sentBody", { number: sent.number, email: sent.email })
						: t("sentBodyNoNumber", { email: sent.email })}
				</p>
				<div>
					<Button
						variant="outline"
						onClick={() => {
							setSent(null);
							setValues((v) => ({ ...v, subject: "", message: "" }));
						}}
					>
						{t("sendAnother")}
					</Button>
				</div>
			</output>
		);
	}

	const describedBy = (f: Field, hasHint = false) =>
		errors[f] ? `${ids[f]}-error` : hasHint ? `${ids[f]}-hint` : undefined;

	return (
		<form
			onSubmit={onSubmit}
			noValidate
			aria-labelledby={`${uid}-title`}
			className="rounded-md bg-nl-pearl shadow-card p-5 md:p-7 grid gap-5"
		>
			<h2 id={`${uid}-title`} className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em]">
				{t("formTitle")}
			</h2>
			<div className="grid gap-5 sm:grid-cols-2">
				<FormField id={ids.name} label={t("name")} error={errors.name}>
					<input
						id={ids.name}
						name="name"
						autoComplete="name"
						value={values.name}
						onChange={(e) => set("name", e.target.value)}
						aria-invalid={!!errors.name || undefined}
						aria-describedby={describedBy("name")}
						aria-required="true"
						className={cn(fieldClass, "h-12")}
					/>
				</FormField>
				<FormField id={ids.email} label={t("email")} error={errors.email}>
					<input
						id={ids.email}
						name="email"
						type="email"
						autoComplete="email"
						inputMode="email"
						dir="ltr"
						value={values.email}
						onChange={(e) => set("email", e.target.value)}
						aria-invalid={!!errors.email || undefined}
						aria-describedby={describedBy("email")}
						aria-required="true"
						className={cn(fieldClass, "h-12 rtl:text-right")}
					/>
				</FormField>
			</div>
			<FormField id={ids.topic} label={t("topic")}>
				<div className="relative">
					<select
						id={ids.topic}
						name="topic"
						value={topic}
						onChange={(e) => setTopic(e.target.value as Topic)}
						className={cn(fieldClass, "h-12 appearance-none pe-10 cursor-pointer")}
					>
						{TOPICS.map((k) => (
							<option key={k} value={k}>
								{t(`topics.${k}`)}
							</option>
						))}
					</select>
					<ChevronDown
						className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-nl-russet"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
				</div>
			</FormField>
			<FormField id={ids.subject} label={t("subject")} hint={t("subjectHint")} error={errors.subject}>
				<input
					id={ids.subject}
					name="subject"
					maxLength={200}
					value={values.subject}
					onChange={(e) => set("subject", e.target.value)}
					aria-invalid={!!errors.subject || undefined}
					aria-describedby={describedBy("subject", true)}
					aria-required="true"
					className={cn(fieldClass, "h-12")}
				/>
			</FormField>
			<FormField id={ids.message} label={t("message")} hint={t("messageHint")} error={errors.message}>
				<textarea
					id={ids.message}
					name="message"
					rows={6}
					value={values.message}
					onChange={(e) => set("message", e.target.value)}
					aria-invalid={!!errors.message || undefined}
					aria-describedby={describedBy("message", true)}
					aria-required="true"
					className={cn(fieldClass, "py-3 min-h-[148px] resize-y leading-[1.55]")}
				/>
			</FormField>
			{failed && (
				<p role="alert" className="m-0 flex items-start gap-2 text-[14px] text-red-700">
					<AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
					{t("errorSend")}
				</p>
			)}
			<div>
				<Button type="submit" size="lg" disabled={create.isPending} className="w-full sm:w-auto">
					{create.isPending ? t("sending") : t("send")}
				</Button>
			</div>
		</form>
	);
}
