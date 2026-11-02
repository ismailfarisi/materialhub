"use client";

import {
	Field,
	FieldError,
	Input,
	compositeClass,
	compositeInputClass,
	compositePrefixClass,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { PhoneInput } from "@/components/ui/phone-input";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useRegisterPhoneAuth, useStartPhoneAuth, useVerifyPhoneAuth } from "@/lib/queries/auth";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Step = "phone" | "code" | "register";

function messageOf(err: unknown, fallback: string) {
	const e = err as { response?: { data?: { message?: string } } };
	return e.response?.data?.message || fallback;
}

export function PhoneAuthForm({ onAuthenticated }: { onAuthenticated: () => void }) {
	const t = useTranslations("auth");
	const tCommon = useTranslations("common");
	const { fire } = useChannelEvents();
	const startPhoneAuth = useStartPhoneAuth();
	const verifyPhoneAuth = useVerifyPhoneAuth();
	const registerPhoneAuth = useRegisterPhoneAuth();
	const [step, setStep] = useState<Step>("phone");
	const [phone, setPhone] = useState("");
	const [verifiedPhone, setVerifiedPhone] = useState("");
	const [code, setCode] = useState("");
	const [registrationToken, setRegistrationToken] = useState("");
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [resent, setResent] = useState(false);

	async function sendCode(target: string) {
		const result = await startPhoneAuth.mutateAsync(target);
		fire("SendOTP", { status: "success" });
		setVerifiedPhone(result.phone);
		return result;
	}

	async function submitPhone(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			await sendCode(phone);
			setResent(false);
			setStep("code");
		} catch (err: unknown) {
			const msg = messageOf(err, tCommon("error"));
			fire("SendOTP", { status: "failure", error: msg });
			setError(msg);
		}
	}

	async function resendCode() {
		setError("");
		try {
			await sendCode(verifiedPhone || phone);
			setCode("");
			setResent(true);
		} catch (err: unknown) {
			const msg = messageOf(err, tCommon("error"));
			fire("SendOTP", { status: "failure", error: msg });
			setError(msg);
		}
	}

	async function submitCode(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			const result = await verifyPhoneAuth.mutateAsync({ phone: verifiedPhone, code });
			fire("VerifyOTP", {
				status: "success",
				requires_registration: !!result.requires_registration,
			});
			if (result.requires_registration) {
				setRegistrationToken(result.registration_token || "");
				setVerifiedPhone(result.phone || verifiedPhone);
				setStep("register");
				return;
			}
			onAuthenticated();
		} catch (err: unknown) {
			const msg = messageOf(err, tCommon("error"));
			fire("VerifyOTP", { status: "failure", error: msg });
			setError(msg);
		}
	}

	function editPhone() {
		setCode("");
		setError("");
		setResent(false);
		setStep("phone");
	}

	async function submitRegistration(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			await registerPhoneAuth.mutateAsync({
				phone: verifiedPhone,
				registration_token: registrationToken,
				first_name: firstName,
				last_name: lastName,
				email,
			});
			fire("RegisterUser", { status: "success" });
			onAuthenticated();
		} catch (err: unknown) {
			const msg = messageOf(err, tCommon("error"));
			fire("RegisterUser", { status: "failure", error: msg });
			setError(msg);
		}
	}

	if (step === "code") {
		return (
			<form onSubmit={submitCode} className="grid gap-5">
				<div className="flex items-center justify-between gap-4 rounded-md bg-nl-linen/70 px-4 py-3">
					<div className="min-w-0">
						<div className="text-[13px] text-nl-russet">{t("codeSentTo")}</div>
						{/* Phone numbers stay LTR even on the Arabic and Urdu storefronts. */}
						<div dir="ltr" className="mt-0.5 truncate font-mono text-[15px] tabular-nums text-nl-cacao rtl:text-end">
							{verifiedPhone}
						</div>
					</div>
					<Button type="button" variant="ghost" size="sm" aria-label={t("changePhone")} onClick={editPhone} className="-me-2">
						{tCommon("edit")}
					</Button>
				</div>
				<Field label={t("verificationCode")} hint={resent ? t("codeResent") : t("codeHint")}>
					{(p) => (
						<Input
							{...p}
							inputMode="numeric"
							autoComplete="one-time-code"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							required
							className="font-mono text-[18px] tracking-[0.3em] tabular-nums md:text-[18px]"
						/>
					)}
				</Field>
				{error && <FieldError>{error}</FieldError>}
				<Button type="submit" size="lg" disabled={verifyPhoneAuth.isPending} className="w-full">
					{verifyPhoneAuth.isPending ? tCommon("loading") : t("verifyCode")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={resendCode}
					disabled={startPhoneAuth.isPending}
					className="justify-self-center text-nl-russet"
				>
					{t("getNewCode")}
				</Button>
			</form>
		);
	}

	if (step === "register") {
		return (
			<form onSubmit={submitRegistration} className="grid gap-5">
				<p className="m-0 flex flex-wrap items-center gap-x-2 rounded-md bg-green-700/10 px-4 py-3 text-sm text-green-800">
					{t("phoneVerifiedLabel")}
					<span dir="ltr" className="font-mono tabular-nums">
						{verifiedPhone}
					</span>
				</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label={t("firstName")} id="phone-first-name">
						{(p) => <Input {...p} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />}
					</Field>
					<Field label={t("lastName")} id="phone-last-name">
						{(p) => <Input {...p} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />}
					</Field>
				</div>
				<Field label={t("email")} id="phone-email">
					{(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
				</Field>
				{error && <FieldError>{error}</FieldError>}
				<Button type="submit" size="lg" disabled={registerPhoneAuth.isPending} className="w-full">
					{registerPhoneAuth.isPending ? tCommon("loading") : t("createAccount")}
				</Button>
			</form>
		);
	}

	return (
		<form onSubmit={submitPhone} className="grid gap-5">
			<Field label={t("phoneNumber")} id="phone-number" hint={t("phoneHint")}>
				{(p) => (
					<PhoneInput
						id={p.id}
						value={phone}
						onChange={setPhone}
						required
						className={compositeClass}
						prefixClassName={compositePrefixClass}
						inputClassName={compositeInputClass}
					/>
				)}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<Button type="submit" size="lg" disabled={startPhoneAuth.isPending} className="w-full">
				{startPhoneAuth.isPending ? tCommon("loading") : t("sendCode")}
			</Button>
		</form>
	);
}
