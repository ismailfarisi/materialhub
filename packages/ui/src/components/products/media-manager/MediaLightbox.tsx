"use client";

import { ArrowsOut, CaretLeft, CaretRight, Info, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "./types";

interface Props {
  items: MediaItem[];
  startIndex: number;
  onClose: () => void;
  onRevertAi?: (id: string) => void;
}

export function MediaLightbox({ items, startIndex, onClose, onRevertAi }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const rootRef = useRef<HTMLDialogElement>(null);

  const item = items[idx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && zoom === 1) setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight" && zoom === 1)
        setIdx((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else rootRef.current?.requestFullscreen?.();
      } else if (e.key === "i" || e.key === "I") setShowInfo((v) => !v);
      else if (e.key === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, items.length, onClose]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.max(1, Math.min(4, zoom + (e.deltaY < 0 ? 0.2 : -0.2)));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  }

  if (!item) return null;

  return (
    <dialog
      ref={rootRef}
      open
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none bg-espresso/95 text-linen flex p-0 border-0"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="flex-1 relative flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={onWheel}
        role="presentation"
      >
        {item.kind === "image" ? (
          <img
            src={item.url}
            alt={item.alt_text ?? ""}
            className="max-h-[90vh] max-w-[90vw] object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            }}
            draggable={false}
          />
        ) : (
          <video
            src={item.url}
            poster={item.poster_url}
            controls
            autoPlay
            muted
            className="max-h-[90vh] max-w-[90vw]"
          >
            <track kind="captions" />
          </video>
        )}

        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Toggle info"
            className="p-2 rounded-full bg-linen/10 hover:bg-linen/20 transition-colors"
          >
            <Info size={18} />
          </button>
          <button
            type="button"
            onClick={() => rootRef.current?.requestFullscreen?.()}
            aria-label="Fullscreen"
            className="p-2 rounded-full bg-linen/10 hover:bg-linen/20 transition-colors"
          >
            <ArrowsOut size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full bg-linen/10 hover:bg-linen/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {idx > 0 && (
          <button
            type="button"
            onClick={() => setIdx(idx - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-linen/10 hover:bg-linen/20 rounded-full transition-colors"
            aria-label="Previous"
          >
            <CaretLeft size={24} />
          </button>
        )}
        {idx < items.length - 1 && (
          <button
            type="button"
            onClick={() => setIdx(idx + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-linen/10 hover:bg-linen/20 rounded-full transition-colors"
            aria-label="Next"
          >
            <CaretRight size={24} />
          </button>
        )}
      </div>

      {showInfo && (
        <div
          className="w-80 bg-espresso border-l border-linen/10 p-4 text-sm space-y-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div>
            <span className="text-linen/60">Kind:</span> {item.kind}
          </div>
          {item.kind === "image" && (
            <>
              <div>
                <span className="text-linen/60">Dimensions:</span> {item.width}×{item.height}
              </div>
              <div>
                <span className="text-linen/60">Alt text:</span> {item.alt_text ?? "—"}
              </div>
              {item.ai_source_image_id && onRevertAi && (
                <button
                  type="button"
                  onClick={() => onRevertAi(item.id)}
                  className="text-amber hover:text-caramel underline-offset-2 hover:underline"
                >
                  Revert AI enhancement
                </button>
              )}
            </>
          )}
          {item.kind === "video" && (
            <div>
              <span className="text-linen/60">Duration:</span> {item.duration_seconds}s
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
