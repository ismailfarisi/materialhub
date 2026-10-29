"use client";

import { useRef, useState, type DragEvent } from "react";
import { X, UploadSimple, Spinner, DotsSixVertical } from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

interface UploadedImage {
  id: string;
  url: string;
  alt?: string;
}

interface ImageUploaderProps {
  images: UploadedImage[];
  onUpload: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  maxImages?: number;
  isUploading?: boolean;
}

export function ImageUploader({
  images,
  onUpload,
  onRemove,
  onReorder,
  maxImages = 10,
  isUploading = false,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const canUploadMore = images.length < maxImages;

  const handleFiles = (files: FileList | null) => {
    if (!files || !canUploadMore) return;
    const allowed = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, maxImages - images.length);
    if (allowed.length > 0) onUpload(allowed);
  };

  // Dropzone drag events
  const handleDropzoneDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDropzoneDragLeave = () => setIsDragOver(false);
  const handleDropzoneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // Thumbnail drag-to-reorder
  const handleThumbDragStart = (id: string) => setDraggedId(id);
  const handleThumbDragOver = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleThumbDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const ids = images.map((img) => img.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedId);
    onReorder(reordered);
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleThumbDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-3">
      {/* Thumbnail grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleThumbDragStart(img.id)}
              onDragOver={(e) => handleThumbDragOver(e, img.id)}
              onDrop={(e) => handleThumbDrop(e, img.id)}
              onDragEnd={handleThumbDragEnd}
              className={cn(
                "relative group aspect-square rounded-lg border-2 overflow-hidden bg-stone-50 cursor-grab",
                dragOverId === img.id && draggedId !== img.id
                  ? "border-primary border-dashed"
                  : "border-stone-200",
                draggedId === img.id && "opacity-50"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? "Product image"}
                className="w-full h-full object-cover"
                draggable={false}
              />

              {/* Drag handle overlay */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DotsSixVertical className="w-4 h-4 text-white drop-shadow" />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                className={cn(
                  "absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white",
                  "flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
                  "hover:bg-red-600 focus:outline-none"
                )}
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone / Add button */}
      {canUploadMore && (
        <div
          onDragOver={handleDropzoneDragOver}
          onDragLeave={handleDropzoneDragLeave}
          onDrop={handleDropzoneDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
            "py-8 px-4 cursor-pointer transition-colors",
            isDragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-500",
            isUploading && "pointer-events-none opacity-60"
          )}
        >
          {isUploading ? (
            <Spinner className="w-6 h-6 animate-spin" />
          ) : (
            <UploadSimple className="w-6 h-6" />
          )}
          <p className="text-sm font-medium">
            {isUploading
              ? "Uploading..."
              : isDragOver
                ? "Drop images here"
                : "Click or drag images to upload"}
          </p>
          <p className="text-xs">
            {images.length} / {maxImages} images
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isUploading}
          />
        </div>
      )}
    </div>
  );
}
