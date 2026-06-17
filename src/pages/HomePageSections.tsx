// ─── HomePageSections.tsx ─────────────────────────────────────────────────────
// Lazy-loaded: PlanSection, ConfirmSection, IngredientRow,
//              LoadingSection, ResultsSection, MenuCard
// These are only needed after user interaction — not on first paint.
// They are imported via React.lazy() in HomePage.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Bookmark,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslatedConfig } from "@/hooks/useTranslatedConfig";
import { trackCtaClick } from "@/lib/analytics";
import type {
  Menu,
  DetectedItem,
  PlanMode,
  DietaryConstraintKey,
} from "./HomePageTypes";

// ─── Anonymous Usage Helpers ─────────────────────────
const ANON_KEY = "omq_anon_usage_v1";
const ANON_DAILY_LIMIT = 1;

function getAnonymousUsageToday(): number {
  try {
    const raw = localStorage.getItem(ANON_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) return 0;
    return count as number;
  } catch {
    return 0;
  }
}

// ─── Category emoji + Wikipedia thumbnail ─────────────

const CATEGORY_EMOJI: Record<string, string> = {
  "produit laitier": "🥛",
  légume: "🥬",
  fruit: "🍎",
  viande: "🥩",
  poisson: "🐟",
  boisson: "🥤",
  condiment: "🧂",
  féculent: "🍞",
  surgelé: "🧊",
  autre: "📦",
};

async function fetchWikipediaThumbnail(name: string): Promise<string | null> {
  const simplified = name
    .replace(/\s+(cocktail|grappe|charnues?|côtelées?\s+noires?|blancs?\s+en\s+botte|rouges?|verts?|jaunes?|fraîches?|frais|en\s+botte|iceberg)\b/gi, "")
    .trim();
  const candidates = [simplified, name].filter(Boolean);
  for (const term of candidates) {
    for (const lang of ["fr", "en"]) {
      try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const data = await res.json();
        const thumb = data?.thumbnail?.source as string | undefined;
        if (thumb) return thumb;
      } catch {
        // try next
      }
    }
  }
  return null;
}

function IngredientThumbnail({ name, fallbackEmoji }: { name: string; fallbackEmoji: string }) {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = localStorage.getItem(`ing_thumb_v2_${name.toLowerCase().trim()}`);
    if (cached && cached !== "failed") return cached;
    return null;
  });
  const [failed, setFailed] = useState(() => {
    return localStorage.getItem(`ing_thumb_v2_${name.toLowerCase().trim()}`) === "failed";
  });

  React.useEffect(() => {
    if (src || failed) return;
    const cacheKey = `ing_thumb_v2_${name.toLowerCase().trim()}`;
    fetchWikipediaThumbnail(name).then((url) => {
      if (url) {
        localStorage.setItem(cacheKey, url);
        setSrc(url);
      } else {
        localStorage.setItem(cacheKey, "failed");
        setFailed(true);
      }
    });
  }, [name, src, failed]);

  if (failed || !src) {
    return <span className="text-lg shrink-0">{fallbackEmoji}</span>;
  }

  return (
    <img
      src={src}
      alt={name}
      className="size-8 rounded-lg object-cover shrink-0 border border-surface-border-strong"
      onError={() => {
        const cacheKey = `ing_thumb_v2_${name.toLowerCase().trim()}`;
        localStorage.setItem(cacheKey, "failed");
        setSrc(null);
        setFailed(true);
      }}
    />
  );
}

// ─── Plan Section (choose when + craving) ────────────

const PLAN_OPTIONS: { mode: PlanMode; emoji: string; labelFr: string; labelEn: string; descFr: string; descEn: string }[] = [
  { mode: "single", emoji: "🍽️", labelFr: "Ce soir", labelEn: "Tonight", descFr: "Un seul repas pour maintenant", descEn: "One meal for right now" },
  { mode: "evening", emoji: "🌙", labelFr: "Tous les soirs", labelEn: "All evenings", descFr: "Un plat par soir cette semaine", descEn: "One dish every evening this week" },
  { mode: "noon_eve", emoji: "☀️🌙", labelFr: "Midi & soir", labelEn: "Lunch & dinner", descFr: "Deux repas par jour, toute la semaine", descEn: "Two meals a day, all week" },
  { mode: "full", emoji: "📅", labelFr: "Semaine complète", labelEn: "Full week", descFr: "3 repas par jour, 7 jours", descEn: "3 meals a day, 7 days" },
];

