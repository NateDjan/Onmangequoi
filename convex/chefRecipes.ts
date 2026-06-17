/**
 * Chef Recipes — Curated classic recipes from famous chefs.
 * Matched against user ingredients and shown with "Inspiré de la recette du Chef X".
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ─── Store a chef recipe ──────────────────────────────────────────────────────
export const store = mutation({
  args: {
    name: v.string(),
    chefName: v.string(),
    description: v.string(),
    cookingTime: v.string(),
    difficulty: v.string(),
    servings: v.number(),
    keyIngredients: v.array(v.string()),
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    imagePrompt: v.string(),
    category: v.string(),
    cuisine: v.string(),
    calories: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if recipe with same name already exists
    const existing = await ctx.db
      .query("chefRecipes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      // Update existing recipe
      await ctx.db.patch(existing._id, {
        ...args,
        keyIngredients: args.keyIngredients.map((k) => k.toLowerCase().trim()),
        active: true,
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("chefRecipes", {
      ...args,
      keyIngredients: args.keyIngredients.map((k) => k.toLowerCase().trim()),
      active: true,
      createdAt: Date.now(),
    });
    return { id, created: true };
  },
});

// ─── Update image URL for a chef recipe ───────────────────────────────────────
export const updateImage = mutation({
  args: {
    id: v.id("chefRecipes"),
    imageUrl: v.string(),
  },
  handler: async (ctx, { id, imageUrl }) => {
    await ctx.db.patch(id, { imageUrl });
  },
});

// ─── Get all active chef recipes (for matching) ──────────────────────────────
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("chefRecipes")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

// ─── Get all chef recipes (admin view) ────────────────────────────────────────
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("chefRecipes").collect();
  },
});

// ─── Find matching chef recipes based on user ingredients ─────────────────────
// Returns recipes where the user has ≥60% of the key ingredients
export const findMatches = query({
  args: {
    userIngredients: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userIngredients, limit }) => {
    const allRecipes = await ctx.db
      .query("chefRecipes")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    // Normalize user ingredients for fuzzy matching
    const normalizedUser = userIngredients.map((i) =>
      i.toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    );

    // Score each recipe by how many key ingredients the user has
    const scored = allRecipes.map((recipe) => {
      const keyCount = recipe.keyIngredients.length;
      if (keyCount === 0) return { recipe, score: 0, matchedCount: 0 };

      const matched = recipe.keyIngredients.filter((key) => {
        const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return normalizedUser.some((userIng) =>
          userIng.includes(normalizedKey) || normalizedKey.includes(userIng)
        );
      });

      return {
        recipe,
        score: matched.length / keyCount,
        matchedCount: matched.length,
      };
    });

    // Filter: need at least 60% match AND at least 2 key ingredients matched
    const matches = scored
      .filter((s) => s.score >= 0.6 && s.matchedCount >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit ?? 3);

    return matches.map((m) => ({
      ...m.recipe,
      matchScore: m.score,
      matchedCount: m.matchedCount,
    }));
  },
});

// ─── Delete a chef recipe ─────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("chefRecipes") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── Count total chef recipes ─────────────────────────────────────────────────
export const count = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("chefRecipes").collect();
    return { total: all.length, active: all.filter((r) => r.active).length };
  },
});
