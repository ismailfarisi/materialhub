"use client";
import {
  Eyebrow,
  MAISON_SANS,
  SerifTitle,
} from "@/components/checkout/maison-primitives";
import { CreatorSummaryCard } from "@/components/creator/creator-summary-card";
import { PayoutRequestCard } from "@/components/creator/payout-request-card";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MediaKitSection } from "./_sections/media-kit";
import { CommissionsTab } from "./_tabs/commissions-tab";
import { LicensingTab } from "./_tabs/licensing-tab";
import { MyCollabsTab } from "./_tabs/my-collabs-tab";
import { OpportunitiesTab } from "./_tabs/opportunities-tab";

/**
 * The creator's own page.
 *
 * The media kit is the page body, not a tab — it is the thing a creator
 * actually maintains, and it was previously buried behind a tab strip they had
 * to know to click. The four transactional sections (what work is available,
 * what they took, what they earned, what they licensed) sit below it, still
 * tabbed, because those are things you check rather than things you keep.
 */

type TabKey = "opportunities" | "mine" | "commissions" | "licensing";

function getTabs(t: ReturnType<typeof useTranslations>): { key: TabKey; label: string }[] {
  return [
    { key: "opportunities", label: t("collabOpportunities") },
    { key: "mine", label: t("collabMine") },
    { key: "commissions", label: "Commissions" },
    { key: "licensing", label: "Licensing" },
  ];
}

const TAB_KEYS: TabKey[] = ["opportunities", "mine", "commissions", "licensing"];

// ?tab=profile, ?tab=showcase and ?tab=mediaKit are still in the wild —
// bookmarks, and the links the creator-approval email sends. All three used to
// select a tab that no longer exists; the kit they were after is now the page
// body, so they fall through to the default tab and the creator sees it anyway.
const RETIRED_TABS = new Set(["profile", "showcase", "mediaKit"]);

// Reading from window.location.search in an effect — not useSearchParams() —
// matches use-require-auth.ts's returnTo handling. useSearchParams() forces a
// Suspense boundary and has broken this app's static build before.
function readTabFromLocation(): TabKey {
  if (typeof window === "undefined") return "opportunities";
  const raw = new URLSearchParams(window.location.search).get("tab");
  if (raw && RETIRED_TABS.has(raw)) return "opportunities";
  return (TAB_KEYS.includes(raw as TabKey) ? raw : "opportunities") as TabKey;
}

export default function CreatorDashboardPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "en";
  const router = useRouter();
  const t = useTranslations("account");
  const TABS = getTabs(t);
  const [tab, setTab] = useState<TabKey>("opportunities");

  useEffect(() => {
    setTab(readTabFromLocation());
  }, []);

  function selectTab(next: TabKey) {
    setTab(next);
    router.replace(`/${locale}/account/creator?tab=${next}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="mb-5">
        <Eyebrow>CREATOR</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          My media kit
        </SerifTitle>
      </div>

      <MediaKitSection />

      <hr style={{ border: 0, borderTop: "1px solid rgba(44,24,16,0.10)", margin: "36px 0 0" }} />

      <CreatorSummaryCard />
      <PayoutRequestCard />

      <div
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "rgba(44,24,16,0.10)" }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            className="uppercase transition-colors px-3 py-2.5 border-b -mb-px"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              color: tab === key ? "hsl(var(--nl-amber))" : "hsl(var(--nl-russet))",
              borderColor: tab === key ? "hsl(var(--nl-amber))" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "opportunities" && <OpportunitiesTab />}
      {tab === "mine" && <MyCollabsTab />}
      {tab === "commissions" && <CommissionsTab />}
      {tab === "licensing" && <LicensingTab />}
    </div>
  );
}
