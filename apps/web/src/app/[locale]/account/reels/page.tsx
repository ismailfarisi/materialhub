"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyReels, type MyReelSummary } from "@/lib/api/reels";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const STATUS_BADGE: Record<
  MyReelSummary["status"],
  { label: string; color: string; bg: string }
> = {
  draft: {
    label: "Draft",
    color: "hsl(var(--nl-russet))",
    bg: "rgba(44,24,16,0.05)",
  },
  pending_review: {
    label: "In review",
    color: "hsl(var(--nl-amber))",
    bg: "rgba(184,115,51,0.08)",
  },
  approved: {
    label: "Published",
    color: "#3f6f4a",
    bg: "rgba(63,111,74,0.08)",
  },
  rejected: {
    label: "Rejected",
    color: "#9a3b3b",
    bg: "rgba(154,59,59,0.08)",
  },
  removed: {
    label: "Removed",
    color: "#9a3b3b",
    bg: "rgba(154,59,59,0.08)",
  },
};

const TAG_BASE = {
  fontFamily: MAISON_SANS,
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  padding: "3px 8px",
};

export default function MyReelsPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const [items, setItems] = useState<MyReelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyReels({ limit: 50 })
      .then((res) => {
        if (!cancelled) {
          setItems(res.items);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const err = e as {
            response?: { data?: { error?: string } };
            message?: string;
          };
          setError(
            err?.response?.data?.error ?? err?.message ?? "Failed to load reels",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <Eyebrow>REELS</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            My Reels
          </SerifTitle>
        </div>
        <Link
          href={`/${locale}/reels/upload`}
          className="inline-block uppercase shrink-0"
          style={{
            background: "hsl(var(--nl-amber))",
            color: "hsl(var(--nl-espresso))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "13px 30px",
            border: "none",
            borderRadius: 0,
          }}
        >
          Post a reel
        </Link>
      </div>

      {loading && (
        <div
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          Loading…
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 13,
            color: "#9a3b3b",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          You haven&apos;t posted any reels yet.{" "}
          <Link
            href={`/${locale}/reels/upload`}
            className="underline"
            style={{ color: "hsl(var(--nl-amber))" }}
          >
            Post your first reel
          </Link>
          .
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const canEdit = r.status === "draft";
            const href = canEdit
              ? `/${locale}/reels/edit/${r.id}`
              : `/${locale}/reels/${r.id}`;
            return (
              <li
                key={r.id}
                className="flex items-center gap-4 p-3 transition-colors"
                style={{
                  border: "1px solid rgba(44,24,16,0.10)",
                  background: "rgba(44,24,16,0.02)",
                }}
              >
                <Link href={href} className="flex items-center gap-4 flex-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    className="w-20 h-32 object-cover shrink-0"
                    style={{ background: "rgba(44,24,16,0.07)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span
                        style={{
                          ...TAG_BASE,
                          color: badge.color,
                          background: badge.bg,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 11,
                          color: "hsl(var(--nl-russet))",
                        }}
                      >
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div
                      className="line-clamp-2"
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 15,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {r.caption || (
                        <em style={{ color: "hsl(var(--nl-russet))" }}>
                          No caption
                        </em>
                      )}
                    </div>
                    {r.status === "rejected" && r.rejection_reason && (
                      <div
                        className="mt-1"
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 11,
                          color: "#9a3b3b",
                        }}
                      >
                        Reason: {r.rejection_reason}
                      </div>
                    )}
                    <div
                      className="mt-1"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 11,
                        color: "hsl(var(--nl-russet))",
                      }}
                    >
                      {r.tags?.length ?? 0} tag
                      {(r.tags?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                      {r.video_duration_seconds}s
                    </div>
                  </div>
                </Link>
                {canEdit && (
                  <Link
                    href={`/${locale}/reels/edit/${r.id}`}
                    className="inline-block uppercase shrink-0"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(44,24,16,0.4)",
                      color: "hsl(var(--nl-cacao))",
                      fontFamily: MAISON_SANS,
                      fontSize: 11,
                      letterSpacing: "0.22em",
                      padding: "9px 20px",
                      borderRadius: 0,
                    }}
                  >
                    Edit
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
