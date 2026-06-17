/**
 * Dish Image Cache — shared across ALL users.
 * Once a dish image is generated for any user, it's reused forever.
 * This cuts image generation costs by ~95% at scale.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Look up a cached image by dish name (normalized)
export const getCachedImage = query({
  args: { dishName: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { dishName }) => {
    const normalized = dishName.toLowerCase().trim();
    const record = await ctx.db
      .query("dishImages")
      .withIndex("by_dish_name", (q) => q.eq("dishName", normalized))
      .first();
    return record ? record.imageUrl : null;
  },
});

// Batch lookup: check which dishes already have cached images
export const getCachedImagesBatch = query({
  args: { dishNames: v.array(v.string()) },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, { dishNames }) => {
    const results: (string | null)[] = [];
    for (const name of dishNames) {
      const normalized = name.toLowerCase().trim();
      const record = await ctx.db
        .query("dishImages")
        .withIndex("by_dish_name", (q) => q.eq("dishName", normalized))
        .first();
      results.push(record ? record.imageUrl : null);
    }
    return results;
  },
});

// Store a newly generated image in the cache
export const storeCachedImage = mutation({
  args: {
    dishName: v.string(),
    imageUrl: v.string(),
    imagePrompt: v.string(),
  },
  handler: async (ctx, { dishName, imageUrl, imagePrompt }) => {
    const normalized = dishName.toLowerCase().trim();
    // Check if already exists (race condition safety)
    const existing = await ctx.db
      .query("dishImages")
      .withIndex("by_dish_name", (q) => q.eq("dishName", normalized))
      .first();
    if (existing) {
      // Update with newest URL
      await ctx.db.patch(existing._id, { imageUrl, updatedAt: Date.now() } as never);
      return existing._id;
    }
    return await ctx.db.insert("dishImages", {
      dishName: normalized,
      imageUrl,
      imagePrompt,
      createdAt: Date.now(),
    });
  },
});

// Clear ALL cached images (used when image prompt style changes)
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("dishImages").collect();
    for (const record of records) {
      await ctx.db.delete(record._id);
    }
    return { deleted: records.length };
  },
});

// Count total cached images (for stats)
export const getCacheStats = query({
  args: {},
  returns: v.object({ totalCached: v.number() }),
  handler: async (ctx) => {
    const records = await ctx.db.query("dishImages").collect();
    return { totalCached: records.length };
  },
});
