import { type Static, Type } from "@sinclair/typebox";

/**
 * A creator's self-authored media kit. Every list is capped here as well as in
 * the service and by a CHECK constraint on the table — the caps are what keeps
 * the vendor-facing page a fixed, designed layout rather than an arbitrary feed.
 */

const Stat = Type.Object({
  label: Type.String({ minLength: 1, maxLength: 40 }),
  // Free text, not a number: a creator writes "68K+" or "1.2M+", and the page
  // sets whatever they typed in display type.
  value: Type.String({ minLength: 1, maxLength: 20 }),
});
export type CreatorMediaKitStat = Static<typeof Stat>;

const Segment = Type.Object({
  label: Type.String({ minLength: 1, maxLength: 60 }),
  percent: Type.Number({ minimum: 0, maximum: 100 }),
});
export type CreatorMediaKitSegment = Static<typeof Segment>;

const nullableString = (maxLength: number) =>
  Type.Optional(Type.Union([Type.String({ maxLength }), Type.Null()]));

export const CreatorMediaKitBody = Type.Object({
  headline: nullableString(120),
  pull_quote: nullableString(160),
  about: nullableString(2000),
  location_label: nullableString(120),
  collaboration_note: nullableString(1000),
  stats: Type.Optional(Type.Array(Stat, { maxItems: 4 })),
  content_types: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 8 }),
  ),
  audience: Type.Optional(Type.Array(Segment, { maxItems: 6 })),
  top_locations: Type.Optional(Type.Array(Segment, { maxItems: 6 })),
  // No `is_published`: there is no draft state. Saving publishes, and the
  // service sets the flag itself, so accepting it here would only let a caller
  // hide a kit through a door the UI no longer has.
});
export type CreatorMediaKitBody = Static<typeof CreatorMediaKitBody>;
