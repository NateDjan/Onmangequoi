"""
Hashtag strategy module for On Mange Quoi? Instagram growth.

Researched hashtag tiers:
  - BIG (500K-5M posts): reach/discovery, use 3-5 per post
  - MEDIUM (50K-500K posts): sweet spot for small accounts, use 5-8
  - SMALL/NICHE (5K-50K posts): higher engagement rate, use 5-7
  - BRANDED (ours): always include, use 2-3

Total: 15-20 hashtags per post (Instagram's sweet spot for reach).

Updated: June 2026
"""
import random
from datetime import datetime


# ── Branded hashtags (ALWAYS include) ─────────────────────────────────
BRANDED = [
    "#OnMangeQuoi",
    "#OnMangeQuoiApp",
    "#RecetteIA",
]

# ── Big hashtags (500K-5M posts) — use 3-5 ────────────────────────────
BIG_GENERAL = [
    "#Recette", "#RecetteFacile", "#CuisineMaison", "#FaitMaison",
    "#InstaFood", "#FoodPorn", "#Foodie", "#RecetteDuJour",
    "#Yummy", "#Homemade", "#FoodPhotography", "#FoodLover",
    "#Delicious", "#Cooking", "#FoodStagram",
]

# ── Medium hashtags (50K-500K) — use 5-8 ──────────────────────────────
MEDIUM_GENERAL = [
    "#CuisineRapide", "#IdeeRepas", "#CuisineIA", "#RecetteInstagram",
    "#RecetteSaine", "#CuisineFacile", "#MonRepas", "#OnCuisine",
    "#PlatDuJour", "#CuisineDeChezNous", "#RecetteSimple",
    "#FoodBelgium", "#CuisineBelge", "#RecetteFrancaise",
    "#MiamMiam", "#ATable", "#BonAppetit",
    "#FoodiesFR", "#CuisinierEnHerbe", "#FoodAddict",
]

# ── Small/Niche hashtags (5K-50K) — high engagement ───────────────────
SMALL_NICHE = [
    "#RecetteAvecRestes", "#FrigoVide", "#CuisineAntiGaspi",
    "#RecetteÉtudiante", "#CuisineDuQuotidien", "#MonFrigo",
    "#RecetteRapide15Min", "#CuisinerAvecCeQuOnA",
    "#RecetteDeChezMoi", "#CuisinierDuDimanche",
    "#FoodTechFR", "#AppCuisine", "#IAEnCuisine",
    "#RecetteAvecIA", "#CuisineIntelligente",
]

# ── Pillar-specific hashtags ──────────────────────────────────────────
PILLAR_HASHTAGS = {
    "leger": {
        "big": ["#HealthyFood", "#MangezSain", "#Light", "#Healthy", "#CleanEating"],
        "medium": ["#RecetteLegere", "#MangerSain", "#RecetteDietetique", "#PlaisirSain",
                    "#RecetteHealthy", "#EquilibreAlimentaire", "#BienveillanteFood"],
        "small": ["#RecetteMinceur", "#CuisineLegere", "#MangerBouger",
                   "#RecetteBassesCalories", "#LegerEtBon"],
    },
    "sport": {
        "big": ["#FitFood", "#Fitness", "#Protein", "#MealPrep", "#GymFood"],
        "medium": ["#RecetteProteinee", "#NutritionSportive", "#PostWorkout",
                    "#RepasProteine", "#FuelYourBody", "#ProteinRecipe"],
        "small": ["#CuisineSportive", "#RepasSportif", "#RecupMusculaire",
                   "#SportEtNutrition", "#MacrosEquilibrees"],
    },
    "gourmand": {
        "big": ["#Gourmandise", "#ComfortFood", "#Foodgasm", "#FoodComa", "#TreatYourself"],
        "medium": ["#PlatReconfortant", "#CuisineGourmande", "#RegalTotal",
                    "#PurGourmandise", "#RecetteGourmande", "#OnSeRegale"],
        "small": ["#PeureuxSAbstenir", "#GourmandEtFier", "#CuisineReconfort",
                   "#ComfortFoodFR", "#PlaisirCoupable"],
    },
    "astuce": {
        "big": ["#AntiGaspi", "#ZeroGaspillage", "#ZeroWaste", "#Ecologie", "#Sustainability"],
        "medium": ["#AntiGaspillage", "#CuisineZeroDechet", "#ValoriseTesRestes",
                    "#RecetteAntiGaspi", "#StopAuGaspillage", "#RecyclerEnCuisine"],
        "small": ["#FrigoPresqueVide", "#CuisineDesRestes", "#RienNeSePerds",
                   "#RecetteAvecDesRestes", "#AstuceAntiGaspi"],
    },
}

