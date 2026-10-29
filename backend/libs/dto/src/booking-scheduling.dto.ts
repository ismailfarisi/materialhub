import { type Static, Type } from "@sinclair/typebox";

const Jsonb = Type.Record(Type.String(), Type.Unknown());

// ─── Vendor locations (branches) ───────────────────────────────────────
export const CreateVendorLocationBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  address: Type.Optional(Type.Union([Jsonb, Type.Null()])),
  lat: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  lng: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  area_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  timezone: Type.Optional(Type.String({ maxLength: 64 })),
  is_active: Type.Optional(Type.Boolean()),
  // Per-branch overrides (payment defaults, cancellation/reschedule policy, hours).
  settings: Type.Optional(Jsonb),
});
export type CreateVendorLocationBody = Static<typeof CreateVendorLocationBody>;

export const UpdateVendorLocationBody = Type.Partial(CreateVendorLocationBody);
export type UpdateVendorLocationBody = Static<typeof UpdateVendorLocationBody>;

// ─── Service areas (home-visit coverage) ───────────────────────────────
export const CreateServiceAreaBody = Type.Object({
  area_id: Type.String({ format: "uuid" }),
  travel_buffer_minutes: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type CreateServiceAreaBody = Static<typeof CreateServiceAreaBody>;

// ─── Staff ─────────────────────────────────────────────────────────────
export const CreateStaffMemberBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  user_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  avatar_url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  bio: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  is_active: Type.Optional(Type.Boolean()),
});
export type CreateStaffMemberBody = Static<typeof CreateStaffMemberBody>;

export const UpdateStaffMemberBody = Type.Partial(CreateStaffMemberBody);
export type UpdateStaffMemberBody = Static<typeof UpdateStaffMemberBody>;

export const LinkStaffLocationBody = Type.Object({
  vendor_location_id: Type.String({ format: "uuid" }),
});
export type LinkStaffLocationBody = Static<typeof LinkStaffLocationBody>;

export const LinkStaffServiceBody = Type.Object({
  service_offering_id: Type.String({ format: "uuid" }),
});
export type LinkStaffServiceBody = Static<typeof LinkStaffServiceBody>;

// ─── Working hours + time-off ──────────────────────────────────────────
const TimeOfDay = Type.String({ pattern: "^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$" });

export const WorkingHoursBody = Type.Object({
  location_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  day_of_week: Type.Integer({ minimum: 0, maximum: 6 }),
  start_time: TimeOfDay,
  end_time: TimeOfDay,
  effective_from: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  effective_to: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type WorkingHoursBody = Static<typeof WorkingHoursBody>;

export const TimeOffBody = Type.Object({
  starts_at: Type.String(),
  ends_at: Type.String(),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type TimeOffBody = Static<typeof TimeOffBody>;
