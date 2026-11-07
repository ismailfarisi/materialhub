"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { MediaAiMenu } from "./MediaAiMenu";
import { MediaBulkBar } from "./MediaBulkBar";
import { MediaCropModal } from "./MediaCropModal";
import { MediaGrid } from "./MediaGrid";
import { MediaLightbox } from "./MediaLightbox";
import { MediaUploadDropzone } from "./MediaUploadDropzone";
import type { ImageMediaItem, MediaItem, MediaManagerProps } from "./types";

type PendingDelete = { id: string; kind: "image" | "video" }[];

/**
 * Readable text for a failed media action. API errors carry `message`; a
 * failed storage PUT or network drop only gives noise, so it becomes one
 * plain sentence.
 */
export function mediaErrorMessage(err: unknown, action = "upload"): string {
  const apiMessage = (err as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  const raw = err instanceof Error ? err.message : "";
  if (!raw || /s3|upload failed|network|failed to fetch|load failed|status code \d+/i.test(raw)) {
    return `The ${action} did not go through. Check your connection and try again; if it keeps failing, uploads may be unavailable right now.`;
  }
  return raw;
}

export function MediaManager({
  items,
  variants,
  isUploading,
  maxItems = 20,
  actions,
  capabilities = {},
}: MediaManagerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastAnchor, setLastAnchor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [cropFor, setCropFor] = useState<ImageMediaItem | null>(null);
  const [aiFor, setAiFor] = useState<ImageMediaItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const remaining = Math.max(0, maxItems - items.length);

  const onSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.metaKey || e.ctrlKey) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setLastAnchor(id);
        } else if (e.shiftKey && lastAnchor) {
          const ids = items.map((i) => i.id);
          const a = ids.indexOf(lastAnchor);
          const b = ids.indexOf(id);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) {
              const idAt = ids[i];
              if (idAt) next.add(idAt);
            }
          }
        } else {
          next.clear();
          next.add(id);
          setLastAnchor(id);
        }
        return next;
      });
    },
    [items, lastAnchor],
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const onActions = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      return {
        expand: () => setLightbox(items.findIndex((i) => i.id === id)),
        crop: () => {
          if (item?.kind === "image") setCropFor(item);
        },
        replace: () => {
          replaceTarget.current = id;
          fileInputRef.current?.click();
        },
        enhance: () => {
          if (item?.kind === "image") setAiFor(item);
        },
        delete: () => {
          if (item) setPendingDelete([{ id, kind: item.kind }]);
        },
        saveAlt: (txt: string) => void actions.updateAlt(id, txt),
        revertAi: () => void actions.revertAi(id),
      };
    },
    [items, actions],
  );

  const onReorder = useCallback(
    (ids: string[]) => {
      const map = new Map(items.map((i) => [i.id, i]));
      const payload = ids
        .map((id, idx) => {
          const it = map.get(id);
          return it ? { id, kind: it.kind, sort_order: idx } : null;
        })
        .filter(
          (x): x is { id: string; kind: "image" | "video"; sort_order: number } => x !== null,
        );
      void actions.reorder(payload);
    },
    [items, actions],
  );

  const onDeleteSelected = useCallback(() => {
    const payload: PendingDelete = items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, kind: i.kind as "image" | "video" }));
    if (payload.length === 0) return;
    setPendingDelete(payload);
  }, [items, selected]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    await actions.remove(pendingDelete);
    if (pendingDelete.length > 1) setSelected(new Set());
    setPendingDelete(null);
  }, [pendingDelete, actions]);

  const deleteSummary = (() => {
    if (!pendingDelete) return { title: "", desc: "" };
    if (pendingDelete.length === 1) {
      const target: MediaItem | undefined = items.find((i) => i.id === pendingDelete[0]?.id);
      const noun = target?.kind === "video" ? "video" : "image";
      return {
        title: `Delete ${noun}?`,
        desc: `This will permanently remove the ${noun} from the product. This cannot be undone.`,
      };
    }
    return {
      title: `Delete ${pendingDelete.length} items?`,
      desc: "Selected images and videos will be permanently removed from the product. This cannot be undone.",
    };
  })();

  return (
    <fieldset
      className="space-y-4 border-0 p-0 m-0"
      onKeyDown={(e) => {
        if (e.key === "Escape") clearSelection();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          setSelected(new Set(items.map((i) => i.id)));
        }
      }}
    >
      {capabilities.upload === false ? null : (
        <MediaUploadDropzone
          compact={items.length > 0}
          isUploading={isUploading}
          remaining={remaining}
          onFiles={async (files) => {
            setError(null);
            try {
              await actions.upload(files);
            } catch (err) {
              setError(mediaErrorMessage(err));
            }
          }}
        />
      )}

      {error ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 text-xs underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {items.length > 0 && (
        <MediaGrid
          items={items}
          selected={selected}
          caps={capabilities}
          variants={variants}
          onReorder={onReorder}
          onSelect={onSelect}
          onActions={onActions}
        />
      )}

      <MediaBulkBar count={selected.size} onDelete={onDeleteSelected} onClear={clearSelection} />

      {lightbox !== null && (
        <MediaLightbox
          items={items}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
          onRevertAi={(id) => void actions.revertAi(id)}
        />
      )}

      <MediaCropModal
        open={cropFor !== null}
        item={cropFor}
        onClose={() => setCropFor(null)}
        onSave={async (crop, focal, rotation) => {
          if (cropFor) await actions.updateCrop(cropFor.id, crop, focal, rotation);
        }}
      />

      <MediaAiMenu
        open={aiFor !== null}
        item={aiFor}
        onClose={() => setAiFor(null)}
        onEnhance={(id) => actions.enhanceAi(id)}
        onAccept={(originalId, candidateId) => actions.acceptAi(originalId, candidateId)}
        onReject={(originalId, candidateId) => actions.rejectAi(originalId, candidateId)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteSummary.title}
        description={deleteSummary.desc}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replaceTarget.current) {
            const target = replaceTarget.current;
            replaceTarget.current = null;
            e.target.value = "";
            setError(null);
            actions.replace(target, f).catch((err) => setError(mediaErrorMessage(err, "replacement")));
          }
        }}
      />
    </fieldset>
  );
}
