#!/usr/bin/env python3
"""
Daily hero image — refreshes the homepage dish photo every morning.

Rotates through 6 pillars over the week, generates a beautiful food photo
via fal.ai, then pushes it to Convex so the homepage picks it up instantly.

Schedule: 06:30 UTC (before the morning post at 08:00)
"""

import asyncio
import json
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, "/work")

# ── Config ────────────────────────────────────────────
CONVEX_URL = "https://tame-cardinal-281.convex.cloud"
FAL_KEY = "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8"
PARIS_TZ = timezone(timedelta(hours=2))  # CEST; +1 in winter — close enough for date

# ── Pillar rotation (day-of-week based) ───────────────
# Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
PILLAR_ROTATION = {
    0: "leger",      # Lundi   — léger, fresh start
    1: "sport",      # Mardi   — sport/énergie
    2: "gourmand",   # Mercredi — plaisir
    3: "exotique",   # Jeudi   — voyage culinaire
    4: "comfort",    # Vendredi — réconfort
    5: "dessert",    # Samedi  — douceur
    6: "gourmand",   # Dimanche — festif
}

# ── Per-pillar prompts & dish lists ───────────────────
PILLARS = {
    "leger": {
        "dishes": [
            "Bol Buddha saumon avocat quinoa",
            "Salade de lentilles betterave chèvre",
            "Wrap poulet grillé crudités houmous",
            "Velouté de courgettes menthe fraîche",
            "Bowl thaï crevettes mangue vermicelles",
            "Taboulé libanais herbes fraîches",
            "Salade niçoise thon haricots verts",
            "Gaspacho tomate basilic concombre",
        ],
        "prompt_style": "fresh vibrant healthy meal, bright natural lighting, clean white plate, farmer's market ingredients, light airy atmosphere",
        "emoji": "🥗",
    },
    "sport": {
        "dishes": [
            "Bowl protéiné poulet riz brun brocoli",
            "Omelette avocat patate douce épinards",
            "Steak grillé haricots verts patate douce",
            "Smoothie bowl acai granola graines chia",
            "Saumon vapeur edamame riz complet",
            "Poulet rôti légumes colorés pommes de terre",
            "Boulettes de dinde épinards pois chiches",
            "Crêpes avoine banane beurre cacahuète",
        ],
        "prompt_style": "high-protein power bowl, energetic food photography, bold colors, athletic nutrition, dynamic composition",
        "emoji": "💪",
    },
    "gourmand": {
        "dishes": [
            "Pâtes carbonara pancetta parmesan",
            "Risotto aux champignons sauvages truffe",
            "Tarte tatin caramélisée beurre noisette",
            "Magret de canard sauce cerise griotte",
            "Ravioles au beurre sauge parmesan",
            "Rôti de bœuf jus corsé gratin dauphinois",
            "Poulet basquaise poivrons chorizo",
            "Croque-monsieur gratinée gruyère jambon",
        ],
        "prompt_style": "indulgent gourmet French dish, warm moody lighting, rustic wooden table, steam rising, golden hour ambiance, deeply satisfying",
        "emoji": "🍽️",
    },
    "dessert": {
        "dishes": [
            "Fondant au chocolat cœur coulant vanille",
            "Tarte aux fraises crème pâtissière",
            "Crème brûlée caramel pralinée",
            "Mille-feuille crème légère framboises",
            "Paris-Brest praliné craquelin",
            "Îles flottantes caramel pistache",
            "Cheesecake mangue coulis passion",
            "Éclair café ganache velours",
        ],
        "prompt_style": "stunning French patisserie dessert, soft diffused light, marble surface, elegant plating, pastel background, dreamy atmosphere",
        "emoji": "🍮",
    },
    "exotique": {
        "dishes": [
            "Ramen japonais porc chashu œuf mariné",
            "Curry thaï poulet lait de coco jasmin",
            "Tacos al pastor ananas coriandre",
            "Paella valenciana crevettes chorizo",
            "Bao bun porc laqué pickles concombre",
            "Poke bowl thon saumon riz vinaigré",
            "Shakshuka œufs tomates poivrons épices",
            "Bibimbap légumes sautés bœuf gochujang",
        ],
        "prompt_style": "vibrant exotic cuisine, colorful spices and garnishes, traditional authentic presentation, travel-inspiring food photography",
        "emoji": "🌍",
    },
    "comfort": {
        "dishes": [
            "Soupe à l'oignon gratinée gruyère",
            "Pot-au-feu bœuf légumes d'hiver",
            "Tartiflette reblochon lardons pommes de terre",
            "Hachis parmentier bœuf purée maison",
            "Blanquette de veau champignons crème",
            "Quiche lorraine lardons gruyère",
            "Gratin de chou-fleur béchamel fromage",
            "Chili con carne haricots rouges cheddar",
        ],
        "prompt_style": "cozy comfort food, warm golden light, rustic cast iron cookware, fireplace atmosphere, soul-warming hearty dish",
        "emoji": "🍲",
    },
}


