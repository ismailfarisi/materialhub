"use client";

import { type AuthMethod, AuthShell, MethodSwitch } from "@/components/auth/auth-shell";
import { switchClassName } from "@/components/auth/login-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { RegisterForm } from "@/components/auth/register-form";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";

function RegisterContent() {
	const t = useTranslations("auth");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const returnTo = safeReturnTo(searchParams.get("returnTo"), `/${locale}/account`);
	const [method, setMethod] = useState<AuthMethod>(searchParams.get("method") === "email" ? "email" : "phone");
	const onAuthenticated = () => router.push(returnTo);

	return (
		<AuthShell
			title={t("registerTitle")}
			description={method === "phone" ? t("phoneRegisterDescription") : t("emailRegisterDescription")}
		>
			<MethodSwitch value={method} onChange={setMethod} className="mb-6" />
			<div role="tabpanel">
				{method === "phone" ? (
					<div className="grid gap-5">
						{/* Phone sign-in creates the account after the code is verified. */}
						<PhoneAuthForm onAuthenticated={onAuthenticated} />
						<p className="m-0 text-center text-sm text-nl-russet">
							{t("hasAccount")}{" "}
							<Link href={`/${locale}/auth/login`} className={switchClassName}>
								{t("loginTitle")}
							</Link>
						</p>
					</div>
				) : (
					<RegisterForm onAuthenticated={onAuthenticated} />
				)}
			</div>
		</AuthShell>
	);
}

export default function RegisterPage() {
	return (
		<Suspense>
			<RegisterContent />
		</Suspense>
	);
}
