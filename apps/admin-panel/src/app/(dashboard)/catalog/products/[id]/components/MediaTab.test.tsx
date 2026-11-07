import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const { presign, m } = vi.hoisted(() => ({
  presign: vi.fn(),
  m: () => ({ mutateAsync: async () => ({}), isPending: false }),
}));
vi.mock("@/lib/s3-upload-client", () => ({
  s3UploadClient: { presign: (...a: unknown[]) => presign(...a), putToS3: vi.fn(), processAsset: vi.fn() },
}));

vi.mock("@/lib/queries/media", () => ({
  useProductMedia: () => ({ data: [] }),
  useAcceptAi: m,
  useCropImage: m,
  useDeleteVideo: m,
  useEnhanceImage: m,
  usePresignVideo: m,
  useProcessVideo: m,
  useRejectAi: m,
  useReorderMedia: m,
  useReplaceImage: m,
  useRevertAi: m,
  useUpdateImage: m,
}));

import { MediaTab } from "./MediaTab";

describe("admin product MediaTab", () => {
  test("a failed presign (S3 not configured) shows a message instead of throwing", async () => {
    // What axios rejects with for the API's 500.
    presign.mockRejectedValue(
      Object.assign(new Error("Request failed with status code 500"), {
        isAxiosError: true,
        response: { status: 500, data: { statusCode: 500, message: "Internal server error" } },
      }),
    );
    const processImage = vi.fn();
    const { container } = render(
      <MediaTab product={{ id: "p1" }} editing processImage={processImage} deleteImage={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "greyboard.png", { type: "image/png" })] } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBeTruthy();
    expect(processImage).not.toHaveBeenCalled();
  });

  test("view mode has no upload dropzone", () => {
    const { container } = render(
      <MediaTab product={{ id: "p1" }} editing={false} processImage={vi.fn()} deleteImage={vi.fn()} />,
    );
    expect(container.querySelector('input[type="file"][multiple]')).toBeNull();
    expect(screen.getByText(/Select Edit to add/)).toBeTruthy();
  });
});
