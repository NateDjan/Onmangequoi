#!/usr/bin/env python3
"""On Mange Quoi? — Weekly Triptych Post

Concept: Same common fridge ingredients → 3 completely different dishes:
  🥗 DIET — light & healthy
  💪 SPORTIF — protein-packed for athletes
  🍕 GOURMAND — comfort food indulgence

Generates one cohesive triptych image (GPT Image 2), adds color-coded labels,
and posts to Facebook + Instagram.

Schedule: Once a week (Sunday at 12h Brussels = 10h UTC)
"""

import asyncio, json, random, requests, sys, time, hashlib
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, "/work")
sys.path.insert(0, "/work/viktor-spaces/on-mange-quoi/meta-automation")

from sdk.tools.utils_tools import ai_structured_output, coworker_text2im
from hashtag_strategy import get_hashtags, get_engagement_cta
from utm_links import triptych_url
from image_dedup import ImageDedup

# ── Config ────────────────────────────────────────────────────────────────────
CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
DEDUP_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/posted_dishes.json")

config = json.loads(CONFIG_PATH.read_text())
PAGE_ID = config["page_id"]
PAGE_TOKEN = config["page_token"]
IG_USER_ID = config["instagram_user_id"]
SITE_URL = config["site_url"]


# ── Ingredient pool (common fridge items) ─────────────────────────────────────
INGREDIENT_SETS = [
    "poulet, courgettes, riz basmati, tomates cerises, œufs",
    "pâtes, lardons, crème fraîche, parmesan, oignon",
    "saumon, pommes de terre, brocoli, citron, ail",
    "bœuf haché, poivrons, oignon, riz, haricots rouges",
    "thon en boîte, pâtes, maïs, tomates, mozzarella",
    "œufs, épinards, champignons, fromage râpé, pain de mie",
    "crevettes, nouilles, carottes, soja, gingembre",
    "dinde, patate douce, quinoa, avocat, poivron",
    "merguez, semoule, pois chiches, courgettes, tomates",
    "jambon, pommes de terre, emmental, crème, salade",
    "poulet, curry, lait de coco, riz, poivrons",
    "steak haché, frites, salade, tomate, oignon",
    "filet de poisson blanc, riz, courgettes, citron, herbes",
    "tofu, riz, brocoli, sauce soja, sésame",
    "agneau, pommes de terre, carottes, oignon, thym",
]


async def step1_generate_recipes(ingredients: str) -> dict:
    """Generate 3 recipe variants (diet, sport, gourmand) from same ingredients."""
    print(f"\n🧠 Step 1: Generating 3 recipes from: {ingredients}")

    schema = {
        "type": "object",
        "properties": {
            "common_ingredients": {"type": "string"},
            "diet_name": {"type": "string"},
            "diet_description": {"type": "string"},
            "sport_name": {"type": "string"},
            "sport_description": {"type": "string"},
            "gourmand_name": {"type": "string"},
            "gourmand_description": {"type": "string"},
        },
        "required": [
            "common_ingredients",
            "diet_name", "diet_description",
            "sport_name", "sport_description",
            "gourmand_name", "gourmand_description",
        ],
    }

    prompt = f"""Tu es un chef créatif français. À partir de ces ingrédients de base : {ingredients}

Propose 3 recettes TRÈS DIFFÉRENTES :

1. **DIET** (🥗) — Ultra léger, peu calorique, frais et sain. Parfait pour un régime.
2. **SPORTIF** (💪) — Riche en protéines, portions généreuses, bon pour la récupération.  
3. **GOURMAND** (🍕) — Comfort food, gratiné/fondant/croustillant, plaisir avant tout.

Pour chaque recette donne :
- Un nom créatif et accrocheur (en français)
- Une description courte (2 phrases max) qui donne envie

Les 3 recettes doivent utiliser les MÊMES ingrédients de base mais de façon radicalement différente.
Donne les ingrédients communs tels quels dans common_ingredients."""

    result = await ai_structured_output(
        content=prompt,
        output_schema=schema,
        model="claude-sonnet",
    )
    recipes = result.output
    print(f"  🥗 Diet: {recipes['diet_name']}")
    print(f"  💪 Sport: {recipes['sport_name']}")
    print(f"  🍕 Gourmand: {recipes['gourmand_name']}")
    return recipes


