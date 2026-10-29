import { describe, expect, test } from "bun:test";
import { ImageFetchError, normalizeImageUrl } from "../image-fetch.downloader.ts";

describe("ImageFetchError", () => {
  test("carries a code", () => {
    const err = new ImageFetchError("x", "y");
    expect(err.code).toBe("x");
  });
});

describe("normalizeImageUrl", () => {
  test("rewrites drive.google.com /file/d/{id}/view share URLs", () => {
    expect(
      normalizeImageUrl(
        "https://drive.google.com/file/d/1u-NEyeAkcip0ft4TxCaULqeElY_oO_-3/view?usp=sharing",
      ),
    ).toBe("https://lh3.googleusercontent.com/d/1u-NEyeAkcip0ft4TxCaULqeElY_oO_-3=w2000");
  });

  test("rewrites /file/d/{id}/view with no query string", () => {
    expect(normalizeImageUrl("https://drive.google.com/file/d/abc123/view")).toBe(
      "https://lh3.googleusercontent.com/d/abc123=w2000",
    );
  });

  test("rewrites drive.google.com /uc?export=download&id={id}", () => {
    expect(normalizeImageUrl("https://drive.google.com/uc?export=download&id=abc123")).toBe(
      "https://lh3.googleusercontent.com/d/abc123=w2000",
    );
  });

  test("rewrites drive.google.com /open?id={id}", () => {
    expect(normalizeImageUrl("https://drive.google.com/open?id=abc123")).toBe(
      "https://lh3.googleusercontent.com/d/abc123=w2000",
    );
  });

  test("leaves non-drive URLs unchanged", () => {
    expect(normalizeImageUrl("https://example.com/foo.png")).toBe("https://example.com/foo.png");
  });

  test("does not match a host that merely starts with drive.google.com", () => {
    expect(normalizeImageUrl("https://drive.google.com.evil.example/file/d/abc/view")).toBe(
      "https://drive.google.com.evil.example/file/d/abc/view",
    );
  });
});
