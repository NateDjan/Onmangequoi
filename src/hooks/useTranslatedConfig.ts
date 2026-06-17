/**
 * Returns all the config objects used in HomePage translated to the current language.
 * This avoids having to rewrite the entire 2000+ line HomePage.
 */
import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

type RecipeTypeKey = "classique" | "allege" | "sport" | "gourmand";
type PlanMode = "single" | "evening" | "noon_eve" | "full";
type Phase = "input" | "analyzing" | "confirm" | "plan" | "loading" | "results";

export function useTranslatedConfig() {
  const { t, tArray, lang } = useLanguage();

  return useMemo(() => {
    const RECIPE_TYPE_CONFIG: Record<RecipeTypeKey, { label: string; emoji: string; desc: string; color: string }> = {
      classique: { label: t("recipeType_classique"), emoji: "🍽️", desc: t("recipeType_classique_desc"), color: "text-orange-400 border-orange-400/40 bg-orange-950/30" },
      allege:    { label: t("recipeType_allege"),    emoji: "🥗", desc: t("recipeType_allege_desc"),    color: "text-green-400 border-green-400/40 bg-green-950/30" },
      sport:     { label: t("recipeType_sport"),     emoji: "💪", desc: t("recipeType_sport_desc"),     color: "text-blue-400 border-blue-400/40 bg-blue-950/30" },
      gourmand:  { label: t("recipeType_gourmand"),  emoji: "🍫", desc: t("recipeType_gourmand_desc"),  color: "text-amber-400 border-amber-400/40 bg-amber-950/30" },
    };

    const PLAN_MODE_CONFIG: Record<PlanMode, { label: string; emoji: string; desc: string }> = {
      single:   { label: t("planMode_single"),   emoji: "🍽️",   desc: t("planMode_single_desc") },
      evening:  { label: t("planMode_evening"),  emoji: "🌙",   desc: t("planMode_evening_desc") },
      noon_eve: { label: t("planMode_noon_eve"), emoji: "☀️🌙", desc: t("planMode_noon_eve_desc") },
      full:     { label: t("planMode_full"),     emoji: "📅",   desc: t("planMode_full_desc") },
    };

    const SLOT_DAY_LABEL: Record<string, string> = {
      lun: t("day_lun"), mar: t("day_mar"), mer: t("day_mer"), jeu: t("day_jeu"),
      ven: t("day_ven"), sam: t("day_sam"), dim: t("day_dim"),
    };

    const SLOT_MEAL_LABEL: Record<string, string> = {
      matin: t("meal_matin"), midi: t("meal_midi"), soir: t("meal_soir"),
    };

    const PHASE_TITLES: Record<Phase, string> = {
      input: t("phase_input"),
      analyzing: t("phase_analyzing"),
      confirm: t("phase_confirm"),
      plan: t("phase_plan"),
      loading: t("phase_loading"),
      results: t("phase_results"),
    };

    const LOADING_MESSAGES = tArray("loadingMessages");
    const ANALYZING_MESSAGES = tArray("analyzingMessages");
    const PHOTO_LABELS = tArray("photoLabels");

    return {
      lang,
      t,
      tArray,
      RECIPE_TYPE_CONFIG,
      PLAN_MODE_CONFIG,
      SLOT_DAY_LABEL,
      SLOT_MEAL_LABEL,
      PHASE_TITLES,
      LOADING_MESSAGES,
      ANALYZING_MESSAGES,
      PHOTO_LABELS,
    };
  }, [lang, t, tArray]);
}
