/**
 * Viktor Tools - AI-powered food/recipe features
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const VIKTOR_API_URL = process.env.VIKTOR_SPACES_API_URL!;
const PROJECT_NAME = process.env.VIKTOR_SPACES_PROJECT_NAME!;
const PROJECT_SECRET = process.env.VIKTOR_SPACES_PROJECT_SECRET!;

async function callTool<T>(role: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${VIKTOR_API_URL}/api/viktor-spaces/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_name: PROJECT_NAME,
      project_secret: PROJECT_SECRET,
      role,
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error ?? "Tool call failed");
  }
  return json.result as T;
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
    [`${prefix}_imagePrompt`]: { type: "string", description: "Detailed English prompt for generating a professional food photography image of the finished dish. MUST include: served on a large wide-rimmed white porcelain plate (assiette creuse à large rebord), entire plate fully visible in frame, wide shot, camera pulled far back, fine dining presentation. NEVER crop the plate, NEVER use extreme close-ups, NEVER use small bowls or tiny plates." },
    [`${prefix}_extras`]: { type: "array", items: { type: "string" }, description: "1-2 ingrédients supplémentaires optionnels qui amélioreraient le plat (ex: 'Parmesan pour garnir', 'Citron pour le jus'). Vide si le plat est déjà complet." },
    [`${prefix}_calories`]: { type: "integer", description: "Estimation des calories par portion (kcal). Donne un chiffre réaliste basé sur les ingrédients." },
  };
}

// Enforce plate style & camera angle on every imagePrompt (safety net)
const PLATE_STYLE_SUFFIX = ", served on a large wide-rimmed white porcelain deep plate (assiette creuse à large rebord), entire plate fully visible in frame, wide shot showing the whole dish, camera pulled back far enough to see the complete plate with generous empty space around it, 45-degree elevated angle, fine dining presentation, never extreme close-up, never cropped plate, never small bowl or tiny plate";
function enforceImagePromptStyle(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("wide-rimmed") && lower.includes("entire plate")) return prompt;
  // Strip any existing style suffix before re-adding the updated one
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
  return {
    name: String(data[`${prefix}_name`] || "Plat du chef"),
    type,
    description: String(data[`${prefix}_description`] || "Un délicieux plat à découvrir !"),
    cookingTime: String(data[`${prefix}_time`] || "30 min"),
    difficulty: String(data[`${prefix}_difficulty`] || "Moyen"),
    servings: typeof data[`${prefix}_servings`] === "number" ? (data[`${prefix}_servings`] as number) : 4,
    ingredients: Array.isArray(data[`${prefix}_ingredients`]) ? (data[`${prefix}_ingredients`] as string[]).map(String) : [],
    steps: Array.isArray(data[`${prefix}_steps`]) ? (data[`${prefix}_steps`] as string[]).map(String) : [],
    imagePrompt: enforceImagePromptStyle(String(
      data[`${prefix}_imagePrompt`] ||
        `Professional food photography of ${data[`${prefix}_name`] || "a delicious dish"}, entire plate fully visible in frame, wide shot with camera pulled far back, large wide-rimmed white porcelain plate, fine dining presentation, elegant plating, 45-degree elevated angle, natural soft lighting, editorial food magazine style`,
    )),
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
    props[`${p}_imagePrompt`] = { type: "string", description: "Detailed English prompt for professional food photography. MUST include: served on a large wide-rimmed white porcelain plate (assiette creuse à large rebord), entire plate fully visible in frame, wide shot with camera pulled far back, fine dining presentation. NEVER crop the plate, NEVER use extreme close-ups, NEVER use small bowls or tiny plates." };
    props[`${p}_calories`] = { type: "integer", description: "Estimation calories par portion (kcal)" };
  }
  return props;
}

function extractWeeklyRecipe(data: Record<string, unknown>, slot: string): Menu {
  const p = `slot_${slot}`;
  return {
    name: String(data[`${p}_name`] || "Plat du chef"),
    type: "classique",
    description: String(data[`${p}_description`] || ""),
    cookingTime: String(data[`${p}_time`] || "30 min"),
    difficulty: String(data[`${p}_difficulty`] || "Facile"),
    servings: typeof data[`${p}_servings`] === "number" ? (data[`${p}_servings`] as number) : 4,
    ingredients: Array.isArray(data[`${p}_ingredients`]) ? (data[`${p}_ingredients`] as string[]).map(String) : [],
    steps: Array.isArray(data[`${p}_steps`]) ? (data[`${p}_steps`] as string[]).map(String) : [],
    imagePrompt: enforceImagePromptStyle(String(data[`${p}_imagePrompt`] || `Professional food photography of ${data[`${p}_name`] || "a delicious dish"}, entire plate fully visible in frame, wide shot with camera pulled far back, large wide-rimmed white porcelain plate, fine dining presentation, 45-degree elevated angle, never close-up, never cropped`)),
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
        const prompt = `Tu es un chef cuisinier. Propose UNE SEULE recette en utilisant STRICTEMENT les ingrédients fournis, en respectant l'envie spécifique de l'utilisateur.\n\nRÈGLES ABSOLUES SUR LES INGRÉDIENTS :\n- Utilise UNIQUEMENT les ingrédients listés par l'utilisateur + sel, poivre et eau (considérés toujours disponibles).\n- N'ajoute AUCUN autre ingrédient non mentionné.\n- Si la liste est limitée, adapte la recette : fais simple mais bon.\n- La recette doit coller le plus possible à l'envie exprimée.\n\nFournis pour recipe1 : name, type, description, time, difficulty, servings, ingredients, steps, imagePrompt, extras, calories\n\nRÈGLE PHOTO (imagePrompt) : Le prompt image DOIT montrer le plat servi dans une grande assiette creuse à large rebord en porcelaine blanche, style gastronomique (wide-rimmed white porcelain plate). Photo prise en légère contre-plongée avec un peu de hauteur, ou en biais depuis une distance élégante (45° angle, slightly elevated, shot from a distance). JAMAIS de petit bol ni de petite assiette. JAMAIS de gros plan serré.`;

        const outputSchema = {
          type: "object" as const,
          properties: makeRecipeSchema("recipe1"),
        };

        const aiResponse = await callTool<{
          result: Record<string, unknown> | null;
          error: string | null;
        }>("ai_structured_output", {
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
                imagePrompt: chef.imagePrompt,
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

      const prompt = `Tu es un chef cuisinier. Propose exactement ${recipeCount} recette${recipeCount > 1 ? "s" : ""} en utilisant STRICTEMENT les ingrédients fournis par l'utilisateur.\n\nRÈGLE SUR LES TYPES — OBLIGATOIRE :\n${typeRules}\n\nRÈGLES SUR LES RECETTES :\n- Propose des recettes CLASSIQUES et TRADITIONNELLES en priorité (plats familiaux du quotidien, cuisine française ou internationale bien connue). Évite les recettes trop originales ou exotiques sauf si l'utilisateur le demande.\n- Chaque recette doit avoir un nom reconnaissable (Poulet rôti, Pâtes carbonara, Salade niçoise…).\n\nRÈGLES ABSOLUES SUR LES INGRÉDIENTS :\n- Utilise UNIQUEMENT les ingrédients listés par l'utilisateur + sel, poivre et eau (considérés toujours disponibles).\n- N'ajoute AUCUN autre ingrédient non mentionné.\n- Dans "ingredients", liste UNIQUEMENT des ingrédients qui viennent de la liste fournie (+ sel/poivre/eau).\n- Si la liste est limitée, adapte les recettes : fais simple mais bon.\n\nPour chaque recette (${recipeKeys}), fournis :\n- name, type, description, time, difficulty, servings, ingredients, steps, imagePrompt, extras, calories\n\nRÈGLE PHOTO (imagePrompt) : Le prompt image DOIT montrer le plat servi dans une grande assiette creuse à large rebord en porcelaine blanche, style gastronomique (wide-rimmed white porcelain plate). Photo prise en légère contre-plongée avec un peu de hauteur, ou en biais depuis une distance élégante (45° angle, slightly elevated, shot from a distance). JAMAIS de petit bol ni de petite assiette. JAMAIS de gros plan serré.`;

      const outputSchema = {
        type: "object" as const,
        properties: recipeEntries.reduce(
          (acc, { key }) => ({ ...acc, ...makeRecipeSchema(key) }),
          {} as Record<string, unknown>,
        ),
      };

      const aiResponse = await callTool<{
        result: Record<string, unknown> | null;
        error: string | null;
      }>("ai_structured_output", {
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
              imagePrompt: chef.imagePrompt,
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
- imagePrompt : prompt détaillé en anglais pour photo food professionnelle. OBLIGATOIRE : le plat doit être servi dans une grande assiette creuse à large rebord en porcelaine blanche (wide-rimmed plate), style gastronomique, présentation élégante. Photo en biais à 45° depuis une légère distance, perspective légèrement surélevée. JAMAIS de petit bol ni de petite assiette. JAMAIS de gros plan serré
- calories : estimation réaliste des calories par portion (kcal)`;

    const outputSchema = {
      type: "object" as const,
      properties: makeWeeklySchema(slots),
    };

    const aiResponse = await callTool<{
      result: Record<string, unknown> | null;
      error: string | null;
    }>("ai_structured_output", {
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


// Trigger the photo analysis cron agent immediately via the Viktor gateway
export const triggerPhotoAnalysis = action({
  args: {},
  returns: v.object({ triggered: v.boolean() }),
  handler: async () => {
    try {
      const result = await callTool<{ status: string }>("trigger_cron", {
        path: "/on-mange-quoi/photo-analysis",
      });
      console.log("Triggered photo analysis cron:", result.status);
      return { triggered: result.status === "success" };
    } catch (e) {
      console.error("Failed to trigger cron:", e);
      return { triggered: false };
    }
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
const FAL_KEY_VALUE = "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8";

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

      // Trigger the image-generation cron immediately
      try {
        await callTool("trigger_cron", { path: "/on-mange-quoi/image-generation" });
      } catch (_e) {
        // Cron trigger is best-effort — it also runs on a schedule
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

// Re-export existing tools
export const quickAiSearch = action({
  args: { query: v.string() },
  returns: v.string(),
  handler: async (_ctx, { query }) => {
    const result = await callTool<{ search_response: string }>("quick_ai_search", {
      search_question: query,
    });
    return result.search_response;
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// retryPendingImages — Remote trigger for stuck image jobs
//
// Allows anyone with the Convex URL to unblock image generation without
// needing access to Viktor's server. Processes ALL pending jobs directly
// from Convex using fal.ai (with Pollinations.ai as free fallback).
//
// Usage:
//   curl -X POST https://acoustic-camel-417.eu-west-1.convex.cloud/api/action \
//     -H 'Content-Type: application/json' \
//     -d '{"path": "viktorTools:retryPendingImages", "args": {}}'
// ──────────────────────────────────────────────────────────────────────────────
export const retryPendingImages = action({
  args: {},
  returns: v.object({
    processed: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    details: v.array(v.string()),
  }),
  handler: async (ctx) => {
    // Fetch all pending jobs
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

    // Helper: build unified food prompt
    const buildPrompt = (dishName: string, imagePrompt: string) =>
      `Professional food photography, ${dishName}, ${imagePrompt}, beautifully plated, appetizing, restaurant quality, soft natural lighting, shallow depth of field, delicious looking`;

    const FAL_IMAGE_MODEL = "fal-ai/flux/schnell";

    // Helper: generate via fal.ai
    const tryFal = async (dishName: string, imagePrompt: string): Promise<string | null> => {
      try {
        const resp = await fetch(`https://fal.run/${FAL_IMAGE_MODEL}`, {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_KEY_VALUE}`,
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
        const data = await resp.json() as { images?: Array<{ url: string }> };
        return data.images?.[0]?.url ?? null;
      } catch {
        return null;
      }
    };

    // Helper: generate via Pollinations.ai (free fallback)
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

    // Process each job sequentially (Convex actions have fetch limits)
    for (const job of jobs) {
      try {
        // Mark as processing
        await ctx.runMutation(api.pendingImages.updateImageJob, {
          id: job._id as never,
          status: "processing",
        });

        // Try fal.ai first, fallback to Pollinations
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
          // Cache for future users
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
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// regenerateSeoPages — Rebuild all static recipe pages + sitemap + Netlify deploy
//
// Triggers Viktor's cron at /on-mange-quoi/seo-rebuild which runs
// rebuild_all_seo_pages.py: generates /recette/{slug}/index.html for every recipe
// (real photo in <img>, og:image, JSON-LD Recipe.image), rebuilds the sitemap
// for all 70 recipes, and deploys the whole dist/ to Netlify.
//
// ⚠️  Route is /recette/{slug}/ (singular) — matches SPA router + sitemap.
//     Static file takes precedence over _redirects catch-all.
//
// Usage:
//   curl -X POST https://acoustic-camel-417.eu-west-1.convex.cloud/api/action \
//     -H 'Content-Type: application/json' \
//     -d '{"path": "viktorTools:regenerateSeoPages", "args": {}}'
// ──────────────────────────────────────────────────────────────────────────────
export const regenerateSeoPages = action({
  args: {},
  returns: v.object({
    status: v.string(),
    message: v.string(),
  }),
  handler: async (_ctx) => {
    await callTool("trigger_cron", { path: "/on-mange-quoi/seo-rebuild" });
    return {
      status: "triggered",
      message: "SEO page rebuild started. Check onmangequoi.net in ~60s.",
    };
  },
});