const CRAVING_OPTIONS_FR = [
  { emoji: "🍝", label: "Pasta / Riz" },
  { emoji: "🥗", label: "Légumes / Salade" },
  { emoji: "🥩", label: "Viande" },
  { emoji: "🐟", label: "Poisson" },
  { emoji: "🌶️", label: "Épicé" },
  { emoji: "⏱️", label: "Rapide" },
  { emoji: "🫕", label: "Comfort food" },
  { emoji: "💪", label: "Fit / Healthy" },
];

export function PlanSection({
  planMode,
  preferences,
  onPlanModeChange,
  onPreferencesChange,
  onGenerate,
}: {
  planMode: PlanMode;
  preferences: string;
  dietaryConstraints: DietaryConstraintKey[];
  onPlanModeChange: (v: PlanMode) => void;
  onPreferencesChange: (v: string) => void;
  onGenerate: () => void;
}) {
  const { lang } = useLanguage();
  const [selectedCravings, setSelectedCravings] = useState<string[]>([]);

  const toggleCraving = (label: string) => {
    setSelectedCravings((prev) => {
      const next = prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label];
      // Sync to preferences field
      const base = preferences.replace(/\|cravings:[^|]*/g, "").trim();
      const cravingStr = next.length > 0 ? ` | ${next.join(", ")}` : "";
      onPreferencesChange(base + cravingStr);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10 animate-fade-in-up">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl mb-2">🗓️</div>
          <h2 className="text-2xl font-bold text-foreground">
            {lang === "fr" ? "Pour quand ?" : "When for?"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {lang === "fr"
              ? "Dis-nous pour combien de repas tu veux cuisiner"
              : "Tell us how many meals you want to plan"}
          </p>
        </div>

        {/* Plan mode tiles */}
        <div className="grid grid-cols-2 gap-3">
          {PLAN_OPTIONS.map((opt) => {
            const isSelected = planMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => onPlanModeChange(opt.mode)}
                className={`rounded-2xl p-4 text-left border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-surface-border bg-surface-subtle hover:border-primary/40 hover:bg-surface-hover"
                }`}
              >
                <div className="text-2xl mb-1">{opt.emoji}</div>
                <div className={`text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {lang === "fr" ? opt.labelFr : opt.labelEn}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {lang === "fr" ? opt.descFr : opt.descEn}
                </div>
              </button>
            );
          })}
        </div>

        {/* Craving chips */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {lang === "fr" ? "Une envie particulière ? (optionnel)" : "Any particular craving? (optional)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {CRAVING_OPTIONS_FR.map((c) => {
              const isActive = selectedCravings.includes(c.label);
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => toggleCraving(c.label)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    isActive
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-surface-border bg-surface-subtle text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Free preference field */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            {lang === "fr" ? "Autre envie ou contrainte ?" : "Any other craving or constraint?"}
          </label>
          <textarea
            value={preferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            rows={2}
            placeholder={lang === "fr" ? "Ex : sans gluten, repas romantique, cuisine asiatique…" : "e.g. gluten-free, romantic dinner, Asian cuisine…"}
            className="w-full bg-surface-subtle border border-surface-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
        </div>

        {/* Generate button */}
        <Button
          type="button"
          onClick={onGenerate}
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
        >
          <Sparkles className="size-5" />
          {lang === "fr"
            ? planMode === "single" ? "✨ Voir les menus" : "✨ Planifier ma semaine"
            : planMode === "single" ? "✨ See menus" : "✨ Plan my week"
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Confirm Section (after photo analysis) ───────────

export function ConfirmSection({
  photoPreview,
  summary,
  items,
  preferences,
  newItemName,
  error,
  onPreferencesChange,
  onToggleItem,
  onEditItem,
  onSaveEdit,
  onRemoveItem,
  onNewItemNameChange,
  onAddItem,
  onConfirm,
  onRestart,
}: {
  photoPreview: string | null;
  summary: string;
  items: DetectedItem[];
  preferences: string;
  newItemName: string;
  error: string | null;
  onPreferencesChange: (v: string) => void;
  onToggleItem: (index: number) => void;
  onEditItem: (index: number) => void;
  onSaveEdit: (index: number, name: string) => void;
  onRemoveItem: (index: number) => void;
  onNewItemNameChange: (v: string) => void;
  onAddItem: () => void;
  onConfirm: () => void;
  onRestart: () => void;
}) {
  const { t, lang } = useLanguage();
  const confirmedCount = items.filter((i) => i.confirmed).length;

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 md:py-10 animate-fade-in-up">
      <div className="w-full max-w-md space-y-5">
        {/* Header with photo thumbnail */}
        <div className="flex items-start gap-3">
          {photoPreview && (
            <img
              src={photoPreview}
              alt={lang === "fr" ? "Ta photo" : "Your photo"}
              className="size-16 rounded-xl object-cover border border-border shadow-sm shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold shimmer-gold">
              {items.some((i) => i.confidence !== "suggestion") ? t("hereIsWhatISee") : t("whatInKitchen")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
              {summary}
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-surface-subtle border border-surface-border rounded-xl px-4 py-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">{t("verifyIngredients")}</strong> — {lang === "fr" ? "coche ✅ ceux que tu veux utiliser, corrige les erreurs avec ✏️, ou ajoute ce qui manque." : "check ✅ those you want to use, fix errors with ✏️, or add what's missing."}
          </p>
        </div>

        {/* Detected items list */}
        <div className="space-y-2">
          {items.map((item, index) => (
            <IngredientRow
              key={`${item.name}-${index}`}
              item={item}
              index={index}
              onToggle={onToggleItem}
              onEdit={onEditItem}
              onSaveEdit={onSaveEdit}
              onRemove={onRemoveItem}
            />
          ))}
        </div>

        {/* Add custom item */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => onNewItemNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddItem()}
            placeholder={lang === "fr" ? "Ajouter un ingrédient…" : "Add an ingredient…"}
            className="flex-1 rounded-xl border border-input bg-card px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition shadow-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddItem}
            disabled={!newItemName.trim()}
            className="h-10 rounded-xl gap-1 px-3"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Preferences */}
        <div className="space-y-2">
          <label
            htmlFor="preferences-confirm"
            className="text-sm font-semibold text-foreground flex items-center gap-1.5"
          >
            <Sparkles className="size-4 text-chart-2" />
            {lang === "fr" ? "Une envie ?" : "Any craving?"}
            <span className="text-muted-foreground font-normal">{lang === "fr" ? "(optionnel)" : "(optional)"}</span>
          </label>
          <input
            id="preferences-confirm"
            type="text"
            value={preferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            placeholder={lang === "fr" ? "Rapide, comfort food, cuisine asiatique…" : "Quick, comfort food, Asian cuisine…"}
            className="w-full rounded-xl border border-surface-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Confirm button */}
        <Button
          type="button"
          onClick={onConfirm}
          disabled={confirmedCount === 0}
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-40 disabled:shadow-none"
        >
          <ChefHat className="size-5" />
          {lang === "fr" ? `Proposer des menus (${confirmedCount} ingrédient${confirmedCount > 1 ? "s" : ""})` : `Suggest menus (${confirmedCount} ingredient${confirmedCount > 1 ? "s" : ""})`}
        </Button>

        {/* Restart */}
        <button
          type="button"
          onClick={onRestart}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition py-2"
        >
          {lang === "fr" ? "← Recommencer" : "← Start over"}
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient Row ───────────────────────────────────

export function IngredientRow({
  item,
  index,
  onToggle,
  onEdit,
  onSaveEdit,
  onRemove,
}: {
  item: DetectedItem;
  index: number;
  onToggle: (i: number) => void;
  onEdit: (i: number) => void;
  onSaveEdit: (i: number, name: string) => void;
  onRemove: (i: number) => void;
}) {
  const { lang } = useLanguage();
  const [editValue, setEditValue] = useState(item.name);
  const emoji = CATEGORY_EMOJI[item.category] || "📦";
  const isUncertain = item.confidence === "basse" || item.confidence === "moyenne";

  if (item.editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl bg-card border border-primary/30 shadow-sm">
        <IngredientThumbnail name={item.name} fallbackEmoji={emoji} />
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSaveEdit(index, editValue)}
          autoFocus
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSaveEdit(index, editValue)}
          className="h-7 w-7 p-0 shrink-0"
        >
          <Check className="size-4 text-primary" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
        item.confirmed
          ? "bg-card border-surface-border shadow-sm"
          : "bg-surface-subtle border-surface-border opacity-50"
      } ${isUncertain && !item.confirmed ? "border-chart-2/40 bg-chart-2/5" : ""}`}
    >
      {/* Toggle checkbox */}
      <button
        type="button"
        onClick={() => onToggle(index)}
        className={`shrink-0 size-6 rounded-lg border-2 flex items-center justify-center transition ${
          item.confirmed
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
      >
        {item.confirmed && <Check className="size-3.5" />}
      </button>

      {/* Ingredient thumbnail */}
      <IngredientThumbnail name={item.name} fallbackEmoji={emoji} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{item.name}</span>
        {isUncertain && (
          <span className="text-xs text-chart-2 font-medium">
            {lang === "fr" ? "Pas sûr — corrige si besoin" : "Not sure — correct if needed"}
          </span>
        )}
      </div>

      {/* Edit button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onEdit(index)}
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </Button>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// Ad placement handled entirely by Google Auto Ads (activated on AdSense account).

// ─── Loading Section ──────────────────────────────────

export function LoadingSection({
  message,
  subtitle,
  emojis,
}: {
  message: string;
  subtitle: string;
  emojis: string[];
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center space-y-8">
        {/* Emoji animation */}
        <div className="flex items-end justify-center gap-3 text-4xl">
          <span className="animate-bounce-cook">{emojis[0]}</span>
          <span className="animate-bounce-cook-delayed">{emojis[1]}</span>
          <span className="animate-bounce-cook-delayed-2">{emojis[2]}</span>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <p className="text-lg font-semibold shimmer-gold transition-all duration-500">
            {message}
          </p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-2 rounded-full bg-primary/60 animate-pulse"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>


      </div>
    </div>
  );
}

// ─── Results Section ──────────────────────────────────

export function ResultsSection({
  menus,
  menuImages,
  expandedMenu,
  isAuthenticated,
  historySaved,
  planMode,
  onToggleExpand,
  onRestart,
  onNavigateSignup,
  onNavigateHistory,
  onImageLoaded,
}: {
  menus: Menu[];
  menuImages: Record<number, string>;
  expandedMenu: number | null;
  isAuthenticated: boolean;
  historySaved: boolean;
  planMode: PlanMode;
  onToggleExpand: (index: number | null) => void;
  onRestart: () => void;
  onNavigateSignup: () => void;
  onNavigateHistory: () => void;
  onImageLoaded: (index: number) => void;
}) {
  const { lang } = useLanguage();
  const { SLOT_DAY_LABEL: SLOT_DAY_LABEL_T, SLOT_MEAL_LABEL: SLOT_MEAL_LABEL_T } = useTranslatedConfig();
  const isWeekly = planMode !== "single";

  // Group menus by day for weekly display
  const byDay: Array<{ day: string; dayLabel: string; items: Array<{ menu: Menu; index: number }> }> = [];
  if (isWeekly) {
    const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
    for (const day of DAYS) {
      const items = menus
        .map((m, i) => ({ menu: m, index: i }))
        .filter(({ menu }) => menu.slot?.startsWith(day + "_"));
      if (items.length > 0) {
        byDay.push({ day, dayLabel: SLOT_DAY_LABEL_T[day] || day, items });
      }
    }
  }

  return (
    <div className="flex-1 px-4 py-8 md:py-12">
      <div className="max-w-md mx-auto space-y-6 stagger-children">
        {/* Header */}
        <div className="text-center space-y-1">
          {isWeekly ? (
            <>
              <h2 className="text-2xl font-bold text-gold">{lang === "fr" ? "Ton planning de la semaine ! 📅" : "Your weekly meal plan! 📅"}</h2>
              <p className="text-muted-foreground text-sm">
                {lang === "fr" ? `${menus.length} repas préparés avec tes ingrédients` : `${menus.length} meals prepared with your ingredients`}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gold">{lang === "fr" ? "Voilà mes suggestions ! 👨‍🍳" : "Here are my suggestions! 👨‍🍳"}</h2>
              <p className="text-muted-foreground text-sm">
                {lang === "fr"
                  ? `${menus.length} idée${menus.length > 1 ? "s" : ""} pour régaler tes papilles`
                  : `${menus.length} idea${menus.length > 1 ? "s" : ""} to treat your taste buds`}
              </p>
            </>
          )}
        </div>

        {/* Save status / signup prompt */}
        {isAuthenticated && historySaved && (
          <div className="flex items-center justify-center gap-2 bg-primary/5 rounded-xl px-4 py-2.5 text-sm">
            <Bookmark className="size-4 text-primary" />
            <span className="text-muted-foreground">
              {lang === "fr" ? "Sauvegardé dans ton" : "Saved to your"}{" "}
              <button
                type="button"
                onClick={onNavigateHistory}
                className="font-semibold text-primary hover:underline"
              >
                {lang === "fr" ? "historique" : "history"}
              </button>
            </span>
          </div>
        )}
        {!isAuthenticated && (() => {
          const usedToday = getAnonymousUsageToday();
          const remaining = Math.max(0, ANON_DAILY_LIMIT - usedToday);
          return (
            <button
              type="button"
              onClick={onNavigateSignup}
              className="w-full flex items-center gap-3 bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-xl px-4 py-3.5 transition text-left group"
            >
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition">
                <UserPlus className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {lang === "fr"
                    ? remaining > 0
                      ? "💾 Crée un compte gratuit pour continuer"
                      : "🔒 Crée un compte gratuit pour continuer"
                    : remaining > 0
                      ? "💾 Create a free account to continue"
                      : "🔒 Create a free account to continue"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "fr"
                    ? remaining > 0
                      ? "Sans CB · 2 recettes/jour · sauvegarde ton historique"
                      : "Tu as utilisé ta génération gratuite · sans CB · 2 recettes/jour incluses"
                    : remaining > 0
                      ? "No credit card · 2 recipes/day · save your history"
                      : "Free generation used · no credit card · 2 recipes/day included"}
                </p>
              </div>
              <History className="size-4 text-primary/50 shrink-0" />
            </button>
          );
        })()}

        {/* Menu cards — weekly grouped or single */}
        {isWeekly ? (
          byDay.map(({ day, dayLabel, items }) => (
            <div key={day} className="space-y-3">
              {/* Day header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-sm font-bold text-primary px-2">{dayLabel}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              {items.map(({ menu, index }) => {
                const [, meal] = (menu.slot || "").split("_");
                return (
                  <div key={index}>
                    {meal && (
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5 ml-1">
                        {SLOT_MEAL_LABEL_T[meal] || meal}
                      </p>
                    )}
                    <MenuCard
                      menu={menu}
                      index={index}
                      imageUrl={menuImages[index]}
                      isExpanded={expandedMenu === index}
                      onToggle={() => onToggleExpand(expandedMenu === index ? null : index)}
                      onImageLoaded={() => onImageLoaded(index)}
                    />
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          menus.map((menu, index) => (
            <MenuCard
              key={menu.name}
              menu={menu}
              index={index}
              imageUrl={menuImages[index]}
              isExpanded={expandedMenu === index}
              onToggle={() =>
                onToggleExpand(expandedMenu === index ? null : index)
              }
              onImageLoaded={() => onImageLoaded(index)}
            />
          ))
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          {isAuthenticated && (
            <Button
              type="button"
              variant="outline"
              onClick={onNavigateHistory}
              className="w-full h-11 rounded-xl gap-2 text-sm font-semibold border-border/80 hover:bg-secondary"
            >
              <History className="size-4" />
              {lang === "fr" ? "Voir mon historique" : "View my history"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onRestart}
            className="w-full h-12 rounded-xl gap-2 text-base font-semibold border-border/80 hover:bg-secondary"
          >
            <RotateCcw className="size-4" />
            {lang === "fr" ? "Recommencer" : "Start over"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Card ────────────────────────────────────────

export function MenuCard({
  menu,
  index,
  imageUrl,
  isExpanded,
  onToggle,
  onImageLoaded,
}: {
  menu: Menu;
  index: number;
  imageUrl?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onImageLoaded?: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | undefined>(imageUrl);
  const [shareCopied, setShareCopied] = useState(false);
  const { lang } = useLanguage();
  const retryCountRef = React.useRef(0);

  // Native share — sends photo + recipe text via OS share sheet
  const handleNativeShare = async () => {
    const lines = [
      `🍽️ ${menu.name}`,
      ``,
      menu.description,
      ``,
      `⏱️ ${menu.cookingTime} • ${menu.difficulty} • ${menu.servings} pers.`,
      ``,
      `🥕 ${lang === "fr" ? "Ingrédients" : "Ingredients"} :`,
      ...menu.ingredients.map((i: string) => `• ${i}`),
      ``,
      `📝 ${lang === "fr" ? "Préparation" : "Instructions"} :`,
      ...menu.steps.map((s: string, idx: number) => `${idx + 1}. ${s}`),
      ``,
      lang === "fr" ? `Recette générée avec On Mange Quoi ? 👉 onmangequoi.net` : `Recipe generated with On Mange Quoi? 👉 onmangequoi.net`,
    ];
    const shareText = lines.join("\n");
    const shareTitle = `${menu.name} — On Mange Quoi ?`;

    if (navigator.share) {
      try {
        if (imgSrc && navigator.canShare) {
          const response = await fetch(imgSrc).catch(() => null);
          if (response?.ok) {
            const blob = await response.blob();
            const file = new File([blob], `${menu.name.replace(/\s+/g, "-")}.jpg`, { type: blob.type || "image/jpeg" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareTitle, text: shareText, files: [file] });
              return;
            }
          }
        }
        await navigator.share({ title: shareTitle, text: shareText, url: "https://onmangequoi.net" });
      } catch { /* user cancelled */ }
    } else {
      // Desktop fallback: copy text to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      } catch { /* ignore */ }
    }
  };

  // Sync src when imageUrl prop changes
  React.useEffect(() => {
    setImgSrc(imageUrl);
    setImgLoaded(false);
    setImgError(false);
    retryCountRef.current = 0;
  }, [imageUrl]);

  const handleImgError = () => {
    if (retryCountRef.current < 3 && imgSrc) {
      retryCountRef.current += 1;
      const delay = retryCountRef.current * 4000;
      setTimeout(() => {
        // Cache-bust by adding a retry param
        const sep = imgSrc.includes("?") ? "&" : "?";
        setImgSrc(`${imgSrc.split("&_r=")[0]}${sep}_r=${retryCountRef.current}`);
        setImgError(false);
      }, delay);
    } else {
      setImgError(true);
    }
  };

  const handleManualRefresh = () => {
    if (!imgSrc && !imageUrl) return;
    const base = (imgSrc || imageUrl || "").split("&_r=")[0];
    const manualRetry = Date.now() % 10000; // unique bust
    const sep = base.includes("?") ? "&" : "?";
    setImgSrc(`${base}${sep}_r=${manualRetry}`);
    setImgLoaded(false);
    setImgError(false);
    retryCountRef.current = 0;
  };

  const difficultyColor =
    menu.difficulty === "Facile"
      ? "text-success"
      : menu.difficulty === "Difficile"
        ? "text-chart-4"
        : "text-chart-2";

  const typeConfig: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
    "peu calorique": { emoji: "🥗", label: "Léger & Régime", bg: "bg-emerald-950/60", text: "text-emerald-400" },
    "sport":         { emoji: "💪", label: "Sport & Énergie", bg: "bg-blue-950/60",    text: "text-blue-400" },
    "gourmande":     { emoji: "🍫", label: "Gourmand",        bg: "bg-amber-950/60",   text: "text-amber-400" },
  };
  const typeKey = (menu.type || "").toLowerCase();
  const typeInfo = typeConfig[typeKey];

  return (
    <div className="card-premium rounded-2xl border border-surface-border bg-card overflow-hidden shadow-lg">
      {/* Image */}
      <div className="aspect-[16/10] bg-muted relative overflow-hidden">
        {imgSrc && !imgError && (
          <img
            src={imgSrc}
            alt={menu.name}
            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`}
            onLoad={() => { setImgLoaded(true); onImageLoaded?.(); }}
            onError={handleImgError}
          />
        )}
        {(!imgSrc || !imgLoaded || imgError) && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="text-3xl animate-pulse">
              {["🥗", "💪", "🍫"][index % 3]}
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {lang === "fr" ? "📸 Génération de la photo…" : "📸 Generating photo…"}
            </p>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-1.5 rounded-full bg-primary/40 animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
          </div>
        )}
        {/* Type badge overlaid on image */}
        {typeInfo && (
          <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${typeInfo.bg} ${typeInfo.text}`}>
            <span>{typeInfo.emoji}</span>
            <span>{typeInfo.label}</span>
          </div>
        )}
        {/* Chef-inspired badge */}
        {menu.chefInspired && menu.chefName && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow-lg bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white backdrop-blur-sm">
            <span>👨‍🍳</span>
            <span>{lang === "fr" ? `Inspiré du Chef ${menu.chefName}` : `Inspired by Chef ${menu.chefName}`}</span>
          </div>
        )}
        {/* Manual refresh button — always accessible, bottom-right corner */}
        <button
          onClick={(e) => { e.stopPropagation(); handleManualRefresh(); }}
          title={lang === "fr" ? "Regénérer l'image" : "Regenerate image"}
          className="absolute bottom-2 right-2 size-7 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-lg font-bold leading-tight">{menu.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {menu.description}
          </p>
        </div>

        {/* Meta badges */}
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">
            <Clock className="size-3 text-chart-3" />
            {menu.cookingTime}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary ${difficultyColor}`}
          >
            <Flame className="size-3" />
            {menu.difficulty}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary">
            <Users className="size-3 text-chart-5" />
            {menu.servings} pers.
          </span>
          {menu.calories != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-chart-2 font-semibold">
              🔥 {menu.calories} kcal
            </span>
          )}
        </div>

        {/* Expandable recipe */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t border-border/50 animate-fade-in-up">
            {/* Ingredients */}
            <div>
              <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2">
                <span className="text-base">🥕</span> {lang === "fr" ? "Ingrédients" : "Ingredients"}
              </h4>
              <ul className="space-y-1">
                {menu.ingredients.map((ing) => (
                  <li
                    key={ing}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-primary mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>

            {/* Steps */}
            <div>
              <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2">
                <span className="text-base">📝</span> {lang === "fr" ? "Préparation" : "Instructions"}
              </h4>
              <ol className="space-y-2">
                {menu.steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 size-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Extras — optional ingredients to buy (with Amazon affiliate links) */}
            {menu.extras && menu.extras.length > 0 && (
              <div className="bg-chart-2/10 rounded-xl p-3 affiliate-section" data-noads="true">
                <h4 className="text-sm font-bold flex items-center gap-1.5 mb-2 text-chart-2">
                  <ShoppingCart className="size-4" />
                  {lang === "fr" ? "Pour aller plus loin (optionnel)" : "Go further (optional)"}
                </h4>
                <ul className="space-y-1.5">
                  {menu.extras.map((extra) => {
                    // Extract just the ingredient name (remove quantity/unit prefix like "1 c.à.s de ")
                    const ingredientName = extra
                      .replace(/^\d+[\s,.]*(g|kg|cl|ml|L|c\.à\.s|c\.à\.c|cuillère[s]?[^\s]*|pincée[s]?|filet|poignée[s]?|tranche[s]?|morceau[x]?)?\s+(de\s+|d['']\s*)?/i, "")
                      .trim();
                    // Amazon affiliate search URL (tag to be replaced with real affiliate ID)
                    const amazonUrl = `https://www.amazon.fr/s?k=${encodeURIComponent(ingredientName)}&tag=onmangequoi-21`;
                    return (
                      <li
                        key={extra}
                        className="text-sm flex items-center gap-2"
                      >
                        <span className="text-chart-2 mt-0.5 shrink-0">+</span>
                        <span className="text-muted-foreground flex-1">{extra}</span>
                        <a
                          href={amazonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF9900]/15 hover:bg-[#FF9900]/30 text-[#FF9900] text-xs font-semibold transition-colors"
                          title={`Acheter sur Amazon`}
                          onClick={() => trackCtaClick({ link_url: amazonUrl, cta_name: `amazon_${ingredientName}` })}
                        >
                          🛒 Amazon
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground/50 mt-2">
                  {lang === "fr" ? "* Liens affiliés Amazon — tu soutiens l'app sans frais supplémentaires" : "* Amazon affiliate links — you support the app at no extra cost"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Toggle + Share row */}
        <div className="flex items-center" data-noads="true">
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-primary hover:text-primary/80 transition"
          >
            {isExpanded ? (
              <>
                {lang === "fr" ? "Masquer la recette" : "Hide recipe"} <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                {lang === "fr" ? "Voir la recette" : "View recipe"} <ChevronDown className="size-4" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleNativeShare}
            className="flex items-center justify-center size-8 rounded-full hover:bg-surface-hover transition text-muted-foreground hover:text-primary"
            title={lang === "fr" ? "Partager" : "Share"}
          >
            <Share2 className="size-4" />
          </button>
          {shareCopied && (
            <span className="text-[11px] text-primary/70 ml-1">✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
