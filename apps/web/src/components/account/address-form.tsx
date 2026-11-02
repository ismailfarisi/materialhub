"use client";

import { PhoneVerifyField, saveAddressErrorMessage } from "@/components/account/phone-verify-field";
import { Button } from "@/components/swatch";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Field,
  FieldError,
  Input,
  Select,
  compositeClass,
  compositeInputClass,
  compositePrefixClass,
} from "./account-ui";
interface AddressFormData {
  full_name: string;
  phone: string;
  building_name: string;
  floor: string;
  apartment: string;
  street: string;
  area: string;
  city: string;
  emirate: string;
  is_default?: boolean;
}

// Ordered field config. `labelKey` resolves under the "account" namespace.
const FIELDS: {
  key: keyof Omit<AddressFormData, "is_default">;
  labelKey: string;
  required: boolean;
  type?: "text" | "phone" | "emirate";
}[] = [
  { key: "full_name", labelKey: "fullName", required: true },
  { key: "phone", labelKey: "phoneNumber", required: true, type: "phone" },
  { key: "building_name", labelKey: "buildingName", required: true },
  { key: "floor", labelKey: "floor", required: false },
  { key: "apartment", labelKey: "apartment", required: false },
  { key: "street", labelKey: "streetAddress", required: true },
  { key: "area", labelKey: "areaDistrict", required: false },
  { key: "city", labelKey: "cityLabel", required: true },
  { key: "emirate", labelKey: "emirateLabel", required: true, type: "emirate" },
];

export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<AddressFormData>;
  onSubmit: (data: AddressFormData) => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tEmirates = useTranslations("emirates");
  const [form, setForm] = useState<AddressFormData>({
    full_name: initial?.full_name || "",
    phone: initial?.phone || "",
    building_name: initial?.building_name || "",
    floor: initial?.floor || "",
    apartment: initial?.apartment || "",
    street: initial?.street || "",
    area: initial?.area || "",
    city: initial?.city || "",
    emirate: initial?.emirate || "",
    is_default: initial?.is_default || false,
  });
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaveError(null);
        try {
          await onSubmit(form);
        } catch (err) {
          setSaveError(saveAddressErrorMessage(err) ?? t("addressSaveFailed"));
        }
      }}
      className="grid gap-5"
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        {FIELDS.map(({ key, labelKey, required, type }) => {
          const label = t(labelKey);
          if (type === "phone") {
            return (
              <Field key={key} label={label}>
                {(p) => (
                  <PhoneVerifyField
                    id={p.id}
                    value={form[key]}
                    onChange={(phone) => setForm({ ...form, [key]: phone })}
                    onVerifiedChange={setPhoneVerified}
                    originalPhone={initial?.phone}
                    required={required}
                    className={compositeClass}
                    prefixClassName={compositePrefixClass}
                    inputClassName={compositeInputClass}
                  />
                )}
              </Field>
            );
          }
          if (type === "emirate") {
            return (
              <Field key={key} label={label}>
                {(p) => (
                  <Select
                    {...p}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={required}
                  >
                    <option value="" disabled>
                      {t("selectEmirate")}
                    </option>
                    {UAE_EMIRATES.map((em) => (
                      <option key={em.value} value={em.value}>
                        {tEmirates(em.labelKey)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            );
          }
          return (
            <Field key={key} label={label} optional={!required}>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={required}
                  autoComplete={key === "full_name" ? "name" : key === "city" ? "address-level2" : undefined}
                />
              )}
            </Field>
          );
        })}
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-nl-cacao">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
          className="h-5 w-5 rounded-sm accent-nl-cacao"
        />
        {t("setAsDefault")}
      </label>
      {saveError && <FieldError>{saveError}</FieldError>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isLoading || !phoneVerified}>
          {isLoading ? tCommon("loading") : t("saveAddress")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        {!phoneVerified && <span className="text-[13px] text-nl-russet">{t("verifyPhoneToSave")}</span>}
      </div>
    </form>
  );
}
