"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SimpleSelect,
} from "@materialhub/ui";
import { Loader2 } from "lucide-react";
import {
  EntityCombobox,
  EntityMultiCombobox,
  type LookupItem,
} from "@/components/ui/entity-combobox";
import {
  getAdminBrandByIdLookup,
  getAdminProductByIdLookup,
  getAdminUserByIdLookup,
  getAdminVendorByIdLookup,
  searchAdminBrandsLookup,
  searchAdminProductsLookup,
  searchAdminUsersLookup,
  searchAdminVendorsLookup,
} from "@/lib/queries/lookups";
import {
  listTaggingPermissions,
  grantTaggingPermission,
  revokeTaggingPermission,
} from "@/lib/api/reels-admin";

type Scope = "any_product" | "specific_brand" | "specific_vendor" | "specific_products";

const SCOPE_OPTIONS: { value: Scope; label: string; help: string }[] = [
  {
    value: "any_product",
    label: "Any product",
    help: "User may tag any product in the catalog.",
  },
  {
    value: "specific_brand",
    label: "Specific brand",
    help: "User may only tag products belonging to the chosen brand.",
  },
  {
    value: "specific_vendor",
    label: "Specific vendor",
    help: "User may only tag products sold by the chosen vendor.",
  },
  {
    value: "specific_products",
    label: "Specific products",
    help: "User may only tag the exact products listed below.",
  },
];

const DEFAULT_FORM = {
  userId: "",
  scope: "any_product" as Scope,
  brandId: "",
  vendorId: "",
  productIds: [] as string[],
  expiresAt: "",
  reason: "",
};

/** Resolves a single id to a human label, falling back to a short id while loading. */
function ResolvedLabel({
  id,
  getById,
}: {
  id: string;
  getById: (id: string) => Promise<LookupItem | null>;
}) {
  const [item, setItem] = useState<LookupItem | null>(null);
  useEffect(() => {
    let cancelled = false;
    getById(id).then((it) => {
      if (!cancelled) setItem(it);
    });
    return () => {
      cancelled = true;
    };
  }, [id, getById]);
  if (!item) {
    return <span className="font-mono text-xs text-muted-foreground">{id.slice(0, 8)}…</span>;
  }
  return (
    <span>
      {item.label}
      {item.sublabel && (
        <span className="block text-xs text-muted-foreground">{item.sublabel}</span>
      )}
    </span>
  );
}

function TargetCell({ p }: { p: any }) {
  if (p.scope === "specific_brand" && p.brand_id) {
    return <ResolvedLabel id={p.brand_id} getById={getAdminBrandByIdLookup} />;
  }
  if (p.scope === "specific_vendor" && p.vendor_id) {
    return <ResolvedLabel id={p.vendor_id} getById={getAdminVendorByIdLookup} />;
  }
  if (p.scope === "specific_products" && p.product_ids?.length) {
    return (
      <div className="space-y-1">
        {p.product_ids.map((pid: string) => (
          <ResolvedLabel key={pid} id={pid} getById={getAdminProductByIdLookup} />
        ))}
      </div>
    );
  }
  return <span className="text-muted-foreground">— (any product)</span>;
}

export function TaggingPermissionsTable() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopeMeta = SCOPE_OPTIONS.find((s) => s.value === form.scope)!;

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setItems(await listTaggingPermissions());
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    setError(null);
    if (!form.userId) {
      setError("Please choose a user.");
      return;
    }
    if (form.scope === "specific_brand" && !form.brandId) {
      setError("Please choose a brand for the “specific brand” scope.");
      return;
    }
    if (form.scope === "specific_vendor" && !form.vendorId) {
      setError("Please choose a vendor for the “specific vendor” scope.");
      return;
    }
    if (form.scope === "specific_products" && form.productIds.length === 0) {
      setError("Please choose at least one product for the “specific products” scope.");
      return;
    }

    setBusy(true);
    try {
      await grantTaggingPermission({
        userId: form.userId,
        scope: form.scope,
        brandId: form.scope === "specific_brand" ? form.brandId : undefined,
        vendorId: form.scope === "specific_vendor" ? form.vendorId : undefined,
        productIds:
          form.scope === "specific_products" ? form.productIds : undefined,
        expiresAt: form.expiresAt || undefined,
        reason: form.reason || undefined,
      });
      setForm(DEFAULT_FORM);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to grant");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this tagging permission?")) return;
    setError(null);
    try {
      await revokeTaggingPermission(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to revoke");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-cacao">Reels — Tagging Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which users may tag products in their reels, and how broadly.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Current grants ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
            Current grants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2 font-medium">User</th>
                  <th className="p-2 font-medium">Scope</th>
                  <th className="p-2 font-medium">Target</th>
                  <th className="p-2 font-medium">Granted</th>
                  <th className="p-2 font-medium">Expires</th>
                  <th className="p-2 font-medium">Reason</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="inline animate-spin" size={16} />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No tagging permissions granted yet.
                    </td>
                  </tr>
                ) : (
                  items.map((p) => (
                    <tr key={p.id} className="border-b align-top">
                      <td className="p-2">
                        <ResolvedLabel id={p.user_id} getById={getAdminUserByIdLookup} />
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{p.scope}</Badge>
                      </td>
                      <td className="p-2">
                        <TargetCell p={p} />
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {p.granted_at ? new Date(p.granted_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">{p.reason ?? "—"}</td>
                      <td className="p-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => revoke(p.id)}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!loading && items.length > 0 && (
              <p className="text-xs text-muted-foreground pt-3">
                Total: {items.length} grant{items.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Grant a new permission ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
            Grant a new permission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>User</Label>
              <EntityCombobox
                value={form.userId || null}
                onChange={(id) => setForm({ ...form, userId: id ?? "" })}
                search={searchAdminUsersLookup}
                getById={getAdminUserByIdLookup}
                placeholder="Search users by name or email…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Scope</Label>
              <SimpleSelect
                value={form.scope}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    scope: v as Scope,
                    brandId: "",
                    vendorId: "",
                    productIds: [],
                  })
                }
                options={SCOPE_OPTIONS.map((s) => ({ label: s.label, value: s.value }))}
              />
              <p className="text-xs text-muted-foreground">{scopeMeta.help}</p>
            </div>

            {form.scope === "specific_brand" && (
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <EntityCombobox
                  value={form.brandId || null}
                  onChange={(id) => setForm({ ...form, brandId: id ?? "" })}
                  search={searchAdminBrandsLookup}
                  getById={getAdminBrandByIdLookup}
                  placeholder="Search brands…"
                />
              </div>
            )}

            {form.scope === "specific_vendor" && (
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <EntityCombobox
                  value={form.vendorId || null}
                  onChange={(id) => setForm({ ...form, vendorId: id ?? "" })}
                  search={searchAdminVendorsLookup}
                  getById={getAdminVendorByIdLookup}
                  placeholder="Search vendors…"
                />
              </div>
            )}

            {form.scope === "specific_products" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Products</Label>
                <EntityMultiCombobox
                  values={form.productIds}
                  onChange={(ids) => setForm({ ...form, productIds: ids })}
                  search={searchAdminProductsLookup}
                  getById={getAdminProductByIdLookup}
                  placeholder="Search products by name or SKU…"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Why is this being granted?"
              />
            </div>
          </div>

          <Button onClick={submit} disabled={busy} className="mt-4">
            {busy && <Loader2 className="mr-1.5 animate-spin" size={14} />}
            {busy ? "Granting…" : "Grant permission"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
