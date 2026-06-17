/**
 * Admin stats — private queries for the app owner.
 * Protected: only accessible to users with the ADMIN_EMAIL address.
 */
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";

const ADMIN_EMAIL = "natanel.d@gmail.com";

async function requireAdmin(ctx: QueryCtx, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await ctx.db.get(userId as any);
  if (!user || (user as { email?: string }).email !== ADMIN_EMAIL) {
    return false;
  }
  return true;
}

export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const isAdmin = await requireAdmin(ctx, userId);
    if (!isAdmin) return null;

    // All users
    const users = await ctx.db.query("users").collect();

    // All subscriptions
    const subs = await ctx.db.query("subscriptions").collect();
    const subByUser = new Map(subs.map((s) => [String(s.userId), s]));

    // All daily usage records
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allUsage = await ctx.db.query("dailyUsage").collect();

    // Auth accounts (provider detection)
    const authAccounts = await ctx.db.query("authAccounts").collect();
    const accountsByUser = new Map<string, string[]>();
    for (const account of authAccounts) {
      const uid = String(account.userId);
      if (!accountsByUser.has(uid)) accountsByUser.set(uid, []);
      accountsByUser.get(uid)!.push((account as { provider?: string }).provider ?? "password");
    }

    // Aggregate total usage per user
    const usageByUser = new Map<string, number>();
    for (const usage of allUsage) {
      const uid = String(usage.userId);
      usageByUser.set(uid, (usageByUser.get(uid) ?? 0) + usage.suggestionsCount);
    }

    // Recent usage (last 7 days) per user
    const recentUsageByUser = new Map<string, number>();
    for (const usage of allUsage.filter((u) => u.createdAt >= sevenDaysAgo)) {
      const uid = String(usage.userId);
      recentUsageByUser.set(uid, (recentUsageByUser.get(uid) ?? 0) + usage.suggestionsCount);
    }

    // Daily signups (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const dailySignups: Record<string, number> = {};
    for (const user of users) {
      const createdAt = user._creationTime;
      if (createdAt >= thirtyDaysAgo) {
        const day = new Date(createdAt).toISOString().slice(0, 10);
        dailySignups[day] = (dailySignups[day] ?? 0) + 1;
      }
    }

    // Build user list
    const userList = users.map((user) => {
      const uid = String(user._id);
      const sub = subByUser.get(uid);
      return {
        id: uid,
        email: (user as { email?: string }).email ?? null,
        name: (user as { name?: string }).name ?? null,
        image: (user as { image?: string }).image ?? null,
        createdAt: user._creationTime,
        plan: sub?.plan ?? "free",
        subStatus: sub?.status ?? null,
        totalUsage: usageByUser.get(uid) ?? 0,
        recentUsage: recentUsageByUser.get(uid) ?? 0,
        providers: accountsByUser.get(uid) ?? [],
      };
    });

    // Sort by signup date desc
    userList.sort((a, b) => b.createdAt - a.createdAt);

    const proCount = subs.filter((s) => s.plan === "pro" && s.status === "active").length;

    return {
      totalUsers: users.length,
      proUsers: proCount,
      freeUsers: users.length - proCount,
      totalSuggestions: allUsage.reduce((acc, u) => acc + u.suggestionsCount, 0),
      activeThisWeek: recentUsageByUser.size,
      dailySignups,
      users: userList,
    };
  },
});
