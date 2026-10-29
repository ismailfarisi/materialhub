"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  toast,
} from "@materialhub/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { RuleBuilder } from "@/components/collections/rule-builder";
import { ItemsEditor } from "@/components/collections/items-editor";
import { CollectionPreview } from "@/components/collections/collection-preview";
import {
  useCollection,
  useUpdateCollection,
  type CollectionRules,
  type CollectionSort,
} from "@/lib/queries/collections";

const SORTS: CollectionSort[] = ["custom", "price_asc", "price_desc", "newest", "rating"];

export default function EditCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: collection, isLoading } = useCollection(id);
  const update = useUpdateCollection();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [defaultSort, setDefaultSort] = useState<CollectionSort>("custom");
  const [rules, setRules] = useState<CollectionRules | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!collection) return;
    setName(collection.name);
    setSlug(collection.slug);
    setDescription(collection.description ?? "");
    setDefaultSort(collection.default_sort);
    setRules(collection.rules);
    setStartsAt(collection.starts_at ? collection.starts_at.slice(0, 16) : "");
    setEndsAt(collection.ends_at ? collection.ends_at.slice(0, 16) : "");
    setIsActive(collection.is_active);
  }, [collection]);

  function saveBasics() {
    update.mutate(
      {
        id,
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description || undefined,
        default_sort: defaultSort,
        // null = cleared. The API body schema accepts null and the service stores
        // it as null — so clearing all rules / a schedule date on an existing
        // collection now persists.
        rules,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: isActive,
      },
      {
        onSuccess: () => toast({ title: "Saved" }),
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.response?.data?.message ?? "Save failed.",
            variant: "destructive",
          }),
      },
    );
  }

  if (isLoading || !collection) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="p-2">
          <Link href="/promotions/collections">
            <ArrowLeft size={18} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">{collection.name}</h1>
          <p className="text-taupe text-sm">/{collection.slug}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">
                Basics & Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Slug</label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Default sort</label>
                  <select
                    value={defaultSort}
                    onChange={(e) => setDefaultSort(e.target.value as CollectionSort)}
                    className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm"
                  >
                    {SORTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-end gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Starts at</label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Ends at</label>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <RuleBuilder key={id} value={rules} onChange={setRules} />
              <div className="flex justify-end">
                <Button onClick={saveBasics} disabled={update.isPending}>
                  {update.isPending && <Loader2 size={16} className="mr-1.5 animate-spin" />}
                  Save basics & rules
                </Button>
              </div>
            </CardContent>
          </Card>

          <ItemsEditor collectionId={id} role="pin" title="Pinned products" />
          <ItemsEditor collectionId={id} role="exclude" title="Excluded products" />
        </div>

        <div>
          <CollectionPreview collectionId={id} />
        </div>
      </div>
    </div>
  );
}
