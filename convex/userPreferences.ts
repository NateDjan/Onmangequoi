import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const pref = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return pref ?? null;
  },
});

export const savePreferences = mutation({
  args: {
    recipeTypes: v.array(v.string()),
    dietaryConstraints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { recipeTypes, dietaryConstraints }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        recipeTypes,
        dietaryConstraints: dietaryConstraints ?? [],
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        recipeTypes,
        dietaryConstraints: dietaryConstraints ?? [],
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});
