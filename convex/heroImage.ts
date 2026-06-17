import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get the most recent hero image (for the homepage)
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("heroImage")
      .withIndex("by_date")
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

// Upsert the hero image for a given date (idempotent — cron safe)
export const upsert = mutation({
  args: {
    imageUrl: v.string(),
    imagePrompt: v.string(),
    pillar: v.string(),
    dishName: v.string(),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    // Check if we already have one for today
    const existing = await ctx.db
      .query("heroImage")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existing) {
      // Update in place (allows manual retries)
      await ctx.db.patch(existing._id, {
        imageUrl: args.imageUrl,
        imagePrompt: args.imagePrompt,
        pillar: args.pillar,
        dishName: args.dishName,
      });
      return existing._id;
    }

    return await ctx.db.insert("heroImage", {
      imageUrl: args.imageUrl,
      imagePrompt: args.imagePrompt,
      pillar: args.pillar,
      dishName: args.dishName,
      date: args.date,
      createdAt: Date.now(),
    });
  },
});
