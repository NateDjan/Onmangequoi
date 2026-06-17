import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

const FREE_DAILY_LIMIT = 3;

/**
 * Get the current user's subscription status.
 * Returns { plan, isPro, usage, limit, canUse }
 */
export const getStatus = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { plan: "free", isPro: false, usage: 0, limit: FREE_DAILY_LIMIT, canUse: true };
    }

    // Get subscription
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const isPro = sub?.plan === "pro" && sub?.status === "active";

    // Get today's usage
    const today = new Date().toISOString().split("T")[0];
    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
      .unique();

    const usageCount = usage?.suggestionsCount ?? 0;
    const canUse = isPro || usageCount < FREE_DAILY_LIMIT;

    return {
      plan: isPro ? "pro" : "free",
      isPro,
      usage: usageCount,
      limit: isPro ? Infinity : FREE_DAILY_LIMIT,
      canUse,
      billingPeriod: sub?.billingPeriod,
      currentPeriodEnd: sub?.currentPeriodEnd,
    };
  },
});

/**
 * Increment daily usage counter. Called after each suggestion generation.
 */
export const incrementUsage = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false };

    const today = new Date().toISOString().split("T")[0];
    const existing = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        suggestionsCount: existing.suggestionsCount + 1,
      });
    } else {
      await ctx.db.insert("dailyUsage", {
        userId,
        date: today,
        suggestionsCount: 1,
        createdAt: Date.now(),
      });
    }

    return { ok: true };
  },
});

/**
 * Check if user can make a suggestion (hasn't hit limit).
 */
export const canSuggest = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { canUse: true, remaining: FREE_DAILY_LIMIT }; // non-logged users can use freely (they can't save anyway)

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (sub?.plan === "pro" && sub?.status === "active") {
      return { canUse: true, remaining: Infinity, isPro: true };
    }

    const today = new Date().toISOString().split("T")[0];
    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
      .unique();

    const used = usage?.suggestionsCount ?? 0;
    const remaining = Math.max(0, FREE_DAILY_LIMIT - used);

    return { canUse: remaining > 0, remaining, isPro: false };
  },
});

/**
 * Create or update a subscription (called from Stripe webhook or manually).
 */
export const upsertSubscription = mutation({
  args: {
    userId: v.id("users"),
    plan: v.string(),
    status: v.string(),
    billingPeriod: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        plan: args.plan,
        status: args.status,
        billingPeriod: args.billingPeriod,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        currentPeriodEnd: args.currentPeriodEnd,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("subscriptions", {
        userId: args.userId,
        plan: args.plan,
        status: args.status,
        billingPeriod: args.billingPeriod,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        currentPeriodEnd: args.currentPeriodEnd,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
