"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import {
  useApplyForCreator,
  useMyCreatorApplication,
} from "@/lib/queries/account";
import { finalizeAvatarUpload, presignAvatarUpload } from "@/lib/api/creator-profile";
import {
  Eyebrow,
  MaisonCheck,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

// Same caps as the post-approval media kit's photo upload
// (account/creator/_sections/media-kit.tsx) — one avatar-processing pipeline,
// two entry points.
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Aligned with the 7 marketplace categories (Skincare, Makeup, Fragrance,
// Hair, Body, Wellness, Tools) — see project_marketplace_category_scope.
const CATEGORIES = [
  "Skincare",
  "Makeup",
  "Fragrance",
  "Hair",
  "Body",
  "Wellness",
  "Tools",
];

interface FormState {
  display_name: string;
  bio: string;
  primary_category: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  follower_estimate: string;
  sample_urls: string;
  motivation: string;
  agreed_to_terms: boolean;
}

const INITIAL_FORM: FormState = {
  display_name: "",
  bio: "",
  primary_category: CATEGORIES[0],
  instagram: "",
  tiktok: "",
  youtube: "",
  follower_estimate: "",
  sample_urls: "",
  motivation: "",
  agreed_to_terms: false,
};

const FIELD_STYLE = {
  border: "1px solid rgba(44,24,16,0.2)",
  background: "rgba(255,255,255,0.55)",
  fontFamily: MAISON_SANS,
  fontSize: 13,
  color: "hsl(var(--nl-cacao))",
  borderRadius: 0,
} as const;

const PRIMARY_BUTTON = {
  background: "hsl(var(--nl-amber))",
  color: "hsl(var(--nl-espresso))",
  fontFamily: MAISON_SANS,
  fontSize: 11,
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  padding: "13px 30px",
  border: "none",
  borderRadius: 0,
};

const FIELD_LABEL = {
  fontFamily: MAISON_SANS,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "hsl(var(--nl-russet))",
};

export default function CreatorApplyPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "en";
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const isCreator =
    user?.creator_tier === "creator" || user?.creator_tier === "influencer";

  const { data: existing, isLoading: loading } = useMyCreatorApplication();
  const applyMutation = useApplyForCreator();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Writes straight to users.avatar_url via the same presign/finalize pair the
  // post-approval media kit uses — an applicant isn't a creator yet, so this
  // can't wait for the creator_applications row the apply mutation creates.
  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type) || file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t("creatorProfilePhotoFailed"));
      return;
    }
    setAvatarBusy(true);
    setAvatarError(null);
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
      setAvatarError(err instanceof Error ? err.message : t("creatorProfilePhotoFailed"));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, boolean> = {};
    // DTO requires display_name minLength 2 — block a 1-char name client-side.
    if (form.display_name.trim().length < 2) errors.display_name = true;
    if (!form.bio.trim()) errors.bio = true;
    if (!form.agreed_to_terms) errors.agreed_to_terms = true;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const social_links: Record<string, string> = {};
    if (form.instagram) social_links.instagram = form.instagram;
    if (form.tiktok) social_links.tiktok = form.tiktok;
    if (form.youtube) social_links.youtube = form.youtube;
    const sample_urls = form.sample_urls
      ? form.sample_urls
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
      : undefined;

    try {
      await applyMutation.mutateAsync({
        display_name: form.display_name,
        bio: form.bio,
        primary_category: form.primary_category,
        social_links,
        // Omit (undefined) rather than send null — t.Optional rejects null.
        follower_estimate: form.follower_estimate
          ? Number(form.follower_estimate)
          : undefined,
        sample_urls,
        motivation: form.motivation || undefined,
        agreed_to_terms: form.agreed_to_terms,
      });
    } catch {
      // surfaced below via applyMutation.isError
    }
  }

  if (isCreator) {
    return (
      <div className="space-y-4">
        <Eyebrow>CREATOR</Eyebrow>
        <SerifTitle size={24}>{t("creatorApplyAlreadyTitle")}</SerifTitle>
        <button
          type="button"
          onClick={() => router.replace(`/${locale}/account/creator`)}
          style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--nl-amber))" }}
          className="uppercase"
        >
          {t("creatorApplyGoDashboard")} →
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="min-h-[40vh] flex items-center justify-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </div>
    );
  }

  const showStatus =
    applyMutation.isSuccess ||
    (existing &&
      (existing.status === "pending" ||
        existing.status === "approved" ||
        existing.status === "needs_info"));

  if (showStatus) {
    // needs_info is an OPEN status backend-side (creator-application.service.ts
    // OPEN_STATUSES) — resubmitting 409s, so show a status view (with the
    // reviewer's notes) instead of the submittable form.
    const isNeedsInfo = !applyMutation.isSuccess && existing?.status === "needs_info";
    return (
      <div className="space-y-3">
        <Eyebrow>CREATOR</Eyebrow>
        <SerifTitle size={24}>
          {isNeedsInfo ? t("creatorApplyNeedsInfo") : t("creatorApplyPendingTitle")}
        </SerifTitle>
        {isNeedsInfo ? (
          existing?.review_notes && (
            <p style={{ fontFamily: MAISON_SANS, fontSize: 14, color: "hsl(var(--nl-russet))" }}>
              {existing.review_notes}
            </p>
          )
        ) : (
          <p style={{ fontFamily: MAISON_SANS, fontSize: 14, color: "hsl(var(--nl-russet))" }}>
            {t("creatorApplyPendingBody")}
          </p>
        )}
      </div>
    );
  }

  // rejected / no application → show the form (prefilled note if any)
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>CREATOR</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("creatorApplyTitle")}
        </SerifTitle>
        <p
          className="mt-2"
          style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
        >
          {t("creatorApplyIntro")}
        </p>
      </div>

      {existing?.status === "rejected" && (
        <div
          className="p-3"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 12.5,
            border: "1px solid rgba(140,55,45,0.35)",
            background: "rgba(140,55,45,0.07)",
            color: "rgb(140,55,45)",
          }}
        >
          {t("creatorApplyRejected")}
          {existing.review_notes ? `: ${existing.review_notes}` : ""}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplyDisplayName")}</span>
          <input
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            value={form.display_name}
            maxLength={120}
            onChange={(e) => update("display_name", e.target.value)}
          />
          {fieldErrors.display_name && (
            <span style={{ fontFamily: MAISON_SANS, fontSize: 11.5, color: "hsl(0,55%,42%)" }}>{t("required")}</span>
          )}
        </label>

        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplyBio")}</span>
          <textarea
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            rows={4}
            maxLength={2000}
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
          />
          {fieldErrors.bio && <span style={{ fontFamily: MAISON_SANS, fontSize: 11.5, color: "hsl(0,55%,42%)" }}>{t("required")}</span>}
        </label>

        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplyCategory")}</span>
          <select
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            value={form.primary_category}
            onChange={(e) => update("primary_category", e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="block text-sm space-y-1.5">
          <span style={FIELD_LABEL}>{t("creatorApplyPhoto")}</span>
          <div className="flex items-center gap-3">
            <div
              className="h-16 w-16 shrink-0 overflow-hidden rounded-full"
              style={{ background: "rgba(44,24,16,0.06)" }}
            >
              {user?.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              className="disabled:opacity-50"
              style={{
                ...FIELD_LABEL,
                background: "transparent",
                border: "1px solid rgba(44,24,16,0.2)",
                padding: "9px 16px",
              }}
            >
              {avatarBusy ? tCommon("loading") : t("creatorApplyAddPhoto")}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          {avatarError && (
            <span style={{ fontFamily: MAISON_SANS, fontSize: 11.5, color: "hsl(0,55%,42%)" }}>
              {avatarError}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm space-y-1">
            <span style={FIELD_LABEL}>Instagram</span>
            <input
              className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
              style={FIELD_STYLE}
              value={form.instagram}
              onChange={(e) => update("instagram", e.target.value)}
            />
          </label>
          <label className="block text-sm space-y-1">
            <span style={FIELD_LABEL}>TikTok</span>
            <input
              className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
              style={FIELD_STYLE}
              value={form.tiktok}
              onChange={(e) => update("tiktok", e.target.value)}
            />
          </label>
          <label className="block text-sm space-y-1">
            <span style={FIELD_LABEL}>YouTube</span>
            <input
              className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
              style={FIELD_STYLE}
              value={form.youtube}
              onChange={(e) => update("youtube", e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplyFollowers")}</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            value={form.follower_estimate}
            onChange={(e) => update("follower_estimate", e.target.value)}
          />
        </label>

        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplySamples")}</span>
          <textarea
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            rows={3}
            placeholder="https://..."
            value={form.sample_urls}
            onChange={(e) => update("sample_urls", e.target.value)}
          />
        </label>

        <label className="block text-sm space-y-1">
          <span style={FIELD_LABEL}>{t("creatorApplyMotivation")}</span>
          <textarea
            className="mt-1 w-full px-3 py-2 outline-none transition-colors focus:border-nl-amber"
            style={FIELD_STYLE}
            rows={3}
            value={form.motivation}
            onChange={(e) => update("motivation", e.target.value)}
          />
        </label>

        <label
          className="flex items-center gap-2 text-sm"
          style={{ fontFamily: MAISON_SANS, color: "hsl(var(--nl-cacao))" }}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={form.agreed_to_terms}
            onChange={(e) => update("agreed_to_terms", e.target.checked)}
          />
          <MaisonCheck checked={form.agreed_to_terms} />
          {t("creatorApplyTerms")}
        </label>
        {fieldErrors.agreed_to_terms && (
          <span style={{ fontFamily: MAISON_SANS, fontSize: 11.5, color: "hsl(0,55%,42%)" }}>{t("creatorApplyTermsRequired")}</span>
        )}

        {applyMutation.isError && (
          <div style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(0,55%,42%)" }}>
            {t("creatorApplyError")}
          </div>
        )}

        <button
          type="submit"
          disabled={applyMutation.isPending}
          className="w-full sm:w-auto disabled:opacity-50"
          style={PRIMARY_BUTTON}
        >
          {applyMutation.isPending ? t("creatorApplySubmitting") : t("creatorApplySubmit")}
        </button>
      </form>
    </div>
  );
}
