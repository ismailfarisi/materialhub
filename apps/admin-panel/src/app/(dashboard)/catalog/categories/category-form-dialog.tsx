"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Textarea,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  S3ImageUploadField,
} from "@materialhub/ui";
import { s3UploadClient } from "@/lib/s3-upload-client";
import {
  useCreateCategory,
  useUpdateCategory,
  type Category,
  type CategoryTranslation,
} from "@/lib/queries/categories";

const LOCALES: Array<{ code: string; label: string; rtl?: boolean }> = [
  { code: "ar", label: "Arabic", rtl: true },
  { code: "hi", label: "Hindi" },
];

function flatten(
  nodes: Category[],
  depth = 0,
  out: Array<{ id: string; name: string; depth: number }> = [],
) {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

function collectSubtreeIds(nodes: Category[], targetId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (node: Category) => {
    ids.add(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  const find = (list: Category[]): Category | undefined => {
    for (const n of list) {
      if (n.id === targetId) return n;
      const f = n.children ? find(n.children) : undefined;
      if (f) return f;
    }
    return undefined;
  };
  const root = find(nodes);
  if (root) walk(root);
  return ids;
}

function translationFor(category: Category | null | undefined, locale: string): CategoryTranslation {
  const found = category?.translations?.find((t) => t.locale === locale);
  return found ?? { locale, name: "", description: "" };
}

interface Props {
  open: boolean;
  category?: Category | null; // null/undefined = create
  allCategories: Category[];
  onClose: () => void;
}

export function CategoryFormDialog({ open, category, allCategories, onClose }: Props) {
  const isEdit = !!category;

  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState<string>(category?.parent_id ?? "__none__");
  const [description, setDescription] = useState(category?.description ?? "");
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(category?.is_featured ?? false);

  const [imageUrl, setImageUrl] = useState(category?.image_url ?? "");
  const [iconUrl, setIconUrl] = useState(category?.icon_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(category?.banner_url ?? "");

  const [metaTitle, setMetaTitle] = useState(category?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(category?.meta_description ?? "");
  const [metaKeywords, setMetaKeywords] = useState(category?.meta_keywords ?? "");

  const [commission, setCommission] = useState(
    category?.commission_rate != null ? String(category.commission_rate) : "",
  );

  const [translations, setTranslations] = useState<Record<string, CategoryTranslation>>(() => {
    const init: Record<string, CategoryTranslation> = {};
    for (const l of LOCALES) init[l.code] = translationFor(category, l.code);
    return init;
  });

  const { mutate: create, isPending: creating } = useCreateCategory();
  const { mutate: update, isPending: updating } = useUpdateCategory();
  const isPending = creating || updating;

  function setTranslation(locale: string, patch: Partial<CategoryTranslation>) {
    setTranslations((prev) => ({ ...prev, [locale]: { ...prev[locale], ...patch } }));
  }

  function buildPayload() {
    const commissionNum = commission.trim() === "" ? null : Number(commission);
    return {
      name: name.trim(),
      parent_id: parentId === "__none__" ? null : parentId,
      description: description.trim() || null,
      image_url: imageUrl || null,
      icon_url: iconUrl || null,
      banner_url: bannerUrl || null,
      is_active: isActive,
      is_featured: isFeatured,
      commission_rate: commissionNum,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      meta_keywords: metaKeywords.trim() || null,
      translations: LOCALES.map((l) => ({
        locale: l.code,
        name: translations[l.code]?.name?.trim() ?? "",
        description: translations[l.code]?.description?.trim() || null,
      })),
    };
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const payload = buildPayload();
    if (isEdit && category) {
      update({ id: category.id, ...payload }, { onSuccess: onClose });
    } else {
      create(payload, { onSuccess: onClose });
    }
  }

  const excludedIds = category ? collectSubtreeIds(allCategories, category.id) : new Set<string>();
  const parentOptions = flatten(allCategories).filter((c) => !excludedIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="py-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="translations">Translations</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div>
              <Label className="mb-1 block">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" />
            </div>
            {isEdit && (
              <div>
                <Label className="mb-1 block">Slug</Label>
                <Input value={category?.slug ?? ""} readOnly disabled className="font-mono text-sm" />
                <p className="mt-1 text-xs text-taupe">Slug is generated automatically and cannot be changed.</p>
              </div>
            )}
            <div>
              <Label className="mb-1 block">Parent Category</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="None (top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top level)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {"— ".repeat(c.depth)}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description for the category page"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-cacao">Active</p>
                <p className="text-xs text-taupe">Disabled categories are hidden from the storefront.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-cacao">Featured</p>
                <p className="text-xs text-taupe">Promote this category in featured placements.</p>
              </div>
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
            </div>
          </TabsContent>

          <TabsContent value="media" className="space-y-5 pt-4">
            <S3ImageUploadField
              assetType="category_image"
              value={imageUrl || null}
              onChange={(url) => setImageUrl(url ?? "")}
              client={s3UploadClient}
              label="Main image"
            />
            <S3ImageUploadField
              assetType="category_icon"
              value={iconUrl || null}
              onChange={(url) => setIconUrl(url ?? "")}
              client={s3UploadClient}
              label="Icon (SVG/PNG)"
            />
            <S3ImageUploadField
              assetType="category_banner"
              value={bannerUrl || null}
              onChange={(url) => setBannerUrl(url ?? "")}
              client={s3UploadClient}
              label="Banner"
            />
          </TabsContent>

          <TabsContent value="seo" className="space-y-4 pt-4">
            <div>
              <Label className="mb-1 block">Meta Title</Label>
              <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">Meta Description</Label>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label className="mb-1 block">Meta Keywords</Label>
              <Input
                value={metaKeywords}
                onChange={(e) => setMetaKeywords(e.target.value)}
                placeholder="comma, separated, keywords"
              />
            </div>
          </TabsContent>

          <TabsContent value="translations" className="space-y-5 pt-4">
            {LOCALES.map((l) => (
              <div key={l.code} className="space-y-2 rounded-md border border-gray-200 p-3">
                <p className="text-sm font-semibold text-cacao">{l.label}</p>
                <Input
                  value={translations[l.code]?.name ?? ""}
                  onChange={(e) => setTranslation(l.code, { name: e.target.value })}
                  placeholder={`${l.label} name`}
                  dir={l.rtl ? "rtl" : "ltr"}
                />
                <Textarea
                  value={translations[l.code]?.description ?? ""}
                  onChange={(e) => setTranslation(l.code, { description: e.target.value })}
                  placeholder={`${l.label} description (optional)`}
                  rows={2}
                  dir={l.rtl ? "rtl" : "ltr"}
                />
              </div>
            ))}
            <p className="text-xs text-taupe">Leave a name blank to remove that translation.</p>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 pt-4">
            <div>
              <Label className="mb-1 block">Commission Rate Override (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="Leave empty to use default"
              />
              <p className="mt-1 text-xs text-taupe">0–100. Overrides the default commission for products in this category.</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending ? "Saving..." : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
