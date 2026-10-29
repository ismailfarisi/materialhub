"use client";

import { InviteToCollabModal } from "@/components/creator-content/InviteToCollabModal";
import { creatorDisplayName } from "@/lib/creator-display-name";
import {
  type CreatorMediaKit,
  type MediaKitSegment,
  useCreatorMediaKit,
} from "@/lib/queries/creator-content";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

/**
 * A creator's media kit — the detail view behind a card on /creators.
 *
 * Two things shape this page:
 *
 * 1. No contact route. The payload carries no handles and no email (the
 *    backend never selects them), so the only way off this page toward the
 *    creator is "Invite to collab". That is the product decision, not an
 *    oversight — do not add a mailto or a social row here later.
 *
 * 2. Every figure is the creator's own claim. Followers, engagement, audience
 *    split and locations are typed into a form by the creator; the platform
 *    measures none of them. The stats band says so out loud, because a vendor
 *    budgeting against these numbers deserves to know what they are.
 *
 * The vendor dashboard loads no display font, so the serif here is a local
 * stack that lands on Georgia almost everywhere rather than a global font
 * dependency added for one page.
 */
const SERIF = "'Antic Didone', 'Playfair Display', Georgia, 'Times New Roman', serif";

/** Warm tints from the MaterialHub UAE palette, in donut order. */
const SEGMENT_COLORS = [
  "hsl(var(--nl-russet))",
  "hsl(var(--nl-caramel))",
  "hsl(var(--nl-taupe))",
  "hsl(var(--nl-amber))",
  "hsl(var(--nl-pearl))",
  "hsl(var(--nl-linen))",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.22em] text-cacao/70">
      {children}
      <span className="mt-1.5 block h-px w-8 bg-russet/50" />
    </h2>
  );
}

/**
 * Audience donut.
 *
 * Drawn with one stroked circle per slice and a rotating dash offset, so it
 * needs no charting dependency. Percentages are the creator's own and are not
 * required to total 100 — the ring is scaled by their sum so it always closes,
 * rather than leaving a gap that would read as a rendering bug.
 */
