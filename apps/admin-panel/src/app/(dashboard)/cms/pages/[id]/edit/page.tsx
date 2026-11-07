"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Textarea, RichEditor, Skeleton } from "@materialhub/ui";
import { usePage, useUpdatePage } from "@/lib/queries/cms";
import { ArrowLeft, Eye } from "lucide-react";

const LOCALE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Arabic", value: "ar" },
  { label: "Hindi", value: "hi" },
  { label: "Urdu", value: "ur" },
  { label: "Malayalam", value: "ml" },
];

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function EditCmsPagePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: page, isLoading } = usePage(id);
  const { mutate: updatePage, isPending } = useUpdatePage();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [locale, setLocale] = useState("en");
  const [status, setStatus] = useState("draft");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (page && !hydrated) {
      setTitle(page.title ?? "");
      setSlug(page.slug ?? "");
      setLocale(page.locale ?? "en");
      setStatus(page.status ?? "draft");
      setContent(page.content ?? "");
      setMetaTitle(page.meta_title ?? "");
      setMetaDescription(page.meta_description ?? "");
      // An existing page keeps its stored slug; don't re-derive it from the title.
      setSlugManual(true);
      setHydrated(true);
    }
  }, [page, hydrated]);

  useEffect(() => {
    if (!slugManual && hydrated) {
      setSlug(slugify(title));
    }
  }, [title, slugManual, hydrated]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!slug.trim()) { setError("Slug is required."); return; }
    setError("");
    updatePage(
      { id, payload: { title, slug, locale, status, content, meta_title: metaTitle, meta_description: metaDescription } },
      {
        onSuccess: () => router.push("/cms/pages"),
        onError: () => setError("Failed to update page. Please try again."),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-pearl/100 text-taupe"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">Edit Page</h1>
          <p className="text-taupe text-sm">Update the CMS page content.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-taupe hover:bg-pearl/50"
          >
            <Eye size={15} />
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <div className={`grid gap-6 grid-cols-1 ${showPreview ? "lg:grid-cols-2" : ""}`}>
        {/* Editor pane */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-linen p-5 space-y-5">
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">Page Details</h2>

            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Page title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Slug</label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                placeholder="page-slug"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Locale</label>
                <Select
                  value={locale}
                  // Radix calls onValueChange("") when the value changes after
                  // mount (the stored page loads late); never store a blank.
                  onValueChange={(v) => v && setLocale(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Status</label>
                <Select
                  value={status}
                  // Saving a published page sent status "" (400) without this.
                  onValueChange={(v) => v && setStatus(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-linen p-5 space-y-3">
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">Content</h2>
            <RichEditor content={content} onChange={setContent} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-linen p-5 space-y-4">
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">SEO</h2>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Meta Title</label>
              <Input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="SEO title (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Meta Description</label>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="SEO description (optional)"
                rows={3}
              />
            </div>
          </div>
        </form>

        {/* Preview pane */}
        {showPreview && (
          <div className="rounded-xl border border-gray-200 bg-linen overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-gray-100 bg-pearl/50 flex items-center gap-2">
              <Eye size={14} className="text-taupe" />
              <span className="text-xs font-medium text-taupe uppercase tracking-wide">Live Preview</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {title && (
                <h1 className="text-2xl font-bold text-cacao mb-4">{title}</h1>
              )}
              {content ? (
                <div
                  className="prose max-w-none text-cacao"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              ) : (
                <p className="text-taupe italic text-sm">No content yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
