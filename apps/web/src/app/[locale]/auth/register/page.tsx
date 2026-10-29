"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";

function RegisterContent() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  return (
    <div className="container max-w-md py-20">
      <h1 className="text-2xl font-bold mb-6 text-center">
        {t("registerTitle")}
      </h1>
      <RegisterForm
        onAuthenticated={() => router.push(returnTo || `/${locale}/beauty-quiz`)}
      />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
