#!/usr/bin/env python3
"""
On Mange Quoi? — Weekly Triptych Post
Same fridge ingredients → 3 dishes: 🥗 DIET · 💪 SPORTIF · 🍕 GOURMAND
Uses Hermes bridge + fal.ai for images. Posts to FB + IG.
Schedule: Sunday at 10h UTC (12h Brussels)
"""
import asyncio, json, random, requests, time
from pathlib import Path
from datetime import datetime, timezone

from shared_config import get_page_id, get_page_token, get_ig_user_id, get_site_url
from hermes_bridge import structured_output, text2im
from hashtag_strategy import get_hashtags, get_engagement_cta
from utm_links import triptych_url
from image_dedup import ImageDedup

PAGE_ID = get_page_id()
pt = get_page_token()
PAGE_TOKEN = pt
ig = get_ig_user_id()
IG_USER_ID = ig
SITE_URL = get_site_url()

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
    "poulet, curry, lait de coco, riz, poivrons",
    "tofu, riz, brocoli, sauce soja, sésame",
    "agneau, pommes de terre, carottes, oignon, thym",
]


async def step1_generate_recipes(ingredients: str) -> dict:
    print(f"\n🧠 Step 1: Generating 3 recipes from: {ingredients}")
    result = await asyncio.to_thread(
        structured_output,
        prompt=f"""Tu es un chef créatif français. À partir de ces ingrédients : {ingredients}

Propose 3 recettes utilisant les MÊMES ingrédients de base mais de façon radicalement différente :

1. **DIET** (🥗) — Ultra léger, peu calorique, frais et sain. Parfait pour un régime.
2. **SPORTIF** (💪) — Riche en protéines, portions généreuses, récupération.
3. **GOURMAND** (🍕) — Comfort food, gratiné/fondant/croustillant, plaisir avant tout.

Pour chaque recette : nom créatif (français), description courte (2 phrases) qui donne envie.
Donne les ingrédients communs tels quels dans common_ingredients.""",
        output_schema={
            "type": "object",
            "properties": {
                "common_ingredients": {"type": "string"},
                "diet_name": {"type": "string"}, "diet_description": {"type": "string"},
                "sport_name": {"type": "string"}, "sport_description": {"type": "string"},
                "gourmand_name": {"type": "string"}, "gourmand_description": {"type": "string"},
            },
            "required": ["common_ingredients", "diet_name", "diet_description", "sport_name", "sport_description", "gourmand_name", "gourmand_description"],
        },
    )
    return result


async def step2_generate_triptych_image(recipes: dict) -> str:
    print("\n🖼️ Step 2: Generating triptych image...")
    prompt = f"""Professional food photography triptych, 3 equal vertical panels side by side.

LEFT: "{recipes['diet_name']}" — {recipes['diet_description']}. Light, fresh, white bowl.
MIDDLE: "{recipes['sport_name']}" — {recipes['sport_description']}. Hearty, dark wok plate.
RIGHT: "{recipes['gourmand_name']}" — {recipes['gourmand_description']}. Rich, golden, ceramic dish.

All 3 from same top-down angle, consistent natural daylight. Real kitchen background.
3 dishes visually VERY different. NO text, NO labels, NO watermarks."""

    # Use fal.ai directly for triptych (needs good quality)
    import httpx
    FAL_KEY = "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8"
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://fal.run/fal-ai/flux/schnell",
            headers={"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"},
            json={"prompt": prompt, "image_size": "square_hd", "num_images": 1, "num_inference_steps": 4},
        )
        data = resp.json()
        if "images" in data and data["images"]:
            img_url = data["images"][0]["url"]
            img_resp = await client.get(img_url)
            path = f"/tmp/omq_triptych_{int(time.time())}.png"
            Path(path).write_bytes(img_resp.content)
            print(f"  ✅ Base image: {path}")
            return path
    raise RuntimeError(f"fal.ai failed: {data}")


def step3_add_labels(base_path: str, recipes: dict) -> str:
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
        x0 = i * panel_w; x1 = x0 + panel_w
        draw.rectangle([(x0, h), (x1, h + LABEL_H)], fill=color)
        bbox = draw.textbbox((0, 0), label, font=font_big)
        tx = x0 + (panel_w - (bbox[2] - bbox[0])) // 2
        draw.text((tx, h + 10), label, fill="white", font=font_big)
        name = dish_name if len(dish_name) <= 30 else dish_name[:28] + "..."
        bbox2 = draw.textbbox((0, 0), name, font=font_small)
        tx2 = x0 + (panel_w - (bbox2[2] - bbox2[0])) // 2
        draw.text((tx2, h + 50), name, fill="white", font=font_small)

    brand = "onmangequoi.net"
    bbox_b = draw.textbbox((0, 0), brand, font=font_brand)
    bw, bh = bbox_b[2] - bbox_b[0], bbox_b[3] - bbox_b[1]
    pill_x, pill_y = w - bw - 16, h - 26
    draw.rounded_rectangle([(pill_x - 8, pill_y - 4), (pill_x + bw + 8, pill_y + bh + 6)], radius=10, fill=(0, 0, 0, 160))
    draw.text((pill_x, pill_y), brand, fill="white", font=font_brand)

    output = f"/tmp/omq_triptych_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    canvas.resize((1080, 1080), Image.LANCZOS).save(output, "JPEG", quality=95)
    print(f"  ✅ Final: {output}")
    return output


