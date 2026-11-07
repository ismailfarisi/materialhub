"use client";

import { Card, CardContent, Switch, toast } from "@materialhub/ui";
import { CreditCard, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type PaymentMethodAmountField,
  type PaymentMethodThreshold,
  paymentProviderLabel,
  usePaymentMethods,
  useTogglePaymentMethod,
  useUpdatePaymentMethodAmount,
  validatePaymentMethodAmount,
} from "@/lib/queries/payment-methods";
import { filsToAed, parseAedInput } from "@/lib/money";

function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatPlans(plans: PaymentMethodThreshold["plans"]): string {
  if (!plans?.length) return "—";
  return plans.map((p) => `${p.installments} × ${p.interval_days}d`).join(", ");
}

const providerLabel = paymentProviderLabel;

const FIELD_LABELS: Record<PaymentMethodAmountField, string> = {
  surcharge_fils: "surcharge",
  min_amount_fils: "minimum order",
  max_amount_fils: "maximum order",
};

/** An AED input for one fils amount on a payment method, saved on its own. */
function AmountCell({
  row,
  field,
}: {
  row: PaymentMethodThreshold;
  field: PaymentMethodAmountField;
}) {
  const serverFils = (row[field] as number | null) ?? 0;
  const [aedInput, setAedInput] = useState<string>(filsToAed(serverFils));
  const update = useUpdatePaymentMethodAmount();
  const fieldLabel = FIELD_LABELS[field];
  const ariaLabel = `${providerLabel(row.provider)} ${fieldLabel} in AED`;

  useEffect(() => {
    setAedInput(filsToAed(serverFils));
  }, [serverFils]);

  const parsed = parseAedInput(aedInput);
  const isDirty = parsed !== null && parsed !== serverFils;
  const rangeError = parsed !== null ? validatePaymentMethodAmount(row, field, parsed) : null;
  const isInvalid = (aedInput.trim() !== "" && parsed === null) || !!rangeError;

  const handleSave = async () => {
    if (parsed === null || !isDirty || isInvalid || update.isPending) return;
    try {
      await update.mutateAsync({ provider: row.provider, field, fils: parsed });
      toast({
        title: `${providerLabel(row.provider)} ${fieldLabel} updated`,
        description: `${filsToAed(parsed)} AED`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        `Failed to update ${fieldLabel}`;
      toast({ title: "Error", description: msg, variant: "destructive" });
      setAedInput(filsToAed(serverFils));
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
    <div className="flex items-center gap-2 justify-end">
      <div className="flex items-center">
        <input
          type="number"
          step="0.01"
          min="0"
          value={aedInput}
          disabled={update.isPending}
          onChange={(e) => setAedInput(e.target.value)}
          aria-label={ariaLabel}
          aria-invalid={isInvalid || undefined}
          className={`w-24 px-2 py-1 text-right text-sm border rounded-md bg-background ${
            isInvalid ? "border-destructive" : "border-input"
          } focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50`}
        />
        <span className="ml-1 text-xs text-muted-foreground">AED</span>
      </div>
      {isDirty && !isInvalid && (
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {update.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      )}
    </div>
    {rangeError && <p className="text-xs text-destructive">{rangeError}</p>}
    </div>
  );
}

export default function PaymentMethodsPage() {
  const { data: methods, isLoading, isError, refetch } = usePaymentMethods();
  const toggle = useTogglePaymentMethod();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  const handleToggle = async (m: PaymentMethodThreshold, next: boolean) => {
    setPendingProvider(m.provider);
    try {
      await toggle.mutateAsync({ provider: m.provider, is_active: next });
      toast({
        title: next
          ? `${providerLabel(m.provider)} enabled`
          : `${providerLabel(m.provider)} disabled`,
        description: "Active quotes will refresh automatically.",
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        "Failed to update payment method";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Payment Methods</h1>
          <p className="text-sm text-muted-foreground">
            Enable or disable providers. Changes take effect immediately.
          </p>
        </div>
      </div>

      <div className="mb-4 flex gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-muted-foreground">
          Minimum and maximum order totals decide when a method is offered at
          checkout (for example the COD cap and the Tabby/Tamara thresholds).
          The surcharge applies to COD only. Instalment plans are set by
          migration.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm" data-stack="md">
            <thead className="bg-muted/40 border-b">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Min order</th>
                <th className="px-4 py-3 font-medium">Max order</th>
                <th className="px-4 py-3 font-medium">Plans</th>
                <th className="px-4 py-3 font-medium text-right">Surcharge</th>
                <th className="px-4 py-3 font-medium">Last updated</th>
                <th className="px-4 py-3 font-medium text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))}

              {isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <p className="text-destructive mb-2">Failed to load payment methods.</p>
                    <button
                      onClick={() => refetch()}
                      className="text-primary hover:underline text-sm"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && methods?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No payment methods configured. Run the seed or migration.
                  </td>
                </tr>
              )}

              {methods?.map((m) => (
                <tr key={m.provider} className="border-b last:border-b-0">
                  <td className="px-4 py-4 font-medium" data-card-title>{providerLabel(m.provider)}</td>
                  <td className="px-4 py-4" data-label="Min order">
                    <AmountCell row={m} field="min_amount_fils" />
                  </td>
                  <td className="px-4 py-4" data-label="Max order">
                    <AmountCell row={m} field="max_amount_fils" />
                  </td>
                  <td className="px-4 py-4 text-muted-foreground" data-label="Plans">{formatPlans(m.plans)}</td>
                  <td className="px-4 py-4 text-right" data-label="Surcharge">
                    {m.provider === "cod" ? (
                      <AmountCell row={m} field="surcharge_fils" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground" data-label="Last updated">
                    {formatRelativeTime(m.updated_at)}
                  </td>
                  <td className="px-4 py-4 text-right" data-label="Active">
                    <Switch
                      checked={m.is_active}
                      disabled={pendingProvider === m.provider}
                      onCheckedChange={(next) => handleToggle(m, next)}
                      aria-label={`Toggle ${providerLabel(m.provider)}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {methods && methods.length > 0 && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Total: {methods.length} payment method{methods.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
