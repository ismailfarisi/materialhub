import { afterEach, describe, expect, test } from "bun:test";
import {
  PostimgGalleryError,
  expandPostimgGalleries,
  extractGalleryImageUrls,
  isPostimgGalleryUrl,
  listPostimgGalleryImages,
} from "../image-fetch.postimg-gallery.ts";

// A trimmed but structurally real gallery page: two cards. Each card has a
// thumbnail <img src> with one id and the full-res data-pswp-src with a
// DIFFERENT id — we must pick data-pswp-src. Card 2's URL carries an HTML
// entity (&amp;) to prove unescaping, and is duplicated to prove dedupe.
const GALLERY_HTML = `
<div class="col" data-image="THUMB1"><a data-pswp-src="https://i.postimg.cc/FULL1/a.jpg" href="https://postimg.cc/THUMB1"><img src="https://i.postimg.cc/THUMB1/a.jpg"></a></div>
<div class="col" data-image="THUMB2"><a data-pswp-src="https://i.postimg.cc/FULL2/b.jpg?x=1&amp;y=2" href="https://postimg.cc/THUMB2"><img src="https://i.postimg.cc/THUMB2/b.jpg"></a></div>
<div class="col"><a data-pswp-src="https://i.postimg.cc/FULL1/a.jpg"></a></div>
`;

describe("isPostimgGalleryUrl", () => {
  test("matches /gallery/{id}", () => {
    expect(isPostimgGalleryUrl("https://postimg.cc/gallery/S4qPzNn")).toBe("S4qPzNn");
  });
  test("matches http and trailing path/query", () => {
    expect(isPostimgGalleryUrl("http://postimg.cc/gallery/ABC?x=1")).toBe("ABC");
  });
  test("matches case-insensitive host/scheme", () => {
    expect(isPostimgGalleryUrl("HTTPS://PostImg.cc/gallery/ABC")).toBe("ABC");
  });
  test("returns null for single share page", () => {
    expect(isPostimgGalleryUrl("https://postimg.cc/ppqQzvH7")).toBeNull();
  });
  test("returns null for direct i.postimg.cc URL", () => {
    expect(isPostimgGalleryUrl("https://i.postimg.cc/FULL1/a.jpg")).toBeNull();
  });
  test("returns null for lookalike host", () => {
    expect(isPostimgGalleryUrl("https://postimg.cc.evil.example/gallery/ABC")).toBeNull();
  });
  test("returns null for junk", () => {
    expect(isPostimgGalleryUrl("not a url")).toBeNull();
  });
});

describe("extractGalleryImageUrls", () => {
  test("extracts data-pswp-src (full-res), not img thumbnails", () => {
    const urls = extractGalleryImageUrls(GALLERY_HTML);
    expect(urls).toEqual([
      "https://i.postimg.cc/FULL1/a.jpg",
      "https://i.postimg.cc/FULL2/b.jpg?x=1&y=2",
    ]);
  });
  test("returns empty array when no data-pswp-src present", () => {
    expect(extractGalleryImageUrls("<html><body>no images</body></html>")).toEqual([]);
  });
});

describe("listPostimgGalleryImages", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  function mockFetch(responder: () => Response | Promise<Response>): void {
    globalThis.fetch = (() => Promise.resolve(responder())) as unknown as typeof fetch;
  }

  test("happy path returns ordered direct URLs", async () => {
    mockFetch(() => new Response(GALLERY_HTML, { status: 200 }));
    const urls = await listPostimgGalleryImages("ABC");
    expect(urls).toEqual([
      "https://i.postimg.cc/FULL1/a.jpg",
      "https://i.postimg.cc/FULL2/b.jpg?x=1&y=2",
    ]);
  });
  test("404 → postimg_gallery_not_found", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    try {
      await listPostimgGalleryImages("MISSING");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PostimgGalleryError);
      expect((err as PostimgGalleryError).code).toBe("postimg_gallery_not_found");
    }
  });
  test("403 → postimg_gallery_inaccessible", async () => {
    mockFetch(() => new Response("", { status: 403 }));
    try {
      await listPostimgGalleryImages("PRIVATE");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PostimgGalleryError).code).toBe("postimg_gallery_inaccessible");
    }
  });
  test("500 → postimg_fetch_error", async () => {
    mockFetch(() => new Response("", { status: 500 }));
    try {
      await listPostimgGalleryImages("ABC");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PostimgGalleryError).code).toBe("postimg_fetch_error");
    }
  });
  test("network error → postimg_fetch_error", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    try {
      await listPostimgGalleryImages("ABC");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PostimgGalleryError).code).toBe("postimg_fetch_error");
    }
  });
  test("200 but no images → postimg_gallery_empty", async () => {
    mockFetch(() => new Response("<html>empty</html>", { status: 200 }));
    try {
      await listPostimgGalleryImages("EMPTY");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as PostimgGalleryError).code).toBe("postimg_gallery_empty");
    }
  });
  test("content-length exceeding cap → postimg_fetch_error", async () => {
    mockFetch(
      () =>
        new Response(GALLERY_HTML, {
          status: 200,
          headers: { "content-length": String(11 * 1024 * 1024) },
        }),
    );
    try {
      await listPostimgGalleryImages("TOO_BIG_HEADER");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PostimgGalleryError);
      expect((err as PostimgGalleryError).code).toBe("postimg_fetch_error");
    }
  });
  test("body exceeding cap mid-stream with no content-length → postimg_fetch_error", async () => {
    const bigBody = "x".repeat(11 * 1024 * 1024);
    mockFetch(() => new Response(bigBody, { status: 200 }));
    try {
      await listPostimgGalleryImages("TOO_BIG_STREAM");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PostimgGalleryError);
      expect((err as PostimgGalleryError).code).toBe("postimg_fetch_error");
    }
  });
});

describe("expandPostimgGalleries", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("passes through when no gallery URLs present", async () => {
    const urls = ["https://i.postimg.cc/FULL1/a.jpg", "https://cdn.example.com/x.jpg"];
    expect(await expandPostimgGalleries(urls)).toEqual(urls);
  });
  test("expands gallery URL in place, preserving position", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(GALLERY_HTML, { status: 200 }))) as unknown as typeof fetch;
    const urls = [
      "https://cdn.example.com/before.jpg",
      "https://postimg.cc/gallery/ABC",
      "https://cdn.example.com/after.jpg",
    ];
    expect(await expandPostimgGalleries(urls)).toEqual([
      "https://cdn.example.com/before.jpg",
      "https://i.postimg.cc/FULL1/a.jpg",
      "https://i.postimg.cc/FULL2/b.jpg?x=1&y=2",
      "https://cdn.example.com/after.jpg",
    ]);
  });
});
