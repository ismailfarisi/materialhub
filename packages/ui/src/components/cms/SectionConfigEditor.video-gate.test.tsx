/**
 * Pins the `editorial_post` exclusion.
 *
 * `BannerBlockEditor` is shared by three section types and the video field is
 * opt-in via `allowVideo`. `EditorialPostEditor` delegates to
 * `PromotionalBannerEditor` *without* it, which is a single missing prop — easy
 * to "tidy up" into existence later, and nothing else would notice.
 */
import { render, screen } from "@testing-library/react";
import type { AxiosInstance } from "axios";
import { describe, expect, test, vi } from "vitest";
import type { S3UploadClient } from "../../hooks/use-s3-upload";
import { SectionConfigEditor } from "./SectionConfigEditor";

const s3Client = {
  presign: vi.fn(),
  putToS3: vi.fn(),
  processAsset: vi.fn(),
  presignLayoutVideo: vi.fn(),
  processLayoutVideo: vi.fn(),
  getLayoutVideo: vi.fn(),
  deleteLayoutVideo: vi.fn(),
} as unknown as S3UploadClient;

const bannerBlock = {
  id: "block-1",
  type: "banner",
  data: {
    image: {
      desktop: { url: "https://cdn/desktop.jpg" },
      mobile: { url: "" },
      focal_point: { x: 0.5, y: 0.5 },
      alt: { en: "", ar: "" },
    },
    title: { en: "", ar: "" },
    cta_text: { en: "", ar: "" },
    cta_link: "",
  },
};

function renderSection(sectionTypeName: string) {
  return render(
    <SectionConfigEditor
      apiClient={{} as AxiosInstance}
      sectionTypeName={sectionTypeName}
      sourceMode="manual"
      settings={{}}
      blocks={[bannerBlock]}
      dataSource={{}}
      bidConfig={{}}
      s3Client={s3Client}
      onSettingsChange={vi.fn()}
      onBlocksChange={vi.fn()}
      onDataSourceChange={vi.fn()}
      onBidConfigChange={vi.fn()}
    />,
  );
}

describe("SectionConfigEditor — background video gate", () => {
  test("hero_carousel offers the background video field", () => {
    renderSection("hero_carousel");
    expect(screen.getByTestId("video-file-input")).toBeInTheDocument();
    expect(screen.getByText(/background video \(optional\)/i)).toBeInTheDocument();
  });

  test("promotional_banner offers the background video field", () => {
    renderSection("promotional_banner");
    expect(screen.getByTestId("video-file-input")).toBeInTheDocument();
    expect(screen.getByText(/background video \(optional\)/i)).toBeInTheDocument();
  });

  test("editorial_post does not — it shares the block editor but is out of scope", () => {
    renderSection("editorial_post");
    // The images it does share are still there, so this is a real exclusion and
    // not an empty render.
    expect(screen.getByText(/desktop image/i)).toBeInTheDocument();
    expect(screen.queryByTestId("video-file-input")).toBeNull();
    expect(screen.queryByText(/background video \(optional\)/i)).toBeNull();
  });
});
