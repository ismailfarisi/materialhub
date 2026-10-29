"use client";

import { useLogin } from "@/lib/queries/auth";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

interface LoginFormProps {
  onAuthenticated: () => void;
  onSwitchToRegister?: () => void;
}

const fieldClassName =
  "mt-2 w-full border border-nl-cacao/15 bg-white/55 px-4 py-3 text-[15px] text-nl-cacao outline-none transition-colors placeholder:text-nl-russet/45 focus:border-nl-amber focus:bg-white focus:ring-2 focus:ring-nl-amber/15";

const labelClassName = "text-[10px] font-medium uppercase tracking-[0.22em] text-nl-russet";

const submitClassName =
  "w-full bg-nl-cacao px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.24em] text-nl-linen transition-colors hover:bg-nl-espresso focus:outline-none focus:ring-2 focus:ring-nl-amber focus:ring-offset-2 focus:ring-offset-nl-linen disabled:cursor-not-allowed disabled:opacity-50";

const switchClassName =
  "font-medium text-nl-amber underline-offset-4 transition-colors hover:text-nl-cacao hover:underline";

export function LoginForm({ onAuthenticated, onSwitchToRegister }: LoginFormProps) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login.mutateAsync({ email, password });
      onAuthenticated();
    } catch (err: any) {
      setError(err.response?.data?.message || tCommon("error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="login-email" className={labelClassName}>
          {t("email")}
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="login-password" className={labelClassName}>
          {t("password")}
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={fieldClassName}
        />
      </div>
      {error && (
        <p className="border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={login.isPending} className={submitClassName}>
        {login.isPending ? tCommon("loading") : t("loginTitle")}
      </button>
      <p className="text-center text-sm text-nl-russet">
        {t("noAccount")}{" "}
        {onSwitchToRegister ? (
          <button type="button" onClick={onSwitchToRegister} className={switchClassName}>
            {t("registerTitle")}
          </button>
        ) : (
          <Link href={`/${locale}/auth/register`} className={switchClassName}>
            {t("registerTitle")}
          </Link>
        )}
      </p>
    </form>
  );
}
