"""TikTok hashtag strategy for On Mange Quoi?
Optimized for French-speaking TikTok audience.
"""

# Core brand hashtags (always include 1-2)
BRAND_TAGS = [
    "#onmangequoi",
    "#onmangeQuoi",
]

# High-volume French food TikTok hashtags (rotate)
FRENCH_FOOD = [
    "#recettefacile",
    "#cuisinemaison",
    "#recettedujourr",
    "#cuisinefrancaise",
    "#miam",
    "#gourmandise",
    "#bonappetit",
    "#plaisirsgourmands",
    "#cestbondecheznous",
    "#faitmaison",
    "#recetterapide",
    "#cuisinerfacilement",
    "#platdujour",
    "#mangersain",
    "#mieuxmanger",
    "#mangerbien",
    "#ideerepas",
    "#quoicuisiner",
]

# Anti-waste / fridge concept (core value prop)
ANTI_GASPI = [
    "#antigaspi",
    "#zerodechet",
    "#zerogaspi",
    "#restedufrigo",
    "#jaimemonfrigo",
    "#fridgehack",
]

# Viral / discovery tags
VIRAL = [
    "#fyp",
    "#foryou",
    "#pourtoi",
    "#viral",
    "#trending",
    "#tiktokfood",
    "#foodtiktok",
    "#astuces",
    "#hack",
]

# AI / tech angle (differentiator)
AI_TECH = [
    "#iarecette",
    "#ia",
    "#intelligenceartificielle",
    "#techfood",
    "#appfood",
]

import random

def get_tiktok_hashtags(theme: str = "general", count: int = 12) -> str:
    """Get optimized TikTok hashtag string.
    
    TikTok best practice: 3-5 niche + 3-5 broad + 1-2 brand = ~10-12 tags
    """
    tags = []
    
    # Always 1 brand tag
    tags.append(random.choice(BRAND_TAGS))
    
    # 1 AI tag (differentiator)
    tags.append(random.choice(AI_TECH))
    
    # Theme-specific mix
    if theme in ("antigaspi", "defi_zero_gaspi", "avant_apres"):
        tags.extend(random.sample(ANTI_GASPI, min(2, len(ANTI_GASPI))))
        tags.extend(random.sample(FRENCH_FOOD, 4))
    elif theme in ("recette", "recette_du_jour", "recette_express"):
        tags.extend(random.sample(FRENCH_FOOD, 5))
        tags.append(random.choice(ANTI_GASPI))
    else:
        tags.extend(random.sample(FRENCH_FOOD, 4))
        tags.append(random.choice(ANTI_GASPI))
    
    # Fill with viral tags
    remaining = count - len(tags)
    if remaining > 0:
        tags.extend(random.sample(VIRAL, min(remaining, len(VIRAL))))
    
    # Dedupe and limit
    seen = set()
    unique = []
    for t in tags:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    
    return " ".join(unique[:count])
