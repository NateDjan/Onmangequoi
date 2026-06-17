import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  photoAnalysis: defineTable({
    storageId: v.string(),
    imageUrl: v.string(),
    status: v.string(), // "pending" | "processing" | "done" | "error"
    items: v.optional(v.string()), // JSON string: [{name, confidence, category}]
    summary: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  menuHistory: defineTable({
    userId: v.id("users"),
    ingredients: v.string(), // comma-separated
    preferences: v.optional(v.string()),
    menus: v.string(), // JSON string of Menu[]
    menuImages: v.optional(v.string()), // JSON string of Record<number, string>
    photoUrl: v.optional(v.string()), // Photo used for analysis, if any
    createdAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_user_date", ["userId", "createdAt"]),

  // Global dish image cache — shared across ALL users
  // Once a dish image is generated, it's reused forever → near-zero cost at scale
  dishImages: defineTable({
    dishName: v.string(),    // Normalized lowercase dish name (cache key)
    imageUrl: v.string(),    // Permanent fal.ai URL
    imagePrompt: v.string(), // Prompt used to generate
    createdAt: v.number(),
  }).index("by_dish_name", ["dishName"]),

  // Async image generation jobs — processed by Viktor image-generation cron
  pendingImages: defineTable({
    sessionId: v.string(),   // Random ID linking 3 images to one session
    index: v.number(),       // 0, 1, 2 (which dish)
    dishName: v.string(),
    imagePrompt: v.string(),
    status: v.string(),      // "pending" | "processing" | "done" | "error"
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  // Public SEO recipes — indexed by Google for organic traffic
  publicRecipes: defineTable({
    slug: v.string(),           // URL-friendly slug
    name: v.string(),           // Recipe name
    description: v.string(),    // Short description
    cookingTime: v.string(),    // "20 min"
    difficulty: v.string(),     // "Facile"
    servings: v.string(),       // "4"
    ingredients: v.array(v.string()),
    steps: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    recipeType: v.optional(v.string()), // classique, allege, sport, gourmand
    sourceMenuHistoryId: v.optional(v.id("menuHistory")),
    createdAt: v.number(),
  }).index("by_slug", ["slug"])
    .index("by_createdAt", ["createdAt"]),

  // User recipe preferences — saved once and reused for future sessions
  userPreferences: defineTable({
    userId: v.id("users"),
    recipeTypes: v.array(v.string()), // ["classique", "allege", "sport", "gourmand"]
    dietaryConstraints: v.optional(v.array(v.string())), // ["vegetarien", "halal", "sans_gluten", ...]
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Subscription status — tracks user plan (free / pro)
  subscriptions: defineTable({
    userId: v.id("users"),
    plan: v.string(),              // "free" | "pro"
    status: v.string(),            // "active" | "cancelled" | "past_due"
    billingPeriod: v.optional(v.string()), // "monthly" | "yearly"
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()), // Unix ms
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_sub", ["stripeSubscriptionId"]),

  // Daily usage tracking — counts free-tier suggestions per day
  dailyUsage: defineTable({
    userId: v.id("users"),
    date: v.string(),              // "YYYY-MM-DD"
    suggestionsCount: v.number(),
    createdAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  // Daily hero image — the food photo shown on the homepage, refreshed every day
  heroImage: defineTable({
    imageUrl: v.string(),       // fal.ai generated image URL
    imagePrompt: v.string(),    // Prompt used to generate
    pillar: v.string(),         // "leger" | "gourmand" | "dessert" | "sport" | "exotique" | "comfort"
    dishName: v.string(),       // e.g. "Bol Buddha saumon avocat"
    date: v.string(),           // "YYYY-MM-DD" (Paris time) — used as idempotency key
    createdAt: v.number(),
  }).index("by_date", ["date"]),

  // Classic chef recipes — curated database of iconic dishes
  // Shown when user's ingredients match, with "Inspiré de la recette du Chef X"
  chefRecipes: defineTable({
    name: v.string(),                    // Recipe name (e.g. "Ratatouille")
    chefName: v.string(),                // Chef name (e.g. "Auguste Gusteau")
    description: v.string(),             // Short appetizing description
    cookingTime: v.string(),             // "45 min"
    difficulty: v.string(),              // "Facile" | "Moyen" | "Difficile"
    servings: v.number(),                // Number of portions
    keyIngredients: v.array(v.string()), // Normalized lowercase key ingredients for matching
    ingredients: v.array(v.string()),    // Full ingredient list with quantities
    steps: v.array(v.string()),          // Preparation steps
    imageUrl: v.optional(v.string()),    // AI-generated image URL
    imagePrompt: v.string(),             // Prompt used to generate the image
    category: v.string(),                // "entrée" | "plat" | "dessert"
    cuisine: v.string(),                 // "française" | "italienne" | "japonaise" etc.
    calories: v.optional(v.number()),    // Estimated kcal per portion
    active: v.boolean(),                 // Whether to include in matching
    createdAt: v.number(),
  }).index("by_active", ["active"])
    .index("by_chef", ["chefName"])
    .index("by_name", ["name"]),
});

export default schema;
