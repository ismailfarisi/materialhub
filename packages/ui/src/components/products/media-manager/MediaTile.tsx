"use client";

import { ArrowsLeftRight, ArrowsOutSimple, Crop, Sparkle, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import type { Capability, MediaItem } from "./types";

interface Props {
  item: MediaItem;
  selected: boolean;
  caps: Partial<Record<Capability, boolean>>;
  on: {
    select: (e: React.MouseEvent) => void;
    expand: () => void;
    crop: () => void;
    replace: () => void;
    enhance: () => void;
    delete: () => void;
    saveAlt: (txt: string) => void;
    revertAi: () => void;
  };
  variantLabel?: string;
}

function ToolButton({
  label,
  icon,
  onClick,
  destructive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] uppercase tracking-wide transition-colors",
        destructive
          ? "text-red-200 hover:bg-red-500/20 hover:text-red-100"
          : "text-linen/90 hover:bg-white/15 hover:text-linen",
      )}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

export function MediaTile({ item, selected, caps, on, variantLabel }: Props) {
  const isImage = item.kind === "image";
  const isPrimary = item.sort_order === 0;
  const altText = isImage ? (item.alt_text ?? "") : "";
  const [altEditing, setAltEditing] = useState(false);
  const [altDraft, setAltDraft] = useState(altText);

  return (
    <div
      className={cn(
        "relative group aspect-square rounded-lg overflow-hidden bg-linen border transition-all shadow-sm",
        selected
          ? "border-amber ring-2 ring-amber/40 shadow-md"
          : "border-pearl/40 hover:border-pearl hover:shadow-md",
      )}
      onClick={on.select}
      onDoubleClick={() => on.expand()}
      onKeyDown={(e) => {
        if (e.key === "Enter") on.expand();
      }}
      aria-label={isImage ? `Image ${item.id}` : `Video ${item.id}`}
      aria-selected={selected}
    >
      {isImage ? (
        <img
          src={item.medium_url ?? item.thumbnail_url ?? item.url}
          alt={altText}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <>
          <img
            src={item.poster_url}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-cacao/60 backdrop-blur flex items-center justify-center">
              <div className="w-0 h-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-linen ml-1" />
            </div>
          </div>
          <div className="absolute bottom-1 right-1 text-[10px] bg-cacao/70 text-linen px-1.5 py-0.5 rounded-sm">
            {Math.floor(item.duration_seconds / 60)}:
            {String(item.duration_seconds % 60).padStart(2, "0")}
          </div>
          {item.status === "processing" && (
            <div className="absolute inset-0 bg-cacao/70 flex items-center justify-center text-xs text-linen">
              Transcoding…
            </div>
          )}
          {item.status === "failed" && (
            <div className="absolute inset-0 bg-russet/80 flex items-center justify-center text-xs text-linen">
              Failed
            </div>
          )}
        </>
      )}

      {isPrimary && (
        <div className="absolute top-2 left-2 bg-amber text-espresso text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
          Primary
        </div>
      )}

      {isImage && item.ai_source_image_id && (
        <button
          type="button"
          title="Enhanced with AI — click to revert"
          aria-label="Revert AI enhancement"
          className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cacao/70 text-linen text-[10px] hover:bg-cacao"
          onClick={(e) => {
            e.stopPropagation();
            on.revertAi();
          }}
        >
          <Sparkle size={10} weight="fill" />
          AI
        </button>
      )}

      {variantLabel && (
        <div className="absolute bottom-1 left-1 text-[10px] bg-cacao/70 text-linen px-1.5 py-0.5 rounded-sm max-w-[70%] truncate">
          {variantLabel}
        </div>
      )}

      {/* Hover toolbar */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform bg-gradient-to-t from-cacao/95 via-cacao/80 to-cacao/0 backdrop-blur flex justify-around items-end pt-3 pb-1.5">
        {caps.upload !== false && (
          <ToolButton
            label="Expand"
            icon={<ArrowsOutSimple size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              on.expand();
            }}
          />
        )}
        {isImage && caps.updateCrop !== false && (
          <ToolButton
            label="Crop"
            icon={<Crop size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              on.crop();
            }}
          />
        )}
        {caps.replace !== false && (
          <ToolButton
            label="Replace"
            icon={<ArrowsLeftRight size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              on.replace();
            }}
          />
        )}
        {isImage && caps.enhanceAi !== false && (
          <ToolButton
            label="AI"
            icon={<Sparkle size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              on.enhance();
            }}
          />
        )}
        {caps.remove !== false && (
          <ToolButton
            label="Delete"
            destructive
            icon={<Trash size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              on.delete();
            }}
          />
        )}
      </div>

      {isImage && (
        <div
          className="absolute -bottom-7 left-0 right-0 text-[11px] text-taupe"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {altEditing ? (
            <input
              ref={(el) => el?.focus()}
              value={altDraft}
              maxLength={125}
              onChange={(e) => setAltDraft(e.target.value)}
              onBlur={() => {
                setAltEditing(false);
                if (altDraft !== altText) on.saveAlt(altDraft);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full bg-transparent border-b border-pearl outline-none focus:border-amber text-cacao"
            />
          ) : (
            <button
              type="button"
              className="w-full text-left truncate hover:text-cacao transition-colors"
              onClick={() => setAltEditing(true)}
            >
              {altText || <span className="text-taupe/60 italic">Add alt text</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
