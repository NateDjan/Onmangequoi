/**
 * AI-powered food/recipe features — fal.ai only (Viktor out of the loop).
 * Hermes redirects all generation through fal for menus, vision & images.
 */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

// ── fal.ai any-llm (menus, search, structured recipes) ─────────────────────
const FAL_LLM_URL = "https://fal.run/fal-ai/any-llm";
const FAL_KEY_VALUE =
  process.env.FAL_KEY ??
  "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8";
const FAL_LLM_MODELS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-sonnet",
  "meta-llama/llama-3.2-3b-instruct",
];

function schemaKeysFromOutputSchema(outputSchema: {
  type?: string;
  properties?: Record<string, unknown>;
}): string[] {
  return Object.keys(outputSchema?.properties ?? {});
}

function coerceJsonValue(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Fallback LLM: no JSON object in response");
  }
  const parsed = JSON.parse(match[0]) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Fallback LLM: JSON root is not an object");
  }
  return parsed as Record<string, unknown>;
}

async function callFalStructured(
  prompt: string,
  inputText: string,
  outputSchema: { type?: string; properties?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const keys = schemaKeysFromOutputSchema(outputSchema);
  const keyHints = keys
    .map((k) => {
      const prop = (outputSchema.properties?.[k] ?? {}) as {
        type?: string;
        items?: { type?: string };
        description?: string;
      };
      const t = prop.type ?? "string";
      if (t === "array") return `${k} (array of strings)`;
      if (t === "integer" || t === "number") return `${k} (integer)`;
      return `${k} (string)`;
    })
    .join(", ");

  const fullPrompt = `${prompt}

DONNÉES UTILISATEUR :
${inputText}

FORMAT DE RÉPONSE — OBLIGATOIRE :
- Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte hors JSON).
- L'objet DOIT contenir EXACTEMENT ces clés : ${keyHints || "(voir le schéma fourni)"}.
- Les tableaux (ingredients, steps, extras) sont des arrays de strings.
- servings et calories sont des entiers.`;

  let lastErr: unknown = null;
  for (const model of FAL_LLM_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55_000);
      let response: Response;
      try {
        response = await fetch(FAL_LLM_URL, {
          method: "POST",
          headers: {
            Authorization: `Key ${FAL_KEY_VALUE}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: fullPrompt,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`fal LLM HTTP ${response.status}: ${body.slice(0, 300)}`);
      }
      const data = (await response.json()) as {
        output?: string;
        error?: string | null;
      };
      if (data.error) throw new Error(String(data.error));
      const out = (data.output ?? "").trim();
      if (!out) throw new Error(`fal LLM empty output (model=${model})`);
      return coerceJsonValue(out);
    } catch (e) {
      lastErr = e;
      console.error(`[fal-llm-fallback] model=${model} failed:`, e);
    }
  }
  throw new Error(
    `Fallback LLM failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/**
 * Structured AI via fal.ai only — Viktor is out of the loop.
 * Hermes/fal owns all recipe & menu generation.
 */
async function callStructuredAI(args: {
  prompt: string;
  input_text: string;
  output_schema: { type?: string; properties?: Record<string, unknown> };
  intelligence_level?: string;
}): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
  try {
    const result = await callFalStructured(
      args.prompt,
      args.input_text,
      args.output_schema,
    );
    return { result, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[structured-ai] fal-only path failed:", msg);
    return { result: null, error: msg };
  }
}

// ──────────────────────────────────────────────
// Menu Suggestion — AI generates 3 recipe ideas
// Uses flat schema because ai_structured_output
// doesn't populate nested objects in arrays.
// ──────────────────────────────────────────────

function makeRecipeSchema(prefix: string) {
  return {
    [`${prefix}_name`]: { type: "string", description: "Nom appétissant du plat" },
    [`${prefix}_type`]: { type: "string", description: "Type de plat : exactement l'une de ces valeurs : 'peu calorique', 'classique', 'gourmande'" },
    [`${prefix}_description`]: { type: "string", description: "Description courte et alléchante (2-3 phrases)" },
    [`${prefix}_time`]: { type: "string", description: "Temps total de préparation et cuisson (ex: 30 min, 1h15)" },
    [`${prefix}_difficulty`]: { type: "string", description: "Facile, Moyen ou Difficile" },
    [`${prefix}_servings`]: { type: "integer", description: "Nombre de portions" },
    [`${prefix}_ingredients`]: { type: "array", items: { type: "string" }, description: "Liste des ingrédients avec quantités" },
    [`${prefix}_steps`]: { type: "array", items: { type: "string" }, description: "Étapes de préparation" },
    [`${prefix}_imagePrompt`]: {
      type: "string",
      description:
        "English food-photo prompt. MUST name the real carb/protein of THIS recipe (e.g. cooked rice grains if rice, pasta shapes if pasta). List the visible ingredients. FORBID wrong starches (no pasta if recipe is rice). Plate: large wide-rimmed white porcelain plate, entire plate visible, wide shot, 45° elevated, never close-up, never small bowl.",
    },
    [`${prefix}_extras`]: { type: "array", items: { type: "string" }, description: "1-2 ingrédients supplémentaires optionnels qui amélioreraient le plat (ex: 'Parmesan pour garnir', 'Citron pour le jus'). Vide si le plat est déjà complet." },
    [`${prefix}_calories`]: { type: "integer", description: "Estimation des calories par portion (kcal). Donne un chiffre réaliste basé sur les ingrédients." },
  };
}

// Enforce plate style, camera angle AND ingredient fidelity on every imagePrompt
const PLATE_STYLE_SUFFIX =
  ", served on a large wide-rimmed white porcelain deep plate (assiette creuse à large rebord), entire plate fully visible in frame, wide shot showing the whole dish, camera pulled back far enough to see the complete plate with generous empty space around it, 45-degree elevated angle, fine dining presentation, never extreme close-up, never cropped plate, never small bowl or tiny plate";

/** Normalize/clean ingredient tokens for prompt injection */
function cleanIngredientLabel(raw: string): string {
  return raw
    .replace(/^\s*[-•*]+\s*/, "")
    .replace(/^\d+[.,]?\d*\s*(g|kg|ml|cl|l|mg|c\.?à\.?[sc]\.?|cs|cc|tasse|cups?|tbsp|tsp|oz|lb)?\s*/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect main starch / protein markers so we can forbid substitutions
 * that flux tends to invent (pasta instead of rice, noodles instead of grains, etc.).
 */
function ingredientFidelityDirectives(dishName: string, ingredients: string[]): {
  mustShow: string[];
  forbid: string[];
} {
  const blob = `${dishName} ${ingredients.join(" ")}`.toLowerCase();
  const mustShow: string[] = [];
  const forbid: string[] = [];

  const has = (...words: string[]) => words.some((w) => blob.includes(w));

  // Starches — mutually exclusive when only one is present
  const hasRice = has("riz", "rice", "risotto", "basmati", "thaï", "thai");
  const hasPasta = has("pâte", "pate", "pasta", "spaghetti", "tagliatelle", "penne", "nouille", "noodle", "linguine", "fusilli", "macaroni");
  const hasPotato = has("pomme de terre", "patate", "potato", "frite", "purée");
  const hasQuinoa = has("quinoa");
  const hasCouscous = has("couscous", "boulgour", "bulgur", "semoule");
  const hasBread = has("pain", "bread", "toast", "bagel");

  if (hasRice && !hasPasta) {
    mustShow.push("clearly visible cooked rice grains (not pasta, not noodles)");
    forbid.push(
      "pasta",
      "spaghetti",
      "noodles",
      "tagliatelle",
      "penne",
      "fusilli",
      "macaroni",
      "ramen",
      "udon",
      "vermicelli",
    );
  }
  if (hasPasta && !hasRice) {
    mustShow.push("clearly visible pasta shapes matching the recipe");
    forbid.push("rice", "risotto", "rice grains");
  }
  if (hasPotato) mustShow.push("potato pieces or fried potato as described");
  if (hasQuinoa) {
    mustShow.push("quinoa grains");
    if (!hasPasta) forbid.push("pasta", "noodles");
    if (!hasRice) forbid.push("rice");
  }
  if (hasCouscous) {
    mustShow.push("couscous / fine wheat grains");
    if (!hasPasta) forbid.push("long pasta", "spaghetti");
  }
  if (hasBread && !hasPasta && !hasRice) mustShow.push("bread as plated");

  // Proteins
  if (has("poulet", "chicken")) mustShow.push("chicken pieces");
  if (has("saumon", "salmon")) mustShow.push("salmon fillet");
  if (has("boeuf", "bœuf", "beef", "steak")) mustShow.push("beef");
  if (has("porc", "pork", "jambon", "lardon")) mustShow.push("pork / ham as specified");
  if (has("canard", "duck", "magret")) mustShow.push("duck / magret");
  if (has("crevette", "shrimp", "gambas")) mustShow.push("shrimp");
  if (has("thon", "tuna")) mustShow.push("tuna");
  if (has("tofu")) mustShow.push("tofu");
  if (has("œuf", "oeuf", "egg", "omelette")) mustShow.push("egg");
  if (has("feta")) mustShow.push("feta cheese cubes/crumbs");
  if (has("fromage", "cheese", "parmesan", "mozza", "emmental", "chèvre", "chevre") && !has("feta")) {
    mustShow.push("cheese as specified");
  }

  // Veg frequent mismatches
  if (has("courgette", "zucchini")) mustShow.push("zucchini / courgette");
  if (has("tomate", "tomato")) mustShow.push("tomato");
  if (has("épinard", "epinard", "spinach")) mustShow.push("spinach");
  if (has("brocoli", "broccoli")) mustShow.push("broccoli florets");
  if (has("menthe", "mint")) mustShow.push("fresh mint leaves");
  if (has("citron", "lemon")) mustShow.push("lemon");
  if (has("avocat", "avocado")) mustShow.push("avocado");

  // De-dupe
  return {
    mustShow: [...new Set(mustShow)],
    forbid: [...new Set(forbid)],
  };
}

/**
 * Build a strict image prompt that forces ingredient fidelity for fal/flux.
 * Always rewrites the prompt around dish name + ingredients (LLM imagePrompt is only a hint).
 */
function buildStrictFoodImagePrompt(
  dishName: string,
  ingredients: string[],
  llmHint?: string,
): string {
  const cleaned = ingredients.map(cleanIngredientLabel).filter((s) => s.length > 1).slice(0, 12);
  const { mustShow, forbid } = ingredientFidelityDirectives(dishName, cleaned);
  const ingredientList =
    cleaned.length > 0 ? cleaned.join(", ") : "only the ingredients implied by the dish name";

  const hint = (llmHint || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  const must = mustShow.length
    ? `MUST visibly include: ${mustShow.join("; ")}.`
    : "MUST visually match the named dish and listed ingredients.";
  const no = forbid.length
    ? `STRICTLY FORBIDDEN on the plate (do NOT render): ${forbid.join(", ")}.`
    : "Do not add unrelated starches or proteins not in the recipe.";

  return [
    `Professional food photography of "${dishName}".`,
    `Authentic plated meal whose REAL ingredients are exactly: ${ingredientList}.`,
    must,
    no,
    "Do not substitute the main carb or protein. If the recipe is rice-based, show RICE grains only — never pasta or noodles. If pasta-based, show pasta — never rice.",
    hint ? `Plating cue: ${hint}.` : "",
    "Photorealistic, appetizing, restaurant quality, soft natural lighting, shallow depth of field, editorial food magazine style",
    PLATE_STYLE_SUFFIX.replace(/^,\s*/, ""),
  ]
    .filter(Boolean)
    .join(" ");
}

function enforceImagePromptStyle(
  prompt: string,
  dishName?: string,
  ingredients?: string[],
): string {
  if (dishName) {
    return buildStrictFoodImagePrompt(dishName, ingredients ?? [], prompt);
  }
  const lower = prompt.toLowerCase();
  if (lower.includes("wide-rimmed") && lower.includes("entire plate")) return prompt;
  const stripped = prompt
    .replace(/, served on a large wide-rimmed.*$/i, "")
    .replace(/, (photographed|shot) at a 45.*$/i, "");
  return stripped + PLATE_STYLE_SUFFIX;
}

function extractRecipe(data: Record<string, unknown>, prefix: string, fallbackType: string) {
  const rawType = String(data[`${prefix}_type`] || fallbackType).toLowerCase().trim();
  // Normalize to one of the 3 valid types
  let type = fallbackType;
  if (rawType.includes("calor") || rawType.includes("light") || rawType.includes("léger") || rawType.includes("régime")) {
    type = "peu calorique";
  } else if (rawType.includes("sport") || rawType.includes("prot") || rawType.includes("énergie") || rawType.includes("muscle")) {
    type = "sport";
  } else if (rawType.includes("gourm") || rawType.includes("indulg") || rawType.includes("riche")) {
    type = "gourmande";
  }
  const name = String(data[`${prefix}_name`] || "Plat du chef");
  const ingredients = Array.isArray(data[`${prefix}_ingredients`])
    ? (data[`${prefix}_ingredients`] as string[]).map(String)
    : [];
  const llmImagePrompt = String(data[`${prefix}_imagePrompt`] || "");
  return {
    name,
    type,
    description: String(data[`${prefix}_description`] || "Un délicieux plat à découvrir !"),
    cookingTime: String(data[`${prefix}_time`] || "30 min"),
    difficulty: String(data[`${prefix}_difficulty`] || "Moyen"),
    servings: typeof data[`${prefix}_servings`] === "number" ? (data[`${prefix}_servings`] as number) : 4,
    ingredients,
    steps: Array.isArray(data[`${prefix}_steps`]) ? (data[`${prefix}_steps`] as string[]).map(String) : [],
    imagePrompt: enforceImagePromptStyle(llmImagePrompt, name, ingredients),
    extras: Array.isArray(data[`${prefix}_extras`]) ? (data[`${prefix}_extras`] as string[]).map(String) : [],
    calories: typeof data[`${prefix}_calories`] === "number" ? (data[`${prefix}_calories`] as number) : undefined,
  };
}

// Plan modes:
// "single"   → 3 recettes pour un repas (comportement original)
// "evening"  → 7 dîners (1 par soir sur la semaine)
// "noon_eve" → 7 déjeuners + 7 dîners
// "full"     → 7 petits-déj + 7 déjeuners + 7 dîners

interface Menu {
  name: string;
  type: string;
  description: string;
  cookingTime: string;
  difficulty: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  imagePrompt: string;
  extras: string[];
  calories?: number;
}

function makeWeeklySchema(slots: string[]) {
  const props: Record<string, unknown> = {};
  for (const slot of slots) {
    const p = `slot_${slot}`;
    props[`${p}_name`] = { type: "string", description: "Nom appétissant du plat" };
    props[`${p}_description`] = { type: "string", description: "Description courte (1-2 phrases)" };
    props[`${p}_time`] = { type: "string", description: "Temps de préparation (ex: 20 min)" };
    props[`${p}_difficulty`] = { type: "string", description: "Facile, Moyen ou Difficile" };
    props[`${p}_servings`] = { type: "integer", description: "Nombre de portions" };
    props[`${p}_ingredients`] = { type: "array", items: { type: "string" }, description: "Ingrédients avec quantités" };
    props[`${p}_steps`] = { type: "array", items: { type: "string" }, description: "Étapes de préparation" };
    props[`${p}_imagePrompt`] = {
      type: "string",
      description:
        "English food-photo prompt naming the REAL ingredients of this meal (rice if rice, pasta if pasta — never swap). Large wide-rimmed white porcelain plate, entire plate visible, wide shot, never close-up.",
    };
    props[`${p}_calories`] = { type: "integer", description: "Estimation calories par portion (kcal)" };
  }
  return props;
}

function extractWeeklyRecipe(data: Record<string, unknown>, slot: string): Menu {
  const p = `slot_${slot}`;
  const name = String(data[`${p}_name`] || "Plat du chef");
  const ingredients = Array.isArray(data[`${p}_ingredients`])
    ? (data[`${p}_ingredients`] as string[]).map(String)
    : [];
  const llmImagePrompt = String(data[`${p}_imagePrompt`] || "");
  return {
    name,
    type: "classique",
    description: String(data[`${p}_description`] || ""),
    cookingTime: String(data[`${p}_time`] || "30 min"),
    difficulty: String(data[`${p}_difficulty`] || "Facile"),
    servings: typeof data[`${p}_servings`] === "number" ? (data[`${p}_servings`] as number) : 4,
    ingredients,
    steps: Array.isArray(data[`${p}_steps`]) ? (data[`${p}_steps`] as string[]).map(String) : [],
    imagePrompt: enforceImagePromptStyle(llmImagePrompt, name, ingredients),
    extras: [],
    calories: typeof data[`${p}_calories`] === "number" ? (data[`${p}_calories`] as number) : undefined,
  };
}

// Recipe type definitions for user preferences
// "classique" | "allege" | "sport" | "gourmand"
// "custom" is generated when user fills "envie particulière"

const RECIPE_TYPE_PROMPTS: Record<string, { label: string; desc: string; fallback: string }> = {
  classique: {
    label: "Classique",
    desc: "un plat familial traditionnel, bien équilibré, savoureux et accessible à tous",
    fallback: "classique",
  },
  allege: {
    label: "Allégé",
    desc: "un plat léger, peu calorique, healthy, idéal pour un régime ou surveiller sa ligne",
    fallback: "peu calorique",
  },
  sport: {
    label: "Sport",
    desc: "un plat riche en protéines, équilibré, idéal pour la récupération sportive ou faire le plein d'énergie",
    fallback: "sport",
  },
  gourmand: {
    label: "Gourmand",
    desc: "un plat riche, savoureux, décadent, un plaisir sans compromis",
    fallback: "gourmande",
  },
};

// Dietary constraint labels for prompt injection
const DIETARY_CONSTRAINT_LABELS: Record<string, string> = {
  vegetarien: "Végétarien — pas de viande ni poisson",
  vegan: "Végan — aucun produit animal (pas de viande, poisson, œufs, lait, beurre, fromage, miel)",
  halal: "Halal — pas de porc, pas d'alcool, viande halal uniquement",
  casher: "Casher — pas de porc, pas de crustacés, pas de mélange viande/lait",
  sans_porc: "Sans porc — aucun produit à base de porc (jambon, lardons, saucisse, etc.)",
  sans_gluten: "Sans gluten — pas de blé, orge, seigle, avoine (sauf certifié sans gluten)",
  sans_lactose: "Sans lactose — pas de lait, crème, beurre, fromage (sauf sans lactose)",
  sans_fruits_de_mer: "Sans fruits de mer ni crustacés",
  sans_noix: "Sans noix ni arachides — aucun fruit à coque",
  sans_oeufs: "Sans œufs",
  sans_soja: "Sans soja ni dérivés de soja",
};

export const suggestMenus = action({
  args: {
    ingredients: v.string(),
    preferences: v.optional(v.string()),
    planMode: v.optional(v.string()), // "single" | "evening" | "noon_eve" | "full"
    recipeTypes: v.optional(v.array(v.string())), // e.g. ["classique", "gourmand"]
    dietaryConstraints: v.optional(v.array(v.string())), // e.g. ["halal", "sans_gluten"]
    servings: v.optional(v.number()), // number of people
  },
  returns: v.object({
    menus: v.array(
      v.object({
        name: v.string(),
        type: v.string(),
        description: v.string(),
        cookingTime: v.string(),
        difficulty: v.string(),
        servings: v.number(),
        ingredients: v.array(v.string()),
        steps: v.array(v.string()),
        imagePrompt: v.string(),
        extras: v.array(v.string()),
        calories: v.optional(v.number()),
        slot: v.optional(v.string()),
        chefName: v.optional(v.string()),
        chefInspired: v.optional(v.boolean()),
      }),
    ),
  }),
  handler: async (ctx, { ingredients, preferences, planMode = "single", recipeTypes, dietaryConstraints, servings }) => {
    // Build dietary constraints prompt section
    const constraintsList = (dietaryConstraints ?? [])
      .map((c) => DIETARY_CONSTRAINT_LABELS[c])
      .filter(Boolean);
    const constraintsPrompt = constraintsList.length > 0
      ? `\n\nCONTRAINTES ALIMENTAIRES OBLIGATOIRES (à respecter impérativement) :\n${constraintsList.map((c) => `- ${c}`).join("\n")}\n- Si un ingrédient fourni par l'utilisateur contrevient à une contrainte, NE L'UTILISE PAS dans la recette.`
      : "";

    const servingsText = servings && servings !== 4 ? `\nNombre de personnes : ${servings} (adapte les quantités en conséquence)` : "";
    const inputText = `Ingrédients disponibles : ${ingredients}${servingsText}${preferences ? `\n\nEnvies / préférences : ${preferences}` : ""}${constraintsPrompt}`;

    if (planMode === "single") {
      // ── If user has a specific request ("envie particulière"), generate ONLY that one recipe ──
      if (preferences && preferences.trim().length > 0) {
        const prompt = `Tu es un chef cuisinier. Propose UNE SEULE recette en utilisant STRICTEMENT les ingrédients fournis, en respectant l'envie spécifique de l'utilisateur.\n\nRÈGLES ABSOLUES SUR LES INGRÉDIENTS :\n- Utilise UNIQUEMENT les ingrédients listés par l'utilisateur + sel, poivre et eau (considérés toujours disponibles).\n- N'ajoute AUCUN autre ingrédient non mentionné.\n- Si la liste est limitée, adapte la recette : fais simple mais bon.\n- La recette doit coller le plus possible à l'envie exprimée.\n\nFournis pour recipe1 : name, type, description, time, difficulty, servings, ingredients, steps, imagePrompt, extras, calories\n\nRÈGLE PHOTO (imagePrompt) : en anglais. Doit lister les vrais ingrédients du plat (ex: cooked rice grains si riz — JAMAIS de pasta/noodles à la place). Interdiction de substituer la féculente ou la protéine principale. Grande assiette creuse porcelaine blanche large rebord, assiette entière visible, plan large 45°, jamais gros plan / petit bol.`;

        const outputSchema = {
          type: "object" as const,
          properties: makeRecipeSchema("recipe1"),
        };

        const aiResponse = await callStructuredAI({
          prompt,
          output_schema: outputSchema,
          input_text: inputText,
          intelligence_level: "balanced",
        });

        if (aiResponse.error || !aiResponse.result) {
          throw new Error(aiResponse.error ?? "Impossible de générer le menu");
        }

        const singleMenu: Array<ReturnType<typeof extractRecipe> & { slot: undefined; chefName?: string; chefInspired?: boolean }> = [
          { ...extractRecipe(aiResponse.result, "recipe1", "classique"), slot: undefined },
        ];

        // ── Chef recipe matching for single-recipe mode too ──
        const singleIngList = ingredients
          .split(/[,;\n]+/)
          .map((i: string) => i.trim().toLowerCase())
          .filter((i: string) => i.length > 0);

        if (singleIngList.length >= 2) {
          try {
            const singleChefMatches = await ctx.runQuery(api.chefRecipes.findMatches, {
              userIngredients: singleIngList,
              limit: 1,
            });
            console.log("[chef-match-single] Found matches:", singleChefMatches.length);
            if (singleChefMatches.length > 0) {
              const chef = singleChefMatches[0];
              singleMenu.push({
                name: chef.name,
                type: "classique",
                description: chef.description,
                cookingTime: chef.cookingTime,
                difficulty: chef.difficulty,
                servings: chef.servings,
                ingredients: chef.ingredients,
                steps: chef.steps,
                imagePrompt: buildStrictFoodImagePrompt(
                  chef.name,
                  Array.isArray(chef.ingredients) ? chef.ingredients.map(String) : [],
                  chef.imagePrompt,
                ),
                extras: [] as string[],
                calories: chef.calories,
                slot: undefined,
                chefName: chef.chefName,
                chefInspired: true as const,
              });
            }
          } catch (_e) {
            console.error("[chef-match-single] Failed:", _e);
          }
        }

        return { menus: singleMenu };
      }

      // ── Determine which recipe types to generate ──
      // Default: only "classique" if no preference saved; use saved preferences otherwise
      const typesToGenerate: string[] = (recipeTypes && recipeTypes.length > 0)
        ? recipeTypes
        : ["classique"];

      // Build dynamic prompt for each selected type
      const recipeEntries = typesToGenerate.map((t, i) => {
        const key = `recipe${i + 1}`;
        const cfg = RECIPE_TYPE_PROMPTS[t] ?? RECIPE_TYPE_PROMPTS.classique;
        return { key, type: t, cfg };
      });

      const typeRules = recipeEntries
        .map(({ key, cfg }) => `- ${key} DOIT être : ${cfg.desc}.`)
        .join("\n");

      const recipeCount = recipeEntries.length;
      const recipeKeys = recipeEntries.map((r) => r.key).join(", ");

      const prompt = `Tu es un chef cuisinier. Propose exactement ${recipeCount} recette${recipeCount > 1 ? "s" : ""} en utilisant STRICTEMENT les ingrédients fournis par l'utilisateur.\n\nRÈGLE SUR LES TYPES — OBLIGATOIRE :\n${typeRules}\n\nRÈGLES SUR LES RECETTES :\n- Propose des recettes CLASSIQUES et TRADITIONNELLES en priorité (plats familiaux du quotidien, cuisine française ou internationale bien connue). Évite les recettes trop originales ou exotiques sauf si l'utilisateur le demande.\n- Chaque recette doit avoir un nom reconnaissable (Poulet rôti, Pâtes carbonara, Salade niçoise…).\n\nRÈGLES ABSOLUES SUR LES INGRÉDIENTS :\n- Utilise UNIQUEMENT les ingrédients listés par l'utilisateur + sel, poivre et eau (considérés toujours disponibles).\n- N'ajoute AUCUN autre ingrédient non mentionné.\n- Dans "ingredients", liste UNIQUEMENT des ingrédients qui viennent de la liste fournie (+ sel/poivre/eau).\n- Si la liste est limitée, adapte les recettes : fais simple mais bon.\n\nPour chaque recette (${recipeKeys}), fournis :\n- name, type, description, time, difficulty, servings, ingredients, steps, imagePrompt, extras, calories\n\nRÈGLE PHOTO (imagePrompt) : en anglais. Doit lister les vrais ingrédients du plat (ex: cooked rice grains si riz — JAMAIS de pasta/noodles à la place). Interdiction de substituer la féculente ou la protéine principale. Grande assiette creuse porcelaine blanche large rebord, assiette entière visible, plan large 45°, jamais gros plan / petit bol.`;

      const outputSchema = {
        type: "object" as const,
        properties: recipeEntries.reduce(
          (acc, { key }) => ({ ...acc, ...makeRecipeSchema(key) }),
          {} as Record<string, unknown>,
        ),
      };

      const aiResponse = await callStructuredAI({
        prompt,
        output_schema: outputSchema,
        input_text: inputText,
        intelligence_level: "balanced",
      });

      if (aiResponse.error || !aiResponse.result) {
        throw new Error(aiResponse.error ?? "Impossible de générer les menus");
      }

      const data = aiResponse.result;
      const menus = recipeEntries.map(({ key, cfg }) => ({
        ...extractRecipe(data, key, cfg.fallback),
        slot: undefined,
      }));

      // ── Check for matching chef recipes ──────────────────────────────────
      // Parse user ingredients into a normalized list for matching
      const userIngList = ingredients
        .split(/[,;\n]+/)
        .map((i: string) => i.trim().toLowerCase())
        .filter((i: string) => i.length > 0);

      console.log("[chef-match] Raw ingredients string:", JSON.stringify(ingredients));
      console.log("[chef-match] Parsed list:", JSON.stringify(userIngList));

      if (userIngList.length >= 2) {
        try {
          const chefMatches = await ctx.runQuery(api.chefRecipes.findMatches, {
            userIngredients: userIngList,
            limit: 1,
          });

          console.log("[chef-match] Found matches:", chefMatches.length, chefMatches.map((m: any) => m.name));
          if (chefMatches.length > 0) {
            const chef = chefMatches[0];
            // Replace the last AI recipe with the chef recipe
            const chefMenu = {
              name: chef.name,
              type: "classique",
              description: `${chef.description}`,
              cookingTime: chef.cookingTime,
              difficulty: chef.difficulty,
              servings: chef.servings,
              ingredients: chef.ingredients,
              steps: chef.steps,
              imagePrompt: buildStrictFoodImagePrompt(
                  chef.name,
                  Array.isArray(chef.ingredients) ? chef.ingredients.map(String) : [],
                  chef.imagePrompt,
                ),
              extras: [] as string[],
              calories: chef.calories,
              slot: undefined,
              chefName: chef.chefName,
              chefInspired: true as const,
            };

            if (menus.length > 1) {
              // Replace the last one
              menus[menus.length - 1] = chefMenu;
            } else {
              // Add as a second option
              menus.push(chefMenu);
            }
          }
        } catch (_e) {
          // Chef recipe matching is non-critical — don't fail the whole request
          console.error("Chef recipe matching failed:", _e);
        }
      }

      return { menus };
    }

    // ── Weekly plan modes ──
    const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
    const DAY_LABELS: Record<string, string> = {
      lun: "Lundi", mar: "Mardi", mer: "Mercredi", jeu: "Jeudi",
      ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
    };

    let slots: string[] = [];
    if (planMode === "evening") {
      slots = DAYS.map((d) => `${d}_soir`);
    } else if (planMode === "noon_eve") {
      slots = DAYS.flatMap((d) => [`${d}_midi`, `${d}_soir`]);
    } else if (planMode === "full") {
      slots = DAYS.flatMap((d) => [`${d}_matin`, `${d}_midi`, `${d}_soir`]);
    }

    const mealLabels: Record<string, string> = {
      matin: "Petit-déjeuner", midi: "Déjeuner", soir: "Dîner",
    };

    const slotDescriptions = slots.map((s) => {
      const [day, meal] = s.split("_");
      return `${s} (${DAY_LABELS[day]} — ${mealLabels[meal]})`;
    }).join(", ");

    const prompt = `Tu es un chef cuisinier créatif. Tu dois planifier les repas de la semaine en utilisant STRICTEMENT les ingrédients fournis par l'utilisateur.

RÈGLES ABSOLUES SUR LES INGRÉDIENTS :
- Utilise UNIQUEMENT les ingrédients listés + sel, poivre et eau (toujours disponibles).
- N'ajoute AUCUN autre ingrédient non mentionné.
- Si la liste est limitée, adapte : fais simple mais bon et varié.
- Varie les recettes pour ne pas répéter le même plat plusieurs fois dans la semaine.

Tu dois fournir une recette pour chacun des créneaux suivants : ${slotDescriptions}.

Pour chaque créneau (ex: slot_lun_soir), fournis :
- name : nom appétissant du plat
- description : description courte (1-2 phrases)
- time : temps de préparation (ex: "20 min")
- difficulty : Facile, Moyen ou Difficile
- servings : nombre de portions (entier)
- ingredients : liste des ingrédients avec quantités
- steps : étapes de préparation claires
- imagePrompt : en anglais, noms des VRAIS ingrédients (cooked rice grains si riz — JAMAIS pasta/noodles). Interdiction de substituer féculente/protéine. Grande assiette creuse porcelaine blanche large rebord, plan large 45°, jamais gros plan / petit bol
- calories : estimation réaliste des calories par portion (kcal)`;

    const outputSchema = {
      type: "object" as const,
      properties: makeWeeklySchema(slots),
    };

    const aiResponse = await callStructuredAI({
      prompt,
      output_schema: outputSchema,
      input_text: inputText,
      intelligence_level: "balanced",
    });

    if (aiResponse.error || !aiResponse.result) {
      throw new Error(aiResponse.error ?? "Impossible de générer le planning");
    }

    const data = aiResponse.result;
    const menus = slots.map((slot) => ({
      ...extractWeeklyRecipe(data, slot),
      slot,
    }));

    return { menus };
  },
});

export const generateUploadUrl = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = action({
  args: { storageId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId as any);
  },
});


// Legacy no-op: photo analysis is done client-side via analyzePhotoDirectly (fal).
// Kept so old clients calling triggerPhotoAnalysis don't crash.
export const triggerPhotoAnalysis = action({
  args: {},
  returns: v.object({ triggered: v.boolean() }),
  handler: async () => {
    // Viktor cron removed — real path is analyzePhotoDirectly (fal vision).
    return { triggered: false };
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Direct photo analysis — no cron, no polling delay (~5-8s total)
// Calls Viktor AI vision directly from Convex action
// ──────────────────────────────────────────────────────────────────────────────

interface FoodItem {
  name: string;
  confidence: string;
  category: string;
}

// ── fal.ai vision: fast, direct, no agent startup ──────────────────────────
const FAL_VISION_URL = "https://fal.run/fal-ai/any-llm/vision";

async function analyzeFoodImage(imageUrl: string): Promise<FoodItem[]> {
  const prompt = `Tu es un expert en reconnaissance d'aliments et en lecture de tickets de caisse / reçus de supermarché. Analyse cette image et identifie TOUS les produits alimentaires.

L'image peut être :
A) Une photo d'aliments (frigo, placard, plan de travail, rayon de supermarché, etc.)
B) Un ticket de caisse / reçu / bon de commande de supermarché ou magasin alimentaire
C) Une capture d'écran d'une commande de courses en ligne (Carrefour, Leclerc, Auchan, Uber Eats, etc.)

RÈGLES IMPORTANTES :
- Identifie CHAQUE aliment/produit alimentaire distinct
- Pour les tickets de caisse : lis les noms des produits listés, même abrégés (ex: "TOM CERISE" → "Tomates cerises", "PV SAUMON FUM" → "Saumon fumé", "LT DEMI ECR" → "Lait demi-écrémé")
- Ignore les produits non alimentaires sur un ticket (sacs, produits ménagers, etc.)
- Utilise les noms complets en français
- Sois exhaustif : inclus légumes, fruits, viandes, produits laitiers, boissons, condiments, surgelés, etc.
- confidence: "haute" = clairement lisible/visible, "moyenne" = partiellement lisible/visible, "basse" = incertain
- category: légume / fruit / viande / poisson / produit laitier / féculent / condiment / boisson / surgelé / autre
- Si aucun aliment visible ou lisible, retourne un tableau vide []

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, sans autre texte :
[{"name": "Tomates cerises", "confidence": "haute", "category": "légume"}, ...]`;

  // Hard timeout: 25s — if fal.ai doesn't respond in time, throw so the caller marks "error"
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch(FAL_VISION_URL, {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY_VALUE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        prompt,
        image_url: imageUrl,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`fal.ai vision error: ${response.status}`);
  }

  const data = await response.json() as { output?: string; error?: string };
  if (data.error) throw new Error(data.error);

  const raw = (data.output ?? "").trim();

  // Extract JSON array from the response (may contain markdown fences)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("No JSON array in fal vision response:", raw.slice(0, 300));
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{ name: string; confidence?: string; category?: string }>;
  return parsed
    .filter((item) => item.name && item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      confidence: item.confidence ?? "haute",
      category: item.category ?? "autre",
    }));
}

export const analyzePhotoDirectly = action({
  args: {
    analysisId: v.id("photoAnalysis"),
    imageUrl: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    itemCount: v.number(),
  }),
  handler: async (ctx, { analysisId, imageUrl }) => {
    // Mark as processing
    await ctx.runMutation(api.photoAnalysis.updateAnalysis, {
      id: analysisId,
      status: "processing",
    });

    try {
      const items = await analyzeFoodImage(imageUrl);

      if (items.length === 0) {
        await ctx.runMutation(api.photoAnalysis.updateAnalysis, {
          id: analysisId,
          status: "error",
          summary: "Aucun ingrédient détecté dans cette photo. Réessaie avec une photo plus nette.",
        });
        return { success: false, itemCount: 0 };
      }

      const summary = `J'ai trouvé ${items.length} produit${items.length !== 1 ? "s" : ""} !`;

      await ctx.runMutation(api.photoAnalysis.updateAnalysis, {
        id: analysisId,
        status: "done",
        items: JSON.stringify(items),
        summary,
      });

      return { success: true, itemCount: items.length };
    } catch (e) {
      console.error("analyzePhotoDirectly error:", e);
      await ctx.runMutation(api.photoAnalysis.updateAnalysis, {
        id: analysisId,
        status: "error",
        summary: "L'analyse a échoué, réessaie avec une nouvelle photo",
      });
      return { success: false, itemCount: 0 };
    }
  },
});

// Fetch a Pollinations image and store it permanently in Convex Storage
// Returns a permanent storage URL, or null on failure
// ─── Food photo via Pollinations.ai (AI-generated, fast, direct URL) ─────────
// Key insight: return the URL immediately — the browser fetches the image itself.
// No server-side download = instant response, ~1–5s image load in browser.

export const fetchAndStoreMenuImages = action({
  args: {
    imagePrompts: v.array(v.string()),
    dishNames: v.array(v.string()),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    sessionId: v.string(),
    urls: v.array(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, { imagePrompts, dishNames, sessionId }) => {
    // Generate a unique session ID for this batch
    const sid = sessionId ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

    // ── Check global dish image cache first ──────────────────────────────────
    // If a dish was generated before (by any user), reuse the cached image.
    // This cuts image generation cost by ~95% once the cache is warm.
    const names = dishNames.map((n) => (n ?? "").toLowerCase().trim());
    const cachedUrls: (string | null)[] = await ctx.runQuery(api.dishImages.getCachedImagesBatch, {
      dishNames: names,
    });

    // Insert immediate results from cache into pendingImages as "done"
    // and only create pending jobs for uncached dishes
    const jobsToGenerate: Array<{ index: number; dishName: string; imagePrompt: string }> = [];
    const prefilledJobs: Array<{ index: number; dishName: string; imagePrompt: string; cachedUrl: string }> = [];

    for (let i = 0; i < imagePrompts.length; i++) {
      if (cachedUrls[i]) {
        prefilledJobs.push({
          index: i,
          dishName: names[i],
          imagePrompt: imagePrompts[i],
          cachedUrl: cachedUrls[i] as string,
        });
      } else {
        jobsToGenerate.push({ index: i, dishName: names[i], imagePrompt: imagePrompts[i] });
      }
    }

    // Create done records for cached images
    if (prefilledJobs.length > 0) {
      await ctx.runMutation(api.pendingImages.createCachedBatch, {
        sessionId: sid,
        jobs: prefilledJobs,
      });
    }

    // Create pending jobs only for uncached dishes
    if (jobsToGenerate.length > 0) {
      await ctx.runMutation(api.pendingImages.createPendingBatch, {
        sessionId: sid,
        jobs: jobsToGenerate,
      });

      // Generate images ourselves via fal (no Viktor cron)
      try {
        await ctx.scheduler.runAfter(0, internal.viktorTools.processPendingImages, {});
      } catch (e) {
        console.error("[images] failed to schedule fal image jobs:", e);
      }
    }

    return { sessionId: sid, urls: cachedUrls };
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Plazam — Analyze a dish photo → return dish name + full recipe
// ──────────────────────────────────────────────────────────────────────────────

export interface PlazamRecipe {
  dishName: string;
  description: string;
  servings: number;
  prepTime: number; // minutes
  cookTime: number; // minutes
  ingredients: { quantity: string; name: string }[];
  steps: string[];
  tips: string;
  imagePrompt: string;
}

export const analyzeDishPhoto = action({
  args: {
    imageUrl: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      dishName: v.string(),
      description: v.string(),
      servings: v.number(),
      prepTime: v.number(),
      cookTime: v.number(),
      ingredients: v.array(v.object({ quantity: v.string(), name: v.string() })),
      steps: v.array(v.string()),
      tips: v.string(),
      imagePrompt: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    }),
  ),
  handler: async (_ctx, { imageUrl }) => {
    const prompt = `Tu es un chef cuisinier expert en reconnaissance de plats. Analyse cette photo d'un plat cuisiné et retourne la recette complète.

INSTRUCTIONS :
- Identifie le nom du plat (si c'est un plat connu, utilise son nom exact)
- Estime les ingrédients et leurs quantités pour 2-4 personnes
- Écris les étapes de préparation détaillées
- Sois précis et pratique
- Réponds en français

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte autour) :
{
  "dishName": "Nom exact du plat",
  "description": "Courte description appétissante (1-2 phrases)",
  "servings": 4,
  "prepTime": 15,
  "cookTime": 30,
  "ingredients": [
    {"quantity": "2 cs", "name": "huile d'olive"},
    {"quantity": "500g", "name": "poulet"}
  ],
  "steps": [
    "Étape 1...",
    "Étape 2..."
  ],
  "tips": "Conseil du chef (optionnel)",
  "imagePrompt": "Professional food photography of [dish name], entire plate fully visible, wide shot, large white porcelain plate, fine dining, soft natural lighting"
}

Si tu ne peux pas identifier un plat cuisiné (image floue, non-alimentaire, etc.), retourne :
{"error": "Impossible d'identifier un plat dans cette image"}`;

    try {
      const response = await fetch(FAL_VISION_URL, {
        method: "POST",
        headers: {
          "Authorization": `Key ${FAL_KEY_VALUE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          prompt,
          image_url: imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.status}`);
      }

      const data = await response.json() as { output?: string; error?: string };
      if (data.error) throw new Error(data.error);

      const raw = (data.output ?? "").trim();

      // Extract JSON from response (may have markdown fences)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false as const, error: "Impossible d'identifier un plat dans cette image" };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      if (parsed.error) {
        return { success: false as const, error: parsed.error as string };
      }

      return {
        success: true as const,
        dishName: String(parsed.dishName ?? "Plat inconnu"),
        description: String(parsed.description ?? ""),
        servings: Number(parsed.servings ?? 4),
        prepTime: Number(parsed.prepTime ?? 15),
        cookTime: Number(parsed.cookTime ?? 30),
        ingredients: Array.isArray(parsed.ingredients)
          ? (parsed.ingredients as Array<{ quantity: string; name: string }>).map((i) => ({
              quantity: String(i.quantity ?? ""),
              name: String(i.name ?? ""),
            }))
          : [],
        steps: Array.isArray(parsed.steps) ? (parsed.steps as string[]).map(String) : [],
        tips: String(parsed.tips ?? ""),
        imagePrompt: String(
          parsed.imagePrompt ??
          `Professional food photography of ${parsed.dishName}, entire plate fully visible, wide shot, large white porcelain plate, fine dining`
        ),
      };
    } catch (e) {
      console.error("analyzeDishPhoto error:", e);
      return { success: false as const, error: "L'analyse a échoué, réessaie avec une photo plus nette du plat" };
    }
  },
});

// Quick AI answer via fal (no Viktor)
export const quickAiSearch = action({
  args: { query: v.string() },
  returns: v.string(),
  handler: async (_ctx, { query }) => {
    const result = await callFalStructured(
      "Tu es un assistant culinaire. Réponds de façon concise et utile en français.",
      query,
      {
        type: "object",
        properties: {
          answer: { type: "string", description: "Réponse courte et utile" },
        },
      },
    );
    return String(result.answer ?? JSON.stringify(result));
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Image generation queue — fal.ai + Pollinations (no Viktor)
//
// processPendingImages  — internalAction, scheduled after fetchAndStoreMenuImages
// retryPendingImages    — public action (manual unblock / curl)
// ──────────────────────────────────────────────────────────────────────────────
async function processPendingImageJobs(ctx: {
  runQuery: Function;
  runMutation: Function;
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  details: string[];
}> {
  const jobs: Array<{
    _id: string;
    dishName: string;
    imagePrompt: string;
  }> = await ctx.runQuery(api.pendingImages.getPendingJobs, {});

  if (jobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, details: ["No pending image jobs found"] };
  }

  const details: string[] = [];
  let succeeded = 0;
  let failed = 0;

  const buildPrompt = (dishName: string, imagePrompt: string) => {
    // imagePrompt is already rewritten with strict ingredient fidelity in extractRecipe.
    // Prefacing with dish name again helps flux anchor the subject.
    const base = (imagePrompt || "").trim();
    if (base.length > 40) {
      return base;
    }
    return buildStrictFoodImagePrompt(dishName || "plated meal", [], base);
  };

  const FAL_IMAGE_MODEL = "fal-ai/flux/schnell";

  const tryFal = async (dishName: string, imagePrompt: string): Promise<string | null> => {
    try {
      const resp = await fetch(`https://fal.run/${FAL_IMAGE_MODEL}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY_VALUE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: buildPrompt(dishName, imagePrompt),
          image_size: { width: 768, height: 768 },
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: false,
        }),
      });
      if (resp.status === 402 || resp.status === 403 || resp.status === 429) return null;
      if (!resp.ok) return null;
      const data = (await resp.json()) as { images?: Array<{ url: string }> };
      return data.images?.[0]?.url ?? null;
    } catch {
      return null;
    }
  };

  const tryPollinations = async (dishName: string, imagePrompt: string): Promise<string | null> => {
    try {
      const encoded = encodeURIComponent(buildPrompt(dishName, imagePrompt));
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&model=flux`;
      const resp = await fetch(url);
      if (resp.ok && resp.headers.get("content-type")?.startsWith("image/")) {
        return resp.url;
      }
      return null;
    } catch {
      return null;
    }
  };

  for (const job of jobs) {
    try {
      await ctx.runMutation(api.pendingImages.updateImageJob, {
        id: job._id as never,
        status: "processing",
      });

      let url = await tryFal(job.dishName, job.imagePrompt);
      let source = "fal";
      if (!url) {
        url = await tryPollinations(job.dishName, job.imagePrompt);
        source = "pollinations";
      }

      if (url) {
        await ctx.runMutation(api.pendingImages.updateImageJob, {
          id: job._id as never,
          status: "done",
          imageUrl: url,
        });
        await ctx.runMutation(api.dishImages.storeCachedImage, {
          dishName: job.dishName,
          imageUrl: url,
          imagePrompt: job.imagePrompt,
        });
        succeeded++;
        details.push(`✅ [${source}] ${job.dishName}`);
      } else {
        await ctx.runMutation(api.pendingImages.updateImageJob, {
          id: job._id as never,
          status: "error",
        });
        failed++;
        details.push(`❌ ${job.dishName}: no URL from fal or pollinations`);
      }
    } catch (e) {
      failed++;
      details.push(`❌ ${job.dishName}: ${e}`);
    }
  }

  return { processed: jobs.length, succeeded, failed, details };
}

export const processPendingImages = internalAction({
  args: {},
  returns: v.object({
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    details: v.array(v.string()),
  }),
  handler: async (ctx) => processPendingImageJobs(ctx),
});

export const retryPendingImages = action({
  args: {},
  returns: v.object({
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    details: v.array(v.string()),
  }),
  handler: async (ctx) => processPendingImageJobs(ctx),
});

// ──────────────────────────────────────────────────────────────────────────────
// regenerateSeoPages — SEO rebuild is local (no Viktor)
//   node scripts/generate-seo-pages.mjs && git push
// ──────────────────────────────────────────────────────────────────────────────
export const regenerateSeoPages = action({
  args: {},
  returns: v.object({
    status: v.string(),
    message: v.string(),
  }),
  handler: async (_ctx) => {
    return {
      status: "manual",
      message:
        "SEO rebuild n'utilise plus Viktor. Lance localement: node scripts/generate-seo-pages.mjs puis push.",
    };
  },
});
