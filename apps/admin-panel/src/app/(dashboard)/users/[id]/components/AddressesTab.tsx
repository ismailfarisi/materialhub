"use client";

import {
  type AdminUserAddress,
  useDeleteUserAddress,
  useUpdateUserAddress,
  useUserAddresses,
} from "@/lib/queries/users";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from "@materialhub/ui";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

const TYPE_OPTIONS = [
  { label: "Shipping", value: "shipping" },
  { label: "Billing", value: "billing" },
  { label: "Both", value: "both" },
];

// The entity stores first_name/last_name; the customer API's `full_name`/`street`
// aliases are inbound-only, so admin reads and writes the canonical columns.
function recipientOf(a: AdminUserAddress) {
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
}

function cityLine(a: AdminUserAddress) {
  return [a.city, a.state].filter(Boolean).join(", ") || "—";
}

// Building/apartment/floor are separate columns the customer app collects;
// collapse them into one line so couriers read them the way they're written.
function unitLine(a: AdminUserAddress) {
  const parts = [
    a.building_name,
    a.apartment && `Apt ${a.apartment}`,
    a.floor && `Floor ${a.floor}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// user_addresses declares these NOT NULL, and the admin DTO types them as
// t.Optional(t.String()) — which in Elysia means "absent", never null. Sending
// null for an emptied input is a VALIDATION 400 the user can do nothing with,
// so these are required here and reported by name.
const REQUIRED_TEXT_FIELDS = {
  label: "Label",
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  address_line_1: "Address line 1",
  city: "City",
  country_code: "Country",
} as const;

// Nullable columns, typed t.Optional(t.Union([t.String(), t.Null()])) in the
// DTO. Clearing one genuinely means "unset it", so an empty input becomes null.
const NULLABLE_TEXT_FIELDS: readonly string[] = [
  "address_line_2",
  "building_name",
  "apartment",
  "floor",
  "state",
  "postal_code",
  "delivery_notes",
];

type FormState = {
  label: string;
  type: string;
  first_name: string;
  last_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  building_name: string;
  apartment: string;
  floor: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  delivery_notes: string;
  is_default: boolean;
};

function toForm(a: AdminUserAddress): FormState {
  return {
    label: a.label ?? "",
    type: a.type ?? "shipping",
    first_name: a.first_name ?? "",
    last_name: a.last_name ?? "",
    phone: a.phone ?? "",
    address_line_1: a.address_line_1 ?? "",
    address_line_2: a.address_line_2 ?? "",
    building_name: a.building_name ?? "",
    apartment: a.apartment ?? "",
    floor: a.floor ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    postal_code: a.postal_code ?? "",
    country_code: a.country_code ?? "AE",
    delivery_notes: a.delivery_notes ?? "",
    is_default: a.is_default,
  };
}

export function AddressesTab({ userId }: { userId: string }) {
  const { data: addresses, isLoading } = useUserAddresses(userId);
  const { mutate: updateAddress, isPending: saving } = useUpdateUserAddress(userId);
  const { mutate: deleteAddress, isPending: deleting } = useDeleteUserAddress(userId);

  const [editing, setEditing] = useState<AdminUserAddress | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserAddress | null>(null);

  function openEdit(address: AdminUserAddress) {
    setEditing(address);
    setForm(toForm(address));
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
  }

  function handleSave() {
    if (!editing || !form) return;

    const blank = Object.entries(REQUIRED_TEXT_FIELDS)
      .filter(([key]) => form[key as keyof FormState].toString().trim() === "")
      .map(([, label]) => label);
    if (blank.length > 0) {
      toast({
        title: blank.length === 1 ? "A required field is empty" : "Required fields are empty",
        description: `${blank.join(", ")} cannot be blank.`,
        variant: "destructive",
      });
      return;
    }

    // Send only what actually changed so we don't clobber concurrent edits.
    const original = toForm(editing);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      if (form[key] !== original[key]) {
        const value = form[key];
        const clearedNullable =
          typeof value === "string" && value.trim() === "" && NULLABLE_TEXT_FIELDS.includes(key);
        patch[key] = clearedNullable ? null : value;
      }
    }

    if (Object.keys(patch).length === 0) {
      closeEdit();
      return;
    }

    updateAddress(
      { addressId: editing.id, patch: patch as Partial<AdminUserAddress> },
      {
        onSuccess: () => {
          toast({ title: "Address updated" });
          closeEdit();
        },
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.response?.data?.message ?? "Failed to update address.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteAddress(confirmDelete.id, {
      onSuccess: () => {
        toast({ title: "Address deleted" });
        setConfirmDelete(null);
      },
      onError: (err: any) =>
        toast({
          title: "Error",
          description: err?.response?.data?.message ?? "Failed to delete address.",
          variant: "destructive",
        }),
    });
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!addresses || addresses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
          <MapPin size={22} className="text-taupe" />
          <p className="text-sm text-taupe">This user has no saved addresses.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addresses.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-taupe" />
                  <span className="text-sm font-semibold text-cacao">
                    {a.label || "Address"}
                  </span>
                  {a.is_default && (
                    <Badge className="bg-amber/15 text-amber text-[10px]">Default</Badge>
                  )}
                  <Badge className="bg-pearl/100 text-taupe text-[10px] capitalize">
                    {a.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Edit address"
                    onClick={() => openEdit(a)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    aria-label="Delete address"
                    onClick={() => setConfirmDelete(a)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-0.5 text-sm text-cacao">
                <p className="font-medium">{recipientOf(a)}</p>
                <p>{a.address_line_1 || "—"}</p>
                {a.address_line_2 && <p>{a.address_line_2}</p>}
                {unitLine(a) && <p className="text-taupe">{unitLine(a)}</p>}
                <p>{cityLine(a)}</p>
                <p className="text-taupe">
                  {[a.postal_code, a.country_code].filter(Boolean).join(" · ") || "—"}
                </p>
                {a.phone && (
                  <p className="text-taupe flex items-center gap-1.5">
                    {a.phone}
                    {a.phone_verified ? (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">Verified</Badge>
                    ) : (
                      <Badge className="bg-pearl/100 text-taupe text-[10px]">Unverified</Badge>
                    )}
                  </p>
                )}
              </div>

              {a.delivery_notes && (
                <p className="mt-2 text-xs text-taupe italic">{a.delivery_notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit address</DialogTitle>
            <DialogDescription>
              Changes are recorded in the audit log against this user. A phone set
              here is not OTP-verified.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addr-label">Label</Label>
                <Input
                  id="addr-label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id="addr-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-first">First name</Label>
                <Input
                  id="addr-first"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-last">Last name</Label>
                <Input
                  id="addr-last"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="addr-phone">Phone</Label>
                <Input
                  id="addr-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="addr-line1">Address line 1</Label>
                <Input
                  id="addr-line1"
                  value={form.address_line_1}
                  onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="addr-line2">Address line 2</Label>
                <Input
                  id="addr-line2"
                  value={form.address_line_2}
                  onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="addr-building">Building name</Label>
                <Input
                  id="addr-building"
                  value={form.building_name}
                  onChange={(e) => setForm({ ...form, building_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-apartment">Apartment</Label>
                <Input
                  id="addr-apartment"
                  value={form.apartment}
                  onChange={(e) => setForm({ ...form, apartment: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-floor">Floor</Label>
                <Input
                  id="addr-floor"
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-city">City</Label>
                <Input
                  id="addr-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-state">Emirate / State</Label>
                <Input
                  id="addr-state"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-postal">Postal code</Label>
                <Input
                  id="addr-postal"
                  value={form.postal_code}
                  onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-country">Country code</Label>
                <Input
                  id="addr-country"
                  maxLength={2}
                  value={form.country_code}
                  onChange={(e) =>
                    setForm({ ...form, country_code: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="addr-notes">Delivery notes</Label>
                <Textarea
                  id="addr-notes"
                  rows={2}
                  value={form.delivery_notes}
                  onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-cacao">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                />
                Set as default address
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this address?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.label || "This address"} will be removed from the customer's
              account. This is a soft delete and is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
