"use client";

import { cn } from "@/lib/utils";
import { MapPin, Play } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

type ShortFilm = {
  url: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  title?: string;
  eyebrow?: string;
};

type MakerLetter = {
  quote: string;
  body?: string;
  author_name: string;
  author_role: string;
  author_avatar_url?: string;
};

type LookbookImage = {
  image_url: string;
  alt?: string;
  tall?: boolean;
};

type IngredientOrigin = {
  role?: string;
  name: string;
  place: string;
  body: string;
  annual_harvest?: string;
};

type Editorial = {
  short_film?: ShortFilm;
  maker_letter?: MakerLetter;
  lookbook?: LookbookImage[];
  ingredient_origins?: IngredientOrigin[];
  campaign?: { name: string; lookbook_total?: number };
};

interface FromTheBrandProps {
  editorial?: Editorial | Record<string, unknown> | null;
  productTitle: string;
}

function isEditorial(e: unknown): e is Editorial {
  return !!e && typeof e === "object";
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function FromTheBrand({ editorial, productTitle }: FromTheBrandProps) {
  if (!isEditorial(editorial)) return null;
  const e = editorial as Editorial;

  const hasFilm = !!e.short_film?.url;
  const hasLetter = !!e.maker_letter?.quote && !!e.maker_letter?.author_name;
  const hasLookbook = Array.isArray(e.lookbook) && e.lookbook.length > 0;
  const hasOrigins = Array.isArray(e.ingredient_origins) && e.ingredient_origins.length > 0;

  if (!hasFilm && !hasLetter && !hasLookbook && !hasOrigins) return null;

  return (
    <section className="py-24 lg:py-32 bg-nl-espresso text-nl-linen relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -top-[20%] -right-[10%] w-1/2 aspect-square pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(184,115,51,0.18) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-[1340px] px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 mb-16 items-end">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-3">
              From the brand
            </div>
            <h2 className="font-serif text-4xl lg:text-6xl leading-[1.02] tracking-tight">
              The story behind <span className="italic text-nl-amber">{productTitle}</span>
            </h2>
          </div>
          {e.maker_letter?.body && (
            <p className="font-serif italic text-lg leading-relaxed text-nl-pearl max-w-[480px]">
              {e.maker_letter.body.length > 200
                ? `${e.maker_letter.body.slice(0, 200)}…`
                : e.maker_letter.body}
            </p>
          )}
        </div>

        {(hasFilm || hasLetter) && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 mb-24">
            {hasFilm && <FilmCard film={e.short_film!} />}
            {hasLetter && <MakerLetterBlock letter={e.maker_letter!} />}
          </div>
        )}

        {hasLookbook && (
          <div className="mb-24">
            <div className="flex items-end justify-between mb-7 gap-6 flex-wrap">
              <div>
                {e.campaign?.name && (
                  <div className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-2.5">
                    {e.campaign.name}
                  </div>
                )}
                <h3 className="font-serif text-3xl tracking-tight">The lookbook</h3>
              </div>
              {e.campaign?.lookbook_total &&
                e.campaign.lookbook_total > (e.lookbook?.length ?? 0) && (
                  <span className="text-[10px] tracking-[0.22em] uppercase text-nl-amber">
                    View all {e.campaign.lookbook_total} →
                  </span>
                )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
              {e.lookbook!.slice(0, 4).map((img, i) => (
                <div
                  key={`look-${i}-${img.image_url}`}
                  className={cn(
                    "relative overflow-hidden bg-nl-russet/30",
                    img.tall ? "aspect-[4/5]" : "aspect-square",
                  )}
                >
                  {img.image_url ? (
                    <Image
                      src={img.image_url}
                      alt={img.alt ?? ""}
                      fill
                      sizes="(max-width: 1024px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasOrigins && (
          <div>
            <div className="mb-9">
              <div className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-2.5">
                Where it comes from
              </div>
              <h3 className="font-serif text-3xl tracking-tight">
                {e.ingredient_origins!.length === 3
                  ? "Three ingredients, three places"
                  : `${e.ingredient_origins!.length} ingredients, sourced with care`}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {e.ingredient_origins!.map((it, i) => (
                <article
                  key={`origin-${i}-${it.name}`}
                  className="border-t border-nl-pearl/15 pt-7"
                >
                  <div className="flex justify-between items-center mb-4 text-[9px] tracking-[0.22em] uppercase">
                    <span className="text-nl-amber">{it.role ?? "Ingredient"}</span>
                    <span className="text-nl-pearl/60">
                      0{i + 1} / 0{e.ingredient_origins!.length}
                    </span>
                  </div>
                  <div className="font-serif text-3xl leading-tight mb-1.5">{it.name}</div>
                  <div className="text-[11px] tracking-wider text-nl-amber mb-4 inline-flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    {it.place}
                  </div>
                  <p className="text-sm leading-relaxed text-nl-pearl mb-6">{it.body}</p>
                  {it.annual_harvest && (
                    <div className="pt-4 border-t border-nl-pearl/15 flex justify-between items-baseline">
                      <span className="text-[9px] tracking-[0.22em] uppercase text-nl-pearl/60">
                        Annual harvest
                      </span>
                      <span className="font-serif text-lg text-nl-amber">{it.annual_harvest}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FilmCard({ film }: { film: ShortFilm }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true);
        videoRef.current?.play();
      }}
      className="relative aspect-[16/10] overflow-hidden bg-nl-cacao group"
    >
      <video
        ref={videoRef}
        src={film.url}
        poster={film.thumbnail_url}
        controls={playing}
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <track kind="captions" />
      </video>

      {!playing && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-transparent to-nl-espresso/60"
          />
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[88px] h-[88px] rounded-full border border-nl-linen/85 bg-nl-espresso/30 backdrop-blur-md flex items-center justify-center group-hover:scale-105 transition-transform"
          >
            <Play className="w-9 h-9 text-nl-linen ml-1" />
          </span>
          <div className="absolute left-6 right-6 bottom-6 flex justify-between items-end text-nl-linen text-left">
            <div>
              {film.eyebrow && (
                <div className="text-[9px] tracking-[0.22em] uppercase text-nl-amber mb-2">
                  {film.eyebrow}
                </div>
              )}
              {film.title && <div className="font-serif text-2xl leading-tight">{film.title}</div>}
            </div>
            {film.duration_seconds && (
              <span className="px-2.5 py-1 bg-nl-espresso/60 backdrop-blur-md text-[10px]">
                {formatDuration(film.duration_seconds)}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  );
}

function MakerLetterBlock({ letter }: { letter: MakerLetter }) {
  return (
    <div className="flex flex-col justify-between py-2">
      <div>
        <div className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-5">
          A letter from the maker
        </div>
        <p className="font-serif italic text-xl lg:text-2xl leading-snug text-nl-linen mb-6">
          &ldquo;{letter.quote}&rdquo;
        </p>
        {letter.body && (
          <p className="text-sm leading-relaxed text-nl-pearl max-w-[420px]">{letter.body}</p>
        )}
      </div>
      <div className="mt-8 flex items-center gap-3.5">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-nl-linen font-serif text-xl"
          style={{ background: "linear-gradient(135deg,#C2865C,#7C4C35)" }}
          aria-hidden="true"
        >
          {letter.author_avatar_url ? (
            <Image
              src={letter.author_avatar_url}
              alt={letter.author_name}
              width={48}
              height={48}
              className="rounded-full object-cover"
            />
          ) : (
            letter.author_name.charAt(0)
          )}
        </div>
        <div>
          <div className="font-serif text-base">{letter.author_name}</div>
          <div className="text-[10px] tracking-[0.18em] uppercase text-nl-amber mt-0.5">
            {letter.author_role}
          </div>
        </div>
      </div>
    </div>
  );
}