function AudienceDonut({ segments }: { segments: MediaKitSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.percent, 0);
  if (total <= 0) return null;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" role="img" aria-label="Audience split">
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

function StatBand({ kit }: { kit: CreatorMediaKit }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>My statistics</SectionLabel>
        {/* Said plainly: these are claims, not measurements. */}
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Self-reported by the creator
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {kit.stats.map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-5 text-center">
            <div className="text-2xl text-cacao" style={{ fontFamily: SERIF }}>
              {stat.value}
            </div>
            <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CreatorMediaKitPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data: kit, isLoading, isError } = useCreatorMediaKit(id);
  const [inviting, setInviting] = useState(false);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  if (isError || !kit) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          This creator is no longer listed in the directory.
        </p>
        <Link href="/creators" className="mt-2 inline-block text-sm text-russet underline">
          Back to creators
        </Link>
      </div>
    );
  }

  const hasAudience = kit.audience.length > 0 || kit.top_locations.length > 0;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-12">
      <Link
        href="/creators"
        className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-cacao"
      >
        ← Creators
      </Link>

      {!kit.has_media_kit && (
        <p className="mt-3 border border-border bg-secondary/40 px-4 py-3 text-sm text-cacao">
          This creator hasn't published a media kit yet. Their name, bio and showcase videos are
          shown below.
        </p>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mt-4 grid gap-6 border border-border bg-card p-5 md:grid-cols-[minmax(0,420px)_1fr] md:gap-8 md:p-7">
        <div className="aspect-[4/5] w-full overflow-hidden bg-secondary">
          {kit.intro_video_url ? (
            // Portfolio videos carry no thumbnail (uploaded with process:
            // "none"), so the clip renders directly — same as the directory card.
            <video src={kit.intro_video_url} controls className="h-full w-full object-cover" />
          ) : kit.avatar_url ? (
            <img src={kit.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-4xl text-russet"
              style={{ fontFamily: SERIF }}
            >
              {initials(creatorDisplayName(kit.display_name))}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <span className="self-start rounded-full bg-russet/85 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-linen">
            {kit.primary_category}
          </span>

          <h1
            className="mt-4 text-4xl leading-tight text-cacao md:text-5xl"
            style={{ fontFamily: SERIF }}
          >
            {creatorDisplayName(kit.display_name)}
          </h1>

          {kit.headline && (
            <p className="mt-2 text-[12px] uppercase tracking-[0.28em] text-cacao/80">
              {kit.headline}
            </p>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-russet">♥</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <p className="text-sm leading-relaxed text-cacao/90">{kit.bio}</p>

          {kit.location_label && (
            <p className="mt-5 text-sm text-cacao/80">
              <span className="me-2 text-russet">◉</span>
              {kit.location_label}
            </p>
          )}

          {/* No handles, no email, by design — see the note at the top of this
              file. The invite is the only route to the creator. */}
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="mt-6 self-start bg-cacao px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-linen transition-colors hover:bg-russet"
          >
            Invite to collab
          </button>
        </div>
      </section>

      {/* ── About / statistics ───────────────────────────────────────────── */}
      {(kit.about ||
        kit.pull_quote ||
        kit.content_types.length > 0 ||
        kit.stats.length > 0 ||
        hasAudience) && (
        <section className="mt-5 grid gap-8 border border-border bg-card p-5 md:grid-cols-[minmax(0,280px)_1fr] md:p-7">
          <div className="space-y-7">
            {kit.about && (
              <div>
                <SectionLabel>About me</SectionLabel>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-cacao/90">
                  {kit.about}
                </p>
              </div>
            )}

            {kit.pull_quote && (
              <p
                className="text-lg italic leading-snug text-russet"
                style={{ fontFamily: SERIF }}
              >
                {kit.pull_quote}
                <span className="ms-2 not-italic">♡</span>
              </p>
            )}

            {kit.content_types.length > 0 && (
              <div>
                <SectionLabel>Content I create</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {kit.content_types.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-cacao/90">
                      <span className="grid h-6 w-6 shrink-0 place-items-center border border-russet/30 text-[10px] text-russet">
                        ✦
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {kit.stats.length > 0 && <StatBand kit={kit} />}

            {hasAudience && (
              <section>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <SectionLabel>Audience overview</SectionLabel>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Self-reported
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-6">
                  {kit.audience.length > 0 && (
                    <>
                      <AudienceDonut segments={kit.audience} />
                      <ul className="space-y-2">
                        {kit.audience.map((segment, i) => (
                          <li
                            key={segment.label}
                            className="flex items-baseline gap-2.5 text-sm text-cacao/90"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                              }}
                            />
                            <span>
                              {segment.percent}% {segment.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {kit.top_locations.length > 0 && (
                    <div className="min-w-[200px] flex-1 bg-secondary/50 p-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-cacao/70">
                        Top locations
                      </div>
                      <dl className="mt-3 space-y-2">
                        {kit.top_locations.map((location) => (
                          <div key={location.label} className="flex justify-between text-sm">
                            <dt className="text-cacao/90">{location.label}</dt>
                            <dd className="text-cacao">{location.percent}%</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {/* ── Recent work ──────────────────────────────────────────────────── */}
      {kit.samples.length > 0 && (
        <section className="mt-5">
          <SectionLabel>Recent work / content examples</SectionLabel>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kit.samples.map((sample) => (
              <figure key={sample.id}>
                <video
                  src={sample.video_url}
                  controls
                  className="aspect-[3/4] w-full bg-secondary object-cover"
                />
                {sample.caption && (
                  <figcaption className="mt-2 text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {sample.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ── Collaborations ───────────────────────────────────────────────── */}
      <section className="mt-6 grid items-center gap-6 border border-border bg-secondary/40 p-6 md:grid-cols-[1fr_1fr]">
        <p className="text-2xl italic leading-snug text-cacao" style={{ fontFamily: SERIF }}>
          Let's create something beautiful together!
        </p>
        <div>
          <SectionLabel>Collaborations</SectionLabel>
          <p className="mt-3 text-sm leading-relaxed text-cacao/90">
            {kit.collaboration_note ??
              `${creatorDisplayName(kit.display_name)} accepts collaboration invites.`}
          </p>
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="mt-4 bg-russet px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-linen transition-colors hover:bg-cacao"
          >
            Invite to collab
          </button>
        </div>
      </section>

      {inviting && (
        <InviteToCollabModal
          card={{ creator: { id: kit.id, name: creatorDisplayName(kit.display_name) } }}
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}
