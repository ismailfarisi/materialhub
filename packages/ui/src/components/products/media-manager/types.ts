export interface ImageMediaItem {
  kind: "image";
  id: string;
  url: string;
  thumbnail_url?: string | null;
  card_url?: string | null;
  medium_url?: string | null;
  alt_text?: string | null;
  sort_order: number;
  width?: number | null;
  height?: number | null;
  focal_x?: number | null;
  focal_y?: number | null;
  variant_id?: string | null;
  ai_source_image_id?: string | null;
  is_primary?: boolean;
}

export interface VideoMediaItem {
  kind: "video";
  id: string;
  url: string;
  webm_url?: string | null;
  poster_url: string;
  duration_seconds: number;
  sort_order: number;
  variant_id?: string | null;
  status: "processing" | "ready" | "failed";
  width?: number | null;
  height?: number | null;
}

export type MediaItem = ImageMediaItem | VideoMediaItem;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FocalPoint {
  x: number;
  y: number;
}

export interface MediaActions {
  upload: (files: File[]) => Promise<void>;
  reorder: (
    items: Array<{ id: string; kind: "image" | "video"; sort_order: number }>,
  ) => Promise<void>;
  remove: (ids: Array<{ id: string; kind: "image" | "video" }>) => Promise<void>;
  updateAlt: (id: string, alt_text: string) => Promise<void>;
  updateCrop: (
    id: string,
    crop: CropRect,
    focal: FocalPoint | null,
    rotation?: number,
  ) => Promise<void>;
  replace: (id: string, file: File) => Promise<void>;
  assignVariant: (
    item: { id: string; kind: "image" | "video" },
    variant_id: string | null,
  ) => Promise<void>;
  enhanceAi: (
    id: string,
  ) => Promise<
    { kind: "candidate"; candidate_id: string; preview_url: string } | { kind: "no_change" }
  >;
  acceptAi: (originalId: string, candidate_id: string) => Promise<void>;
  rejectAi: (originalId: string, candidate_id: string) => Promise<void>;
  revertAi: (enhancedId: string) => Promise<void>;
}

export type Capability = keyof MediaActions;

export interface MediaManagerProps {
  items: MediaItem[];
  variants?: { id: string; name: string }[];
  isUploading: boolean;
  maxItems?: number;
  actions: MediaActions;
  capabilities?: Partial<Record<Capability, boolean>>;
}
