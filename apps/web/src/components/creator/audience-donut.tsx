"use client";

import type { CreatorMediaKitSegment } from "@/lib/api/creator-media-kit";

/**
 * The audience donut, drawn with one stroked circle per slice and a rotating
 * dash offset — no charting dependency for six numbers.
 *
 * Percentages are the creator's own and are not required to total 100, so the
 * ring is scaled by their sum and always closes. Leaving a real gap would read
 * as a rendering bug rather than as "these numbers don't add up".
 *
 * Kept identical in behaviour to the donut on the brand-facing media kit in the
 * vendor app, so the creator's page and the page a brand opens agree.
 */

/** Warm tints in donut order. Alpha steps fill in where the palette has no
 *  distinct sixth hue — adjacent slices stay separable either way. */
export const SEGMENT_COLORS = [
  "hsl(var(--nl-amber))",
  "hsl(var(--nl-russet))",
  "hsl(var(--nl-cacao))",
  "rgba(184,115,51,0.55)",
  "hsl(var(--nl-pearl))",
  "rgba(44,24,16,0.28)",
];

export function AudienceDonut({
  segments,
  size = 128,
}: {
  segments: CreatorMediaKitSegment[];
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.percent, 0);
  if (total <= 0) return null;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      viewBox="0 0 120 120"
      className="shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Audience split"
    >
      <title>Audience split</title>
      {segments.map((segment, i) => {
        const fraction = segment.percent / total;
        const dash = fraction * circumference;
        const element = (
          <circle
            key={segment.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
            strokeWidth="20"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            // Start at 12 o'clock rather than 3 o'clock.
            transform="rotate(-90 60 60)"
          />
        );
        offset += dash;
        return element;
      })}
    </svg>
  );
}
