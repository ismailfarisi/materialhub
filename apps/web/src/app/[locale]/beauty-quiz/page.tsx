"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useUpdateBeautyProfile } from "@/lib/queries/beauty-profile";
import type { BeautyProfilePayload } from "@/lib/queries/beauty-profile";
import { QUIZ_QUESTIONS } from "@/components/beauty-quiz/quiz-config";
import { QuizStep } from "@/components/beauty-quiz/quiz-step";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SANS,
  MAISON_SERIF,
} from "@/components/checkout/maison-primitives";

export default function BeautyQuizPage() {
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { isReady } = useRequireAuth();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<BeautyProfilePayload>({});
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync, isPending } = useUpdateBeautyProfile();

  const totalSteps = QUIZ_QUESTIONS.length;
  const currentQuestion = QUIZ_QUESTIONS[step];
  const isLastStep = step === totalSteps - 1;

  const homeRoute = `/${locale}`;

  async function persist(completed: boolean) {
    setError(null);
    try {
      await mutateAsync({ ...answers, completed });
    } catch {
      // "Skip for now" is an explicit escape — don't trap the user if the partial
      // save fails. Only the Finish path surfaces the error and stays on the page.
      if (!completed) {
        router.push(homeRoute);
        return;
      }
      setError("Something went wrong. Please try again.");
      return;
    }
    router.push(homeRoute);
  }

  function handleSkip() {
    persist(false);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleNext() {
    if (isLastStep) {
      persist(true);
    } else {
      setStep((s) => s + 1);
    }
  }

  if (!isReady) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center bg-background"
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          <Eyebrow className="mb-2">Beauty Profile</Eyebrow>
          <SerifTitle size={28}>Let's personalise your picks</SerifTitle>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="flex-1 h-px"
            style={{ background: "rgba(44,24,16,0.10)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${((step + 1) / totalSteps) * 100}%`,
                background: "hsl(var(--nl-amber))",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11,
              letterSpacing: "0.16em",
              color: "hsl(var(--nl-russet))",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Step {step + 1} of {totalSteps}
          </span>
        </div>

        {/* Quiz step */}
        <div className="mb-8">
          <QuizStep
            question={currentQuestion}
            value={answers[currentQuestion.key]}
            onChange={(next) =>
              setAnswers((a) => ({ ...a, [currentQuestion.key]: next }))
            }
          />
        </div>

        {/* Error */}
        {error && (
          <p
            className="mb-4 text-center"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 13,
              color: "rgb(140,55,45)",
            }}
          >
            {error}
          </p>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isPending}
                className="transition-colors disabled:opacity-40"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "hsl(var(--nl-russet))",
                  padding: "8px 14px",
                  border: "1px solid rgba(44,24,16,0.2)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending}
              className="transition-colors disabled:opacity-40"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "hsl(var(--nl-russet))",
                padding: "8px 14px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Skip for now
            </button>
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="transition-all disabled:opacity-40"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "hsl(var(--nl-espresso))",
              background: "hsl(var(--nl-amber))",
              border: "1px solid hsl(var(--nl-amber))",
              padding: "10px 24px",
              cursor: "pointer",
            }}
          >
            {isPending ? "Saving…" : isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
