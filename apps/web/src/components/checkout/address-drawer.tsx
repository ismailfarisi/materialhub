"use client";

import { PhoneVerifyField, saveAddressErrorMessage } from "@/components/account/phone-verify-field";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useAddresses, useCreateAddress, useUpdateAddress } from "@/lib/queries/account";
import { useCheckoutStore } from "@/stores/checkout";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { MAISON_SANS, MAISON_SERIF } from "./maison-primitives";

const EMPTY_FORM = {
  full_name: "",
  phone: "",
  building_name: "",
  floor: "",
  apartment: "",
  street: "",
  area: "",
  city: "",
  emirate: "",
};

export function AddressDrawer() {
  const t = useTranslations("checkout");
  const tEmirates = useTranslations("emirates");
  const { isAddressDrawerOpen, editingAddressId, setAddressDrawerOpen, setSelectedAddressId } =
    useCheckoutStore();
  const { data: addresses } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The address's phone as stored, captured once per open/edit — unlike
  // `form.phone`, this does NOT track keystrokes, so PhoneVerifyField can tell
  // "still the original number" (grandfathered, backend never gates it) from
  // "user changed it" (gated, same as creating a new address).
  const [originalPhone, setOriginalPhone] = useState<string | undefined>(undefined);

  const isEditing = !!editingAddressId;

  useEffect(() => {
    setSaveError(null);
    if (isEditing && addresses) {
      const addr = addresses.find((a: any) => a.id === editingAddressId);
      if (addr) {
        setForm({
          full_name: addr.full_name || "",
          phone: addr.phone || "",
          building_name: addr.building_name || "",
          floor: addr.floor || "",
          apartment: addr.apartment || "",
          street: addr.street || "",
          area: addr.area || "",
          city: addr.city || "",
          emirate: addr.emirate || "",
        });
        setOriginalPhone(addr.phone || undefined);
        return;
      }
    }
    setForm(EMPTY_FORM);
    setOriginalPhone(undefined);
  }, [isEditing, editingAddressId, addresses]);

  useEffect(() => {
    if (!isAddressDrawerOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddressDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isAddressDrawerOpen, setAddressDrawerOpen]);

  if (!isAddressDrawerOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      if (isEditing) {
        await updateAddress.mutateAsync({ id: editingAddressId!, ...form });
        setAddressDrawerOpen(false);
      } else {
        const saved = await createAddress.mutateAsync(form);
        if (saved?.id) {
          setSelectedAddressId(saved.id);
        }
        setAddressDrawerOpen(false);
      }
    } catch (err) {
      // A stale client-side "verified" gate can still be rejected server-side
      // (403 PHONE_NOT_VERIFIED) — surface that readably instead of a silent
      // failure, since the customer is mid-checkout here.
      setSaveError(saveAddressErrorMessage(err) ?? "Failed to save this address. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Form-state keys (snake_case for API) mapped to existing i18n keys under "checkout".
  const fields: {
    key: keyof typeof EMPTY_FORM;
    labelKey: string;
    required: boolean;
    type?: "text" | "phone" | "emirate";
  }[] = [
    { key: "full_name", labelKey: "fullName", required: true },
    { key: "phone", labelKey: "phone", required: true, type: "phone" },
    { key: "building_name", labelKey: "buildingName", required: true },
    { key: "floor", labelKey: "floor", required: false },
    { key: "apartment", labelKey: "apartment", required: false },
    { key: "street", labelKey: "street", required: true },
    { key: "area", labelKey: "area", required: false },
    { key: "city", labelKey: "city", required: true },
    { key: "emirate", labelKey: "emirate", required: true, type: "emirate" },
  ];

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("hideOrderSummary")}
        className="fixed inset-0 z-40 cursor-default"
        style={{ background: "rgba(26, 18, 8, 0.55)" }}
        onClick={() => setAddressDrawerOpen(false)}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> brings its own positioning/backdrop semantics that conflict with this slide-over layout */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? t("editAddress") : t("createAddress")}
        className="fixed inset-y-0 end-0 w-full max-w-md z-50 flex flex-col"
        style={{
          background: "hsl(var(--nl-linen))",
          color: "hsl(var(--nl-cacao))",
          fontFamily: MAISON_SANS,
          boxShadow: "-24px 0 60px rgba(26,18,8,0.35)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "24px 28px 20px",
            borderBottom: "1px solid rgba(44,24,16,0.1)",
          }}
        >
          <div>
            <div
              className="uppercase"
              style={{
                fontSize: 10,
                letterSpacing: "0.28em",
                color: "hsl(var(--nl-amber-text))",
              }}
            >
              {t("deliverTo")}
            </div>
            <h2
              style={{
                fontFamily: MAISON_SERIF,
                fontSize: 28,
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                marginTop: 4,
                fontWeight: 400,
              }}
            >
              {isEditing ? t("editAddress") : t("createAddress")}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setAddressDrawerOpen(false)}
            aria-label={t("hideOrderSummary")}
            className="grid place-items-center transition-colors hover:bg-black/5"
            style={{
              width: 32,
              height: 32,
              border: "1px solid rgba(44,24,16,0.12)",
              color: "hsl(var(--nl-cacao))",
            }}
          >
            <X className="h-4 w-4" strokeWidth={1.25} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto"
          style={{ padding: "20px 28px 24px" }}
        >
          <div className="space-y-3">
            {fields.map(({ key, labelKey, required, type }) => {
              const id = `address-${key}`;
              const controlStyle = {
                fontFamily: MAISON_SERIF,
                fontSize: 15,
                color: "hsl(var(--nl-cacao))",
                marginTop: 4,
                border: "none",
                padding: 0,
              } as const;
              return (
                <div
                  key={key}
                  style={{
                    border: "1px solid rgba(44,24,16,0.16)",
                    background: "rgba(255,255,255,0.55)",
                    padding: "10px 14px 8px",
                  }}
                >
                  <label
                    htmlFor={id}
                    className="block uppercase"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.22em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {t(labelKey as any)}
                    {required && (
                      <span className="ms-1" style={{ color: "hsl(var(--nl-amber-text))" }}>
                        *
                      </span>
                    )}
                  </label>
                  {type === "phone" ? (
                    <PhoneVerifyField
                      id={id}
                      value={form[key]}
                      onChange={(phone) => handleField(key, phone)}
                      onVerifiedChange={setPhoneVerified}
                      originalPhone={originalPhone}
                      required={required}
                      className="mt-1 flex items-center"
                      prefixClassName="me-2"
                      prefixStyle={{ ...controlStyle, marginTop: 0, color: "hsl(var(--nl-russet))" }}
                      inputClassName="w-full bg-transparent outline-none"
                      inputStyle={{ ...controlStyle, marginTop: 0 }}
                    />
                  ) : type === "emirate" ? (
                    <select
                      id={id}
                      value={form[key]}
                      onChange={(e) => handleField(key, e.target.value)}
                      required={required}
                      className="w-full bg-transparent outline-none"
                      style={controlStyle}
                    >
                      <option value="" disabled>
                        {t(labelKey as any)}
                      </option>
                      {UAE_EMIRATES.map((em) => (
                        <option key={em.value} value={em.value}>
                          {tEmirates(em.labelKey)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type="text"
                      value={form[key]}
                      onChange={(e) => handleField(key, e.target.value)}
                      required={required}
                      className="w-full bg-transparent outline-none"
                      style={controlStyle}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {saveError && (
            <p className="text-red-600 text-xs mt-3" role="alert">
              {saveError}
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              !form.full_name ||
              !form.phone ||
              !form.building_name ||
              !form.street ||
              !form.city ||
              !form.emirate ||
              !phoneVerified
            }
            className="w-full uppercase mt-6 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "hsl(var(--nl-cacao))",
              color: "hsl(var(--nl-linen))",
              padding: "18px 0",
              fontSize: 11,
              letterSpacing: "0.28em",
              border: "none",
            }}
          >
            {saving ? "..." : t("saveAddress")}
          </button>
        </form>
      </aside>
    </>
  );
}
