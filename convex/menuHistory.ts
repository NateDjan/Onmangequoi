/**
 * Menu History — Save and retrieve past menu generations per user.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Save a menu generation to history
export const saveHistory = mutation({
  args: {
    ingredients: v.string(),
    preferences: v.optional(v.string()),
    menus: v.string(), // JSON string
    menuImages: v.optional(v.string()), // JSON string
    photoUrl: v.optional(v.string()),
  },
  returns: v.id("menuHistory"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    return await ctx.db.insert("menuHistory", {
      userId,
      ingredients: args.ingredients,
      preferences: args.preferences,
      menus: args.menus,
      menuImages: args.menuImages,
      photoUrl: args.photoUrl,
      createdAt: Date.now(),
    });
  },
});

// Update menu images for an existing history entry (images arrive after menus)
export const updateHistoryImages = mutation({
  args: {
    id: v.id("menuHistory"),
    menuImages: v.string(),
  },
  handler: async (ctx, { id, menuImages }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Non autorisé");

    await ctx.db.patch(id, { menuImages });
  },
});

// Get user's menu history (latest first)
export const listHistory = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("menuHistory"),
      ingredients: v.string(),
      preferences: v.optional(v.string()),
      menus: v.string(),
      menuImages: v.optional(v.string()),
      photoUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const entries = await ctx.db
      .query("menuHistory")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return entries.map((e) => ({
      _id: e._id,
      ingredients: e.ingredients,
      preferences: e.preferences,
      menus: e.menus,
      menuImages: e.menuImages,
      photoUrl: e.photoUrl,
      createdAt: e.createdAt,
    }));
  },
});

// Delete a history entry
export const deleteHistory = mutation({
  args: { id: v.id("menuHistory") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Non autorisé");

    await ctx.db.delete(id);
  },
});