async def step2_generate_triptych_image(recipes: dict) -> str:
    """Generate a cohesive triptych image with GPT Image 2."""
    print("\n🖼️ Step 2: Generating triptych image (GPT Image 2)...")

    prompt = f"""Create a professional food photography triptych image, split into exactly 3 equal vertical panels side by side.

The 3 panels show 3 different dishes made from the SAME ingredients ({recipes['common_ingredients']}):

LEFT PANEL: "{recipes['diet_name']}" — {recipes['diet_description']}. Light, fresh, colorful. Served in a white bowl or plate.

MIDDLE PANEL: "{recipes['sport_name']}" — {recipes['sport_description']}. Hearty, abundant portion. Served in a dark bowl or wok plate.

RIGHT PANEL: "{recipes['gourmand_name']}" — {recipes['gourmand_description']}. Rich, golden, indulgent. Served in a ceramic oven dish or deep plate.

STYLE: All 3 panels photographed from the same top-down angle with consistent natural daylight. Real kitchen table background. Smartphone food photography style, authentic and appetizing. Each panel clearly separated. The 3 dishes must look visually VERY different.

NO text, NO labels, NO watermarks."""

    result = await coworker_text2im(
        prompt=prompt,
        model="gpt-image-2",
        aspect_ratio="1:1",
    )

    print(f"  ✅ Base image: {result.local_path}")
    return result.local_path


def step3_add_labels(base_path: str, recipes: dict) -> str:
    """Add color-coded labels to the triptych."""
    from PIL import Image, ImageDraw, ImageFont

    print("\n🎨 Step 3: Adding labels...")

    FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    img = Image.open(base_path).convert("RGB")
    img = img.resize((1080, 1080), Image.LANCZOS)
    w, h = img.size

    LABEL_H = 85
    canvas = Image.new("RGB", (w, h + LABEL_H), (20, 20, 20))
    canvas.paste(img, (0, 0))
    draw = ImageDraw.Draw(canvas)

    font_big = ImageFont.truetype(FONT_BOLD, 30)
    font_small = ImageFont.truetype(FONT_REG, 15)
    font_brand = ImageFont.truetype(FONT_REG, 13)

    panel_w = w // 3

    labels = [
        ("DIET", recipes["diet_name"], (76, 175, 80)),
        ("SPORTIF", recipes["sport_name"], (33, 150, 243)),
        ("GOURMAND", recipes["gourmand_name"], (255, 87, 34)),
    ]

    for i, (label, dish_name, color) in enumerate(labels):
        x0 = i * panel_w
        x1 = x0 + panel_w

        draw.rectangle([(x0, h), (x1, h + LABEL_H)], fill=color)

        bbox = draw.textbbox((0, 0), label, font=font_big)
        tw = bbox[2] - bbox[0]
        tx = x0 + (panel_w - tw) // 2
        draw.text((tx, h + 10), label, fill="white", font=font_big)

        name = dish_name if len(dish_name) <= 30 else dish_name[:28] + "..."
        bbox2 = draw.textbbox((0, 0), name, font=font_small)
        tw2 = bbox2[2] - bbox2[0]
        tx2 = x0 + (panel_w - tw2) // 2
        draw.text((tx2, h + 50), name, fill="white", font=font_small)

    # Brand watermark
    brand = "onmangequoi.net"
    bbox_b = draw.textbbox((0, 0), brand, font=font_brand)
    bw = bbox_b[2] - bbox_b[0]
    bh = bbox_b[3] - bbox_b[1]
    pill_x = w - bw - 16
    pill_y = h - 26
    draw.rounded_rectangle(
        [(pill_x - 8, pill_y - 4), (pill_x + bw + 8, pill_y + bh + 6)],
        radius=10,
        fill=(0, 0, 0, 160),
    )
    draw.text((pill_x, pill_y), brand, fill="white", font=font_brand)

    # Resize to 1080x1080 for IG
    final = canvas.resize((1080, 1080), Image.LANCZOS)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output = f"/tmp/omq_triptych_{ts}.jpg"
    final.save(output, "JPEG", quality=95)
    print(f"  ✅ Final: {output}")
    return output