async def step4_generate_caption(recipes: dict) -> str:
    print("\n✍️ Step 4: Generating caption...")
    hashtags = get_hashtags(pillar="leger", count=18)
    cta = get_engagement_cta("mixed")

    result = await asyncio.to_thread(
        structured_output,
        prompt=f"""Écris une légende Instagram pour ce post triptych :

CONCEPT : Mêmes ingrédients ({recipes['common_ingredients']}) → 3 plats selon ton mood.

🥗 DIET : {recipes['diet_name']} — {recipes['diet_description']}
💪 SPORTIF : {recipes['sport_name']} — {recipes['sport_description']}
🍕 GOURMAND : {recipes['gourmand_name']} — {recipes['gourmand_description']}

RÈGLES : Ton conversationnel, hook qui interpelle, micro-scénario frigo → app, 3 options avec emojis, CTA: {cta}, lien onmangequoi.net (UTM: {triptych_url()}), @onmangequoi_app, hashtags: {hashtags}, max 2000 car.""",
        output_schema={"type": "object", "properties": {"caption": {"type": "string"}}, "required": ["caption"]},
    )
    return result["caption"]


def step5_post(image_path: str, caption: str) -> dict:
    print("\n📤 Step 5: Posting...")
    results = {}

    print("  → Facebook...")
    with open(image_path, "rb") as f:
        fb_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"caption": caption, "published": "true"}, files={"source": f}
        )
    fb_data = fb_resp.json()
    if "id" in fb_data:
        results["facebook"] = {"id": fb_data["id"], "status": "ok"}
        print(f"  ✅ FB: {fb_data['id']}")
    else:
        results["facebook"] = {"error": str(fb_data), "status": "error"}

    print("  → Instagram...")
    with open(image_path, "rb") as f:
        cdn_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"published": "false"}, files={"source": f}
        )
    cdn_data = cdn_resp.json()
    if "id" not in cdn_data:
        results["instagram"] = {"error": str(cdn_data)}
        return results

    img_info = requests.get(
        f"https://graph.facebook.com/v19.0/{cdn_data['id']}",
        params={"fields": "images", "access_token": PAGE_TOKEN}
    ).json()
    images = img_info.get("images", [])
    if not images:
        results["instagram"] = {"error": "No CDN URL"}
        return results

    container = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"image_url": images[0]["source"], "caption": caption}
    ).json()

    if "id" not in container:
        results["instagram"] = {"error": str(container)}
        return results

    creation_id = container["id"]
    for _ in range(15):
        time.sleep(5)
        status = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}
        ).json().get("status_code", "UNKNOWN")
        if status == "FINISHED": break
        if status in ("ERROR", "EXPIRED"):
            results["instagram"] = {"error": f"Container {status}"}
            return results

    publish = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN}, data={"creation_id": creation_id}
    ).json()

    if "id" in publish:
        results["instagram"] = {"id": publish["id"], "status": "ok"}
        print(f"  ✅ IG: {publish['id']}")
    else:
        results["instagram"] = {"error": str(publish)}

    return results


async def main():
    print("=" * 60)
    print(f"🍽️  WEEKLY TRIPTYCH — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    ingredients = random.choice(INGREDIENT_SETS)
    print(f"\n📦 Ingredients: {ingredients}")

    recipes = await step1_generate_recipes(ingredients)
    print(f"  🥗 Diet: {recipes['diet_name']}")
    print(f"  💪 Sport: {recipes['sport_name']}")
    print(f"  🍕 Gourmand: {recipes['gourmand_name']}")

    base_image = await step2_generate_triptych_image(recipes)
    final_image = step3_add_labels(base_image, recipes)
    caption = await step4_generate_caption(recipes)
    print(f"\n--- CAPTION ---\n{caption[:500]}...\n")

    post_results = step5_post(final_image, caption)

    fb_ok = post_results.get("facebook", {}).get("status") == "ok"
    ig_ok = post_results.get("instagram", {}).get("status") == "ok"
    print(f"\nFacebook: {'✅' if fb_ok else '❌'}")
    print(f"Instagram: {'✅' if ig_ok else '❌'}")


if __name__ == "__main__":
    asyncio.run(main())
