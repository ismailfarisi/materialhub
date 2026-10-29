import { cn } from "@/lib/utils";

export type SpecEntry = { label: string; value: string | null | undefined; mono?: boolean };

interface SpecStripProps {
  entries: SpecEntry[];
}

export function SpecStrip({ entries }: SpecStripProps) {
  const visible = entries.filter((e) => e.value);
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-7 border-y border-nl-cacao/15 mb-10">
      {visible.map((e) => (
        <div key={e.label}>
          <div className="text-[9px] tracking-[0.22em] uppercase text-nl-russet mb-2">
            {e.label}
          </div>
          <div className={cn("font-serif text-lg text-nl-cacao", e.mono && "tracking-wider")}>
            {e.value}
          </div>
        </div>
      ))}
    </div>
  );
}
