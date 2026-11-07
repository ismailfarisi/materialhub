"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FieldError, Input } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { type TwoFactorMethod, isExpiredTwoFactorChallenge, useVerifyTwoFactor } from "@/lib/queries/auth";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { switchClassName } from "./login-form";

interface TwoFactorStepProps {
	challengeToken: string;
	onAuthenticated: () => void;
	/** Back to email/password; `notice` explains why when the challenge ran out. */
	onRestart: (notice?: string) => void;
}

/**
 * Second login step for accounts with two-step verification: a 6-digit code
 * from the authenticator app, or a single-use backup code.
 */
export function TwoFactorStep({ challengeToken, onAuthenticated, onRestart }: TwoFactorStepProps) {
	const t = useTranslations("auth.twoFactor");
	const tCommon = useTranslations("common");
	const verify = useVerifyTwoFactor();
	const [method, setMethod] = useState<TwoFactorMethod>("totp");
	const [code, setCode] = useState("");
	const [error, setError] = useState("");

	const value = method === "totp" ? code.replace(/\D/g, "").slice(0, 6) : code.replace(/\s+/g, "");
	const canSubmit = method === "totp" ? value.length === 6 : value.length > 0;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		setError("");
		try {
			await verify.mutateAsync({ challenge_token: challengeToken, code: value, method });
			onAuthenticated();
		} catch (err) {
			if (isExpiredTwoFactorChallenge(err)) {
				onRestart(t("expired"));
				return;
			}
			setError(apiErrorMessage(err, t("invalidCode")));
		}
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-5">
			<div className="grid gap-1.5">
				<h2 className="m-0 text-lg font-semibold text-nl-cacao">{t("title")}</h2>
				<p className="m-0 text-sm text-nl-russet">
					{method === "totp" ? t("totpDescription") : t("backupDescription")}
				</p>
			</div>
			<Field label={method === "totp" ? t("codeLabel") : t("backupLabel")} id="login-2fa-code">
				{(p) => (
					<Input
						{...p}
						autoFocus
						autoComplete="one-time-code"
						inputMode={method === "totp" ? "numeric" : "text"}
						maxLength={method === "totp" ? 6 : 32}
						value={code}
						onChange={(e) => setCode(e.target.value)}
						required
					/>
				)}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<Button type="submit" size="lg" disabled={verify.isPending || !canSubmit} className="w-full">
				{verify.isPending ? tCommon("loading") : t("verify")}
			</Button>
			<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
				<button
					type="button"
					className={switchClassName}
					onClick={() => {
						setMethod((m) => (m === "totp" ? "backup" : "totp"));
						setCode("");
						setError("");
					}}
				>
					{method === "totp" ? t("useBackup") : t("useApp")}
				</button>
				<button type="button" className={switchClassName} onClick={() => onRestart()}>
					{t("back")}
				</button>
			</div>
		</form>
	);
}
