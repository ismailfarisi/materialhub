"use client";

interface AuthoritySelectorProps {
  label: string;
  value: "authoritative" | "advisory";
  onChange: (value: "authoritative" | "advisory") => void;
}

const HINTS: Record<"authoritative" | "advisory", string> = {
  authoritative: "Updates apply directly to your store. Use only for fully trusted partners.",
  advisory: "Updates queue for admin review before applying. Default for new integrations.",
};

export function AuthoritySelector({ label, value, onChange }: AuthoritySelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-cacao">{label}</p>
      <div className="flex gap-2">
        {(["authoritative", "advisory"] as const).map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={[
                "px-4 py-1.5 rounded-full text-sm font-medium capitalize",
                "transition-colors duration-200",
                active ? "bg-amber text-espresso" : "bg-pearl/30 text-cacao hover:bg-pearl/50",
              ].join(" ")}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-taupe">{HINTS[value]}</p>
    </div>
  );
}