def get_today_paris() -> str:
    """Get today's date string in Paris timezone."""
    return datetime.now(PARIS_TZ).strftime("%Y-%m-%d")


def get_dish_for_today(pillar: str, date_str: str) -> str:
    """Pick a dish pseudo-randomly by day hash — deterministic but varied."""
    # Use the day-of-year to rotate through the dish list
    day_of_year = datetime.strptime(date_str, "%Y-%m-%d").timetuple().tm_yday
    dishes = PILLARS[pillar]["dishes"]
    return dishes[day_of_year % len(dishes)]


async def generate_hero_image(dish_name: str, pillar: str) -> str | None:
    """Generate a food photo via fal.ai, return URL."""
    import httpx

    style = PILLARS[pillar]["prompt_style"]
    prompt = (
        f"Ultra-realistic professional food photography of {dish_name}. "
        f"{style}. "
        "Shot with a 50mm lens, shallow depth of field, hero food shot, "
        "restaurant quality plating, mouth-watering, highly detailed, "
        "8k resolution, no text, no watermark."
    )

    print(f"  🎨 Generating image for: {dish_name}")
    print(f"  Prompt: {prompt[:120]}...")

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://fal.run/fal-ai/flux/schnell",
                headers={
                    "Authorization": f"Key {FAL_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "image_size": {"width": 1280, "height": 720},  # 16:9 hero
                    "num_images": 1,
                    "num_inference_steps": 4,
                },
            )

            if resp.status_code != 200:
                print(f"  ❌ fal.ai error {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            images = data.get("images", [])
            if not images:
                print(f"  ❌ No images returned: {data}")
                return None

            url = images[0]["url"]
            print(f"  ✅ Image generated: {url[:80]}...")
            return url

    except Exception as e:
        print(f"  ❌ fal.ai exception: {e}")
        return None


def push_to_convex(image_url: str, image_prompt: str, pillar: str, dish_name: str, date_str: str) -> bool:
    """Push the hero image to Convex via HTTP mutation."""
    payload = json.dumps({
        "path": "heroImage:upsert",
        "args": {
            "imageUrl": image_url,
            "imagePrompt": image_prompt,
            "pillar": pillar,
            "dishName": dish_name,
            "date": date_str,
        },
        "format": "json",
    }).encode()

    try:
        req = urllib.request.Request(
            f"{CONVEX_URL}/api/mutation",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            result = json.loads(r.read())
        print(f"  ✅ Convex updated: {result}")
        return True
    except Exception as e:
        print(f"  ❌ Convex push failed: {e}")
        return False


async def main():
    today = get_today_paris()
    weekday = datetime.strptime(today, "%Y-%m-%d").weekday()
    pillar = PILLAR_ROTATION[weekday]
    dish_name = get_dish_for_today(pillar, today)
    emoji = PILLARS[pillar]["emoji"]
    style = PILLARS[pillar]["prompt_style"]

    print(f"\n🍽️  Hero Image du Jour — {today}")
    print(f"   Pillar: {pillar} {emoji}")
    print(f"   Plat: {dish_name}")

    # Generate image
    image_url = await generate_hero_image(dish_name, pillar)
    if not image_url:
        print("  ⚠️  Image generation failed, keeping existing hero.")
        return

    # Push to Convex
    prompt_short = f"Ultra-realistic food photo of {dish_name}, {style[:80]}"
    success = push_to_convex(image_url, prompt_short, pillar, dish_name, today)

    if success:
        print(f"\n✅ Hero image updated! {emoji} {dish_name}")
        print(f"   URL: {image_url}")
        print(f"   Live at: https://onmangequoi.net")
    else:
        print("\n⚠️  Image generated but Convex push failed.")


if __name__ == "__main__":
    asyncio.run(main())
