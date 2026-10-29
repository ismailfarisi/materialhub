import { type Static, Type } from "@sinclair/typebox";

export const RegisterVendorBody = Type.Object({
  business_name: Type.String({ minLength: 1, maxLength: 255 }),
  business_type: Type.String({ maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  contact_email: Type.String({ format: "email" }),
  contact_phone: Type.String({ maxLength: 20 }),
  trade_license_number: Type.Optional(Type.String({ maxLength: 100 })),
  vat_number: Type.Optional(Type.String({ maxLength: 50 })),
  website_url: Type.Optional(Type.String({ maxLength: 512 })),
  return_policy: Type.Optional(Type.String()),
  shipping_policy: Type.Optional(Type.String()),
});
export type RegisterVendorBody = Static<typeof RegisterVendorBody>;

export const UpdateVendorBody = Type.Partial(RegisterVendorBody);
export type UpdateVendorBody = Static<typeof UpdateVendorBody>;

export const VendorListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  is_featured: Type.Optional(Type.Boolean()),
  search: Type.Optional(Type.String()),
  sort_by: Type.Optional(Type.String({ default: "created_at" })),
  sort_order: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
});
export type VendorListQuery = Static<typeof VendorListQuery>;

export const AdminCreateVendorBody = Type.Object({
  user: Type.Object({
    first_name: Type.String({ minLength: 1, maxLength: 100 }),
    last_name: Type.String({ minLength: 1, maxLength: 100 }),
    email: Type.String({ format: "email" }),
    phone: Type.String({ maxLength: 20 }),
    password: Type.String({ minLength: 8 }),
  }),
  vendor: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.Optional(Type.String()),
    business_name: Type.String({ minLength: 1, maxLength: 255 }),
    business_type: Type.Optional(Type.String({ maxLength: 100 })),
    contact_email: Type.String({ format: "email" }),
    contact_phone: Type.String({ maxLength: 20 }),
    whatsapp: Type.Optional(Type.String({ maxLength: 20 })),
    website_url: Type.Optional(Type.String({ maxLength: 512 })),
    trade_license_number: Type.Optional(Type.String({ maxLength: 100 })),
    vat_number: Type.Optional(Type.String({ maxLength: 50 })),
    vat_registered: Type.Optional(Type.Boolean()),
    address: Type.Optional(
      Type.Object({
        street: Type.Optional(Type.String()),
        city: Type.Optional(Type.String()),
        emirate: Type.Optional(Type.String()),
        country: Type.Optional(Type.String()),
      }),
    ),
    social_links: Type.Optional(Type.Record(Type.String(), Type.String())),
    commission_type: Type.Optional(
      Type.Union([Type.Literal("percentage"), Type.Literal("fixed"), Type.Literal("tiered")]),
    ),
    commission_value: Type.Optional(Type.Number({ minimum: 0 })),
    commission_tiers: Type.Optional(
      Type.Array(
        Type.Object({
          min_amount: Type.Number(),
          max_amount: Type.Number(),
          rate: Type.Number(),
        }),
      ),
    ),
    payout_schedule: Type.Optional(Type.String()),
    minimum_payout: Type.Optional(Type.Number({ minimum: 0 })),
    processing_time_days: Type.Optional(Type.Number({ minimum: 0 })),
    auto_approve_orders: Type.Optional(Type.Boolean()),
    meta_title: Type.Optional(Type.String({ maxLength: 255 })),
    meta_description: Type.Optional(Type.String({ maxLength: 500 })),
  }),
  documents: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.String(),
        file_url: Type.String(),
        file_name: Type.String(),
        file_size: Type.Optional(Type.Number()),
        mime_type: Type.Optional(Type.String()),
        expiry_date: Type.Optional(Type.String({ format: "date" })),
      }),
    ),
  ),
  bank_account: Type.Optional(
    Type.Object({
      account_holder_name: Type.String(),
      bank_name: Type.String(),
      account_number: Type.String(),
      iban: Type.Optional(Type.String()),
      swift_code: Type.Optional(Type.String()),
      routing_number: Type.Optional(Type.String()),
      currency: Type.Optional(Type.String()),
    }),
  ),
});
export type AdminCreateVendorBody = Static<typeof AdminCreateVendorBody>;

export const AdminUpdateVendorBody = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.String(),
    logo_url: Type.Union([Type.String({ maxLength: 1024 }), Type.Null()]),
    banner_url: Type.Union([Type.String({ maxLength: 1024 }), Type.Null()]),
    business_name: Type.String({ maxLength: 255 }),
    business_type: Type.String({ maxLength: 100 }),
    contact_email: Type.String({ format: "email" }),
    contact_phone: Type.String({ maxLength: 20 }),
    whatsapp: Type.String({ maxLength: 20 }),
    website_url: Type.String({ maxLength: 512 }),
    trade_license_number: Type.String({ maxLength: 100 }),
    vat_number: Type.String({ maxLength: 50 }),
    vat_registered: Type.Boolean(),
    address: Type.Object({
      street: Type.Optional(Type.String()),
      city: Type.Optional(Type.String()),
      emirate: Type.Optional(Type.String()),
      country: Type.Optional(Type.String()),
    }),
    social_links: Type.Record(Type.String(), Type.String()),
    cover_images: Type.Array(Type.String()),
    commission_type: Type.Union([
      Type.Literal("percentage"),
      Type.Literal("fixed"),
      Type.Literal("tiered"),
    ]),
    commission_value: Type.Number({ minimum: 0 }),
    commission_tiers: Type.Array(
      Type.Object({
        min_amount: Type.Number(),
        max_amount: Type.Number(),
        rate: Type.Number(),
      }),
    ),
    payout_schedule: Type.String(),
    minimum_payout: Type.Number({ minimum: 0 }),
    auto_approve_orders: Type.Boolean(),
    processing_time_days: Type.Number({ minimum: 0 }),
    return_policy: Type.String(),
    shipping_policy: Type.String(),
    is_featured: Type.Boolean(),
    featured_until: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    meta_title: Type.String({ maxLength: 255 }),
    meta_description: Type.String({ maxLength: 500 }),
  }),
);
export type AdminUpdateVendorBody = Static<typeof AdminUpdateVendorBody>;

export const AdminUploadDocumentBody = Type.Object({
  type: Type.String(),
  file_url: Type.String(),
  file_name: Type.String(),
  file_size: Type.Optional(Type.Number()),
  mime_type: Type.Optional(Type.String()),
  expiry_date: Type.Optional(Type.String({ format: "date" })),
});
export type AdminUploadDocumentBody = Static<typeof AdminUploadDocumentBody>;

export const AdminUpdateDocumentBody = Type.Partial(
  Type.Object({
    file_url: Type.String(),
    file_name: Type.String(),
    file_size: Type.Number(),
    mime_type: Type.String(),
    expiry_date: Type.String({ format: "date" }),
  }),
);
export type AdminUpdateDocumentBody = Static<typeof AdminUpdateDocumentBody>;
