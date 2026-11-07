"use client";

import * as React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export type TwoFactorMethod = "totp" | "backup";

export interface TwoFactorChallengeFormProps {
  /** Called with the trimmed code and the method the user picked. */
  onVerify: (code: string, method: TwoFactorMethod) => void;
  /** Return to the email/password step (the challenge is single-use). */
  onCancel?: () => void;
  isPending?: boolean;
  error?: string | null;
}

/** Normalise what the user typed: TOTP codes are 6 digits, backup codes keep letters. */
export function normaliseTwoFactorCode(raw: string, method: TwoFactorMethod): string {
  const trimmed = raw.replace(/\s+/g, "");
  return method === "totp" ? trimmed.replace(/\D/g, "").slice(0, 6) : trimmed;
}

/**
 * Second login step for accounts with two-factor authentication. Shown after
 * `/auth/login` answers `{ requires_2fa: true, challenge_token }`; the caller
 * posts the code to `/auth/2fa/login-verify` (TOTP) or `/auth/2fa/backup-verify`.
 */
export function TwoFactorChallengeForm({
  onVerify,
  onCancel,
  isPending = false,
  error,
}: TwoFactorChallengeFormProps) {
  const [method, setMethod] = React.useState<TwoFactorMethod>("totp");
  const [code, setCode] = React.useState("");
  const inputId = React.useId();
  const errorId = `${inputId}-error`;

  const value = normaliseTwoFactorCode(code, method);
  const canSubmit = method === "totp" ? value.length === 6 : value.length > 0;

  function switchMethod() {
    setMethod((m) => (m === "totp" ? "backup" : "totp"));
    setCode("");
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !isPending) onVerify(value, method);
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          {method === "totp"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter one of the backup codes you saved when you turned on two-factor authentication. Each code works once."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={inputId}>{method === "totp" ? "Authentication code" : "Backup code"}</Label>
        <Input
          id={inputId}
          autoFocus
          autoComplete="one-time-code"
          inputMode={method === "totp" ? "numeric" : "text"}
          maxLength={method === "totp" ? 6 : 32}
          placeholder={method === "totp" ? "123456" : "Backup code"}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={!canSubmit || isPending}>
        {isPending ? "Verifying…" : "Verify and sign in"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="underline underline-offset-4" onClick={switchMethod}>
          {method === "totp" ? "Use a backup code" : "Use your authenticator app"}
        </button>
        {onCancel ? (
          <button type="button" className="underline underline-offset-4" onClick={onCancel}>
            Back to sign in
          </button>
        ) : null}
      </div>
    </form>
  );
}
