"use client";

import { Eyebrow, MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { AudienceDonut, SEGMENT_COLORS } from "@/components/creator/audience-donut";
import { EditableSection, SectionLabel } from "@/components/creator/editable-section";
import {
  BOX,
  Body,
  BUTTON_CLASS,
  ErrorNote,
  FieldLabel,
  INPUT_CLASS,
  INPUT_STYLE,
  Quiet,
  SECONDARY_BUTTON_CLASS,
  SMALL_QUIET,
  SMALL_SECONDARY,
} from "@/components/creator/maison-ui";
import {
  type CreatorMediaKit,
  type CreatorMediaKitSegment,
  type CreatorMediaKitStat,
  getMyMediaKit,
  saveMyMediaKit,
} from "@/lib/api/creator-media-kit";
import {
  type CreatorPortfolio,
  type CreatorPortfolioKind,
  deletePortfolioVideo,
  finalizePortfolioVideo,
  getMyPortfolio,
  presignPortfolioVideo,
} from "@/lib/api/creator-portfolio";
import {
  type CreatorProfile,
  type CreatorProfileSocialLinks,
  finalizeAvatarUpload,
  getMyCreatorProfile,
  presignAvatarUpload,
  updateMyCreatorProfile,
} from "@/lib/api/creator-profile";
import { useAuthStore } from "@/stores/auth";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

/**
 * The creator's media kit — laid out as the page a brand actually opens, and
 * editable in place. This is the body of /account/creator, not a tab: the kit
 * is the thing a creator maintains, so it reads first and the transactional
 * sections (opportunities, collabs, commissions, licensing) sit under it.
 *
 * This replaces three separate form tabs (Profile, Showcase, Media kit). The
 * creator was editing their kit as three disconnected lists of inputs and had
 * no way to see the result; a brand saw an editorial page assembled from those
 * fields in the vendor app. Same content, two different shapes, and only one of
 * them told the creator what a brand would think of it. So: one page, in the
 * brand-facing layout, with an Edit control on each region.
 *
 * Two endpoints back this page. Name, bio, social links and the avatar live on
 * the creator application (`/me/creator/application`); everything else lives on
 * the media kit (`/me/creator/media-kit`). The identity section therefore saves
 * to both, and only writes the half that changed.
 *
 * Caps mirror the backend and a CHECK constraint on the table: 4 stats, 8
 * content types, 6 audience slices, 6 locations, 6 sample videos.
 *
 * Strings: the controls carried over from the Profile and Showcase tabs keep
 * their existing translation keys — they ship in five languages and dropping
 * them would be a regression. The media-kit copy was English-only before this
 * change and stays that way rather than inventing half-translated keys.
 */

const STAT_LIMIT = 4;
const CONTENT_TYPE_LIMIT = 8;
const SEGMENT_LIMIT = 6;
const SAMPLE_LIMIT = 6;

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EMPTY_STAT: CreatorMediaKitStat = { label: "", value: "" };
const EMPTY_SEGMENT: CreatorMediaKitSegment = { label: "", percent: 0 };
const EMPTY_LINKS: CreatorProfileSocialLinks = {
  instagram: "",
  tiktok: "",
  youtube: "",
  other: "",
};

/** Suggested starting rows, so a blank kit is not a blank page. */
const STAT_PLACEHOLDERS = [
  { label: "Followers", value: "68K+" },
  { label: "Engagement rate", value: "5.6%" },
  { label: "Avg. reach", value: "1.2M+" },
  { label: "Avg. views", value: "2.5M+" },
];

type SectionKey = "identity" | "about" | "content" | "stats" | "audience" | "collab";

interface FormState {
  display_name: string;
  bio: string;
  social_links: CreatorProfileSocialLinks;
  headline: string;
  location_label: string;
  about: string;
  pull_quote: string;
  collaboration_note: string;
  stats: CreatorMediaKitStat[];
  content_types: string[];
  audience: CreatorMediaKitSegment[];
  top_locations: CreatorMediaKitSegment[];
}

function toForm(profile: CreatorProfile | null, kit: CreatorMediaKit | null): FormState {
  return {
    display_name: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    social_links: { ...EMPTY_LINKS, ...(profile?.social_links ?? {}) },
    headline: kit?.headline ?? "",
    location_label: kit?.location_label ?? "",
    about: kit?.about ?? "",
    pull_quote: kit?.pull_quote ?? "",
    collaboration_note: kit?.collaboration_note ?? "",
    // One blank row beats an empty section with only an "Add" button on it.
    stats: kit?.stats?.length ? kit.stats : [{ ...EMPTY_STAT }],
    content_types: kit?.content_types?.length ? kit.content_types : [""],
    audience: kit?.audience?.length ? kit.audience : [{ ...EMPTY_SEGMENT }],
    top_locations: kit?.top_locations?.length ? kit.top_locations : [{ ...EMPTY_SEGMENT }],
  };
}

function initials(name: string, fallback: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return fallback.toUpperCase();
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Muted stand-in where a field is still empty — the page should never render
 *  a blank space the creator can't identify as "something goes here". */
function Unset({ children }: { children: string }) {
  return (
    <span
      style={{
        fontFamily: MAISON_SERIF,
        fontStyle: "italic",
        fontSize: 14,
        color: "hsl(var(--nl-russet))",
        opacity: 0.6,
      }}
    >
      {children}
    </span>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${BUTTON_CLASS} hover:bg-[rgba(44,24,16,0.04)]`}
      style={{ ...SMALL_QUIET, padding: "6px 10px" }}
    >
      ✕
    </button>
  );
}

function AddRowButton({
  onAdd,
  label,
  disabled,
}: {
  onAdd: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className={SECONDARY_BUTTON_CLASS}
      style={SMALL_SECONDARY}
    >
      {label}
    </button>
  );
}

export function MediaKitSection() {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const introInputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [kit, setKit] = useState<CreatorMediaKit | null>(null);
  const [portfolio, setPortfolio] = useState<CreatorPortfolio | null>(null);
  const [form, setForm] = useState<FormState>(() => toForm(null, null));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // One section is open at a time, so a single set of edit-state fields covers
  // the page. `savedKey` is what shows "Saved." under the section just closed.
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<SectionKey | null>(null);

  const [managingWork, setManagingWork] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, k, pf] = await Promise.all([
        getMyCreatorProfile(),
        getMyMediaKit(),
        getMyPortfolio(),
      ]);
      setProfile(p);
      setKit(k);
      setPortfolio(pf);
      setForm(toForm(p, k));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Opening a section always re-seeds the draft from what is saved, so a
   *  cancelled edit leaves nothing behind for the next one to inherit. */
  function startEdit(key: SectionKey) {
    setForm(toForm(profile, kit));
    setSectionError(null);
    setSavedKey(null);
    setEditing(key);
  }

  function cancelEdit() {
    setForm(toForm(profile, kit));
    setSectionError(null);
    setEditing(null);
  }

  async function saveSection(key: SectionKey) {
    setSaving(true);
    setSectionError(null);
    try {
      if (key === "identity") {
        // Two endpoints behind one Save. Each is only called when its own half
        // actually changed, so editing a headline doesn't rewrite the
        // application row (and vice versa).
        const links = {
          instagram: form.social_links.instagram?.trim() || null,
          tiktok: form.social_links.tiktok?.trim() || null,
          youtube: form.social_links.youtube?.trim() || null,
          other: form.social_links.other?.trim() || null,
        };
        const profileChanged =
          form.display_name !== (profile?.display_name ?? "") ||
          form.bio !== (profile?.bio ?? "") ||
          JSON.stringify(links) !== JSON.stringify({ ...EMPTY_LINKS, ...profile?.social_links });
        const kitChanged =
          form.headline !== (kit?.headline ?? "") ||
          form.location_label !== (kit?.location_label ?? "");

        if (profileChanged) {
          setProfile(
            await updateMyCreatorProfile({
              display_name: form.display_name,
              bio: form.bio,
              social_links: links,
            }),
          );
        }
        if (kitChanged) {
          setKit(
            await saveMyMediaKit({
              headline: form.headline,
              location_label: form.location_label,
            }),
          );
        }
      } else if (key === "about") {
        setKit(await saveMyMediaKit({ about: form.about, pull_quote: form.pull_quote }));
      } else if (key === "content") {
        setKit(
          await saveMyMediaKit({
            content_types: form.content_types.filter((c) => c.trim() !== ""),
          }),
        );
      } else if (key === "stats") {
        setKit(
          await saveMyMediaKit({
            stats: form.stats.filter((s) => s.label.trim() !== "" && s.value.trim() !== ""),
          }),
        );
      } else if (key === "audience") {
        setKit(
          await saveMyMediaKit({
            audience: form.audience.filter((s) => s.label.trim() !== ""),
            top_locations: form.top_locations.filter((s) => s.label.trim() !== ""),
          }),
        );
      } else if (key === "collab") {
        setKit(await saveMyMediaKit({ collaboration_note: form.collaboration_note }));
      }
      setEditing(null);
      setSavedKey(key);
    } catch (err) {
      setSectionError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type) || file.size > MAX_AVATAR_BYTES) {
      setMediaError(t("creatorProfilePhotoFailed"));
      return;
    }
    setMediaBusy(true);
    setMediaError(null);
    try {
      const { uploadUrl, key } = await presignAvatarUpload(file.name, file.type);
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(t("creatorProfilePhotoFailed"));
      const { avatar_url } = await finalizeAvatarUpload(key);
      if (user) setUser({ ...user, avatar_url });
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : t("creatorProfilePhotoFailed"));
    } finally {
      setMediaBusy(false);
    }
  }

  async function uploadVideo(file: File, kind: CreatorPortfolioKind) {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type) || file.size > MAX_VIDEO_BYTES) {
      setMediaError(t("creatorShowcaseUploadFailed"));
      return;
    }
    setMediaBusy(true);
    setMediaError(null);
    try {
      const { uploadUrl, key } = await presignPortfolioVideo(file.name, file.type);
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(t("creatorShowcaseUploadFailed"));
      await finalizePortfolioVideo(key, kind);
      setPortfolio(await getMyPortfolio());
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : t("creatorShowcaseUploadFailed"));
    } finally {
      setMediaBusy(false);
    }
  }

  async function handleVideoInput(e: ChangeEvent<HTMLInputElement>, kind: CreatorPortfolioKind) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadVideo(file, kind);
  }

  async function handleDeleteSample(id: string) {
    setMediaBusy(true);
    setMediaError(null);
    try {
      await deletePortfolioVideo(id);
      setPortfolio(await getMyPortfolio());
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : t("creatorShowcaseDeleteFailed"));
    } finally {
      setMediaBusy(false);
    }
  }

  if (loading) return <Quiet>{tc("loading")}</Quiet>;

  if (loadError && !profile && !kit) {
    return (
      <div className="space-y-3">
        <ErrorNote>{loadError}</ErrorNote>
        <button
          type="button"
          onClick={loadAll}
          className={SECONDARY_BUTTON_CLASS}
          style={SMALL_SECONDARY}
        >
          {tc("retry")}
        </button>
      </div>
    );
  }

  const displayName = profile?.display_name ?? "";
  const samples = portfolio?.samples ?? [];
  const intro = portfolio?.intro ?? null;
  const samplesFull = samples.length >= SAMPLE_LIMIT;
  const audienceTotal = (kit?.audience ?? []).reduce((sum, s) => sum + s.percent, 0);
  const hasAudience = (kit?.audience?.length ?? 0) > 0 || (kit?.top_locations?.length ?? 0) > 0;

  return (
    <div className="space-y-9">
      {/* There is no publish step: whatever is saved here is what a brand sees,
          so the only commit point is each section's own Save. */}
      <Body>
        This is your media kit exactly as a brand sees it when they open your profile from the
        creator directory. Edit any part of it in place — each section goes live to brands as
        soon as you save it. Brands never see your contact details or social handles; they can
        only invite you to a collaboration.
      </Body>

      {mediaError && <ErrorNote>{mediaError}</ErrorNote>}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="grid gap-6 p-5 md:grid-cols-[minmax(0,380px)_1fr] md:gap-8 md:p-7" style={BOX}>
        <div className="space-y-2.5">
          <div
            className="w-full overflow-hidden"
            style={{ aspectRatio: "4 / 5", background: "rgba(44,24,16,0.05)" }}
          >
            {intro ? (
              // Portfolio videos carry no thumbnail (uploaded with process:
              // "none"), so the clip renders directly — same as the brand view.
              <video src={intro.video_url} controls className="h-full w-full object-cover" />
            ) : user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{
                  fontFamily: MAISON_SERIF,
                  fontSize: 44,
                  color: "hsl(var(--nl-amber))",
                }}
              >
                {initials(displayName, user?.email?.charAt(0) ?? "U")}
              </div>
            )}
          </div>
          <Body size={11.5}>
            {intro
              ? "Your intro video is the first thing a brand sees. Your photo is shown wherever a video isn't."
              : "Add an intro video and it replaces your photo here — it's the first thing a brand sees."}
          </Body>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={mediaBusy}
              onClick={() => avatarInputRef.current?.click()}
              className={SECONDARY_BUTTON_CLASS}
              style={SMALL_SECONDARY}
            >
              {mediaBusy ? tc("loading") : t("creatorProfileChangePhoto")}
            </button>
            <button
              type="button"
              disabled={mediaBusy}
              onClick={() => introInputRef.current?.click()}
              className={SECONDARY_BUTTON_CLASS}
              style={SMALL_SECONDARY}
            >
              {mediaBusy
                ? tc("loading")
                : intro
                  ? t("creatorShowcaseReplaceIntro")
                  : t("creatorShowcaseAddIntro")}
            </button>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <input
            ref={introInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => handleVideoInput(e, "intro")}
          />
        </div>

        <div className="flex flex-col justify-center">
          <EditableSection
            title="Who you are"
            editing={editing === "identity"}
            saving={saving}
            error={editing === "identity" ? sectionError : null}
            saved={savedKey === "identity"}
            savedLabel={t("creatorProfileSaved")}
            onEdit={() => startEdit("identity")}
            onCancel={cancelEdit}
            onSave={() => saveSection("identity")}
          >
            {editing === "identity" ? (
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="kit-name">{t("creatorProfileDisplayName")}</FieldLabel>
                  <input
                    id="kit-name"
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    value={form.display_name}
                    onChange={(e) => update("display_name", e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="kit-headline">Line under your name</FieldLabel>
                  <input
                    id="kit-headline"
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    maxLength={120}
                    placeholder="Beauty & Makeup Creator"
                    value={form.headline}
                    onChange={(e) => update("headline", e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="kit-bio">{t("creatorProfileBio")}</FieldLabel>
                  <textarea
                    id="kit-bio"
                    rows={4}
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    value={form.bio}
                    onChange={(e) => update("bio", e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="kit-location">Where you're based</FieldLabel>
                  <input
                    id="kit-location"
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    maxLength={120}
                    placeholder="Dubai, UAE"
                    value={form.location_label}
                    onChange={(e) => update("location_label", e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>{t("creatorProfileSocialLinks")}</FieldLabel>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["instagram", t("creatorProfileInstagram")],
                        ["tiktok", t("creatorProfileTiktok")],
                        ["youtube", t("creatorProfileYoutube")],
                        ["other", t("creatorProfileOtherLink")],
                      ] as const
                    ).map(([key, label]) => (
                      <input
                        key={key}
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                        placeholder={label}
                        value={form.social_links[key] ?? ""}
                        onChange={(e) =>
                          update("social_links", {
                            ...form.social_links,
                            [key]: e.target.value,
                          })
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-1.5">
                    <Body size={11.5}>Only you see these. Brands never get your handles.</Body>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {profile?.primary_category && (
                  <span
                    className="inline-block uppercase"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.22em",
                      padding: "6px 14px",
                      background: "hsl(var(--nl-russet))",
                      color: "hsl(var(--nl-linen))",
                    }}
                  >
                    {profile.primary_category}
                  </span>
                )}
                <h1
                  className="mt-3.5"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 38,
                    lineHeight: 1.1,
                    fontWeight: 400,
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  {displayName || <Unset>Add your name</Unset>}
                </h1>
                {kit?.headline && (
                  <p
                    className="mt-2 uppercase"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 11,
                      letterSpacing: "0.28em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {kit.headline}
                  </p>
                )}
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1" style={{ background: "rgba(44,24,16,0.12)" }} />
                  <span style={{ color: "hsl(var(--nl-amber))" }}>♥</span>
                  <span className="h-px flex-1" style={{ background: "rgba(44,24,16,0.12)" }} />
                </div>
                <div style={{ fontFamily: MAISON_SANS, fontSize: 13.5, lineHeight: 1.6, color: "hsl(var(--nl-cacao))" }}>
                  {profile?.bio || <Unset>Add a short bio — brands read this first.</Unset>}
                </div>
                <p className="mt-4" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}>
                  <span className="me-2" style={{ color: "hsl(var(--nl-amber))" }}>
                    ◉
                  </span>
                  {kit?.location_label || <Unset>Where are you based?</Unset>}
                </p>
              </div>
            )}
          </EditableSection>
        </div>
      </section>

      {/* ── About / pull quote ───────────────────────────────────────────── */}
      <EditableSection
        title="About me"
        editing={editing === "about"}
        saving={saving}
        error={editing === "about" ? sectionError : null}
        saved={savedKey === "about"}
        onEdit={() => startEdit("about")}
        onCancel={cancelEdit}
        onSave={() => saveSection("about")}
      >
        {editing === "about" ? (
          <div className="space-y-4 md:max-w-xl">
            <div>
              <FieldLabel htmlFor="kit-about">About me</FieldLabel>
              <textarea
                id="kit-about"
                rows={5}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                maxLength={2000}
                placeholder="Beauty lover & content creator sharing makeup, skincare and self-care tips."
                value={form.about}
                onChange={(e) => update("about", e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="kit-quote">Pull quote</FieldLabel>
              <input
                id="kit-quote"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                maxLength={160}
                placeholder="Be your own kind of beautiful"
                value={form.pull_quote}
                onChange={(e) => update("pull_quote", e.target.value)}
              />
              <p
                className="mt-1.5"
                style={{
                  fontFamily: MAISON_SERIF,
                  fontStyle: "italic",
                  fontSize: 12,
                  color: "hsl(var(--nl-amber-text))",
                }}
              >
                Set in display type beside your photo.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5 md:max-w-2xl">
            <div
              className="whitespace-pre-wrap"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {kit?.about || <Unset>Tell brands who you are and how you work.</Unset>}
            </div>
            {kit?.pull_quote && (
              <p
                style={{
                  fontFamily: MAISON_SERIF,
                  fontStyle: "italic",
                  fontSize: 19,
                  lineHeight: 1.3,
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {kit.pull_quote}
                <span className="ms-2 not-italic">♡</span>
              </p>
            )}
          </div>
        )}
      </EditableSection>

      {/* ── Content I create ─────────────────────────────────────────────── */}
      <EditableSection
        title="Content I create"
        aside={`${kit?.content_types?.length ?? 0}/${CONTENT_TYPE_LIMIT}`}
        editing={editing === "content"}
        saving={saving}
        error={editing === "content" ? sectionError : null}
        saved={savedKey === "content"}
        onEdit={() => startEdit("content")}
        onCancel={cancelEdit}
        onSave={() => saveSection("content")}
      >
        {editing === "content" ? (
          <div className="space-y-3 md:max-w-xl">
            <Body size={12}>Up to {CONTENT_TYPE_LIMIT} short labels.</Body>
            {form.content_types.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and freely reordered by add/remove
              <div key={`content-${i}`} className="flex items-center gap-2">
                <input
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                  maxLength={60}
                  placeholder="Makeup tutorials"
                  value={item}
                  onChange={(e) => {
                    const next = [...form.content_types];
                    next[i] = e.target.value;
                    update("content_types", next);
                  }}
                />
                <RemoveButton
                  label={`Remove content type ${i + 1}`}
                  onClick={() =>
                    update(
                      "content_types",
                      form.content_types.filter((_, index) => index !== i),
                    )
                  }
                />
              </div>
            ))}
            <AddRowButton
              label="Add content type"
              disabled={form.content_types.length >= CONTENT_TYPE_LIMIT}
              onAdd={() => update("content_types", [...form.content_types, ""])}
            />
          </div>
        ) : kit?.content_types?.length ? (
          <ul className="space-y-2 md:max-w-xl">
            {kit.content_types.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2.5"
                style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}
              >
                <span
                  className="grid shrink-0 place-items-center"
                  style={{
                    width: 24,
                    height: 24,
                    border: "1px solid rgba(184,115,51,0.35)",
                    fontSize: 10,
                    color: "hsl(var(--nl-amber))",
                  }}
                >
                  ✦
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <Unset>List the kinds of content you make — tutorials, reviews, GRWM.</Unset>
        )}
      </EditableSection>

      {/* ── Statistics ───────────────────────────────────────────────────── */}
      <EditableSection
        title="My statistics"
        aside="Self-reported"
        editing={editing === "stats"}
        saving={saving}
        error={editing === "stats" ? sectionError : null}
        saved={savedKey === "stats"}
        onEdit={() => startEdit("stats")}
        onCancel={cancelEdit}
        onSave={() => saveSection("stats")}
      >
        {editing === "stats" ? (
          <div className="space-y-3 md:max-w-xl">
            <Body size={12}>
              Up to {STAT_LIMIT} figures, written however you like — "68K+", "5.6%". Brands see
              these as your own numbers, labelled self-reported; MaterialHub does not verify them.
            </Body>
            {form.stats.map((stat, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and freely reordered by add/remove
              <div key={`stat-${i}`} className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <FieldLabel>Label</FieldLabel>
                  <input
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    maxLength={40}
                    placeholder={STAT_PLACEHOLDERS[i]?.label ?? "Followers"}
                    value={stat.label}
                    onChange={(e) => {
                      const next = [...form.stats];
                      next[i] = { ...stat, label: e.target.value };
                      update("stats", next);
                    }}
                  />
                </div>
                <div className="w-32">
                  <FieldLabel>Value</FieldLabel>
                  <input
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                    maxLength={20}
                    placeholder={STAT_PLACEHOLDERS[i]?.value ?? "68K+"}
                    value={stat.value}
                    onChange={(e) => {
                      const next = [...form.stats];
                      next[i] = { ...stat, value: e.target.value };
                      update("stats", next);
                    }}
                  />
                </div>
                <RemoveButton
                  label={`Remove statistic ${i + 1}`}
                  onClick={() =>
                    update(
                      "stats",
                      form.stats.filter((_, index) => index !== i),
                    )
                  }
                />
              </div>
            ))}
            <AddRowButton
              label="Add statistic"
              disabled={form.stats.length >= STAT_LIMIT}
              onAdd={() => update("stats", [...form.stats, { ...EMPTY_STAT }])}
            />
          </div>
        ) : kit?.stats?.length ? (
          <div
            className="grid grid-cols-2 gap-px sm:grid-cols-4"
            style={{ background: "rgba(44,24,16,0.10)" }}
          >
            {kit.stats.map((stat) => (
              <div
                key={stat.label}
                className="px-4 py-5 text-center"
                style={{ background: "hsl(var(--nl-linen))" }}
              >
                <div
                  style={{ fontFamily: MAISON_SERIF, fontSize: 26, color: "hsl(var(--nl-cacao))" }}
                >
                  {stat.value}
                </div>
                <div
                  className="mt-1.5 uppercase"
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Unset>Add your headline figures — followers, engagement, reach.</Unset>
        )}
      </EditableSection>

      {/* ── Audience ─────────────────────────────────────────────────────── */}
      <EditableSection
        title="Audience overview"
        aside="Self-reported"
        editing={editing === "audience"}
        saving={saving}
        error={editing === "audience" ? sectionError : null}
        saved={savedKey === "audience"}
        onEdit={() => startEdit("audience")}
        onCancel={cancelEdit}
        onSave={() => saveSection("audience")}
      >
        {editing === "audience" ? (
          <div className="space-y-6 md:max-w-xl">
            {(
              [
                {
                  key: "audience" as const,
                  title: "Audience split",
                  hint: `Up to ${SEGMENT_LIMIT} slices. They don't have to total 100% — the donut is scaled to their sum.`,
                  placeholder: "Women 18–24",
                },
                {
                  key: "top_locations" as const,
                  title: "Top locations",
                  hint: `Up to ${SEGMENT_LIMIT} places your audience watches from.`,
                  placeholder: "UAE",
                },
              ] satisfies Array<{
                key: "audience" | "top_locations";
                title: string;
                hint: string;
                placeholder: string;
              }>
            ).map(({ key, title, hint, placeholder }) => (
              <div key={key} className="space-y-3">
                <Eyebrow>{title}</Eyebrow>
                <Body size={12}>{hint}</Body>
                {form[key].map((segment, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and freely reordered by add/remove
                  <div key={`${key}-${i}`} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <FieldLabel>Label</FieldLabel>
                      <input
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                        maxLength={60}
                        placeholder={placeholder}
                        value={segment.label}
                        onChange={(e) => {
                          const next = [...form[key]];
                          next[i] = { ...segment, label: e.target.value };
                          update(key, next);
                        }}
                      />
                    </div>
                    <div className="w-24">
                      <FieldLabel>Percent</FieldLabel>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                        value={segment.percent === 0 ? "" : segment.percent}
                        onChange={(e) => {
                          const next = [...form[key]];
                          next[i] = { ...segment, percent: Number(e.target.value) || 0 };
                          update(key, next);
                        }}
                      />
                    </div>
                    <RemoveButton
                      label={`Remove ${title} row ${i + 1}`}
                      onClick={() =>
                        update(
                          key,
                          form[key].filter((_, index) => index !== i),
                        )
                      }
                    />
                  </div>
                ))}
                <AddRowButton
                  label="Add row"
                  disabled={form[key].length >= SEGMENT_LIMIT}
                  onAdd={() => update(key, [...form[key], { ...EMPTY_SEGMENT }])}
                />
              </div>
            ))}
          </div>
        ) : hasAudience ? (
          <div className="flex flex-wrap items-center gap-7">
            {kit && kit.audience.length > 0 && audienceTotal > 0 && (
              <>
                <AudienceDonut segments={kit.audience} />
                <ul className="space-y-2">
                  {kit.audience.map((segment, i) => (
                    <li
                      key={segment.label}
                      className="flex items-baseline gap-2.5"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      <span
                        className="shrink-0 rounded-full"
                        style={{
                          width: 8,
                          height: 8,
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
            {kit && kit.top_locations.length > 0 && (
              <div className="min-w-[200px] flex-1 p-4" style={BOX}>
                <div
                  className="uppercase"
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  Top locations
                </div>
                <dl className="mt-3 space-y-2">
                  {kit.top_locations.map((location) => (
                    <div
                      key={location.label}
                      className="flex justify-between"
                      style={{ fontFamily: MAISON_SANS, fontSize: 13 }}
                    >
                      <dt style={{ color: "hsl(var(--nl-russet))" }}>{location.label}</dt>
                      <dd style={{ color: "hsl(var(--nl-cacao))" }}>{location.percent}%</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        ) : (
          <Unset>Describe who watches you — age, gender split, where they are.</Unset>
        )}
      </EditableSection>

      {/* ── Recent work ──────────────────────────────────────────────────────
          Uploads and deletes take effect immediately, so this section gets a
          Manage/Done toggle rather than the Save/Cancel pair — there is no
          draft here to cancel. */}
      <section className="space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionLabel>Recent work</SectionLabel>
          <div className="flex items-center gap-3">
            <span
              className="uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "hsl(var(--nl-russet))",
                opacity: 0.75,
              }}
            >
              {samples.length}/{SAMPLE_LIMIT}
            </span>
            <button
              type="button"
              onClick={() => setManagingWork((v) => !v)}
              className={`${BUTTON_CLASS} hover:bg-[rgba(44,24,16,0.04)]`}
              style={{ ...SMALL_QUIET, padding: "5px 10px" }}
            >
              {managingWork ? "Done" : "Manage"}
            </button>
          </div>
        </div>

        {samples.length === 0 ? (
          <Unset>Add a few clips — this is the work a brand judges you on.</Unset>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {samples.map((sample) => (
              <figure key={sample.id} className="space-y-1.5">
                <video
                  src={sample.video_url}
                  controls
                  className="w-full object-cover"
                  style={{ aspectRatio: "3 / 4", border: "1px solid rgba(44,24,16,0.10)" }}
                />
                {sample.caption && (
                  <figcaption
                    className="text-center uppercase"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {sample.caption}
                  </figcaption>
                )}
                {managingWork && (
                  <button
                    type="button"
                    disabled={mediaBusy}
                    onClick={() => handleDeleteSample(sample.id)}
                    className={`${BUTTON_CLASS} w-full hover:bg-[rgba(44,24,16,0.04)]`}
                    style={{ ...SMALL_QUIET, padding: "6px 10px", color: "rgb(140,55,45)" }}
                  >
                    {t("creatorShowcaseDelete")}
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}

        {managingWork &&
          (samplesFull ? (
            <Quiet>{t("creatorShowcaseLimitReached")}</Quiet>
          ) : (
            <>
              <button
                type="button"
                disabled={mediaBusy}
                onClick={() => sampleInputRef.current?.click()}
                className={SECONDARY_BUTTON_CLASS}
                style={SMALL_SECONDARY}
              >
                {mediaBusy ? tc("loading") : t("creatorShowcaseAddSample")}
              </button>
              <input
                ref={sampleInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => handleVideoInput(e, "sample")}
              />
            </>
          ))}
      </section>

      {/* ── Collaborations ───────────────────────────────────────────────── */}
      <section className="grid items-center gap-6 p-6 md:grid-cols-2" style={BOX}>
        <p
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 24,
            lineHeight: 1.25,
            color: "hsl(var(--nl-cacao))",
          }}
        >
          Let's create something beautiful together!
        </p>
        <EditableSection
          title="Collaborations"
          editing={editing === "collab"}
          saving={saving}
          error={editing === "collab" ? sectionError : null}
          saved={savedKey === "collab"}
          onEdit={() => startEdit("collab")}
          onCancel={cancelEdit}
          onSave={() => saveSection("collab")}
        >
          {editing === "collab" ? (
            <div>
              <FieldLabel htmlFor="kit-collab">What you're open to</FieldLabel>
              <textarea
                id="kit-collab"
                rows={4}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                maxLength={1000}
                placeholder="Open to brand collaborations, sponsored content, product reviews and long-term partnerships."
                value={form.collaboration_note}
                onChange={(e) => update("collaboration_note", e.target.value)}
              />
            </div>
          ) : (
            <div
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {kit?.collaboration_note || (
                <Unset>Say what kind of collaborations you want to be invited to.</Unset>
              )}
            </div>
          )}
        </EditableSection>
      </section>
    </div>
  );
}
