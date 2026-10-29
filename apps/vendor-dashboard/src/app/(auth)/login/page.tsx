"use client";

import { Suspense, useEffect, useState } from "react";
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
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@materialhub/ui";
import { useLogin } from "@/lib/queries/auth";
import {
  buildVendorInterestSummary,
  type VendorInterestFormValues,
  vendorInterestSchema,
} from "@/lib/vendor-interest";
import { useAuthStore } from "@/stores/auth";

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
      "Connect storefront updates, reels, coupons, and integrations as your brand grows.",
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
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const { mutate: login, isPending, error } = useLogin();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [interestSummary, setInterestSummary] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, returnTo, router]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const interestForm = useForm<VendorInterestFormValues>({
    resolver: zodResolver(vendorInterestSchema),
    defaultValues: {
      brandName: "",
      contactName: "",
      email: "",
      category: "",
      website: "",
      message: "",
    },
  });

  function onSubmit(values: LoginFormValues) {
    login(values, {
      onSuccess: () => {
        router.replace(returnTo);
      },
    });
  }

  function onInterestSubmit(values: VendorInterestFormValues) {
    setInterestSummary(buildVendorInterestSummary(values));
    interestForm.reset({
      brandName: "",
      contactName: "",
      email: "",
      category: "",
      website: "",
      message: "",
    });
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
                  NL
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
                Register interest
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[0.98] text-linen sm:text-5xl lg:text-7xl">
                Grow your beauty brand with a dashboard built for selling.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-pearl/82 sm:text-lg">
                Tell us about your brand and the MaterialHub UAE team will review
                category fit, operational needs, and the best path into the
                vendor program.
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
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
                  New vendor
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-linen">
                  Register interest
                </h2>
              </div>
              <p className="max-w-xs text-sm leading-6 text-pearl/70">
                This is not account creation. We will follow up after review.
              </p>
            </div>

            {interestSummary ? (
              <div className="border border-amber/40 bg-linen/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-6 w-6 text-amber" weight="thin" />
                  <div>
                    <h3 className="font-semibold text-linen">Interest received</h3>
                    <p className="mt-1 text-sm leading-6 text-pearl/75">
                      We recorded your interest for {interestSummary}. The vendor
                      team will contact you with next steps.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setInterestSummary(null)}
                    >
                      Send another request
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Form {...interestForm}>
                <form
                  onSubmit={interestForm.handleSubmit(onInterestSubmit)}
                  className="grid gap-4 text-linen"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={interestForm.control}
                      name="brandName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Brand name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Luna Glow"
                              autoComplete="organization"
                              className="border-pearl/25 bg-linen/95"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={interestForm.control}
                      name="contactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Sara Vendor"
                              autoComplete="name"
                              className="border-pearl/25 bg-linen/95"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={interestForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="founder@brand.com"
                              autoComplete="email"
                              className="border-pearl/25 bg-linen/95"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={interestForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product category</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Skincare, makeup, fragrance"
                              autoComplete="off"
                              className="border-pearl/25 bg-linen/95"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={interestForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website or Instagram</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://brand.com or @brand"
                            autoComplete="url"
                            className="border-pearl/25 bg-linen/95"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={interestForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What should we know?</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Share your product range, launch stage, or selling goals."
                            className="min-h-24 resize-none border-pearl/25 bg-linen/95 text-cacao"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="h-11 w-full">
                    Register interest
                    <ArrowRight className="h-4 w-4" weight="thin" />
                  </Button>
                </form>
              </Form>
            )}
          </div>
        </section>

        <aside className="relative z-10 flex items-center py-6 lg:min-h-screen lg:justify-center">
          <div className="mx-auto w-full max-w-md border border-pearl/70 bg-linen/95 p-5 text-cacao shadow-[0_28px_90px_rgba(26,18,8,0.34)] backdrop-blur-sm sm:p-7">
          <div className="mb-7">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-pearl/70 pb-5">
              <div className="flex h-14 w-14 items-center justify-center bg-amber text-sm font-semibold tracking-[0.22em] text-espresso shadow-[0_14px_40px_rgba(184,115,51,0.24)]">
                NL
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
