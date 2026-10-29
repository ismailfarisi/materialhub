"use client";

import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import type { QuizQuestion } from "./quiz-config";

interface QuizStepProps {
  question: QuizQuestion;
  value: string | string[] | null | undefined;
  onChange: (next: string | string[]) => void;
}

export function QuizStep({ question, value, onChange }: QuizStepProps) {
  const { title, type, options } = question;

  function handleClick(optValue: string) {
    if (type === "single") {
      onChange(optValue);
    } else {
      const current = Array.isArray(value) ? value : [];
      if (current.includes(optValue)) {
        onChange(current.filter((v) => v !== optValue));
      } else {
        onChange([...current, optValue]);
      }
    }
  }

  function isActive(optValue: string): boolean {
    if (type === "single") {
      return value === optValue;
    }
    return Array.isArray(value) && value.includes(optValue);
  }

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend
        className="mb-5 w-full"
        style={{
          fontFamily: MAISON_SERIF,
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.2,
          color: "hsl(var(--nl-cacao))",
          letterSpacing: "-0.005em",
        }}
      >
        {title}
        {type === "multi" && (
          <span
            className="block mt-1"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "hsl(var(--nl-russet))",
              fontStyle: "normal",
            }}
          >
            Select all that apply
          </span>
        )}
      </legend>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map((opt) => {
          const active = isActive(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => handleClick(opt.value)}
              className="py-3 px-4 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nl-amber))] focus-visible:ring-offset-1"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                border: `1px solid ${active ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"}`,
                background: active ? "rgba(184,115,51,0.08)" : "rgba(255,255,255,0.55)",
                color: active ? "hsl(var(--nl-amber))" : "hsl(var(--nl-cacao))",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
