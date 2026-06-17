/**
 * Photo Analysis Pipeline
 * 
 * Frontend creates a pending analysis request, then polls for results.
 * A background worker (Viktor cron) processes pending requests using
 * coworker_text2im(gemini-flash-image) for vision analysis.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new photo analysis request
export const createAnalysis = mutation({
  args: {
    storageId: v.string(),
    imageUrl: v.string(),
  },
  returns: v.id("photoAnalysis"),
  handler: async (ctx, { storageId, imageUrl }) => {
    const now = Date.now();
    return await ctx.db.insert("photoAnalysis", {
      storageId,
      imageUrl,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Poll for analysis results
export const getAnalysis = query({
  args: { id: v.id("photoAnalysis") },
  returns: v.union(
    v.object({
      status: v.literal("pending"),
    }),
    v.object({
      status: v.literal("processing"),
    }),
    v.object({
      status: v.literal("done"),
      items: v.string(),
      summary: v.string(),
    }),
    v.object({
      status: v.literal("error"),
      summary: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return null;

    if (doc.status === "done") {
      return {
        status: "done" as const,
        items: doc.items ?? "[]",
        summary: doc.summary ?? "",
      };
    }
    if (doc.status === "error") {
      return {
        status: "error" as const,
        summary: doc.summary ?? "Erreur inconnue",
      };
    }
    return { status: doc.status as "pending" | "processing" };
  },
});

// Get pending analyses (called by the cron worker)
// Also resets "processing" records stuck for > 3 minutes back to "pending"
export const getPendingAnalyses = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("photoAnalysis"),
      imageUrl: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("photoAnalysis")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(5);
    return pending.map((doc) => ({
      _id: doc._id,
      imageUrl: doc.imageUrl,
      createdAt: doc.createdAt,
    }));
  },
});

// Reset analyses stuck in "processing" for > 3 minutes back to "pending"
// Called by the cron worker to recover from crashed actions
export const resetStuckAnalyses = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const threeMinutesAgo = Date.now() - 3 * 60 * 1000;
    const stuck = await ctx.db
      .query("photoAnalysis")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();
    let count = 0;
    for (const doc of stuck) {
      if (doc.updatedAt < threeMinutesAgo) {
        await ctx.db.patch(doc._id, { status: "pending", updatedAt: Date.now() });
        count++;
      }
    }
    return count;
  },
});

// Update analysis status (called by the cron worker)
export const updateAnalysis = mutation({
  args: {
    id: v.id("photoAnalysis"),
    status: v.string(),
    items: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, items, summary }) => {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
    };
    if (items !== undefined) updates.items = items;
    if (summary !== undefined) updates.summary = summary;
    await ctx.db.patch(id, updates);
  },
});