async def step4_generate_caption(recipes: dict) -> str:
    """Generate an engaging caption for the triptych post."""
    print("\n✍️ Step 4: Generating caption...")

    hashtags = get_hashtags(pillar="leger", extra_tags=[
        "#RecetteBassesCalories", "#RepasSportif", "#SaladeDEte",
        "#BienveillanteFood", "#Foodgasm",
    ])
    cta = get_engagement_cta()

    result = await ai_structured_output(
        content=f"""Écris une légende Facebook/Instagram pour ce post triptych :

CONCEPT : Mêmes ingrédients du frigo ({recipes['common_ingredients']}) → 3 plats complètement différents selon ton mood.

🥗 DIET : {recipes['diet_name']} — {recipes['diet_description']}
💪 SPORTIF : {recipes['sport_name']} — {recipes['sport_description']}
🍕 GOURMAND : {recipes['gourmand_name']} — {recipes['gourmand_description']}

RÈGLES :
- Ton conversationnel, comme un pote qui partage un hack cuisine
- Commence par un hook qui interpelle (question, situation relatable)
- Raconte un micro-scénario : "j'avais X dans mon frigo, j'ai lancé onmangequoi.net..."
- Présente les 3 options avec les emojis
- CTA : {cta}
- Mention le lien onmangequoi.net (UTM complet pour bio: {triptych_url()})
- Tag @onmangequoi_app
- Finis avec les hashtags : {hashtags}
- Max 2000 caractères total""",
        output_schema={
            "type": "object",
            "properties": {"caption": {"type": "string"}},
            "required": ["caption"],
        },
        model="claude-sonnet",
    )
    caption = result.output["caption"]
    print(f"  ✅ Caption: {len(caption)} chars")
    return caption


def step5_post(image_path: str, caption: str) -> dict:
    """Post to Facebook and Instagram."""
    print("\n📤 Step 5: Posting...")
    results = {}

    # Facebook
    print("  → Facebook...")
    with open(image_path, "rb") as f:
        fb_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"caption": caption, "published": "true"},
            files={"source": f},
        )
    fb_data = fb_resp.json()
    if "id" in fb_data:
        results["facebook"] = {"id": fb_data["id"], "status": "ok"}
        print(f"  ✅ Facebook: {fb_data['id']}")
    else:
        results["facebook"] = {"error": str(fb_data), "status": "error"}
        print(f"  ❌ Facebook: {fb_data}")

    # Instagram
    print("  → Instagram...")
    with open(image_path, "rb") as f:
        cdn_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"published": "false"},
            files={"source": f},
        )
    cdn_data = cdn_resp.json()

    if "id" not in cdn_data:
        results["instagram"] = {"error": str(cdn_data), "status": "error"}
        print(f"  ❌ IG CDN: {cdn_data}")
        return results

    photo_id = cdn_data["id"]
    img_info = requests.get(
        f"https://graph.facebook.com/v19.0/{photo_id}",
        params={"fields": "images", "access_token": PAGE_TOKEN},
    ).json()

    images = img_info.get("images", [])
    if not images:
        results["instagram"] = {"error": "No CDN URL", "status": "error"}
        return results

    image_url = images[0]["source"]

    container = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"image_url": image_url, "caption": caption},
    ).json()

    if "id" not in container:
        results["instagram"] = {"error": str(container), "status": "error"}
        print(f"  ❌ IG container: {container}")
        return results

    creation_id = container["id"]
    for attempt in range(15):
        time.sleep(5)
        status = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN},
        ).json().get("status_code", "UNKNOWN")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            results["instagram"] = {"error": f"Container {status}", "status": "error"}
            print(f"  ❌ IG: Container {status}")
            return results

    publish = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id},
    ).json()

    if "id" in publish:
        results["instagram"] = {"id": publish["id"], "status": "ok"}
        print(f"  ✅ Instagram: {publish['id']}")
    else:
        results["instagram"] = {"error": str(publish), "status": "error"}
        print(f"  ❌ Instagram: {publish}")

    return results


async def main():
    print("=" * 60)
    print(f"🍽️  WEEKLY TRIPTYCH — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # Pick random ingredients (avoid recent ones via dedup)
    dedup = ImageDedup(str(DEDUP_PATH))
    ingredients = random.choice(INGREDIENT_SETS)
    print(f"\n📦 Ingredients: {ingredients}")

    # Pipeline
    recipes = await step1_generate_recipes(ingredients)
    base_image = await step2_generate_triptych_image(recipes)
    final_image = step3_add_labels(base_image, recipes)
    caption = await step4_generate_caption(recipes)

    print(f"\n--- CAPTION ---\n{caption}\n")

    post_results = step5_post(final_image, caption)

    # Register in dedup
    for name_key in ["diet_name", "sport_name", "gourmand_name"]:
        dedup.register(recipes[name_key])

    # Summary
    print("\n" + "=" * 60)
    fb_ok = post_results.get("facebook", {}).get("status") == "ok"
    ig_ok = post_results.get("instagram", {}).get("status") == "ok"
    print(f"Facebook: {'✅' if fb_ok else '❌'}")
    print(f"Instagram: {'✅' if ig_ok else '❌'}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
