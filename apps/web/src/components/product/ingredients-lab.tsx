"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Check, Leaf, Rabbit, Sparkles } from "lucide-react";

interface IngredientsLabProps {
  key_ingredients?: Array<{ name: string; image_url?: string; benefit: string }>;
  skin_types?: string[];
  concerns?: string[];
  usage_steps?: Array<{ step: number; title: string; description: string }>;
  clean_beauty_badges?: string[];
}

const badgeIcons: Record<string, any> = {
  "Paraben-free": Sparkles,
  "Cruelty-free": Rabbit,
  "Vegan": Leaf,
};

export function IngredientsLab({
  key_ingredients,
  skin_types,
  concerns,
  usage_steps,
  clean_beauty_badges,
}: IngredientsLabProps) {
  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-10">
          The Ingredients Lab
        </h2>

        {key_ingredients && key_ingredients.length > 0 && (
          <div className="mb-10">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {key_ingredients.map((ing) => (
                <div key={ing.name} className="shrink-0 w-56 p-4 rounded-xl bg-warm border border-border text-center">
                  {ing.image_url && (
                    <div className="relative w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden bg-card">
                      <Image src={ing.image_url} alt={ing.name} fill className="object-cover" />
                    </div>
                  )}
                  <h4 className="font-semibold text-sm">{ing.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{ing.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {skin_types && skin_types.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Skin Type</h3>
              <div className="flex flex-wrap gap-2">
                {["Oily", "Dry", "Combination", "Sensitive", "Normal"].map((type) => {
                  const isMatch = skin_types.includes(type);
                  return (
                    <span
                      key={type}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border",
                        isMatch
                          ? "bg-copper/10 text-copper border-copper/20 font-medium"
                          : "bg-warm/50 text-muted-foreground border-border"
                      )}
                    >
                      {isMatch && <Check className="h-3 w-3" />}
                      {type}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {concerns && concerns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Targets</h3>
              <div className="flex flex-wrap gap-2">
                {concerns.map((concern) => (
                  <span key={concern} className="px-3 py-1.5 rounded-full text-sm bg-copper/10 text-copper border border-copper/20 font-medium">
                    {concern}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {usage_steps && usage_steps.length > 0 && (
          <div className="mt-10">
            <h3 className="text-sm font-semibold uppercase tracking-wide mb-4 text-center">How to Use</h3>
            <div className="flex items-start justify-center gap-4 overflow-x-auto scrollbar-hide pb-2">
              {usage_steps.map((step, i) => (
                <div key={step.step} className="flex items-start gap-3">
                  <div className="shrink-0 w-40 text-center">
                    <div className="w-10 h-10 rounded-full bg-copper text-white flex items-center justify-center font-bold text-sm mx-auto">
                      {step.step}
                    </div>
                    <h4 className="font-medium text-sm mt-2">{step.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                  </div>
                  {i < usage_steps.length - 1 && (
                    <div className="hidden md:block w-12 h-px bg-border mt-5 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {clean_beauty_badges && clean_beauty_badges.length > 0 && (
          <div className="mt-8 flex justify-center gap-4">
            {clean_beauty_badges.map((badge) => {
              const Icon = badgeIcons[badge] || Sparkles;
              return (
                <div key={badge} className="flex items-center gap-2 px-4 py-2 rounded-full border border-copper/20 text-copper text-sm font-medium">
                  <Icon className="h-4 w-4" />
                  {badge}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
