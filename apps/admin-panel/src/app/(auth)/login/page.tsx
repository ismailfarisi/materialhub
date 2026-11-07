"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  TwoFactorChallengeForm,
} from "@materialhub/ui";
import {
  NO_ADMIN_ACCESS_MESSAGE,
  isAdminRole,
  isExpiredTwoFactorChallenge,
  loginErrorMessage,
  useLogin,
  useVerifyTwoFactor,
} from "@/lib/queries/auth";
import { useAuthStore } from "@/stores/auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo") || "/";
  // Only same-app paths; never bounce back to /login itself.
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") && !rawReturnTo.startsWith("/login")
      ? rawReturnTo
      : "/";
  const { mutate: login, isPending, error } = useLogin();
  const verify = useVerifyTwoFactor();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [stepNotice, setStepNotice] = useState<string | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const noAdminRedirect = searchParams.get("reason") === "no-admin";

  // Only staff are sent on: redirecting any signed-in account made a
  // customer bounce between /login and the dashboard guard forever.
  useEffect(() => {
    if (isAuthenticated && isAdminRole(role)) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, role, returnTo, router]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginFormValues) {
    verify.reset();
    setStepNotice(null);
    login(values, {
      onSuccess: (result) => {
        if (result.requires_2fa) {
          setChallengeToken(result.challenge_token);
          return;
        }
        router.replace(returnTo);
      },
    });
  }

  const loginError = error
    ? loginErrorMessage(error, "Invalid email or password. Please try again.")
    : stepNotice
      ? stepNotice
      : noAdminRedirect
      ? NO_ADMIN_ACCESS_MESSAGE
      : null;

  return (
    <Card>
      <CardHeader className="space-y-1">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm tracking-[0.12em]">
            MH
          </div>
        </div>
        <CardTitle className="text-2xl text-center">Admin Panel</CardTitle>
        <CardDescription className="text-center">
          Sign in to manage the MaterialHub platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        {challengeToken ? (
          <TwoFactorChallengeForm
            isPending={verify.isPending}
            error={
              verify.error
                ? loginErrorMessage(verify.error, "That code didn't work. Please try again.")
                : null
            }
            onVerify={(code, method) =>
              verify.mutate(
                { challenge_token: challengeToken, code, method },
                {
                  onSuccess: () => router.replace(returnTo),
                  onError: (err) => {
                    // The challenge expired or ran out of attempts: start over.
                    if (isExpiredTwoFactorChallenge(err)) {
                      setStepNotice(loginErrorMessage(err, "Please sign in again."));
                      setChallengeToken(null);
                    }
                  },
                },
              )
            }
            onCancel={() => {
              verify.reset();
              setChallengeToken(null);
            }}
          />
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {loginError && (
              <p role="alert" className="text-sm text-destructive">
                {loginError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Form>
        )}
      </CardContent>
    </Card>
  );
}
