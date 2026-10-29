"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@materialhub/ui";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { parseAedInput } from "@/lib/money";
import {
  type ShippingContributionTier,
  type ShippingContributionTierCreate,
  useCreateShippingContributionTier,
  useUpdateShippingContributionTier,
} from "@/lib/queries/shipping-contribution-tiers";
import { useVendorOptions } from "@/lib/queries/shipping-rates";

const schema = z.object({
  min_order_value_aed: z
    .string()
    .refine((v) => parseAedInput(v) !== null, { message: "Enter a non-negative number" }),
  vendor_contribution_aed: z
    .string()
    .refine((v) => parseAedInput(v) !== null, { message: "Enter a non-negative number" }),
  vendor_id: z.string(), // "" = platform default
  sort_order: z.string(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  min_order_value_aed: "0.00",
  vendor_contribution_aed: "",
  vendor_id: "",
  sort_order: "0",
  is_active: true,
};

function toFormValues(tier: ShippingContributionTier): FormValues {
  return {
    min_order_value_aed: (tier.min_order_value / 100).toFixed(2),
    vendor_contribution_aed: (tier.vendor_contribution / 100).toFixed(2),
    vendor_id: tier.vendor_id ?? "",
    sort_order: String(tier.sort_order ?? 0),
    is_active: tier.is_active,
  };
}

function toApiPayload(v: FormValues): ShippingContributionTierCreate {
  return {
    vendor_id: v.vendor_id === "" ? null : v.vendor_id,
    min_order_value: parseAedInput(v.min_order_value_aed) ?? 0,
    vendor_contribution: parseAedInput(v.vendor_contribution_aed) ?? 0,
    currency: "AED",
    is_active: v.is_active,
    sort_order: Number.parseInt(v.sort_order, 10) || 0,
  };
}

interface Props {
  tier?: ShippingContributionTier;
}

export function ShippingContributionTierForm({ tier }: Props) {
  const router = useRouter();
  const create = useCreateShippingContributionTier();
  const update = useUpdateShippingContributionTier(tier?.id ?? "");
  const vendors = useVendorOptions();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    if (tier) reset(toFormValues(tier));
  }, [tier, reset]);

  const onSubmit = async (values: FormValues) => {
    const payload = toApiPayload(values);
    try {
      if (tier) {
        await update.mutateAsync(payload);
        toast({ title: "Contribution band updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Contribution band created" });
        router.push("/settings/shipping-contribution-tiers");
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? "Save failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      {/* Scope */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Scope</h2>
          <p className="text-sm text-muted-foreground">
            A band applies globally unless you choose a vendor. A vendor with any bands of their own
            uses only those — the global bands are ignored for that vendor.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Vendor</Label>
              <Controller
                name="vendor_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || "__platform__"}
                    onValueChange={(v) => field.onChange(v === "__platform__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__platform__">Platform default (all vendors)</SelectItem>
                      {vendors.data?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="sort_order">Sort order</Label>
              <Input id="sort_order" type="number" min={0} step={1} {...register("sort_order")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Band */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Band</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="min_order_value_aed">Order value from (AED) *</Label>
              <Input
                id="min_order_value_aed"
                type="number"
                step="0.01"
                min={0}
                {...register("min_order_value_aed")}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Inclusive lower bound. The band with the highest threshold ≤ the order value applies;
                its contribution is the de-facto cap.
              </p>
              {errors.min_order_value_aed && (
                <p className="text-sm text-destructive mt-1">{errors.min_order_value_aed.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="vendor_contribution_aed">Vendor pays (AED) *</Label>
              <Input
                id="vendor_contribution_aed"
                type="number"
                step="0.01"
                min={0}
                {...register("vendor_contribution_aed")}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Deducted from the vendor's payout for orders in this band.
              </p>
              {errors.vendor_contribution_aed && (
                <p className="text-sm text-destructive mt-1">
                  {errors.vendor_contribution_aed.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Label>Active</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={!isDirty || !isValid || isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {tier ? "Save changes" : "Create band"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
