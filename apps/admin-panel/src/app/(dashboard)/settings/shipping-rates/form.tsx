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
import { filsToAed, parseAedInput } from "@/lib/money";
import {
  type ShippingRate,
  type ShippingRateCreate,
  useCreateShippingRate,
  useUpdateShippingRate,
  useVendorOptions,
  useZoneOptions,
} from "@/lib/queries/shipping-rates";

const KNOWN_METHODS = ["standard", "express", "same_day", "pickup"] as const;

const schema = z
  .object({
    name: z.string().min(1, "Required").max(255),
    method: z.string().min(1, "Required").max(100),
    base_cost_aed: z.string().refine((v) => parseAedInput(v) !== null, {
      message: "Enter a non-negative number",
    }),
    per_kg_cost_aed: z.string().refine(
      (v) => v === "" || parseAedInput(v) !== null,
      { message: "Must be a non-negative number" },
    ),
    free_above_aed: z.string().refine(
      (v) => v === "" || parseAedInput(v) !== null,
      { message: "Must be a non-negative number" },
    ),
    min_order_amount_aed: z.string().refine(
      (v) => v === "" || parseAedInput(v) !== null,
      { message: "Must be a non-negative number" },
    ),
    carrier_cost_aed: z.string().refine(
      (v) => v === "" || parseAedInput(v) !== null,
      { message: "Must be a non-negative number" },
    ),
    vendor_id: z.string(), // "" = platform
    zone_id: z.string(), // "" = any
    min_weight_grams: z.string(),
    max_weight_grams: z.string(),
    carrier: z.string(),
    estimated_days_min: z.string(),
    estimated_days_max: z.string(),
    is_active: z.boolean(),
    sort_order: z.string(),
  })
  .refine(
    (v) => {
      const mn = v.estimated_days_min === "" ? null : Number(v.estimated_days_min);
      const mx = v.estimated_days_max === "" ? null : Number(v.estimated_days_max);
      if (mn == null || mx == null) return true;
      return mx >= mn;
    },
    { path: ["estimated_days_max"], message: "Max must be ≥ Min" },
  );

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  name: "",
  method: "standard",
  base_cost_aed: "",
  per_kg_cost_aed: "0.00",
  free_above_aed: "",
  min_order_amount_aed: "",
  carrier_cost_aed: "",
  vendor_id: "",
  zone_id: "",
  min_weight_grams: "",
  max_weight_grams: "",
  carrier: "",
  estimated_days_min: "",
  estimated_days_max: "",
  is_active: true,
  sort_order: "0",
};

function toFormValues(rate: ShippingRate): FormValues {
  return {
    name: rate.name,
    method: rate.method,
    base_cost_aed: filsToAed(rate.base_cost),
    per_kg_cost_aed: filsToAed(rate.per_kg_cost ?? 0),
    free_above_aed: rate.free_above == null ? "" : filsToAed(rate.free_above),
    min_order_amount_aed:
      rate.min_order_amount == null ? "" : filsToAed(rate.min_order_amount),
    carrier_cost_aed:
      rate.carrier_cost == null ? "" : filsToAed(rate.carrier_cost),
    vendor_id: rate.vendor_id ?? "",
    zone_id: rate.zone_id ?? "",
    min_weight_grams: rate.min_weight_grams == null ? "" : String(rate.min_weight_grams),
    max_weight_grams: rate.max_weight_grams == null ? "" : String(rate.max_weight_grams),
    carrier: rate.carrier ?? "",
    estimated_days_min:
      rate.estimated_days_min == null ? "" : String(rate.estimated_days_min),
    estimated_days_max:
      rate.estimated_days_max == null ? "" : String(rate.estimated_days_max),
    is_active: rate.is_active,
    sort_order: String(rate.sort_order ?? 0),
  };
}

function toApiPayload(v: FormValues): ShippingRateCreate {
  const intOrNull = (s: string) => (s === "" ? null : Number.parseInt(s, 10));
  const aedOrNull = (s: string) => (s === "" ? null : parseAedInput(s));
  return {
    vendor_id: v.vendor_id === "" ? null : v.vendor_id,
    zone_id: v.zone_id === "" ? null : v.zone_id,
    name: v.name,
    method: v.method,
    min_weight_grams: intOrNull(v.min_weight_grams),
    max_weight_grams: intOrNull(v.max_weight_grams),
    min_order_amount: aedOrNull(v.min_order_amount_aed),
    carrier: v.carrier === "" ? null : v.carrier,
    base_cost: parseAedInput(v.base_cost_aed) ?? 0,
    carrier_cost: aedOrNull(v.carrier_cost_aed),
    per_kg_cost: parseAedInput(v.per_kg_cost_aed) ?? 0,
    free_above: aedOrNull(v.free_above_aed),
    currency: "AED",
    estimated_days_min: intOrNull(v.estimated_days_min),
    estimated_days_max: intOrNull(v.estimated_days_max),
    is_active: v.is_active,
    sort_order: Number.parseInt(v.sort_order, 10) || 0,
  };
}

