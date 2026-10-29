"use client";

import { useTranslations } from "next-intl";
import { Eyebrow, MAISON_SANS, MAISON_SERIF, MaisonRadio, MaisonTile } from "@/components/checkout/maison-primitives";

export interface HomeVisitAddressState {
  full_name: string;
  phone: string;
  street: string;
  area: string;
  city: string;
  emirate: string;
}

export const EMPTY_HOME_VISIT_ADDRESS: HomeVisitAddressState = {
  full_name: "",
  phone: "",
  street: "",
  area: "",
  city: "",
  emirate: "",
};

const ADDRESS_FIELDS: {
  key: keyof HomeVisitAddressState;
  labelKey: string;
  required: boolean;
}[] = [
  { key: "full_name", labelKey: "addressFullName", required: true },
  { key: "phone", labelKey: "addressPhone", required: true },
  { key: "street", labelKey: "addressStreet", required: true },
  { key: "area", labelKey: "addressArea", required: false },
  { key: "city", labelKey: "addressCity", required: true },
  { key: "emirate", labelKey: "addressEmirate", required: true },
];

/**
 * Home-visit address collection for booking checkout — reuses the
 * checkout AddressDrawer's field set (full_name/phone/street/area/city/
 * emirate) and the account's saved addresses, but is NOT wired to
 * useCreateAddress/useUpdateAddress: `customer_address` on POST /bookings
 * is a plain snapshot object, not an account address record, so a
 * freehand entry here is never persisted to the account — only selecting
 * an existing saved address reuses account data.
 */
export function BookingAddressForm({
  areaName,
  savedAddresses,
  selectedAddressId,
  onSelectAddress,
  useNewAddress,
  onToggleNewAddress,
  newAddress,
  onChangeNewAddress,
}: {
  areaName: string | null;
  savedAddresses: any[] | undefined;
  selectedAddressId: string | null;
  onSelectAddress: (id: string) => void;
  useNewAddress: boolean;
  onToggleNewAddress: () => void;
  newAddress: HomeVisitAddressState;
  onChangeNewAddress: (field: keyof HomeVisitAddressState, value: string) => void;
}) {
  const t = useTranslations("booking.checkout");
  const hasSaved = !!savedAddresses && savedAddresses.length > 0;
  const showNewForm = useNewAddress || !hasSaved;

  return (
    <div className="mt-6">
      <Eyebrow className="mb-2.5">{t("addressTitle")}</Eyebrow>
      {areaName && (
        <p
          className="mb-3"
          style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--nl-russet))" }}
        >
          {areaName}
        </p>
      )}

      {hasSaved && !useNewAddress && (
        <div className="space-y-2">
          {savedAddresses!.map((addr) => (
            <MaisonTile
              key={addr.id}
              selected={selectedAddressId === addr.id}
              onClick={() => onSelectAddress(addr.id)}
              className="p-3"
            >
              <div className="flex items-start gap-2.5">
                <MaisonRadio selected={selectedAddressId === addr.id} />
                <div style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-cacao))" }}>
                  <div>{addr.full_name}</div>
                  <div style={{ color: "hsl(var(--nl-russet))" }}>
                    {[addr.street, addr.area, addr.city, addr.emirate].filter(Boolean).join(", ")}
                  </div>
                </div>
              </div>
            </MaisonTile>
          ))}
        </div>
      )}

      {hasSaved && (
        <button
          type="button"
          onClick={onToggleNewAddress}
          className="mt-3 uppercase"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10.5,
            letterSpacing: "0.18em",
            color: "hsl(var(--nl-amber))",
          }}
        >
          {useNewAddress ? t("addressUseSaved") : t("addressAddNew")}
        </button>
      )}

      {showNewForm && (
        <div className="mt-3 space-y-2.5">
          {ADDRESS_FIELDS.map(({ key, labelKey, required }) => {
            const id = `home-visit-${key}`;
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
                  style={{ fontSize: 9, letterSpacing: "0.22em", color: "hsl(var(--nl-russet))" }}
                >
                  {t(labelKey as any)}
                  {required && (
                    <span className="ms-1" style={{ color: "hsl(var(--nl-amber))" }}>
                      *
                    </span>
                  )}
                </label>
                <input
                  id={id}
                  type="text"
                  value={newAddress[key]}
                  onChange={(e) => onChangeNewAddress(key, e.target.value)}
                  required={required}
                  className="w-full bg-transparent outline-none"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 15,
                    color: "hsl(var(--nl-cacao))",
                    marginTop: 4,
                    border: "none",
                    padding: 0,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
