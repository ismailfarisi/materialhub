"use client";

import { cn } from "@/lib/utils";

interface ReviewSummary {
  vibe_cloud: Array<{ word: string; count: number }>;
  consensus: { worth_it: number; its_okay: number; skip: number };
  repurchase_pct: number;
  avg_wear_time?: string;
  visible_results_in?: string;
}

interface TheVerdictProps {
  summary: ReviewSummary | null;
  categoryType?: string;
}

function ConsensusBar({ consensus }: { consensus: ReviewSummary["consensus"] }) {
  const total = consensus.worth_it + consensus.its_okay + consensus.skip;
  if (total === 0) return null;
  const worthPct = Math.round((consensus.worth_it / total) * 100);
  const okayPct = Math.round((consensus.its_okay / total) * 100);
  const skipPct = Math.round((consensus.skip / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden">
        <div className="bg-copper transition-all" style={{ width: `${worthPct}%` }} />
        <div className="bg-gold/50 transition-all" style={{ width: `${okayPct}%` }} />
        <div className="bg-border transition-all" style={{ width: `${skipPct}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-copper font-medium">Worth it {worthPct}%</span>
        <span className="text-muted-foreground">It&apos;s okay {okayPct}%</span>
        <span className="text-muted-foreground">Skip {skipPct}%</span>
      </div>
    </div>
  );
}

function VibeCloud({ words }: { words: ReviewSummary["vibe_cloud"] }) {
  if (words.length === 0) return null;
  const maxCount = Math.max(...words.map((w) => w.count));

  const colorVariants = [
    "text-copper",
    "text-gold",
    "text-foreground/70",
    "text-copper/70",
    "text-gold/80",
  ];

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 py-4">
      {words.map((w, i) => {
        const scale = 0.75 + (w.count / maxCount) * 0.75;
        return (
          <span
            key={w.word}
            className={cn("font-serif font-bold transition-all hover:scale-110", colorVariants[i % colorVariants.length])}
            style={{ fontSize: `${scale}rem` }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center p-4 rounded-xl bg-warm border border-border">
      <div className="text-2xl font-bold text-copper">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function TheVerdict({ summary, categoryType }: TheVerdictProps) {
  if (!summary) return null;

  const middleStat = categoryType === "fragrance" && summary.avg_wear_time
    ? { label: "Average wear time", value: summary.avg_wear_time }
    : summary.visible_results_in
    ? { label: "Visible results in", value: summary.visible_results_in }
    : null;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-center">
        The Verdict
      </h2>
      <VibeCloud words={summary.vibe_cloud} />
      <ConsensusBar consensus={summary.consensus} />
      <div className="flex gap-4">
        <StatCard label="Would repurchase" value={`${summary.repurchase_pct}%`} />
        {middleStat && <StatCard label={middleStat.label} value={middleStat.value} />}
      </div>
    </div>
  );
}
