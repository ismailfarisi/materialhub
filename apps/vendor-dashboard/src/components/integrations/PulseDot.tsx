"use client";

export type PulseState = "live" | "recent" | "stale";

interface PulseDotProps {
  state: PulseState;
}

export function PulseDot({ state }: PulseDotProps) {
  return (
    <>
      <style>{`
        @keyframes nl-pulse-breathe {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.4); opacity: 0.4; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .nl-pulse-live {
          animation: nl-pulse-breathe 2.5s ease-out infinite;
          box-shadow: 0 0 12px hsl(var(--nl-amber) / 0.4);
        }
      `}</style>
      <span
        aria-hidden="true"
        className={[
          "inline-block shrink-0 rounded-full",
          "w-1.5 h-1.5",
          state === "live"
            ? "bg-amber nl-pulse-live"
            : state === "recent"
              ? "bg-amber"
              : "bg-pearl/50",
        ].join(" ")}
      />
    </>
  );
}