interface Props {
  rate?: ShippingRate;
}

export function ShippingRateForm({ rate }: Props) {
  const router = useRouter();
  const create = useCreateShippingRate();
  const update = useUpdateShippingRate(rate?.id ?? "");
  const vendors = useVendorOptions();
  const zones = useZoneOptions();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    if (rate) reset(toFormValues(rate));
  }, [rate, reset]);

  const method = watch("method");
  const isCustomMethod = !KNOWN_METHODS.includes(method as any);

  const onSubmit = async (values: FormValues) => {
    const payload = toApiPayload(values);
    try {
      if (rate) {
        await update.mutateAsync(payload);
        toast({ title: "Shipping rate updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Shipping rate created" });
        router.push("/settings/shipping-rates");
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Vendor</Label>
              <Controller
                name="vendor_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "__platform__"} onValueChange={(v) => field.onChange(v === "__platform__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__platform__">Platform default</SelectItem>
                      {vendors.data?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.business_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label>Zone</Label>
              <Controller
                name="zone_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "__any__"} onValueChange={(v) => field.onChange(v === "__any__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">All zones</SelectItem>
                      {zones.data?.map((z) => (
                        <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Identity</h2>
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Method *</Label>
              <Controller
                name="method"
                control={control}
                render={({ field }) => {
                  const isKnown = KNOWN_METHODS.includes(field.value as any);
                  const selectValue = isKnown ? field.value : "__custom__";
                  return (
                    <>
                      <Select
                        value={selectValue}
                        onValueChange={(v) => field.onChange(v === "__custom__" ? "" : v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {KNOWN_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                          <SelectItem value="__custom__">Custom…</SelectItem>
                        </SelectContent>
                      </Select>
                      {!isKnown && (
                        <Input
                          className="mt-2"
                          placeholder="Custom method name"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      )}
                    </>
                  );
                }}
              />
              {isCustomMethod && method !== "" && (
                <p className="text-sm text-amber-600 mt-2">
                  This method is not recognised by checkout — the rate will be stored
                  but not offered to customers.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="sort_order">Sort order</Label>
              <Input id="sort_order" type="number" min={0} step={1} {...register("sort_order")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base_cost_aed">Base cost (AED) *</Label>
              <Input id="base_cost_aed" type="number" step="0.01" min={0} {...register("base_cost_aed")} />
              {errors.base_cost_aed && (
                <p className="text-sm text-destructive mt-1">{errors.base_cost_aed.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="per_kg_cost_aed">Per-kg cost (AED)</Label>
              <Input id="per_kg_cost_aed" type="number" step="0.01" min={0} {...register("per_kg_cost_aed")} />
            </div>
            <div>
              <Label htmlFor="free_above_aed">Free above (AED)</Label>
              <Input id="free_above_aed" type="number" step="0.01" min={0} placeholder="Never" {...register("free_above_aed")} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value="AED" disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Constraints */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Constraints (optional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="min_weight_grams">Min weight (g)</Label>
              <Input id="min_weight_grams" type="number" min={0} step={1} {...register("min_weight_grams")} />
            </div>
            <div>
              <Label htmlFor="max_weight_grams">Max weight (g)</Label>
              <Input id="max_weight_grams" type="number" min={0} step={1} {...register("max_weight_grams")} />
            </div>
            <div>
              <Label htmlFor="min_order_amount_aed">Min order amount (AED)</Label>
              <Input id="min_order_amount_aed" type="number" step="0.01" min={0} {...register("min_order_amount_aed")} />
            </div>
            <div>
              <Label htmlFor="carrier">Carrier</Label>
              <Input id="carrier" {...register("carrier")} />
            </div>
            <div>
              <Label htmlFor="carrier_cost_aed">Carrier cost (AED)</Label>
              <Input id="carrier_cost_aed" type="number" step="0.01" min={0} {...register("carrier_cost_aed")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fulfilment */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">Fulfilment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="estimated_days_min">Estimated days min</Label>
              <Input id="estimated_days_min" type="number" min={0} step={1} {...register("estimated_days_min")} />
            </div>
            <div>
              <Label htmlFor="estimated_days_max">Estimated days max</Label>
              <Input id="estimated_days_max" type="number" min={0} step={1} {...register("estimated_days_max")} />
              {errors.estimated_days_max && (
                <p className="text-sm text-destructive mt-1">{errors.estimated_days_max.message}</p>
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
          {rate ? "Save changes" : "Create shipping rate"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
