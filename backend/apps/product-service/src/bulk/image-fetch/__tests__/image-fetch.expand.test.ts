import { afterEach, describe, expect, test } from "bun:test";
import { expandSourceUrls } from "../image-fetch.expand.ts";

const GALLERY_HTML = `<a data-pswp-src="https://i.postimg.cc/G1/a.jpg"></a><a data-pswp-src="https://i.postimg.cc/G2/b.jpg"></a>`;

describe("expandSourceUrls", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("passes plain URLs through untouched (no Drive key needed)", async () => {
    const urls = ["https://cdn.example.com/x.jpg", "https://i.postimg.cc/D/direct.jpg"];
    expect(await expandSourceUrls(urls, { googleDriveApiKey: null })).toEqual(urls);
  });

  test("expands a pipe-mixed cell: plain + Drive folder + postimg gallery, in order", async () => {
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("googleapis.com")) {
        return Promise.resolve(
          new Response(JSON.stringify({ files: [{ id: "df1", name: "01.jpg" }] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(GALLERY_HTML, { status: 200 }));
    }) as unknown as typeof fetch;

    const urls = [
      "https://cdn.example.com/plain.jpg",
      "https://drive.google.com/drive/folders/ABC",
      "https://postimg.cc/gallery/XYZ",
    ];
    expect(await expandSourceUrls(urls, { googleDriveApiKey: "k" })).toEqual([
      "https://cdn.example.com/plain.jpg",
      "https://lh3.googleusercontent.com/d/df1=w2000",
      "https://i.postimg.cc/G1/a.jpg",
      "https://i.postimg.cc/G2/b.jpg",
    ]);
  });

  test("propagates a postimg gallery failure un-swallowed", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 404 }))) as unknown as typeof fetch;

    await expect(
      expandSourceUrls(["https://postimg.cc/gallery/X"], { googleDriveApiKey: null }),
    ).rejects.toMatchObject({ code: "postimg_gallery_not_found" });
  });
});
