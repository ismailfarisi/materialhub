import { api } from "../api";

/** A headline figure. `value` is free text so "68K+" and "1.2M+" both work. */
export interface CreatorMediaKitStat {
  label: string;
  value: string;
}

/** An audience donut slice, or a top-locations row. */
export interface CreatorMediaKitSegment {
  label: string;
  percent: number;
}

export interface CreatorMediaKit {
  id: string;
  headline: string | null;
  pull_quote: string | null;
  about: string | null;
  location_label: string | null;
  collaboration_note: string | null;
  stats: CreatorMediaKitStat[];
  content_types: string[];
  audience: CreatorMediaKitSegment[];
  top_locations: CreatorMediaKitSegment[];
  /** Always true for anything saved through this editor — there is no draft
   *  state. Kept on the type because the server still returns the column, and
   *  a legacy kit saved before publishing was removed can still read false
   *  until its owner saves any section. */
  is_published: boolean;
}

export type CreatorMediaKitInput = Partial<Omit<CreatorMediaKit, "id" | "is_published">>;

/** Null until the creator has saved a kit for the first time. */
export async function getMyMediaKit(): Promise<CreatorMediaKit | null> {
  const res = await api.get("/me/creator/media-kit");
  return res.data.data as CreatorMediaKit | null;
}

/** Upsert. Fields left out keep their stored value, so a body carrying one
 *  section's fields is a safe partial save. Saving publishes: the server sets
 *  `is_published` itself and rejects it in the body. */
export async function saveMyMediaKit(input: CreatorMediaKitInput): Promise<CreatorMediaKit> {
  const res = await api.put("/me/creator/media-kit", input);
  return res.data.data as CreatorMediaKit;
}
