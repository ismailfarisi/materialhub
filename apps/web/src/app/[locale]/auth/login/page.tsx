"use client";

import { Suspense, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

function LoginContent() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || `/${locale}`;
  const [method, setMethod] = useState<"phone" | "email">("phone");

  const onAuthenticated = () => router.push(returnTo);

  return (
    <div className="container max-w-md py-12 md:py-20 px-4">
      <h1 className="font-serif text-[28px] md:text-[32px] text-nl-cacao mb-2 text-center">
        {t("loginTitle")}
      </h1>
      {method === "phone" ? (
        <>
          <p className="text-sm text-nl-russet text-center mb-6">
            {t("phoneLoginDescription")}
          </p>
          <PhoneAuthForm onAuthenticated={onAuthenticated} />
        </>
      ) : (
        <div className="mt-6">
          <LoginForm onAuthenticated={onAuthenticated} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setMethod(method === "phone" ? "email" : "phone")}
        className="mt-6 w-full min-h-[44px] text-sm text-nl-russet underline underline-offset-4"
      >
        {method === "phone" ? t("useEmailInstead") : t("usePhoneInstead")}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
