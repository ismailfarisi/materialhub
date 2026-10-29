"use client";

import { cn } from "@/lib/utils";
import { Droplets, Wind, Sun, Snowflake, Flower2, TreePine } from "lucide-react";

interface ScentNote {
  name: string;
  description?: string;
}

interface ScentStoryProps {
  scent_notes?: { top: ScentNote[]; heart: ScentNote[]; base: ScentNote[] };
  longevity_rating?: number;
  sillage_rating?: number;
  season_ratings?: { spring: number; summer: number; fall: number; winter: number };
  mood_tags?: string[];
  smells_like?: Array<{ product_name: string; image_url?: string; reason: string }>;
}

function RatingBar({ value, max = 5, labels }: { value: number; max?: number; labels: string[] }) {
  const pct = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="h-2 bg-warm rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-copper to-gold rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function NotePill({ note, tier }: { note: ScentNote; tier: "top" | "heart" | "base" }) {
  const tierColors = {
    top: "bg-gold/15 text-gold border-gold/25",
    heart: "bg-copper/15 text-copper border-copper/25",
    base: "bg-warm-dark/10 text-foreground border-warm-dark/20",
  };

  return (
    <div className="group relative">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border",
          tierColors[tier]
        )}
      >
        {note.name}
      </span>
      {note.description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-warm-dark text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          {note.description}
        </div>
      )}
    </div>
  );
}

function SeasonRadar({ ratings }: { ratings: { spring: number; summer: number; fall: number; winter: number } }) {
  const seasons = [
    { key: "spring", label: "Spring", icon: Flower2, value: ratings.spring },
    { key: "summer", label: "Summer", icon: Sun, value: ratings.summer },
    { key: "fall", label: "Fall", icon: TreePine, value: ratings.fall },
    { key: "winter", label: "Winter", icon: Snowflake, value: ratings.winter },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {seasons.map((s) => (
        <div key={s.key} className="flex flex-col items-center gap-1.5">
          <div
            className={cn(
              "p-2.5 rounded-full transition",
              s.value >= 3 ? "bg-copper/15 text-copper" : "bg-warm text-muted-foreground"
            )}
          >
            <s.icon className="h-5 w-5" />
          </div>
          <span className="text-xs font-medium">{s.label}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 w-1 rounded-full",
                  i < s.value ? "bg-copper" : "bg-border"
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScentStory({
  scent_notes,
  longevity_rating,
  sillage_rating,
  season_ratings,
  mood_tags,
  smells_like,
}: ScentStoryProps) {
  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-10">
          The Scent Story
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          {/* Left — Meters */}
          <div className="space-y-6">
            {longevity_rating != null && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="h-4 w-4 text-copper" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide">Longevity</h3>
                </div>
                <RatingBar value={longevity_rating} labels={["1hr", "4hr", "8hr", "12hr+"]} />
              </div>
            )}
            {sillage_rating != null && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Wind className="h-4 w-4 text-copper" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide">Sillage</h3>
                </div>
                <RatingBar value={sillage_rating} labels={["Intimate", "Moderate", "Strong", "Enormous"]} />
              </div>
            )}
            {season_ratings && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Best Seasons</h3>
                <SeasonRadar ratings={season_ratings} />
              </div>
            )}
          </div>

          {/* Center — Scent Pyramid */}
          {scent_notes && (
            <div className="flex flex-col items-center gap-6">
              <div className="text-center space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gold">Top Notes</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {scent_notes.top.map((note) => (
                    <NotePill key={note.name} note={note} tier="top" />
                  ))}
                </div>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="text-center space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-copper">Heart Notes</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {scent_notes.heart.map((note) => (
                    <NotePill key={note.name} note={note} tier="heart" />
                  ))}
                </div>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="text-center space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/60">Base Notes</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {scent_notes.base.map((note) => (
                    <NotePill key={note.name} note={note} tier="base" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right — Mood & Occasion */}
          <div className="space-y-6">
            {mood_tags && mood_tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Mood & Occasion</h3>
                <div className="grid grid-cols-2 gap-2">
                  {mood_tags.map((tag) => (
                    <div
                      key={tag}
                      className="px-3 py-2.5 rounded-xl bg-copper/10 text-copper text-sm font-medium text-center border border-copper/15"
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Smells Like comparisons */}
        {smells_like && smells_like.length > 0 && (
          <div className="mt-10">
            <h3 className="text-sm font-semibold uppercase tracking-wide mb-4 text-center">
              If You Love...
            </h3>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {smells_like.map((item) => (
                <div
                  key={item.product_name}
                  className="shrink-0 w-64 p-4 rounded-xl bg-warm border border-border"
                >
                  <p className="font-medium text-sm">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
