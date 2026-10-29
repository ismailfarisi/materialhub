import { api } from "../api";

export type CreatorPortfolioKind = "sample" | "intro";

export interface CreatorPortfolioVideo {
  id: string;
  user_id: string;
  kind: CreatorPortfolioKind;
  video_url: string;
  content_type: string;
  caption: string | null;
  created_at: string;
}

export interface CreatorPortfolio {
  intro: CreatorPortfolioVideo | null;
  samples: CreatorPortfolioVideo[];
}

export async function getMyPortfolio(): Promise<CreatorPortfolio> {
  const res = await api.get("/me/creator/portfolio/videos");
  return res.data.data as CreatorPortfolio;
}

export async function presignPortfolioVideo(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string }> {
  const res = await api.post("/me/creator/portfolio/videos/presign", {
    filename,
    content_type: contentType,
  });
  return res.data.data as { uploadUrl: string; key: string };
}

export async function finalizePortfolioVideo(
  key: string,
  kind: CreatorPortfolioKind,
  caption?: string | null,
): Promise<CreatorPortfolioVideo> {
  const res = await api.post("/me/creator/portfolio/videos", { key, kind, caption });
  return res.data.data as CreatorPortfolioVideo;
}

export async function deletePortfolioVideo(id: string): Promise<void> {
  await api.delete(`/me/creator/portfolio/videos/${id}`);
}
