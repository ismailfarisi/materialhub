"use client";

import { PhoneInput } from "@/components/ui/phone-input";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useRegisterPhoneAuth, useStartPhoneAuth, useVerifyPhoneAuth } from "@/lib/queries/auth";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Step = "phone" | "code" | "register";

const fieldClassName =
  "mt-2 w-full border border-nl-cacao/15 bg-white/55 px-4 py-3 text-[15px] text-nl-cacao outline-none transition-colors placeholder:text-nl-russet/45 focus:border-nl-amber focus:bg-white focus:ring-2 focus:ring-nl-amber/15";

const labelClassName = "text-[10px] font-medium uppercase tracking-[0.22em] text-nl-russet";

const submitClassName =
  "w-full bg-nl-cacao px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.24em] text-nl-linen transition-colors hover:bg-nl-espresso focus:outline-none focus:ring-2 focus:ring-nl-amber focus:ring-offset-2 focus:ring-offset-nl-linen disabled:cursor-not-allowed disabled:opacity-50";

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

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await startPhoneAuth.mutateAsync(phone);
      fire("SendOTP", { status: "success" });
      setVerifiedPhone(result.phone);
      setStep("code");
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } } };
      const msg = errorObj.response?.data?.message || tCommon("error");
      fire("SendOTP", { status: "failure", error: msg });
      setError(msg);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await verifyPhoneAuth.mutateAsync({
        phone: verifiedPhone,
        code,
      });
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
      const errorObj = err as { response?: { data?: { message?: string } } };
      const msg = errorObj.response?.data?.message || tCommon("error");
      fire("VerifyOTP", { status: "failure", error: msg });
      setError(msg);
    }
  }

  function editPhone() {
    setCode("");
    setError("");
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
      const errorObj = err as { response?: { data?: { message?: string } } };
      const msg = errorObj.response?.data?.message || tCommon("error");
      fire("RegisterUser", { status: "failure", error: msg });
      setError(msg);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-5">
        <div className="flex items-center justify-between gap-4 border border-nl-cacao/15 bg-white/40 px-4 py-3">
          <div className="min-w-0">
            <div className={labelClassName}>{t("codeSentTo")}</div>
            {/* Phone numbers stay LTR even on the Arabic and Urdu storefronts. */}
            <div dir="ltr" className="mt-1 truncate text-[15px] text-nl-cacao">
              {verifiedPhone}
            </div>
          </div>
          <button
            type="button"
            aria-label={t("changePhone")}
            className="shrink-0 text-[10px] font-medium uppercase tracking-[0.22em] text-nl-russet underline underline-offset-4 transition-colors hover:text-nl-cacao"
            onClick={editPhone}
          >
            {tCommon("edit")}
          </button>
        </div>
        <div>
          <label htmlFor="phone-code" className={labelClassName}>
            {t("verificationCode")}
          </label>
          <input
            id="phone-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className={fieldClassName}
          />
        </div>
        {error && (
          <p className="border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={verifyPhoneAuth.isPending} className={submitClassName}>
          {verifyPhoneAuth.isPending ? tCommon("loading") : t("verifyCode")}
        </button>
      </form>
    );
  }

  if (step === "register") {
    return (
      <form onSubmit={submitRegistration} className="space-y-5">
        <p className="text-sm text-nl-russet">{t("verifiedPhone", { phone: verifiedPhone })}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="phone-first-name" className={labelClassName}>
              {t("firstName")}
            </label>
            <input
              id="phone-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="phone-last-name" className={labelClassName}>
              {t("lastName")}
            </label>
            <input
              id="phone-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={fieldClassName}
            />
          </div>
        </div>
        <div>
          <label htmlFor="phone-email" className={labelClassName}>
            {t("email")}
          </label>
          <input
            id="phone-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldClassName}
          />
        </div>
        {error && (
          <p className="border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={registerPhoneAuth.isPending} className={submitClassName}>
          {registerPhoneAuth.isPending ? tCommon("loading") : t("createAccount")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPhone} className="space-y-5">
      <div>
        <label htmlFor="phone-number" className={labelClassName}>
          {t("phoneNumber")}
        </label>
        <PhoneInput
          id="phone-number"
          value={phone}
          onChange={setPhone}
          required
          className="mt-2 flex border border-nl-cacao/15 bg-white/55 focus-within:border-nl-amber focus-within:bg-white focus-within:ring-2 focus-within:ring-nl-amber/15"
          prefixClassName="flex items-center border-r border-nl-cacao/15 px-4 text-[15px] font-medium text-nl-cacao"
          inputClassName="w-full bg-transparent px-4 py-3 text-[15px] text-nl-cacao outline-none placeholder:text-nl-russet/45"
        />
      </div>
      {error && (
        <p className="border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={startPhoneAuth.isPending} className={submitClassName}>
        {startPhoneAuth.isPending ? tCommon("loading") : t("sendCode")}
      </button>
    </form>
  );
}
