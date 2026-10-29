"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getFeed, getUserProfile, type UserProfile } from "@/lib/api/reels";
import { ReelThumbnail } from "@/components/reels/reel-thumbnail";
import { FollowButton } from "@/components/reels/follow-button";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const PANEL = {
  border: "1px solid rgba(44,24,16,0.10)",
  background: "rgba(44,24,16,0.015)",
} as const;

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontFamily: MAISON_SERIF,
          fontSize: 22,
          lineHeight: 1,
          color: "hsl(var(--nl-cacao))",
        }}
      >
        {n.toLocaleString()}
      </span>
      <span
        className="uppercase"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          color: "hsl(var(--nl-russet))",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams<{ locale: string; userId: string }>();
  const locale = params?.locale ?? "en";
  const userId = params?.userId ?? "";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    getUserProfile(userId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        return getFeed({ context: "user", userId: p.id, limit: 30 });
      })
      .then((d) => {
        if (cancelled || !d) return;
        setReels(d.reels);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ProfileSkeleton />;

  if (notFound || !profile)
    return (
      <div
        className="min-h-[60vh] flex flex-col items-center justify-center text-center px-5"
        style={{ background: "hsl(var(--background))" }}
      >
        <Eyebrow>Not found</Eyebrow>
        <SerifTitle size={32} className="mt-3">
          This profile doesn’t exist
        </SerifTitle>
        <p
          className="mt-2"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 15,
            color: "hsl(var(--nl-russet))",
          }}
        >
          It may have been removed or the link is incorrect.
        </p>
      </div>
    );

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
        {/* Profile header — Maison panel */}
        <div
          className="p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-5 md:gap-7"
          style={PANEL}
        >
          <div
            className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden shrink-0 mx-auto sm:mx-0"
            style={{ border: "1px solid rgba(184,115,51,0.5)" }}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: "rgba(184,115,51,0.08)",
                  fontFamily: MAISON_SERIF,
                  fontSize: 34,
                  color: "hsl(var(--nl-amber))",
                }}
              >
                {profile.displayName?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-start">
            <Eyebrow>{profile.isSelf ? "Your profile" : "Member"}</Eyebrow>
            <SerifTitle size={34} className="mt-2 truncate">
              {profile.displayName}
            </SerifTitle>

            <div className="mt-3.5 flex items-center justify-center sm:justify-start gap-5">
              <Stat n={profile.followerCount} label="Followers" />
              <span
                style={{
                  width: 1,
                  height: 22,
                  background: "rgba(44,24,16,0.16)",
                }}
              />
              <Stat n={profile.publishedReelCount} label="Reels" />
            </div>

            <div className="mt-5 flex justify-center sm:justify-start">
              {profile.isSelf ? (
                <Link
                  href={`/${locale}/account/settings`}
                  className="inline-block uppercase transition-colors"
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 11,
                    letterSpacing: "0.22em",
                    padding: "13px 30px",
                    border: "1px solid rgba(44,24,16,0.4)",
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  Edit profile
                </Link>
              ) : (
                <FollowButton userId={profile.id} disabled={profile.isSelf} />
              )}
            </div>
          </div>
        </div>

        {/* Reels */}
        <div className="mt-10 md:mt-12">
          <div className="flex items-baseline gap-2.5 mb-3">
            <Eyebrow>Reels</Eyebrow>
            <span
              style={{
                fontFamily: MAISON_SERIF,
                fontStyle: "italic",
                fontSize: 14,
                color: "hsl(var(--nl-russet))",
              }}
            >
              · {reels.length}
            </span>
          </div>
          <div
            className="mb-6"
            style={{ height: 1, background: "rgba(44,24,16,0.10)" }}
          />
          {reels.length === 0 ? (
            <div
              className="py-14 text-center"
              style={{
                fontFamily: MAISON_SERIF,
                fontStyle: "italic",
                fontSize: 16,
                color: "hsl(var(--nl-russet))",
              }}
            >
              No reels yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {reels.map((r) => (
                <ReelThumbnail
                  key={r.id}
                  reelId={r.id}
                  thumbnailUrl={r.thumbnail_url}
                  viewCount={r.view_count}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
        <div
          className="p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-5 md:gap-7"
          style={{ border: "1px solid rgba(44,24,16,0.10)" }}
        >
          <div
            className="w-24 h-24 md:w-28 md:h-28 rounded-full shrink-0 mx-auto sm:mx-0 animate-pulse"
            style={{ background: "rgba(44,24,16,0.07)" }}
          />
          <div className="flex-1 w-full space-y-3">
            <div
              className="h-3 w-20 animate-pulse"
              style={{ background: "rgba(44,24,16,0.07)" }}
            />
            <div
              className="h-7 w-52 max-w-full animate-pulse"
              style={{ background: "rgba(44,24,16,0.07)" }}
            />
            <div
              className="h-4 w-40 animate-pulse"
              style={{ background: "rgba(44,24,16,0.07)" }}
            />
            <div
              className="h-10 w-36 animate-pulse"
              style={{ background: "rgba(44,24,16,0.07)" }}
            />
          </div>
        </div>
        <div className="mt-10 md:mt-12 flex flex-wrap gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="w-32 aspect-[9/16] animate-pulse"
              style={{ background: "rgba(44,24,16,0.07)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
