"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  Package,
  Sparkle,
  Storefront,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@materialhub/ui";
import { getMembershipsFromToken } from "@/lib/auth";
import { useLogin, useLogout } from "@/lib/queries/auth";
import { safeReturnTo } from "@/lib/return-to";
import { useAuthStore } from "@/stores/auth";

/** Signed-in users who may use the dashboard: a vendor team member, or an admin. */
function canUseDashboard(role: string | undefined): boolean {
  return getMembershipsFromToken().length > 0 || role === "admin" || role === "super_admin";
}

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const growthTiles = [
  {
    title: "Curated catalog",
    description:
      "Launch product edits, media, variants, and bulk imports from one workspace.",
    icon: Package,
  },
  {
    title: "Order control",
    description:
      "Track fulfillment, returns, promotions, and payouts without switching tools.",
    icon: ChartLineUp,
  },
  {
    title: "Commerce content",
    description:
      "Connect storefront updates, coupons, and integrations as your business grows.",
    icon: Sparkle,
  },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const { mutate: logout } = useLogout();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams);
  const { mutate: login, isPending, error } = useLogin();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  // Signed in, but with no vendor membership (a customer account, or an
  // application still under review): explain instead of bouncing in a loop.
  const notVendor =
    (isAuthenticated && !canUseDashboard(user?.role)) ||
    (!isAuthenticated && searchParams.get("reason") === "not-vendor");

  useEffect(() => {
    if (isAuthenticated && canUseDashboard(user?.role)) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, user?.role, returnTo, router]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginFormValues) {
    // Redirect happens in the effect above once the session is known, and
    // only when the account can actually use the dashboard.
    login(values);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-cacao text-linen">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-caramel/80 to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(184,115,51,0.18)_0%,rgba(44,24,16,0)_38%,rgba(26,18,8,0.34)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(242,234,224,0.06),transparent_42%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8">
        <section className="flex min-h-[calc(100vh-3rem)] flex-col justify-between gap-8 py-4 lg:py-8">
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center border border-amber/50 bg-espresso/70 text-sm font-semibold tracking-[0.22em] text-amber">
                  MH
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
                    MaterialHub UAE partners
                  </p>
                  <p className="text-sm text-pearl/75">Vendor dashboard access</p>
                </div>
              </div>
              <div className="flex items-center gap-2 border border-pearl/15 bg-linen/5 px-3 py-2 text-xs text-pearl/80">
                <Storefront className="h-4 w-4 text-amber" weight="thin" />
                Curated marketplace
              </div>
            </div>

            <div className="max-w-4xl space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
                MaterialHub suppliers
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[0.98] text-linen sm:text-5xl lg:text-7xl">
                Grow your materials business with a dashboard built for selling.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-pearl/82 sm:text-lg">
                List papers, boards, leather, fittings and packaging, sell at trade
                quantity breaks, and run orders, quotes and payouts from one
                workspace.
              </p>
            </div>

            <div className="grid max-w-4xl gap-3 md:grid-cols-3">
              {growthTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div
                    key={tile.title}
                    className="border border-pearl/15 bg-linen/[0.04] p-4 backdrop-blur-sm"
                  >
                    <Icon className="mb-4 h-6 w-6 text-amber" weight="thin" />
                    <h2 className="text-sm font-semibold text-linen">
                      {tile.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-pearl/70">
                      {tile.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-w-4xl border-t border-pearl/15 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
              New supplier
            </p>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-linen">Apply to sell on MaterialHub</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-pearl/70">
                  Sign in with your MaterialHub account, tell us about your business and upload
                  your trade licence. We review every application before your store opens.
                </p>
              </div>
              <Button asChild className="h-11 shrink-0">
                <Link href="/apply">
                  Start your application
                  <ArrowRight className="h-4 w-4" weight="thin" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <aside className="relative z-10 flex items-center py-6 lg:min-h-screen lg:justify-center">
          <div className="mx-auto w-full max-w-md border border-pearl/70 bg-linen/95 p-5 text-cacao shadow-[0_28px_90px_rgba(26,18,8,0.34)] backdrop-blur-sm sm:p-7">
          <div className="mb-7">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-pearl/70 pb-5">
              <div className="flex h-14 w-14 items-center justify-center bg-amber text-sm font-semibold tracking-[0.22em] text-espresso shadow-[0_14px_40px_rgba(184,115,51,0.24)]">
                MH
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
                  Returning vendor
                </p>
                <p className="mt-1 text-xs text-taupe">Private workspace</p>
              </div>
            </div>
            <h2 className="text-3xl font-semibold text-cacao">
              Vendor Dashboard
            </h2>
            <p className="mt-3 text-sm leading-6 text-taupe">
              Sign in to manage your MaterialHub UAE store. Redirected vendors return
              to the requested dashboard page after authentication.
            </p>
          </div>

          {notVendor ? (
            <div role="status" className="mb-5 border border-amber/50 bg-amber/10 p-4 text-sm text-cacao">
              <p className="font-semibold">
                {user?.email ? `${user.email} is not on a vendor team yet.` : "This account is not on a vendor team yet."}
              </p>
              <p className="mt-1 leading-6 text-taupe">
                Apply to open a store, or ask a store owner to invite you. If you have already
                applied, you can sign in here once MaterialHub approves the application.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/apply">Apply to sell</Link>
                </Button>
                {isAuthenticated ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => logout()}
                  >
                    Use another account
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

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
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {(error as any)?.response?.data?.message ??
                    "Invalid email or password. Please try again."}
                </p>
              )}

              <Button type="submit" className="h-11 w-full" disabled={isPending}>
                {isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 grid gap-3 border-t border-pearl/70 pt-5 text-xs leading-5 text-taupe">
            <div className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber" weight="thin" />
              <span>Redirected vendors return to the requested page after sign-in.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber" weight="thin" />
              <span>
                Need access? Ask your store owner to send a team invite from the
                dashboard.
              </span>
            </div>
          </div>
        </div>
        </aside>
      </div>
    </main>
  );
}
