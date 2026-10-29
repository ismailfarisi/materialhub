"use client";

import { useAddresses } from "@/lib/queries/account";
import { useCheckoutStore } from "@/stores/checkout";
import { MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { MAISON_SANS, MAISON_SERIF, MaisonCard, MaisonRadio } from "./maison-primitives";

export function DeliverySection() {
  const t = useTranslations("checkout");
  const { selectedAddressId, setSelectedAddressId, setAddressDrawerOpen } = useCheckoutStore();
  const { data: addresses, isLoading } = useAddresses();

  useEffect(() => {
    if (!addresses || addresses.length === 0 || selectedAddressId) return;
    const defaultAddr = addresses.find((a: any) => a.is_default) || addresses[0];
    if (defaultAddr?.id) {
      setSelectedAddressId(defaultAddr.id);
    }
  }, [addresses, selectedAddressId, setSelectedAddressId]);

  const changeCta = (id: string) => (
    <button
      type="button"
      onClick={() => setAddressDrawerOpen(true, id)}
      className="uppercase transition-opacity hover:opacity-70"
      style={{
        fontSize: 10,
        letterSpacing: "0.22em",
        color: "hsl(var(--nl-russet))",
        borderBottom: "1px solid rgba(44,24,16,0.2)",
        paddingBottom: 1,
        fontFamily: MAISON_SANS,
      }}
    >
      {t("changeTo")}
    </button>
  );

  return (
    <MaisonCard title={t("deliverTo")}>
      {isLoading ? (
        <div
          className="animate-pulse"
          style={{ padding: 16, border: "1px solid rgba(44,24,16,0.16)" }}
        >
          <div className="h-4 mb-2" style={{ width: "33%", background: "rgba(44,24,16,0.08)" }} />
          <div className="h-3" style={{ width: "66%", background: "rgba(44,24,16,0.08)" }} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {addresses?.map((addr: any) => {
            const isSelected = selectedAddressId === addr.id;
            return (
              <button
                type="button"
                key={addr.id}
                onClick={() => setSelectedAddressId(addr.id)}
                className="w-full text-start transition-colors"
                style={{
                  padding: "14px 16px",
                  display: "grid",
                  gridTemplateColumns: "20px 1fr auto",
                  gap: 14,
                  alignItems: "start",
                  border: `1px solid ${isSelected ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"}`,
                  background: isSelected ? "rgba(184,115,51,0.06)" : "rgba(255,255,255,0.55)",
                }}
              >
                <MaisonRadio selected={isSelected} />
                <div className="min-w-0">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 16,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {addr.full_name}
                    </span>
                    {addr.is_default && (
                      <span
                        className="uppercase"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.22em",
                          color: "hsl(var(--nl-amber-text))",
                          border: "1px solid hsl(var(--nl-amber))",
                          padding: "2px 7px",
                        }}
                      >
                        {t("defaultTag")}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12.5,
                      color: "hsl(var(--nl-russet))",
                      lineHeight: 1.55,
                    }}
                  >
                    {[addr.building_name, addr.apartment, addr.floor].filter(Boolean).join(", ")}
                    {[addr.building_name, addr.apartment, addr.floor].some(Boolean) && <br />}
                    {addr.street}
                    {addr.area && `, ${addr.area}`}, {addr.city}, {addr.emirate}
                    {addr.phone && (
                      <>
                        {" · "}
                        <span
                          style={{
                            fontFamily: MAISON_SERIF,
                            fontStyle: "italic",
                          }}
                        >
                          {addr.phone}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span>{changeCta(addr.id)}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setAddressDrawerOpen(true)}
            className="w-full uppercase flex items-center justify-center transition-opacity hover:opacity-70"
            style={{
              padding: "12px 16px",
              gap: 8,
              fontSize: 10.5,
              letterSpacing: "0.22em",
              color: "hsl(var(--nl-cacao))",
              border: "1px solid rgba(44,24,16,0.16)",
              background: "transparent",
              fontFamily: MAISON_SANS,
            }}
          >
            {addresses && addresses.length > 0 ? (
              <Plus className="h-3.5 w-3.5" strokeWidth={1.25} />
            ) : (
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.25} />
            )}
            {t("addNewAddress")}
          </button>
        </div>
      )}
    </MaisonCard>
  );
}
