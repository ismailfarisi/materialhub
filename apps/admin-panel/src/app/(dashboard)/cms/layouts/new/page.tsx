"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@materialhub/ui";
import { useCreateLayout } from "@/lib/queries/layouts";
import { ArrowLeft } from "lucide-react";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function NewLayoutPage() {
  const router = useRouter();
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState("");

  const { mutate: createLayout, isPending } = useCreateLayout();

  function handleTitleEnChange(value: string) {
    setTitleEn(value);
    if (!slugTouched) {
      setSlug(toSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(toSlug(value));
  }

  function handleSubmit() {
    if (!titleEn.trim()) {
      setFormError("English title is required.");
      return;
    }
    if (!slug.trim()) {
      setFormError("Slug is required.");
      return;
    }
    setFormError("");

    const title: Record<string, string> = { en: titleEn.trim() };
    if (titleAr.trim()) title.ar = titleAr.trim();

    createLayout(
      { slug, title },
      {
        onSuccess: (result) => {
          router.push(`/cms/layouts/${result.id}/edit`);
        },
        onError: () => {
          setFormError("Failed to create layout. The slug may already be in use.");
        },
      }
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/cms/layouts")}
          className="p-1.5 rounded hover:bg-pearl/100 text-taupe hover:text-cacao"
          aria-label="Back to layouts"
          title="Back to layouts"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">Create Layout</h1>
          <p className="text-taupe text-sm">
            Layouts compose storefront pages from sections (carousels, banners,
            product rails).
          </p>
        </div>
      </div>

      <div className="bg-linen rounded-xl border border-gray-200 p-6 space-y-5">
        {formError && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {formError}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-cacao mb-1">
            Title (English) <span className="text-red-500">*</span>
          </label>
          <Input
            value={titleEn}
            onChange={(e) => handleTitleEnChange(e.target.value)}
            placeholder="e.g. Homepage Layout"
            autoFocus
          />
          <p className="mt-1 text-xs text-taupe">
            Shown to admins when picking layouts.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-cacao mb-1">
            Title (Arabic)
            <span className="ml-2 text-xs font-normal text-taupe">
              Optional
            </span>
          </label>
          <Input
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            placeholder="e.g. تخطيط الصفحة الرئيسية"
            dir="rtl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-cacao mb-1">
            Slug <span className="text-red-500">*</span>
          </label>
          <Input
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="e.g. homepage-layout"
            className="font-mono"
          />
          <p className="mt-1 text-xs text-taupe">
            {slugTouched
              ? "Lowercase, hyphens only. Used as the unique identifier."
              : "Auto-generated from title. You can edit it before saving."}
          </p>
          {slug && (
            <p className="mt-2 text-xs text-taupe">
              Preview:{" "}
              <code className="px-1.5 py-0.5 rounded bg-pearl/100 font-mono text-cacao">
                /layouts/{slug}
              </code>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push("/cms/layouts")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Layout"}
          </Button>
        </div>
      </div>
    </div>
  );
}