# ── Seasonal hashtags ─────────────────────────────────────────────────
SEASONAL = {
    6: ["#RecetteDEte", "#CuisineEstivale", "#FraisDeSaison", "#SaladeDEte", "#BBQ", "#Grillades"],
    7: ["#RecetteDEte", "#CuisineEstivale", "#BBQTime", "#FruitsDEte", "#CuisineVacances"],
    8: ["#RecetteDEte", "#DerniersJoursDEte", "#FruitsDEte", "#AperitifEstival"],
    9: ["#RecetteDAutomne", "#CuisineDAutomne", "#BackToKitchen", "#Champignons", "#Courges"],
    10: ["#RecetteDAutomne", "#Soupe", "#Potage", "#CuisineReconfortante", "#Halloween"],
    11: ["#RecetteDHiver", "#Soupe", "#PlatMijote", "#CuisineReconfortante"],
    12: ["#RecetteDeFetes", "#Noel", "#MenuDeNoel", "#CuisineDeFete"],
    1: ["#RecetteDHiver", "#BonnesResolutions", "#MangerMieux", "#Detox"],
    2: ["#RecetteDHiver", "#SaintValentin", "#RecetteEnAmoureux", "#CuisineDHiver"],
    3: ["#RecetteDePrintemps", "#Printemps", "#LegumesDePrintemps", "#Renouveau"],
    4: ["#RecetteDePrintemps", "#Paques", "#LegumesDeSaison", "#Asperges"],
    5: ["#RecetteDePrintemps", "#Fraises", "#FruitsDePrintemps", "#CuisineFraiche"],
}

# ── Engagement-boosting hashtags ──────────────────────────────────────
ENGAGEMENT = [
    "#QuEstCeQuOnMangeCeSoir", "#IdeeRecette", "#InspirationCuisine",
    "#QuoiFairePourDiner", "#JeNeSaisPasQuoiManger",
]


def get_hashtags(pillar: str, count: int = 18) -> str:
    """
    Return an optimized hashtag string for the given content pillar.
    
    Mix: 2-3 branded + 3-4 big + 4-5 medium + 3-4 small + 1-2 seasonal + 1-2 engagement
    Total ~15-18 hashtags (Instagram sweet spot).
    """
    tags = set()
    
    # Always include branded
    tags.update(BRANDED)
    
    # Big hashtags (3-4)
    tags.update(random.sample(BIG_GENERAL, min(4, len(BIG_GENERAL))))
    
    # Medium general (3-4)
    tags.update(random.sample(MEDIUM_GENERAL, min(4, len(MEDIUM_GENERAL))))
    
    # Pillar-specific
    p_tags = PILLAR_HASHTAGS.get(pillar, PILLAR_HASHTAGS["gourmand"])
    tags.update(random.sample(p_tags["big"], min(2, len(p_tags["big"]))))
    tags.update(random.sample(p_tags["medium"], min(3, len(p_tags["medium"]))))
    tags.update(random.sample(p_tags["small"], min(2, len(p_tags["small"]))))
    
    # Small/niche general (2-3)
    remaining_small = [t for t in SMALL_NICHE if t not in tags]
    tags.update(random.sample(remaining_small, min(3, len(remaining_small))))
    
    # Seasonal (1-2)
    month = datetime.now().month
    seasonal = SEASONAL.get(month, [])
    if seasonal:
        tags.update(random.sample(seasonal, min(2, len(seasonal))))
    
    # Engagement (1)
    tags.update(random.sample(ENGAGEMENT, 1))
    
    # Trim to target count
    tag_list = list(tags)
    if len(tag_list) > count:
        # Keep branded, then randomize the rest
        branded_set = set(BRANDED)
        branded_in = [t for t in tag_list if t in branded_set]
        others = [t for t in tag_list if t not in branded_set]
        random.shuffle(others)
        tag_list = branded_in + others[:count - len(branded_in)]
    
    random.shuffle(tag_list)
    return " ".join(tag_list)


