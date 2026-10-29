import type { BeautyProfilePayload } from "@/lib/queries/beauty-profile";

export type QuizQuestion = {
  key: keyof Omit<BeautyProfilePayload, "completed">;
  title: string;
  type: "single" | "multi";
  options: { value: string; label: string }[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    key: "skin_type",
    title: "What's your skin type?",
    type: "single",
    options: [
      { value: "oily", label: "Oily" },
      { value: "dry", label: "Dry" },
      { value: "combination", label: "Combination" },
      { value: "normal", label: "Normal" },
      { value: "sensitive", label: "Sensitive" },
    ],
  },
  {
    key: "skin_concerns",
    title: "What are your top skin concerns?",
    type: "multi",
    options: [
      { value: "acne", label: "Acne" },
      { value: "aging", label: "Aging" },
      { value: "dark_spots", label: "Dark spots" },
      { value: "dryness", label: "Dryness" },
      { value: "redness", label: "Redness" },
      { value: "dullness", label: "Dullness" },
      { value: "pores", label: "Pores" },
      { value: "sensitivity", label: "Sensitivity" },
    ],
  },
  {
    key: "skin_tone_depth",
    title: "How would you describe your skin tone?",
    type: "single",
    options: [
      { value: "fair", label: "Fair" },
      { value: "light", label: "Light" },
      { value: "medium", label: "Medium" },
      { value: "tan", label: "Tan" },
      { value: "deep", label: "Deep" },
    ],
  },
  {
    key: "undertone",
    title: "What's your undertone?",
    type: "single",
    options: [
      { value: "warm", label: "Warm" },
      { value: "cool", label: "Cool" },
      { value: "neutral", label: "Neutral" },
    ],
  },
  {
    key: "hair_type",
    title: "What's your hair type?",
    type: "single",
    options: [
      { value: "straight", label: "Straight" },
      { value: "wavy", label: "Wavy" },
      { value: "curly", label: "Curly" },
      { value: "coily", label: "Coily" },
    ],
  },
  {
    key: "fragrance_families",
    title: "Which fragrance families do you love?",
    type: "multi",
    options: [
      { value: "floral", label: "Floral" },
      { value: "fresh", label: "Fresh" },
      { value: "woody", label: "Woody" },
      { value: "oriental", label: "Oriental" },
      { value: "fruity", label: "Fruity" },
      { value: "gourmand", label: "Gourmand" },
    ],
  },
];
