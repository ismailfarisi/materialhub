import { api } from "../api";

export interface CreatorProfileSocialLinks {
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  other?: string | null;
}

export interface CreatorProfile {
  id: string;
  display_name: string;
  bio: string;
  /** Chosen at application time and not editable here — PATCH ignores it.
   *  Read-only on this type for that reason. */
  readonly primary_category: string;
  social_links: CreatorProfileSocialLinks;
}

export async function getMyCreatorProfile(): Promise<CreatorProfile | null> {
  const res = await api.get("/me/creator/application");
  return res.data.data as CreatorProfile | null;
}

export async function updateMyCreatorProfile(input: {
  display_name?: string;
  bio?: string;
  social_links?: CreatorProfileSocialLinks;
}): Promise<CreatorProfile> {
  const res = await api.patch("/me/creator/application", input);
  return res.data.data as CreatorProfile;
}

export async function presignAvatarUpload(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string }> {
  const res = await api.post("/me/creator/avatar/presign", {
    filename,
    content_type: contentType,
  });
  return res.data.data as { uploadUrl: string; key: string };
}

export async function finalizeAvatarUpload(key: string): Promise<{ avatar_url: string }> {
  const res = await api.post("/me/creator/avatar", { key });
  return res.data.data as { avatar_url: string };
}
