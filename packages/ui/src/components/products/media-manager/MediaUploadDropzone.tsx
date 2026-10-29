"use client";

import { Spinner, UploadSimple } from "@phosphor-icons/react";
import { type DragEvent, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

interface Props {
  isUploading: boolean;
  remaining: number;
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

const ACCEPTED = "image/jpeg,image/png,image/webp,video/mp4,video/webm";

async function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => reject(new Error("Cannot read video"));
    v.src = URL.createObjectURL(file);
  });
}

export function MediaUploadDropzone({ isUploading, remaining, onFiles, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || remaining <= 0) return;
    setError(null);
    const accepted: File[] = [];
    for (const f of Array.from(list).slice(0, remaining)) {
      if (f.type.startsWith("image/")) {
        accepted.push(f);
        continue;
      }
      if (f.type.startsWith("video/")) {
        if (f.size > 50 * 1024 * 1024) {
          setError(`${f.name} is over 50MB`);
          continue;
        }
        try {
          const dur = await probeVideoDuration(f);
          if (dur > 30.5) {
            setError(`${f.name} is ${Math.round(dur)}s — must be ≤30s`);
            continue;
          }
        } catch {
          setError(`Cannot read ${f.name}`);
          continue;
        }
        accepted.push(f);
      }
    }
    if (accepted.length > 0) onFiles(accepted);
  }

  return (
    <div>
      <button
        type="button"
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "w-full rounded-lg border border-dashed cursor-pointer transition-all duration-200",
          compact ? "py-3 px-4" : "py-10 px-6",
          "flex flex-col items-center justify-center gap-1.5",
          over
            ? "border-amber bg-amber/10 text-cacao"
            : "border-pearl text-taupe hover:border-cacao/40 hover:bg-pearl/20 bg-linen",
          isUploading && "pointer-events-none opacity-60",
        )}
      >
        {isUploading ? (
          <Spinner className="w-5 h-5 animate-spin" />
        ) : (
          <UploadSimple className="w-5 h-5" />
        )}
        <p className="text-sm font-medium text-cacao">
          {isUploading ? "Uploading…" : "Drop images or video, or click to browse"}
        </p>
        <p className="text-xs text-taupe">
          JPG, PNG, WebP, MP4, WebM · video ≤30s, ≤50MB · {remaining} slots left
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </button>
      {error && (
        <p className="text-xs text-russet mt-1.5 flex items-center gap-1.5">
          <span className="inline-block w-1 h-1 rounded-full bg-russet" /> {error}
        </p>
      )}
    </div>
  );
}
