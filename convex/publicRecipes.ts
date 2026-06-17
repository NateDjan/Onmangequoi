import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Public recipes — SEO-indexed pages for organic Google traffic.
 * No auth required for reading (public pages).
 */

// Get a single recipe by slug (public, no auth)
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("publicRecipes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

// List recent public recipes (for sitemap / recipe index page)
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const recipes = await ctx.db
      .query("publicRecipes")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit ?? 50);
    return recipes;
  },
});

// Publish a recipe (called by Viktor automation or from the app)
export const publish = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    cookingTime: v.string(),
    difficulty: v.string(),
    servings: v.string(),
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    recipeType: v.optional(v.string()),
    sourceMenuHistoryId: v.optional(v.id("menuHistory")),
  },
  handler: async (ctx, args) => {
    // Generate slug from name
    const slug = args.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    // Check if slug already exists
    const existing = await ctx.db
      .query("publicRecipes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        slug,
      });
      return { id: existing._id, slug, updated: true };
    }

    const id = await ctx.db.insert("publicRecipes", {
      ...args,
      slug,
      createdAt: Date.now(),
    });
    return { id, slug, created: true };
  },
});
