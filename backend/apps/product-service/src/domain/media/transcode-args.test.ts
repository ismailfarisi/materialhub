import { describe, expect, test } from "bun:test";
import { buildTranscodeArgs } from "./transcode-args.ts";

describe("buildTranscodeArgs", () => {
  test("keeps AAC audio by default (product videos have sound)", () => {
    const args = buildTranscodeArgs({ rawPath: "/in.mp4", mp4Path: "/out.mp4" });
    expect(args).toContain("-acodec");
    expect(args).toContain("aac");
    expect(args).not.toContain("-an");
  });

  test("strips audio when asked (layout background videos are muted)", () => {
    const args = buildTranscodeArgs({ rawPath: "/in.mp4", mp4Path: "/out.mp4", stripAudio: true });
    expect(args).toContain("-an");
    expect(args).not.toContain("-acodec");
    expect(args).not.toContain("aac");
  });

  test("preserves the H.264 profile and faststart in both modes", () => {
    for (const stripAudio of [false, true]) {
      const args = buildTranscodeArgs({ rawPath: "/in.mp4", mp4Path: "/out.mp4", stripAudio });
      expect(args).toContain("libx264");
      expect(args).toContain("+faststart");
      expect(args).toContain("scale='min(1080,iw)':-2");
      expect(args[args.length - 1]).toBe("/out.mp4");
    }
  });
});
