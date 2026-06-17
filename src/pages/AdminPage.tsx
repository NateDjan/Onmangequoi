import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import {
  Users,
  TrendingUp,
  Calendar,
  ChefHat,
  Crown,
  Activity,
  Mail,
  UserCheck,
} from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-500/10 text-green-500",
    amber: "bg-amber-500/10 text-amber-500",
    blue: "bg-blue-500/10 text-blue-500",
  };
  return (
    <div className="bg-card rounded-2xl border border-surface-border p-5 flex items-start gap-4">
      <div className={`size-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color] ?? colorMap.primary}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    password: { label: "Email", cls: "bg-slate-500/10 text-slate-400" },
    google: { label: "Google", cls: "bg-red-500/10 text-red-400" },
    apple: { label: "Apple", cls: "bg-gray-500/10 text-gray-300" },
    "microsoft-entra-id": { label: "Microsoft", cls: "bg-blue-500/10 text-blue-400" },
  };
  const { label, cls } = map[provider] ?? { label: provider, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>{label}</span>
  );
}

export function AdminPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const stats = useQuery(api.adminStats.getAdminStats);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="size-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: "/admin" }} replace />;

  // stats === undefined → still loading
  if (stats === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="size-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // stats === null → not admin
  if (stats === null) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <p className="text-muted-foreground text-sm">Accès réservé à l'administrateur.</p>
        </div>
      </div>
    );
  }

  // Build sorted daily signups array
  const signupDays: [string, number][] = Object.entries(stats.dailySignups as Record<string, number>)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14); // last 14 days
  const maxSignups = Math.max(...signupDays.map(([, v]: [string, number]) => v), 1);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 max-w-4xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="text-2xl">📊</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gold">Console Admin</h1>
          <p className="text-sm text-muted-foreground">On Mange Quoi — tableau de bord privé</p>
        </div>
      </div>

      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-surface-border p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Inscrits total" value={stats.totalUsers} color="primary" />
            <StatCard icon={Crown} label="Comptes Pro" value={stats.proUsers} sub="abonnés payants" color="amber" />
            <StatCard icon={Activity} label="Actifs cette semaine" value={stats.activeThisWeek} sub="ont utilisé l'app" color="green" />
            <StatCard icon={ChefHat} label="Suggestions générées" value={stats.totalSuggestions} sub="depuis le début" color="blue" />
          </div>

          {/* Daily signups chart (last 14 days) */}
          <div className="bg-card rounded-2xl border border-surface-border p-5">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              Inscriptions — 14 derniers jours
            </h2>
            {signupDays.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Pas encore de données</p>
            ) : (
              <div className="flex items-end gap-1 h-24">
                {signupDays.map(([day, count]: [string, number]) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md bg-primary/70 min-h-[4px] transition-all"
                      style={{ height: `${Math.max(4, (count / maxSignups) * 80)}px` }}
                      title={`${day}: ${count} inscription${count > 1 ? "s" : ""}`}
                    />
                    <span className="text-[9px] text-muted-foreground rotate-45 origin-left mt-1">
                      {day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User table */}
          <div className="bg-card rounded-2xl border border-surface-border overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
              <UserCheck className="size-4 text-primary" />
              <h2 className="text-base font-semibold">
                Utilisateurs ({stats.users.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">Utilisateur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Connexion</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Plan</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Suggestions</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">7 jours</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground">Inscrit le</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.users.map((user: { id: string; email: string | null; name: string | null; image: string | null; createdAt: number; plan: string; totalUsage: number; recentUsage: number; providers: string[] }) => (
                    <tr key={user.id} className="border-b border-surface-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {user.image ? (
                            <img src={user.image} className="size-8 rounded-full object-cover" alt="" />
                          ) : (
                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-sm leading-tight">{user.name ?? "—"}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="size-3" />
                              {user.email ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.providers.length > 0
                            ? user.providers.map((p: string) => <ProviderBadge key={p} provider={p} />)
                            : <ProviderBadge provider="password" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.plan === "pro" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                            <Crown className="size-3" /> Pro
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Gratuit</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold">{user.totalUsage}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.recentUsage > 0 ? (
                          <span className="text-xs font-semibold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-md">
                            {user.recentUsage}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {stats.users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                        Aucun utilisateur inscrit pour l'instant
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
