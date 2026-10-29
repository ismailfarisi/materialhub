import { ReelFeed } from "@/components/reels/reel-feed";

export default function ReelsPage({
  params,
}: {
  params: { locale: string };
}) {
  return <ReelFeed locale={params.locale} />;
}