def get_reel_hashtags(count: int = 20) -> str:
    """Return optimized hashtags specifically for Reels (higher reach potential)."""
    tags = set(BRANDED)
    
    # Reel-specific big tags
    reel_big = [
        "#Reels", "#ReelsFR", "#ReelsCuisine", "#RecetteReels",
        "#FoodReel", "#CookingReel", "#Viral", "#ViralFood",
    ]
    tags.update(random.sample(reel_big, min(4, len(reel_big))))
    
    # General food tags
    tags.update(random.sample(BIG_GENERAL, min(4, len(BIG_GENERAL))))
    tags.update(random.sample(MEDIUM_GENERAL, min(4, len(MEDIUM_GENERAL))))
    tags.update(random.sample(SMALL_NICHE, min(3, len(SMALL_NICHE))))
    
    # Seasonal
    month = datetime.now().month
    seasonal = SEASONAL.get(month, [])
    if seasonal:
        tags.update(random.sample(seasonal, min(2, len(seasonal))))
    
    tag_list = list(tags)
    if len(tag_list) > count:
        branded_set = set(BRANDED)
        branded_in = [t for t in tag_list if t in branded_set]
        others = [t for t in tag_list if t not in branded_set]
        random.shuffle(others)
        tag_list = branded_in + others[:count - len(branded_in)]
    
    random.shuffle(tag_list)
    return " ".join(tag_list)


def get_story_hashtags(theme: str, count: int = 5) -> str:
    """Return a small set of hashtags for Stories (less = better for stories)."""
    tags = set(["#OnMangeQuoi"])
    
    theme_map = {
        "recette_du_jour": ["#RecetteDuJour", "#IdeeRepas", "#CuisineMaison"],
        "astuce_frigo": ["#AstuceCuisine", "#TipsCuisine", "#AntiGaspi"],
        "ingredient_star": ["#IngredientDeSaison", "#FraisDeSaison", "#CuisineDeSaison"],
        "quiz_cuisine": ["#QuizCuisine", "#Sondage", "#VotezPour"],
        "defi_zero_gaspi": ["#AntiGaspi", "#ZeroGaspillage", "#DefiCuisine"],
        "avant_apres": ["#AvantApres", "#FrigoTransformation", "#RecetteIA"],
        "recette_express": ["#RecetteExpress", "#5Minutes", "#CuisineRapide"],
        "saison_du_moment": ["#DeSaison", "#FraisDeSaison", "#CuisineSaisonniere"],
        "astuce_conservation": ["#AstuceConservation", "#AntiGaspi", "#ConserverSesAliments"],
        "combo_surprise": ["#ComboSurprise", "#RecetteIA", "#CuisineCreative"],
    }
    
    extra = theme_map.get(theme, ["#RecetteDuJour", "#CuisineMaison"])
    tags.update(extra[:count - 1])
    
    return " ".join(list(tags)[:count])


# ── Engagement CTA templates ─────────────────────────────────────────
ENGAGEMENT_HOOKS = {
    "question": [
        "Et toi, tu aurais fait quoi avec ces ingrédients ? 👇",
        "C'est validé ou pas ? Dis-moi en commentaire ! 💬",
        "Tu testes ce soir ? Tag quelqu'un qui adorerait ! 🏷️",
        "Quel est ton plat préféré quand t'as la flemme ? 👇",
        "Tu connaissais cette recette ? 🤔",
        "Qui d'autre a un frigo comme ça ? 😅",
        "Ton frigo ressemble à quoi là maintenant ? 📸",
        "Tag quelqu'un qui mange toujours la même chose 😂",
        "Tu aurais ajouté quel ingrédient ? 👇",
        "1, 2 ou 3 ? Vote en commentaire ! 🗳️",
    ],
    "challenge": [
        "DÉFI : prends ton frigo en photo et poste-le en story ! 📸",
        "Challenge : cuisine ça ce soir et montre-nous le résultat ! 🍳",
        "Ose essayer et tague @onmangequoi_app dans ta story ! 💪",
    ],
    "save_share": [
        "📌 Enregistre ce post pour quand t'auras pas d'idée !",
        "💾 Save pour plus tard, tu me remercieras 😉",
        "📲 Partage à quelqu'un qui galère à trouver des idées repas !",
        "Enregistre 📌 + Partage 📲 = tu nous aides BEAUCOUP 🙏",
    ],
}


def get_engagement_cta(style: str = "mixed") -> str:
    """Return an engagement-boosting CTA for the post caption."""
    if style == "question":
        return random.choice(ENGAGEMENT_HOOKS["question"])
    elif style == "challenge":
        return random.choice(ENGAGEMENT_HOOKS["challenge"])
    elif style == "save_share":
        return random.choice(ENGAGEMENT_HOOKS["save_share"])
    else:
        # Mix: question + save/share
        q = random.choice(ENGAGEMENT_HOOKS["question"])
        s = random.choice(ENGAGEMENT_HOOKS["save_share"])
        return f"{q}\n\n{s}"


if __name__ == "__main__":
    for p in ["leger", "sport", "gourmand", "astuce"]:
        print(f"\n── {p.upper()} ──")
        print(get_hashtags(p))
    print(f"\n── REEL ──")
    print(get_reel_hashtags())
    print(f"\n── ENGAGEMENT ──")
    print(get_engagement_cta())
