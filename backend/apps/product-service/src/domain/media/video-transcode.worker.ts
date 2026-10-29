import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "@materialhub/config";
import { AppDataSource, ensureDatabase } from "@materialhub/database";
import type { MediaService } from "@materialhub/utils";
import { Worker } from "bullmq";
import { buildTranscodeArgs } from "./transcode-args.ts";

interface TranscodeJob {
  product_video_id: string;
  raw_key: string;
  strip_audio?: boolean;
  max_duration_seconds?: number;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (b) => {
      out += b.toString();
    });
    proc.stderr.on("data", (b) => {
      err += b.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Number.parseFloat(out.trim()))
        : reject(new Error(`ffprobe exited ${code}: ${err.slice(-200)}`)),
    );
  });
}

export interface VideoWorkerDeps {
  mediaService: MediaService;
}

export async function startVideoTranscodeWorker(deps: VideoWorkerDeps): Promise<Worker> {
  await ensureDatabase();

  const worker = new Worker(
    // Must match the queue name in container.ts. BullMQ rejects ':' in names.
    "media-video",
    async (job) => {
      const { product_video_id, raw_key, strip_audio, max_duration_seconds } =
        job.data as TranscodeJob;
      const workDir = join(tmpdir(), `video-${product_video_id}`);
      await mkdir(workDir, { recursive: true });
      const rawExt = raw_key.endsWith(".webm")
        ? ".webm"
        : raw_key.endsWith(".mov")
          ? ".mov"
          : ".mp4";
      const rawPath = join(workDir, `raw${rawExt}`);
      const mp4Path = join(workDir, "video.mp4");
      const posterPath = join(workDir, "poster.jpg");

      try {
        // 1. Pull raw
        const rawBuf = await deps.mediaService.downloadBuffer(raw_key);
        await writeFile(rawPath, rawBuf);

        // 2. ffprobe duration check (server-side, untrusted client)
        const duration = await probeDuration(rawPath);
        const maxDuration = max_duration_seconds ?? 30.5;
        if (duration > maxDuration)
          throw new Error(`video too long (${duration.toFixed(1)}s, max ${maxDuration}s)`);
        const durationSec = Math.max(1, Math.round(duration));

        // 3. Transcode to mp4
        await runFfmpeg(buildTranscodeArgs({ rawPath, mp4Path, stripAudio: strip_audio === true }));

        // 4. Poster frame
        await runFfmpeg([
          "-y",
          "-ss",
          "00:00:01",
          "-i",
          rawPath,
          "-frames:v",
          "1",
          "-q:v",
          "4",
          posterPath,
        ]);

        // 5. Upload to processed-video/{uuid}/
        const prefix = `processed-video/${product_video_id}`;
        const mp4Key = `${prefix}/video.mp4`;
        const posterKey = `${prefix}/poster.jpg`;
        await deps.mediaService.uploadBuffer(mp4Key, await readFile(mp4Path), "video/mp4");
        await deps.mediaService.uploadBuffer(posterKey, await readFile(posterPath), "image/jpeg");

        // 6. Update row
        await AppDataSource.query(
          `UPDATE product_videos
             SET status='ready', url=$1, poster_url=$2,
                 duration_seconds=$3, mime_type='video/mp4', updated_at=now()
             WHERE id=$4`,
          [
            deps.mediaService.getPublicUrl(mp4Key),
            deps.mediaService.getPublicUrl(posterKey),
            durationSec,
            product_video_id,
          ],
        );

        // 7. Raw cleanup deferred to S3 lifecycle policy (avoid prefix-delete sweeping siblings).
      } catch (err) {
        await AppDataSource.query(
          `UPDATE product_videos SET status='failed', updated_at=now() WHERE id=$1`,
          [product_video_id],
        );
        throw err;
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    {
      connection: { url: config.bullmq.redisUrl },
      // ffmpeg is CPU-bound — keep concurrency low (image-fetch worker is 10 because it's I/O-bound)
      concurrency: 2,
    },
  );

  worker.on("error", (e) => console.error("[video-transcode-worker]", e));
  return worker;
}
