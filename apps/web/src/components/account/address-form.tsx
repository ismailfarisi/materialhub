"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import { PhoneVerifyField, saveAddressErrorMessage } from "@/components/account/phone-verify-field";
import { UAE_EMIRATES } from "@/lib/emirates";

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

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(15,18,24,0.2)",
  background: "rgba(255,255,255,0.6)",
  fontFamily: MAISON_SANS,
  borderRadius: 0,
};

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

  const focusAmber = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "hsl(var(--nl-amber))";
    e.currentTarget.style.boxShadow = "0 0 0 1px hsl(var(--nl-amber))";
  };
  const blurAmber = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "rgba(15,18,24,0.2)";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaveError(null);
        try {
          await onSubmit(form);
        } catch (err) {
          setSaveError(saveAddressErrorMessage(err) ?? "Failed to save this address. Please try again.");
        }
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(({ key, labelKey, required, type }) => {
          const label = t(labelKey);
          if (type === "phone") {
            return (
              <PhoneVerifyField
                key={key}
                value={form[key]}
                onChange={(phone) => setForm({ ...form, [key]: phone })}
                onVerifiedChange={setPhoneVerified}
                originalPhone={initial?.phone}
                required={required}
                onFocus={focusAmber}
                onBlur={blurAmber}
                className="flex items-center px-3.5 py-2.5 text-sm w-full transition-all text-nl-cacao"
                style={inputStyle}
                prefixClassName="me-2 text-nl-russet"
                inputClassName="w-full bg-transparent outline-none"
                inputStyle={{ border: "none", fontFamily: MAISON_SANS }}
              />
            );
          }
          if (type === "emirate") {
            return (
              <select
                key={key}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                onFocus={focusAmber}
                onBlur={blurAmber}
                required={required}
                className="px-3.5 py-2.5 text-sm w-full outline-none transition-all text-nl-cacao"
                style={inputStyle}
              >
                <option value="" disabled>
                  {label}
                </option>
                {UAE_EMIRATES.map((em) => (
                  <option key={em.value} value={em.value}>
                    {tEmirates(em.labelKey)}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={key}
              type="text"
              placeholder={label}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              onFocus={focusAmber}
              onBlur={blurAmber}
              required={required}
              className="px-3.5 py-2.5 text-sm w-full outline-none transition-all text-nl-cacao"
              style={inputStyle}
            />
          );
        })}
      </div>
      <label
        className="flex items-center gap-2 text-sm text-nl-cacao"
        style={{ fontFamily: MAISON_SANS }}
      >
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
          style={{ accentColor: "hsl(var(--nl-amber))" }}
        />
        {t("setAsDefault")}
      </label>
      {saveError && (
        <p className="text-red-600 text-xs" role="alert">
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isLoading || !phoneVerified}
          className="uppercase disabled:opacity-50"
          style={{
            background: "hsl(var(--nl-amber))",
            color: "hsl(var(--nl-espresso))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "13px 30px",
            border: "none",
            borderRadius: 0,
          }}
        >
          {isLoading ? tCommon("loading") : tCommon("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="uppercase transition-colors"
          style={{
            background: "transparent",
            border: "1px solid rgba(15,18,24,0.4)",
            color: "hsl(var(--nl-cacao))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "13px 30px",
            borderRadius: 0,
          }}
        >
          {tCommon("cancel")}
        </button>
      </div>
    </form>
  );
}
