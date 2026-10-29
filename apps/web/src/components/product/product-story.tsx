"use client";

import { ScentStory } from "./scent-story";
import { IngredientsLab } from "./ingredients-lab";
import { TheLook } from "./the-look";
import { TheRoutine } from "./the-routine";

interface ProductStoryProps {
  product: any;
}

export function ProductStory({ product }: ProductStoryProps) {
  const categoryType = product.category_type || "general";

  switch (categoryType) {
    case "fragrance":
      return (
        <ScentStory
          scent_notes={product.scent_notes}
          longevity_rating={product.longevity_rating}
          sillage_rating={product.sillage_rating}
          season_ratings={product.season_ratings}
          mood_tags={product.mood_tags}
          smells_like={product.smells_like}
        />
      );
    case "skincare":
      return (
        <IngredientsLab
          key_ingredients={product.key_ingredients}
          skin_types={product.skin_types}
          concerns={product.concerns}
          usage_steps={product.usage_steps}
          clean_beauty_badges={product.clean_beauty_badges}
        />
      );
    case "makeup":
      return (
        <TheLook
          shades={product.shades}
          finish_type={product.finish_type}
          coverage_level={product.coverage_level}
          wear_time={product.wear_time}
          pairs_with={product.pairs_with}
        />
      );
    case "haircare":
      return (
        <TheRoutine
          hair_types={product.hair_types}
          key_ingredients={product.key_ingredients}
          concerns={product.concerns}
          usage_steps={product.usage_steps}
        />
      );
    default:
      if (!product.key_ingredients && !product.specifications) return null;
      return (
        <section className="py-12 md:py-16">
          <div className="container">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-10">Key Features</h2>
            {product.key_ingredients && (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                {product.key_ingredients.map((ing: any) => (
                  <div key={ing.name} className="shrink-0 w-56 p-4 rounded-xl bg-warm border border-border text-center">
                    <h4 className="font-semibold text-sm">{ing.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{ing.benefit}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
  }
}
