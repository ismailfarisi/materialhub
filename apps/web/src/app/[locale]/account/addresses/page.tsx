"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAddresses,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress,
} from "@/lib/queries/account";
import { AddressForm } from "@/components/account/address-form";
import { MapPin, Trash2, Edit2 } from "lucide-react";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

export default function AddressesPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const { data: addresses, isLoading } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading)
    return (
      <div
        className="py-12 text-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </div>
    );

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <Eyebrow>ADDRESSES</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("addresses")}
          </SerifTitle>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
          }}
          className="uppercase shrink-0"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "hsl(var(--nl-amber))",
          }}
        >
          {tCommon("addAddress")}
        </button>
      </div>

      {showForm && !editingId && (
        <div className="mb-4">
          <AddressForm
            onSubmit={async (data) => {
              await createAddress.mutateAsync(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
            isLoading={createAddress.isPending}
          />
        </div>
      )}

      <div className="space-y-3">
        {(addresses || []).map((addr: any) => (
          <div
            key={addr.id}
            style={{
              border: "1px solid rgba(44,24,16,0.10)",
              background: "rgba(44,24,16,0.02)",
              padding: 16,
            }}
          >
            {editingId === addr.id ? (
              <AddressForm
                initial={addr}
                onSubmit={async (data) => {
                  await updateAddress.mutateAsync({ id: addr.id, ...data });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                isLoading={updateAddress.isPending}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0 flex-1">
                  <MapPin
                    className="h-5 w-5 mt-0.5 shrink-0 text-nl-russet"
                    strokeWidth={1.25}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="flex flex-wrap items-center gap-2"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        fontWeight: 500,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      <span className="break-words">{addr.full_name}</span>
                      {addr.is_default && (
                        <span
                          className="uppercase whitespace-nowrap"
                          style={{
                            fontFamily: MAISON_SANS,
                            fontSize: 10,
                            letterSpacing: "0.18em",
                            color: "hsl(var(--nl-amber))",
                            border: "1px solid rgba(184,115,51,0.4)",
                            padding: "2px 7px",
                          }}
                        >
                          {t("defaultAddress")}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-nl-russet break-words mt-0.5">
                      {[
                        addr.building_name,
                        addr.apartment,
                        addr.floor,
                        addr.street,
                        addr.area,
                        addr.city,
                        addr.emirate,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="text-sm text-nl-russet break-words">
                      {addr.phone}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingId(addr.id)}
                    className="p-1 text-nl-russet hover:text-nl-cacao transition-colors"
                    aria-label={tCommon("edit")}
                  >
                    <Edit2 className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(tCommon("deleteConfirm"))) {
                        deleteAddress.mutate(addr.id);
                      }
                    }}
                    className="p-1 text-nl-russet transition-colors hover:text-[hsl(var(--nl-cacao))]"
                    aria-label={tCommon("delete")}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
