/**
 * Local stand-in for Cloudflare Stream (dev only). Implements the slice of the
 * Stream API that reels-service and the web/vendor upload forms use:
 *
 *   POST   /client/v4/accounts/:acct/stream/direct_upload   -> one-time upload URL
 *   POST   /upload/:uid                                      -> browser multipart upload
 *   GET    /client/v4/accounts/:acct/stream/:uid             -> video object
 *   DELETE /client/v4/accounts/:acct/stream/:uid
 *   POST   /client/v4/accounts/:acct/stream/:uid/downloads   -> MP4 download link
 *   GET    /:uid/manifest/video.m3u8, /:uid/thumbnails/thumbnail.jpg, /:uid/downloads/default.mp4
 *
 * After an upload, ffmpeg transcodes to MP4 + HLS and grabs a thumbnail, then
 * the server sends a signed `webhook-signature` notification to reels-service,
 * same as Cloudflare. Everything lives under DATA_DIR/<uid>/.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 7071);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ACCOUNT_ID = process.env.ACCOUNT_ID ?? "local-dev";
const API_TOKEN = process.env.API_TOKEN ?? "local-dev-token";
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

const UID_RE = /^[a-f0-9]{32}$/;
const FILE_RE = /^[\w.-]+$/;

interface VideoRecord {
  uid: string;
  thumbnail: string;
  readyToStream: boolean;
  status: { state: string; pctComplete?: string; errReasonCode?: string; errReasonText?: string };
  meta: Record<string, string>;
  created: string;
  modified: string;
  uploadExpiry: string;
  maxDurationSeconds: number;
  duration: number;
  input: { width: number; height: number };
  playback: { hls: string; dash: string };
  preview: string;
  requireSignedURLs: boolean;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const cfError = (status: number, code: number, message: string) =>
  json({ success: false, errors: [{ code, message }], messages: [], result: null }, status);

const videoDir = (uid: string) => join(DATA_DIR, uid);
const recordFile = (uid: string) => join(videoDir(uid), "video.json");

async function loadRecord(uid: string): Promise<VideoRecord | null> {
  const file = Bun.file(recordFile(uid));
  return (await file.exists()) ? ((await file.json()) as VideoRecord) : null;
}

async function saveRecord(rec: VideoRecord): Promise<void> {
  rec.modified = new Date().toISOString();
  await Bun.write(recordFile(rec.uid), JSON.stringify(rec, null, 2));
}

async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${err.slice(-800)}`);
  return out;
}

async function sendWebhook(rec: VideoRecord): Promise<void> {
  if (!WEBHOOK_URL) return;
  const body = JSON.stringify(rec);
  const time = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WEBHOOK_SECRET) {
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${time}.${body}`).digest("hex");
    headers["Webhook-Signature"] = `time=${time},sig1=${sig}`;
  }
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers, body });
    console.log(`[webhook] ${rec.uid} ${rec.status.state} -> ${res.status}`);
  } catch (e) {
    // reels-service not running: its recovery job polls GET /stream/:uid instead.
    console.warn(`[webhook] ${rec.uid} -> ${WEBHOOK_URL} failed: ${(e as Error).message}`);
  }
}

async function fail(rec: VideoRecord, code: string, text: string): Promise<void> {
  rec.status = { state: "error", pctComplete: "0", errReasonCode: code, errReasonText: text };
  await saveRecord(rec);
  await sendWebhook(rec);
}

async function processUpload(rec: VideoRecord, inputPath: string): Promise<void> {
  const dir = videoDir(rec.uid);
  const mp4 = join(dir, "downloads", "default.mp4");
  await mkdir(join(dir, "downloads"), { recursive: true });
  await mkdir(join(dir, "manifest"), { recursive: true });
  await mkdir(join(dir, "thumbnails"), { recursive: true });

  try {
    // ffmpeg applies rotation metadata, so the probed size below is the
    // displayed size — the same thing Cloudflare reports in `input`.
    await run([
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "48",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      mp4,
    ]);
  } catch (e) {
    console.warn(`[process] ${rec.uid} transcode failed: ${(e as Error).message}`);
    await fail(rec, "ERR_NON_VIDEO", "The file was not recognized as a valid video file.");
    return;
  }

  const probe = JSON.parse(
    await run([
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      mp4,
    ]),
  ) as { streams?: Array<{ width: number; height: number }>; format?: { duration?: string } };
  const duration = Number(probe.format?.duration ?? 0);
  const { width = 0, height = 0 } = probe.streams?.[0] ?? {};

  rec.duration = duration;
  rec.input = { width, height };
  if (rec.maxDurationSeconds && duration > rec.maxDurationSeconds) {
    await fail(rec, "ERR_DURATION_EXCEED_CONSTRAINT", "Video exceeds maxDurationSeconds.");
    return;
  }

  await run([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-i",
    mp4,
    "-c",
    "copy",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    join(dir, "manifest", "seg_%03d.ts"),
    join(dir, "manifest", "video.m3u8"),
  ]);
  await run([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-ss",
    String(Math.min(1, duration / 2)),
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    join(dir, "thumbnails", "thumbnail.jpg"),
  ]);
  await rm(inputPath, { force: true });

  rec.readyToStream = true;
  rec.status = { state: "ready", pctComplete: "100.000000" };
  await saveRecord(rec);
  console.log(`[process] ${rec.uid} ready ${width}x${height} ${duration.toFixed(1)}s`);
  await sendWebhook(rec);
}

async function handleApi(req: Request, parts: string[]): Promise<Response> {
  // parts: ["client","v4","accounts",acct,"stream", ...rest]
  if (parts[3] !== ACCOUNT_ID || req.headers.get("authorization") !== `Bearer ${API_TOKEN}`) {
    return cfError(403, 10000, "Authentication error");
  }
  const rest = parts.slice(5);

  if (req.method === "POST" && rest.length === 1 && rest[0] === "direct_upload") {
    const body = (await req.json().catch(() => ({}))) as {
      maxDurationSeconds?: number;
      expiry?: string;
      meta?: Record<string, string>;
    };
    const uid = randomBytes(16).toString("hex");
    const now = new Date().toISOString();
    const base = `${PUBLIC_URL}/${uid}`;
    const rec: VideoRecord = {
      uid,
      thumbnail: `${base}/thumbnails/thumbnail.jpg`,
      readyToStream: false,
      status: { state: "pendingupload" },
      meta: body.meta ?? {},
      created: now,
      modified: now,
      uploadExpiry: body.expiry ?? new Date(Date.now() + 3600_000).toISOString(),
      maxDurationSeconds: body.maxDurationSeconds ?? 0,
      duration: -1,
      input: { width: -1, height: -1 },
      playback: { hls: `${base}/manifest/video.m3u8`, dash: `${base}/manifest/video.mpd` },
      preview: `${base}/watch`,
      requireSignedURLs: false,
    };
    await mkdir(videoDir(uid), { recursive: true });
    await saveRecord(rec);
    return json({
      success: true,
      errors: [],
      messages: [],
      result: { uid, uploadURL: `${PUBLIC_URL}/upload/${uid}` },
    });
  }

  const uid = rest[0];
  if (!uid || !UID_RE.test(uid)) return cfError(404, 10003, "Not Found");
  const rec = await loadRecord(uid);
  if (!rec) return cfError(404, 10003, "Not Found");

  if (rest.length === 1 && req.method === "GET") {
    return json({ success: true, errors: [], messages: [], result: rec });
  }
  if (rest.length === 1 && req.method === "DELETE") {
    await rm(videoDir(uid), { recursive: true, force: true });
    return json({ success: true, errors: [], messages: [], result: null });
  }
  if (
    rest.length === 2 &&
    rest[1] === "downloads" &&
    (req.method === "POST" || req.method === "GET")
  ) {
    const ready = rec.status.state === "ready";
    return json({
      success: true,
      errors: [],
      messages: [],
      result: {
        default: {
          status: ready ? "ready" : "inprogress",
          url: `${PUBLIC_URL}/${uid}/downloads/default.mp4`,
          percentComplete: ready ? 100 : 0,
        },
      },
    });
  }
  return cfError(405, 10000, "Method not allowed");
}

async function handleUpload(req: Request, uid: string): Promise<Response> {
  if (!UID_RE.test(uid)) return cfError(404, 10003, "Not Found");
  const rec = await loadRecord(uid);
  if (!rec) return cfError(404, 10003, "Not Found");
  if (rec.status.state !== "pendingupload") return cfError(400, 10005, "Upload URL already used");
  if (Date.parse(rec.uploadExpiry) < Date.now()) return cfError(400, 10005, "Upload URL expired");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return cfError(400, 10005, "Missing multipart field 'file'");

  const inputPath = join(videoDir(uid), "input");
  await Bun.write(inputPath, file);
  rec.status = { state: "inprogress", pctComplete: "0" };
  await saveRecord(rec);

  // Respond like Cloudflare (upload accepted), then process in the background.
  processUpload(rec, inputPath).catch((e) => {
    console.error(`[process] ${uid} crashed:`, e);
    fail(rec, "ERR_UNKNOWN", (e as Error).message).catch(() => {});
  });
  return new Response(null, { status: 200, headers: cors });
}

const CONTENT_TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

async function handleMedia(parts: string[]): Promise<Response> {
  const [uid, kind, file] = parts;
  if (
    !uid ||
    !UID_RE.test(uid) ||
    !file ||
    !FILE_RE.test(file) ||
    !["manifest", "thumbnails", "downloads"].includes(kind ?? "")
  ) {
    return new Response("Not Found", { status: 404, headers: cors });
  }
  const f = Bun.file(join(videoDir(uid), kind as string, file));
  if (!(await f.exists())) return new Response("Not Found", { status: 404, headers: cors });
  const ext = file.split(".").pop() ?? "";
  return new Response(f, {
    headers: { ...cors, "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
  });
}

Bun.serve({
  port: PORT,
  maxRequestBodySize: 1024 * 1024 * 1024,
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    try {
      if (
        parts[0] === "client" &&
        parts[1] === "v4" &&
        parts[2] === "accounts" &&
        parts[4] === "stream"
      ) {
        return await handleApi(req, parts);
      }
      if (parts[0] === "upload" && parts.length === 2 && req.method === "POST") {
        return await handleUpload(req, parts[1] as string);
      }
      if (parts.length === 3 && req.method === "GET") return await handleMedia(parts);
      if (parts.length === 0) return json({ ok: true, service: "local-stream" });
      return new Response("Not Found", { status: 404, headers: cors });
    } catch (e) {
      console.error(e);
      return cfError(500, 10002, (e as Error).message);
    }
  },
});

console.log(
  `local-stream listening on :${PORT} (public ${PUBLIC_URL}), webhook -> ${WEBHOOK_URL || "disabled"}`,
);
