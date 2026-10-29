"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { requestReelUpload } from "@/lib/api/reels";
import { uploadToCloudflareStream } from "@/lib/cloudflare-tus-upload";

const MAX_SIZE_MB = 200;
const ALLOWED_TYPES = ["video/mp4", "video/quicktime"];

export function ReelUploadForm() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "en";
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "complete">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum is ${MAX_SIZE_MB} MB.`);
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError("Only MP4 or MOV files are allowed.");
      setFile(null);
      return;
    }
    setError(null);
    setProgress(0);
    setFile(f);
  }

  async function startUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    setStage("uploading");
    try {
      const { uploadUrl, reelId } = await requestReelUpload();
      uploadToCloudflareStream({
        file,
        uploadUrl,
        onProgress: (p) => setProgress(p.percent),
        onSuccess: () => {
          setProgress(100);
          setStage("complete");
          router.push(`/${locale}/reels/edit/${reelId}`);
        },
        onError: (e) => {
          setError(e.message || "Upload failed");
          setBusy(false);
          setStage("idle");
        },
      });
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(
        err?.response?.data?.error ?? err?.message ?? "Upload failed",
      );
      setBusy(false);
      setStage("idle");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Post a Reel</h1>
      <p className="text-sm text-gray-600">
        Vertical video (9:16), 3–90 seconds, up to {MAX_SIZE_MB} MB. MP4 or MOV.
      </p>
      <input
        type="file"
        accept="video/mp4,video/quicktime"
        onChange={handleFileChange}
        disabled={busy}
        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-black file:text-white file:cursor-pointer"
      />
      {error && (
        <div className="text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}
      {file && !busy && (
        <button
          type="button"
          onClick={startUpload}
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors"
        >
          Upload
        </button>
      )}
      {busy && (
        <div className="space-y-2">
          {stage === "uploading" && (
            <>
              <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                <div
                  className="bg-black h-2 rounded transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm text-gray-600">Uploading… {progress}%</div>
            </>
          )}
          {stage === "complete" && (
            <div className="text-sm text-gray-600">
              Upload complete. Opening editor…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
