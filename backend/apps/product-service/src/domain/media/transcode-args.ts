/**
 * ffmpeg args for the shared transcode. Extracted from the worker so the
 * audio/no-audio branch is unit-testable without running ffmpeg.
 */
export function buildTranscodeArgs(input: {
  rawPath: string;
  mp4Path: string;
  stripAudio?: boolean;
}): string[] {
  return [
    "-y",
    "-i",
    input.rawPath,
    "-vcodec",
    "libx264",
    "-profile:v",
    "main",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-vf",
    "scale='min(1080,iw)':-2",
    "-movflags",
    "+faststart",
    ...(input.stripAudio ? ["-an"] : ["-acodec", "aac", "-b:a", "128k"]),
    input.mp4Path,
  ];
}
