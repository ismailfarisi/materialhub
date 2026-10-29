import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DriveFolderError,
  buildDriveFileUrl,
  expandDriveFolders,
  isDriveFolderUrl,
  listDriveFolderImages,
  sortFilesByName,
} from "../image-fetch.drive-folder.ts";

describe("isDriveFolderUrl", () => {
  test("matches /drive/folders/{ID}", () => {
    expect(isDriveFolderUrl("https://drive.google.com/drive/folders/1AbC_def-123")).toBe(
      "1AbC_def-123",
    );
  });

  test("matches with trailing slash", () => {
    expect(isDriveFolderUrl("https://drive.google.com/drive/folders/ABC/")).toBe("ABC");
  });

  test("matches with query string", () => {
    expect(isDriveFolderUrl("https://drive.google.com/drive/folders/ABC?usp=sharing")).toBe("ABC");
  });

  test("matches case-insensitive scheme/host", () => {
    expect(isDriveFolderUrl("HTTPS://Drive.Google.com/drive/folders/ABC")).toBe("ABC");
  });

  test("returns null for per-file Drive URL", () => {
    expect(isDriveFolderUrl("https://drive.google.com/file/d/abc/view")).toBeNull();
  });

  test("returns null for static CDN URL", () => {
    expect(isDriveFolderUrl("https://cdn.example.com/img.jpg")).toBeNull();
  });

  test("returns null for lookalike host (subdomain attack)", () => {
    expect(isDriveFolderUrl("https://drive.google.com.evil.example/drive/folders/ABC")).toBeNull();
  });

  test("returns null for malformed URL", () => {
    expect(isDriveFolderUrl("not a url")).toBeNull();
  });
});

describe("buildDriveFileUrl", () => {
  test("returns lh3.googleusercontent.com URL with =w2000 size", () => {
    expect(buildDriveFileUrl("abc123")).toBe("https://lh3.googleusercontent.com/d/abc123=w2000");
  });
});

describe("sortFilesByName", () => {
  test("sorts alphabetically, case-insensitive", () => {
    const files = [
      { id: "1", name: "banana.jpg" },
      { id: "2", name: "Apple.jpg" },
      { id: "3", name: "cherry.jpg" },
    ];
    expect(sortFilesByName(files).map((f) => f.name)).toEqual([
      "Apple.jpg",
      "banana.jpg",
      "cherry.jpg",
    ]);
  });

  test("sorts numerically within strings", () => {
    const files = [
      { id: "1", name: "10-back.jpg" },
      { id: "2", name: "2-side.jpg" },
      { id: "3", name: "1-front.jpg" },
    ];
    expect(sortFilesByName(files).map((f) => f.name)).toEqual([
      "1-front.jpg",
      "2-side.jpg",
      "10-back.jpg",
    ]);
  });

  test("does not mutate input", () => {
    const files = [
      { id: "1", name: "b.jpg" },
      { id: "2", name: "a.jpg" },
    ];
    const snapshot = [...files];
    sortFilesByName(files);
    expect(files).toEqual(snapshot);
  });
});

