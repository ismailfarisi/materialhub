"use client";

import { useState } from "react";
import { ChevronDown, ThumbsUp, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  question: string;
  answer?: string;
  is_vendor_answer?: boolean;
  upvote_count?: number;
  user_name?: string;
}

interface QAAccordionProps {
  questions: Question[];
  productId: string;
}

export function QAAccordion({ questions, productId }: QAAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-8">
          Questions & Answers
        </h2>

        <div className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Have a question? Ask the community..."
            className="flex-1 px-4 py-3 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-copper/30 focus:border-copper placeholder:text-muted-foreground"
          />
          <button className="px-5 py-3 bg-copper text-white rounded-full text-sm font-medium hover:bg-copper/90 transition shrink-0">
            Ask
          </button>
        </div>

        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenId(openId === q.id ? null : q.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-warm/50 transition"
              >
                {q.upvote_count != null && (
                  <span className="flex items-center gap-1 text-xs text-copper shrink-0">
                    <ThumbsUp className="h-3 w-3" />
                    {q.upvote_count}
                  </span>
                )}
                <span className="flex-1 text-sm font-medium">{q.question}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                    openId === q.id && "rotate-180"
                  )}
                />
              </button>
              {openId === q.id && q.answer && (
                <div className={cn("px-4 pb-4 pt-0", q.is_vendor_answer ? "bg-warm/50" : "")}>
                  <div className="border-t border-border pt-3">
                    {q.is_vendor_answer && (
                      <span className="inline-flex items-center gap-1 text-xs text-copper font-medium mb-1.5">
                        <BadgeCheck className="h-3 w-3" />
                        Vendor Response
                      </span>
                    )}
                    <p className="text-sm text-foreground/80">{q.answer}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No questions yet. Be the first to ask!
          </p>
        )}
      </div>
    </section>
  );
}
