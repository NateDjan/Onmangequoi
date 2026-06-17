/**
 * Stripe Integration — Checkout session creation + webhook handling
 *
 * Price IDs (live):
 *   Monthly: price_1ThFddRuslcT7mGZNipa1RGf  (3.99€/month)
 *   Yearly:  price_1ThFddRuslcT7mGZoVxr6uDA  (29.99€/year)
 */
import { action, httpAction } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const PRICE_IDS = {
  monthly: "price_1ThFddRuslcT7mGZNipa1RGf",
  yearly: "price_1ThFddRuslcT7mGZoVxr6uDA",
};

const SUCCESS_URL = "https://onmangequoi.net/pricing?success=1";
const CANCEL_URL = "https://onmangequoi.net/pricing?cancelled=1";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: raw Stripe API call
// ─────────────────────────────────────────────────────────────────────────────
async function stripePost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(`Stripe ${path} failed: ${err?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(`Stripe GET ${path} failed: ${err?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: create a Stripe Checkout session
// ─────────────────────────────────────────────────────────────────────────────
export const createCheckoutSession = action({
  args: {
    billingPeriod: v.union(v.literal("monthly"), v.literal("yearly")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get user email from DB
    const user = await ctx.runQuery(api.users.getById, { userId });
    const email = user?.email ?? undefined;

    const priceId = PRICE_IDS[args.billingPeriod];

    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      // Pass userId in metadata so webhook can match back
      "subscription_data[metadata][userId]": userId,
      "subscription_data[metadata][billingPeriod]": args.billingPeriod,
    };

    if (email) {
      params.customer_email = email;
    }

    const session = await stripePost("checkout/sessions", params);

    return { url: session.url as string };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Action: create Stripe customer portal session (manage / cancel)
// ─────────────────────────────────────────────────────────────────────────────
export const createPortalSession = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const sub = await ctx.runQuery(api.subscriptions.getByUserId, { userId });
    if (!sub?.stripeCustomerId) throw new Error("No active subscription found");

    const session = await stripePost("billing_portal/sessions", {
      customer: sub.stripeCustomerId,
      return_url: "https://onmangequoi.net/pricing",
    });

    return { url: session.url as string };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP action: Stripe webhook
// ─────────────────────────────────────────────────────────────────────────────
export const stripeWebhook = httpAction(async (ctx, req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  // Verify signature if webhook secret is set
  let event: Record<string, unknown>;
  if (STRIPE_WEBHOOK_SECRET) {
    // Manual HMAC-SHA256 verification (no external library)
    const verified = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET);
    if (!verified) {
      return new Response("Invalid signature", { status: 400 });
    }
  }

  event = JSON.parse(body) as Record<string, unknown>;
  const eventType = event.type as string;

  if (eventType === "checkout.session.completed") {
    const session = event.data as { object: Record<string, unknown> };
    const obj = session.object;
    const subscriptionId = obj.subscription as string | undefined;

    if (subscriptionId) {
      // Fetch the subscription to get metadata
      const stripeSub = await stripeGet(`subscriptions/${subscriptionId}`);
      const metadata = stripeSub.metadata as Record<string, string> | undefined;
      const userId = metadata?.userId;
      const billingPeriod = metadata?.billingPeriod ?? "monthly";

      if (userId) {
        const customer = obj.customer as string | undefined;
        const currentPeriodEnd = (stripeSub.current_period_end as number) * 1000;

        await ctx.runMutation(api.subscriptions.upsertSubscription, {
          userId: userId as never,
          plan: "pro",
          status: "active",
          billingPeriod,
          stripeCustomerId: customer,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd,
        });
      }
    }
  }

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const subscription = (event.data as { object: Record<string, unknown> }).object;
    const subscriptionId = subscription.id as string;
    const status = subscription.status as string; // "active" | "canceled" | "past_due" etc.
    const metadata = subscription.metadata as Record<string, string> | undefined;
    const userId = metadata?.userId;
    const billingPeriod = metadata?.billingPeriod ?? "monthly";
    const customer = subscription.customer as string | undefined;
    const currentPeriodEnd = (subscription.current_period_end as number) * 1000;

    if (userId) {
      const plan = status === "active" ? "pro" : "free";
      const normalizedStatus = status === "active" ? "active" : status === "past_due" ? "past_due" : "cancelled";

      await ctx.runMutation(api.subscriptions.upsertSubscription, {
        userId: userId as never,
        plan,
        status: normalizedStatus,
        billingPeriod,
        stripeCustomerId: customer,
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd,
      });
    }
  }

  return new Response("ok", { status: 200 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe signature verification (HMAC-SHA256, no external lib)
// ─────────────────────────────────────────────────────────────────────────────
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const computed = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
    const computedHex = Array.from(new Uint8Array(computed))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedHex === signature;
  } catch {
    return false;
  }
}