describe("listDriveFolderImages", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  beforeEach(() => {
    fetchCalls = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(responder: (url: string) => Response | Promise<Response>): void {
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push({ url, init });
      return Promise.resolve(responder(url));
    }) as unknown as typeof fetch;
  }

  test("happy path: returns files from single page", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            files: [
              { id: "f1", name: "01.jpg" },
              { id: "f2", name: "02.jpg" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const files = await listDriveFolderImages("ABC", "test-key");
    expect(files).toEqual([
      { id: "f1", name: "01.jpg" },
      { id: "f2", name: "02.jpg" },
    ]);
  });

  test("query includes folder ID, MIME filter, and trashed=false", async () => {
    mockFetch(() => new Response(JSON.stringify({ files: [] }), { status: 200 }));

    await listDriveFolderImages("ABC", "test-key");
    expect(fetchCalls).toHaveLength(1);
    const url = fetchCalls[0]!.url;
    expect(url).toContain("googleapis.com/drive/v3/files");
    expect(url).toContain("key=test-key");
    expect(url).toContain("pageSize=1000");
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("'ABC' in parents");
    expect(decoded).toContain("mimeType contains 'image/'");
    expect(decoded).toContain("trashed=false");
  });

  test("paginates via nextPageToken", async () => {
    mockFetch((url) => {
      if (url.includes("pageToken=PAGE2")) {
        return new Response(JSON.stringify({ files: [{ id: "f3", name: "c.jpg" }] }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          files: [
            { id: "f1", name: "a.jpg" },
            { id: "f2", name: "b.jpg" },
          ],
          nextPageToken: "PAGE2",
        }),
        { status: 200 },
      );
    });

    const files = await listDriveFolderImages("ABC", "test-key");
    expect(files.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[1]!.url).toContain("pageToken=PAGE2");
  });

  test("HTTP 404 → DriveFolderError(drive_folder_not_found)", async () => {
    mockFetch(() => new Response("{}", { status: 404 }));
    try {
      await listDriveFolderImages("MISSING", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DriveFolderError);
      expect((err as DriveFolderError).code).toBe("drive_folder_not_found");
    }
  });

  test("HTTP 403 → DriveFolderError(drive_folder_inaccessible)", async () => {
    mockFetch(() => new Response("{}", { status: 403 }));
    try {
      await listDriveFolderImages("PRIVATE", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_folder_inaccessible");
    }
  });

  test("HTTP 429 → DriveFolderError(drive_api_error)", async () => {
    mockFetch(() => new Response("{}", { status: 429 }));
    try {
      await listDriveFolderImages("ABC", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_api_error");
    }
  });

  test("HTTP 500 → DriveFolderError(drive_api_error)", async () => {
    mockFetch(() => new Response("{}", { status: 500 }));
    try {
      await listDriveFolderImages("ABC", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_api_error");
    }
  });

  test("network error → DriveFolderError(drive_api_error)", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    try {
      await listDriveFolderImages("ABC", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_api_error");
    }
  });

  test("empty folder returns empty array (no error)", async () => {
    mockFetch(() => new Response(JSON.stringify({ files: [] }), { status: 200 }));
    const files = await listDriveFolderImages("EMPTY", "test-key");
    expect(files).toEqual([]);
  });

  test("malformed response (no files key) → drive_api_error", async () => {
    mockFetch(() => new Response(JSON.stringify({ kind: "drive#fileList" }), { status: 200 }));
    try {
      await listDriveFolderImages("ABC", "test-key");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_api_error");
    }
  });
});

describe("expandDriveFolders", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("passes through when no folder URLs present", async () => {
    const urls = ["https://cdn.example.com/a.jpg", "https://drive.google.com/file/d/x/view"];
    const out = await expandDriveFolders(urls, "test-key");
    expect(out).toEqual(urls);
  });

  test("expands folder URL in place, preserving position", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            files: [
              { id: "f2", name: "02-back.jpg" },
              { id: "f1", name: "01-front.jpg" },
            ],
          }),
          { status: 200 },
        ),
      )) as unknown as typeof fetch;

    const urls = [
      "https://cdn.example.com/before.jpg",
      "https://drive.google.com/drive/folders/ABC",
      "https://cdn.example.com/after.jpg",
    ];
    const out = await expandDriveFolders(urls, "test-key");
    expect(out).toEqual([
      "https://cdn.example.com/before.jpg",
      "https://lh3.googleusercontent.com/d/f1=w2000",
      "https://lh3.googleusercontent.com/d/f2=w2000",
      "https://cdn.example.com/after.jpg",
    ]);
  });

  test("null apiKey throws drive_api_not_configured", async () => {
    const urls = ["https://drive.google.com/drive/folders/ABC"];
    try {
      await expandDriveFolders(urls, null);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DriveFolderError).code).toBe("drive_api_not_configured");
    }
  });

  test("null apiKey is OK if no folder URLs present", async () => {
    const urls = ["https://cdn.example.com/a.jpg"];
    const out = await expandDriveFolders(urls, null);
    expect(out).toEqual(urls);
  });

  test("empty folder produces no URLs at that position", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ files: [] }), { status: 200 }),
      )) as unknown as typeof fetch;
    const urls = [
      "https://cdn.example.com/x.jpg",
      "https://drive.google.com/drive/folders/EMPTY",
      "https://cdn.example.com/y.jpg",
    ];
    const out = await expandDriveFolders(urls, "test-key");
    expect(out).toEqual(["https://cdn.example.com/x.jpg", "https://cdn.example.com/y.jpg"]);
  });
});
