"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  useCreateCollection,
  type CollectionKind,
  type CollectionRules,
  type CollectionSort,
} from "@/lib/queries/collections";

const SORTS: CollectionSort[] = ["custom", "price_asc", "price_desc", "newest", "rating"];

export default function NewCollectionPage() {
  const router = useRouter();
  const { mutate: create, isPending } = useCreateCollection();
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CollectionKind>("product");
  const [defaultSort, setDefaultSort] = useState<CollectionSort>("custom");
  const [rules, setRules] = useState<CollectionRules | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  function handleSubmit() {
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    create(
      {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description || undefined,
        kind,
        default_sort: defaultSort,
        // null = no rules / no schedule. The API body schema accepts null and the
        // service stores it as null.
        rules,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: isActive,
      },
      {
        onSuccess: (c) => {
          toast({ title: "Collection created", description: "Now add pins and excludes." });
          router.push(`/promotions/collections/${c.id}`);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? "Failed to create collection.";
          setError(msg);
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="p-2">
          <Link href="/promotions/collections">
            <ArrowLeft size={18} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">New Collection</h1>
          <p className="text-taupe text-sm">Define basics and a rule query. Add pins next.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">
            Basics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Edit" />
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Slug</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated from name"
            />
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
              <label className="block text-sm font-medium text-cacao mb-1">Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CollectionKind)}
                className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm"
              >
                <option value="product">Product</option>
                <option value="variant">Variant</option>
              </select>
            </div>
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
            Active
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">
            Rule Query
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RuleBuilder value={rules} onChange={setRules} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link href="/promotions/collections">
            <ArrowLeft size={16} className="mr-1.5" />
            Cancel
          </Link>
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 size={16} className="mr-1.5 animate-spin" />}
          {isPending ? "Creating…" : "Create & add items"}
        </Button>
      </div>
    </div>
  );
}
