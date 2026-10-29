"use client";

import { useState } from "react";
import { Button, Card, CardContent, EditorialEditor, type ProductEditorial, toast } from "@materialhub/ui";
import { s3UploadClient } from "@/lib/s3-upload-client";

interface EditorialTabProps {
  product: any;
  editing: boolean;
  onSave: (editorial: ProductEditorial | null) => Promise<void>;
}

export function EditorialTab({ product, editing, onSave }: EditorialTabProps) {
  const [value, setValue] = useState<ProductEditorial | null>(product.editorial ?? null);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return <EditorialReadView editorial={product.editorial ?? null} />;
  }

  return (
    <div className="space-y-4">
      <EditorialEditor value={value} onChange={setValue} uploadClient={s3UploadClient} />
      <div className="flex justify-end">
        <Button
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(value);
              toast({ title: "Editorial saved" });
            } catch (e) {
              toast({
                title: "Save failed",
                description: (e as Error).message,
                variant: "destructive",
              });
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Editorial"}
        </Button>
      </div>
    </div>
  );
}

function EditorialReadView({ editorial }: { editorial: ProductEditorial | null }) {
  if (!editorial || isAllEmpty(editorial)) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-taupe">No editorial content. Click Edit to add.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {editorial.short_film && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <SectionHeader title="Short Film" eyebrow={editorial.short_film.eyebrow} />
            {editorial.short_film.title && (
              <p className="text-base font-medium text-cacao">{editorial.short_film.title}</p>
            )}
            <div className="flex items-start gap-4">
              {editorial.short_film.thumbnail_url && (
                <img
                  src={editorial.short_film.thumbnail_url}
                  alt=""
                  className="w-32 h-20 object-cover rounded border border-gray-200"
                />
              )}
              <div className="text-xs text-taupe space-y-1 flex-1">
                <Field label="URL" value={editorial.short_film.url} link />
                {editorial.short_film.duration_seconds != null && (
                  <Field label="Duration" value={`${editorial.short_film.duration_seconds}s`} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {editorial.maker_letter && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <SectionHeader title="Maker Letter" />
            <div className="flex items-start gap-4">
              {editorial.maker_letter.author_avatar_url && (
                <img
                  src={editorial.maker_letter.author_avatar_url}
                  alt={editorial.maker_letter.author_name}
                  className="w-12 h-12 object-cover rounded-full border border-gray-200 shrink-0"
                />
              )}
              <div className="flex-1 space-y-2">
                <p className="text-sm italic text-cacao">"{editorial.maker_letter.quote}"</p>
                {editorial.maker_letter.body && (
                  <p className="text-xs text-taupe whitespace-pre-wrap">{editorial.maker_letter.body}</p>
                )}
                <p className="text-xs text-taupe">
                  — <span className="font-medium text-cacao">{editorial.maker_letter.author_name}</span>
                  {editorial.maker_letter.author_role && (
                    <span className="text-taupe">, {editorial.maker_letter.author_role}</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {editorial.lookbook && editorial.lookbook.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <SectionHeader title="Lookbook" badge={`${editorial.lookbook.length} ${editorial.lookbook.length === 1 ? "image" : "images"}`} />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {editorial.lookbook.map((row, i) => (
                <div
                  key={i}
                  className={`relative rounded border border-gray-200 overflow-hidden bg-gray-50 ${row.tall ? "row-span-2 aspect-[3/4]" : "aspect-square"}`}
                >
                  {row.image_url ? (
                    <img src={row.image_url} alt={row.alt ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-taupe">No URL</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {editorial.ingredient_origins && editorial.ingredient_origins.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <SectionHeader title="Ingredient Origins" badge={`${editorial.ingredient_origins.length} ${editorial.ingredient_origins.length === 1 ? "ingredient" : "ingredients"}`} />
            <div className="space-y-3">
              {editorial.ingredient_origins.map((row, i) => (
                <div key={i} className="rounded border border-gray-200 p-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-cacao">
                      {row.name}
                      <span className="text-xs text-taupe font-normal"> — {row.place}</span>
                    </p>
                    {row.role && (
                      <span className="text-[10px] uppercase tracking-wider text-taupe bg-stone-100 px-2 py-0.5 rounded">
                        {row.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-taupe whitespace-pre-wrap">{row.body}</p>
                  {row.annual_harvest && (
                    <p className="text-xs text-taupe">Annual harvest: {row.annual_harvest}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {editorial.campaign && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <SectionHeader title="Campaign" />
            <Field label="Name" value={editorial.campaign.name} />
            {editorial.campaign.lookbook_total != null && (
              <Field label="Lookbook total" value={String(editorial.campaign.lookbook_total)} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SectionHeader({ title, eyebrow, badge }: { title: string; eyebrow?: string; badge?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 pb-2">
      <div>
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-wider text-taupe">{eyebrow}</p>
        )}
        <h3 className="text-sm font-semibold text-cacao">{title}</h3>
      </div>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider text-taupe bg-stone-100 px-2 py-0.5 rounded">
          {badge}
        </span>
      )}
    </div>
  );
}

function Field({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <p className="text-xs">
      <span className="text-taupe">{label}:</span>{" "}
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
          {value}
        </a>
      ) : (
        <span className="text-cacao">{value}</span>
      )}
    </p>
  );
}

function isAllEmpty(v: ProductEditorial): boolean {
  return (
    !v.short_film &&
    !v.maker_letter &&
    (!v.lookbook || v.lookbook.length === 0) &&
    (!v.ingredient_origins || v.ingredient_origins.length === 0) &&
    !v.campaign
  );
}
