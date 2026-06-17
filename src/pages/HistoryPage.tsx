import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Calendar,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  History,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "../../convex/_generated/api";

interface Menu {
  name: string;
  type?: string;
  description: string;
  cookingTime: string;
  difficulty: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  imagePrompt: string;
  extras: string[];
}

function useFormatDate() {
  const { lang } = useLanguage();
  return (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (lang === "fr") {
      if (diffMins < 1) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours}h`;
      if (diffDays < 7) return `Il y a ${diffDays}j`;
    } else {
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
    }

    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "short",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const formatDate = useFormatDate();
  const history = useQuery(api.menuHistory.listHistory);
  const deleteHistory = useMutation(api.menuHistory.deleteHistory);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHistory({ id: id as any });
    } catch {
      // ignore
    }
    setDeletingId(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition py-1 pr-2"
          >
            <ArrowLeft className="size-4" />
            {t("back")}
          </button>
        </div>

        <div className="text-center space-y-2">
          <div className="mx-auto size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <History className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gold">{t("history_title")}</h1>
          <p className="text-muted-foreground text-sm">
            {lang === "fr" ? "Retrouve tes anciennes suggestions de menus" : "Find your previous menu suggestions"}
          </p>
        </div>

        {/* Loading */}
        {history === undefined && (
          <div className="text-center py-12">
            <div className="flex justify-center gap-1.5 mb-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-2 rounded-full bg-primary/60 animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        )}

        {/* Empty state */}
        {history && history.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="text-5xl">🍳</div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {lang === "fr" ? "Pas encore d'historique" : "No history yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {lang === "fr" ? "Génère tes premiers menus et ils seront sauvegardés ici !" : "Generate your first menus and they'll be saved here!"}
              </p>
            </div>
            <Button
              onClick={() => navigate("/")}
              className="gap-2 mt-4"
            >
              <ChefHat className="size-4" />
              {lang === "fr" ? "Commencer" : "Get started"}
            </Button>
          </div>
        )}

        {/* History entries */}
        {history && history.length > 0 && (
          <div className="space-y-3">
            {history.map((entry) => {
              const isExpanded = expandedEntry === entry._id;
              let menus: Menu[] = [];
              let images: Record<number, string> = {};
              try {
                menus = JSON.parse(entry.menus);
              } catch { /* ignore */ }
              try {
                if (entry.menuImages) images = JSON.parse(entry.menuImages);
              } catch { /* ignore */ }

              return (
                <div
                  key={entry._id}
                  className="rounded-2xl card-premium border border-surface-border bg-card overflow-hidden"
                >
                  {/* Entry header */}
                  <button
                    type="button"
                    onClick={() => setExpandedEntry(isExpanded ? null : entry._id)}
                    className="w-full text-left p-4 hover:bg-secondary/30 transition"
                  >
                    <div className="flex items-start gap-3">
                      {entry.photoUrl ? (
                        <img
                          src={entry.photoUrl}
                          alt=""
                          className="size-12 rounded-xl object-cover border border-surface-border-strong shrink-0"
                        />
                      ) : (
                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <ChefHat className="size-5 text-primary" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {menus.map((m) => m.name).join(" · ") || "Menus"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {entry.ingredients}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground/70">
                          <Calendar className="size-3" />
                          {formatDate(entry.createdAt)}
                          {entry.preferences && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-secondary text-[10px] font-medium">
                              {entry.preferences}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 mt-1">
                        {isExpanded ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-surface-border p-4 space-y-4 animate-fade-in-up">
                      {menus.map((menu, idx) => {
                        const menuKey = `${entry._id}-${idx}`;
                        const isMenuExpanded = expandedMenu === menuKey;
                        const imageUrl = images[idx];
                        const difficultyColor =
                          menu.difficulty === "Facile"
                            ? "text-success"
                            : menu.difficulty === "Difficile"
                              ? "text-chart-4"
                              : "text-chart-2";

                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-surface-border overflow-hidden"
                          >
                            {imageUrl && (
                              <img
                                src={imageUrl}
                                alt={menu.name}
                                className="w-full aspect-[16/10] object-cover"
                              />
                            )}

                            <div className="p-3 space-y-2">
                              {menu.type && (() => {
                                const typeConfig: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
                                  "peu calorique": { emoji: "🥗", label: lang === "fr" ? "Léger & Régime" : "Light & Diet", bg: "bg-emerald-50", text: "text-emerald-700" },
                                  "sport":         { emoji: "💪", label: lang === "fr" ? "Sport & Énergie" : "Sport & Energy", bg: "bg-blue-50",    text: "text-blue-700" },
                                  "gourmande":     { emoji: "🍫", label: lang === "fr" ? "Gourmand" : "Gourmet",        bg: "bg-amber-50",   text: "text-amber-700" },
                                };
                                const info = typeConfig[(menu.type as string).toLowerCase()];
                                return info ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${info.bg} ${info.text}`}>
                                    {info.emoji} {info.label}
                                  </span>
                                ) : null;
                              })()}
                              <h4 className="font-bold text-sm">{menu.name}</h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {menu.description}
                              </p>

                              <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary">
                                  <Clock className="size-2.5 text-chart-3" />
                                  {menu.cookingTime}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary ${difficultyColor}`}>
                                  <Flame className="size-2.5" />
                                  {menu.difficulty}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary">
                                  <Users className="size-2.5 text-chart-5" />
                                  {menu.servings} {lang === "fr" ? "pers." : "serv."}
                                </span>
                              </div>

                              {isMenuExpanded && (
                                <div className="space-y-3 pt-2 border-t border-surface-border">
                                  <div>
                                    <h5 className="text-xs font-bold mb-1">🥕 {lang === "fr" ? "Ingrédients" : "Ingredients"}</h5>
                                    <ul className="space-y-0.5">
                                      {menu.ingredients.map((ing) => (
                                        <li key={ing} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                          <span className="text-primary mt-1 size-1 rounded-full bg-primary shrink-0" />
                                          {ing}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <h5 className="text-xs font-bold mb-1">📝 {lang === "fr" ? "Préparation" : "Instructions"}</h5>
                                    <ol className="space-y-1">
                                      {menu.steps.map((step, i) => (
                                        <li key={step} className="flex items-start gap-2 text-xs">
                                          <span className="shrink-0 size-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center mt-0.5">
                                            {i + 1}
                                          </span>
                                          <span className="text-muted-foreground leading-relaxed">{step}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                  {menu.extras && menu.extras.length > 0 && (
                                    <div className="bg-chart-2/10 rounded-lg p-2">
                                      <h5 className="text-xs font-bold flex items-center gap-1 text-chart-2 mb-1">
                                        <ShoppingCart className="size-3" />
                                        {lang === "fr" ? "Pour aller plus loin" : "Go further"}
                                      </h5>
                                      <ul className="space-y-0.5">
                                        {menu.extras.map((extra) => (
                                          <li key={extra} className="text-xs text-muted-foreground flex items-start gap-1">
                                            <span className="text-chart-2">+</span>
                                            {extra}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => setExpandedMenu(isMenuExpanded ? null : menuKey)}
                                className="w-full flex items-center justify-center gap-1 py-1 text-xs font-semibold text-primary hover:text-primary/80 transition"
                              >
                                {isMenuExpanded ? (
                                  <>{lang === "fr" ? "Masquer" : "Hide"} <ChevronUp className="size-3" /></>
                                ) : (
                                  <>{lang === "fr" ? "Voir la recette" : "View recipe"} <ChevronDown className="size-3" /></>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry._id)}
                        disabled={deletingId === entry._id}
                        className="w-full text-muted-foreground hover:text-destructive gap-2 h-9"
                      >
                        <Trash2 className="size-3.5" />
                        {deletingId === entry._id
                          ? (lang === "fr" ? "Suppression…" : "Deleting…")
                          : (lang === "fr" ? "Supprimer de l'historique" : "Delete from history")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
