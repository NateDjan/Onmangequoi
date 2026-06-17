/**
 * Pending Images — Async image generation jobs for menu dish photos.
 * The Viktor image-generation cron processes these and stores imageUrl when done.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create pending image generation jobs for a session (called by fetchAndStoreMenuImages)
export const createPendingBatch = mutation({
  args: {
    sessionId: v.string(),
    jobs: v.array(v.object({
      index: v.number(),
      dishName: v.string(),
      imagePrompt: v.string(),
    })),
  },
  handler: async (ctx, { sessionId, jobs }) => {
    const now = Date.now();
    for (const job of jobs) {
      await ctx.db.insert("pendingImages", {
        sessionId,
        index: job.index,
        dishName: job.dishName,
        imagePrompt: job.imagePrompt,
        status: "pending",
        createdAt: now,
      });
    }
  },
});

// Get all images for a session (for frontend subscription)
export const getSessionImages = query({
  args: { sessionId: v.string() },
  returns: v.array(v.object({
    _id: v.id("pendingImages"),
    index: v.number(),
    status: v.string(),
    imageUrl: v.optional(v.string()),
  })),
  handler: async (ctx, { sessionId }) => {
    const records = await ctx.db
      .query("pendingImages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    return records.map(r => ({ _id: r._id, index: r.index, status: r.status, imageUrl: r.imageUrl }));
  },
});

// Get pending jobs (for cron) — no returns validator to avoid _creationTime mismatch
export const getPendingJobs = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db
      .query("pendingImages")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(10);
    // Map to plain objects for the cron script
    return records.map(r => ({
      _id: r._id,
      sessionId: r.sessionId,
      index: r.index,
      dishName: r.dishName,
      imagePrompt: r.imagePrompt,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
});

// Update image job result (called by cron after generation)
export const updateImageJob = mutation({
  args: {
    id: v.id("pendingImages"),
    status: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, imageUrl }) => {
    const update: { status: string; imageUrl?: string } = { status };
    if (imageUrl !== undefined) update.imageUrl = imageUrl;
    await ctx.db.patch(id, update);
  },
});

// Clean up old completed/errored jobs (older than 1 hour)
export const cleanupOldJobs = mutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const old = await ctx.db
      .query("pendingImages")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    for (const job of old) {
      if (job.createdAt < oneHourAgo) {
        await ctx.db.delete(job._id);
      }
    }
  },
});

// Create "done" records for dishes served from the global cache
export const createCachedBatch = mutation({
  args: {
    sessionId: v.string(),
    jobs: v.array(v.object({
      index: v.number(),
      dishName: v.string(),
      imagePrompt: v.string(),
      cachedUrl: v.string(),
    })),
  },
  handler: async (ctx, { sessionId, jobs }) => {
    const now = Date.now();
    for (const job of jobs) {
      await ctx.db.insert("pendingImages", {
        sessionId,
        index: job.index,
        dishName: job.dishName,
        imagePrompt: job.imagePrompt,
        status: "done",
        imageUrl: job.cachedUrl,
        createdAt: now,
      });
    }
  },
});
