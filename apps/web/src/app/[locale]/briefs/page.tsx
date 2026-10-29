import type { Metadata } from "next";
import { apiServer } from "@/lib/api-server";
import { Eyebrow, SerifTitle } from "@/components/checkout/maison-primitives";
import { BriefBoard, type PublicBrief } from "./_components/brief-board";

export const metadata: Metadata = {
  title: "Creator briefs — MaterialHub",
  description: "Open UGC briefs from MaterialHub brands. Pitch your bid and create the reel.",
};

export const revalidate = 300;

async function getOpenBriefs(): Promise<PublicBrief[]> {
  try {
    const server = await apiServer();
    const res = await server.get("/reels/briefs/open");
    return Array.isArray(res.data?.data) ? (res.data.data as PublicBrief[]) : [];
  } catch {
    return [];
  }
}

export default async function BriefsBoardPage() {
  const briefs = await getOpenBriefs();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Eyebrow>CREATOR BRIEFS</Eyebrow>
        <SerifTitle size={30} className="mt-1.5">
          Open briefs
        </SerifTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Brands looking for UGC reels. Pitch your price and what you&apos;d make.
        </p>
      </div>
      <BriefBoard briefs={briefs} />
    </div>
  );
}
