"use client";

import { useLogin, useRegister } from "@/lib/queries/auth";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

interface RegisterFormProps {
  onAuthenticated: () => void;
  onSwitchToLogin?: () => void;
}

const fieldClassName =
  "mt-2 w-full border border-nl-cacao/15 bg-white/55 px-4 py-3 text-[15px] text-nl-cacao outline-none transition-colors placeholder:text-nl-russet/45 focus:border-nl-amber focus:bg-white focus:ring-2 focus:ring-nl-amber/15";

const labelClassName = "text-[10px] font-medium uppercase tracking-[0.22em] text-nl-russet";

const submitClassName =
  "w-full bg-nl-cacao px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.24em] text-nl-linen transition-colors hover:bg-nl-espresso focus:outline-none focus:ring-2 focus:ring-nl-amber focus:ring-offset-2 focus:ring-offset-nl-linen disabled:cursor-not-allowed disabled:opacity-50";

const switchClassName =
  "font-medium text-nl-amber underline-offset-4 transition-colors hover:text-nl-cacao hover:underline";

export function RegisterForm({ onAuthenticated, onSwitchToLogin }: RegisterFormProps) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const register = useRegister();
  const login = useLogin();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    try {
      await register.mutateAsync({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
      });
      // Auto-login after registration
      await login.mutateAsync({ email: form.email, password: form.password });
      onAuthenticated();
    } catch (err: any) {
      setError(err.response?.data?.message || tCommon("error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="register-first-name" className={labelClassName}>
            {t("firstName")}
          </label>
          <input
            id="register-first-name"
            type="text"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            required
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="register-last-name" className={labelClassName}>
            {t("lastName")}
          </label>
          <input
            id="register-last-name"
            type="text"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            required
            className={fieldClassName}
          />
        </div>
      </div>
      <div>
        <label htmlFor="register-email" className={labelClassName}>
          {t("email")}
        </label>
        <input
          id="register-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="register-password" className={labelClassName}>
          {t("password")}
        </label>
        <input
          id="register-password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="register-confirm-password" className={labelClassName}>
          {t("confirmPassword")}
        </label>
        <input
          id="register-confirm-password"
          type="password"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          required
          className={fieldClassName}
        />
      </div>
      {error && (
        <p className="border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={register.isPending || login.isPending}
        className={submitClassName}
      >
        {register.isPending ? tCommon("loading") : t("registerTitle")}
      </button>
      <p className="text-center text-sm text-nl-russet">
        {t("hasAccount")}{" "}
        {onSwitchToLogin ? (
          <button type="button" onClick={onSwitchToLogin} className={switchClassName}>
            {t("loginTitle")}
          </button>
        ) : (
          <Link href={`/${locale}/auth/login`} className={switchClassName}>
            {t("loginTitle")}
          </Link>
        )}
      </p>
    </form>
  );
}
