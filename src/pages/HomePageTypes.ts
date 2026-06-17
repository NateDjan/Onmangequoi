// ─── Shared types for HomePage and HomePageSections ──────────────────────────
// Extracted to a separate file so the types are importable by the lazy chunk
// without pulling in all of HomePage's code.

export type RecipeTypeKey = "classique" | "allege" | "sport" | "gourmand";
export type DietaryConstraintKey =
  | "vegetarien"
  | "vegan"
  | "halal"
  | "casher"
  | "sans_porc"
  | "sans_gluten"
  | "sans_lactose"
  | "sans_fruits_de_mer"
  | "sans_noix"
  | "sans_oeufs"
  | "sans_soja";

export const ALL_DIETARY_CONSTRAINTS: { key: DietaryConstraintKey; emoji: string }[] = [
  { key: "vegetarien", emoji: "🥬" },
  { key: "vegan", emoji: "🌱" },
  { key: "halal", emoji: "☪️" },
  { key: "casher", emoji: "✡️" },
  { key: "sans_porc", emoji: "🚫🐷" },
  { key: "sans_gluten", emoji: "🌾" },
  { key: "sans_lactose", emoji: "🥛" },
  { key: "sans_fruits_de_mer", emoji: "🦐" },
  { key: "sans_noix", emoji: "🥜" },
  { key: "sans_oeufs", emoji: "🥚" },
  { key: "sans_soja", emoji: "🫘" },
];

export interface Menu {
  name: string;
  type?: string;
  description: string;
  cookingTime: string;
  difficulty: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  imagePrompt: string;
  extras: string[];
  calories?: number;
  slot?: string; // e.g. "lun_soir" for weekly mode
  chefName?: string;       // Chef name for "Inspiré de" badge
  chefInspired?: boolean;  // Whether this is a chef-inspired recipe
}

export interface DetectedItem {
  name: string;
  confidence: string;
  category: string;
  confirmed: boolean;
  editing: boolean;
}

// Multi-photo entry (frigo, placard, congélateur)
export interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  label: string; // "Frigo", "Placard", "Congélateur"
}

export type PlanMode = "single" | "evening" | "noon_eve" | "full";
export type Phase = "input" | "analyzing" | "confirm" | "plan" | "loading" | "results";
