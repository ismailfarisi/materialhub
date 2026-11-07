import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaManager, mediaErrorMessage } from "./MediaManager";
import type { MediaActions } from "./types";

function actions(overrides: Partial<MediaActions> = {}): MediaActions {
  const ok = vi.fn(async () => {});
  return {
    upload: ok,
    reorder: ok,
    remove: ok,
    updateAlt: ok,
    updateCrop: ok,
    replace: ok,
    assignVariant: ok,
    enhanceAi: vi.fn(async () => ({ kind: "no_change" as const })),
    acceptAi: ok,
    rejectAi: ok,
    revertAi: ok,
    ...overrides,
  };
}

describe("MediaManager upload errors", () => {
  it("shows a message when the upload fails instead of swallowing it", async () => {
    const upload = vi.fn(async () => {
      throw new Error("S3 PUT failed: 403");
    });
    const { container } = render(
      <MediaManager items={[]} isUploading={false} actions={actions({ upload })} />,
    );
    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const file = new File(["x"], "kraft.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalled());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/did not go through/i);
    expect(alert.textContent).not.toMatch(/S3 PUT/);
  });
});

describe("mediaErrorMessage", () => {
  it("prefers the API message", () => {
    expect(mediaErrorMessage({ response: { data: { message: "Maximum 10 images per product" } } })).toBe(
      "Maximum 10 images per product",
    );
  });

  it("passes through readable errors", () => {
    expect(mediaErrorMessage(new Error("kraft.png is over 50MB"))).toBe("kraft.png is over 50MB");
  });
});
