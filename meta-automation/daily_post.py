#!/usr/bin/env python3
"""
On Mange Quoi? — Daily post generator for Facebook + Instagram

Replaces Viktor AI dependencies with Hermes bridge.
"""
import asyncio, json, requests, sys, os, time, random, argparse
from pathlib import Path
from datetime import datetime, timezone

from shared_config import get_page_id, get_page_token, get_ig_user_id, get_site_url, POST_HISTORY_PATH, CONFIG_PATH
from hermes_bridge import structured_output
from image_dedup import ImageDedup
from hashtag_strategy import get_hashtags, get_engagement_cta
from utm_links import feed_url

config = json.loads(CONFIG_PATH.read_text())
PAGE_ID = get_page_id()
PAGE_TOKEN = get_page_token()
IG_USER_ID = get_ig_user_id()
SITE_URL = get_site_url()

# ─── Content Pillars ──────────────────────────────────────────────────────────
PILLARS = {
    "leger": {
        "label": "🥗 Léger & Régime",
        "angle": "léger, diète, santé, faible calories",
        "guidelines": "Plats légers, salades, bowls, soupes, grillades simples, crudités. Max ~400 kcal. Frais et coloré.",
    },
    "sport": {
        "label": "💪 Sport & Énergie",
        "angle": "protéines, récupération musculaire, énergie, fitness",
        "guidelines": "Plats riches en protéines, bowls, wraps, omelettes, grillades. Bons glucides. Post-entraînement.",
    },
    "gourmand": {
        "label": "🍕 Gourmand",
        "angle": "plaisir, réconfort, indulgence assumée",
        "guidelines": "Plats réconfortants, gratins, plats mijotés, desserts, street food. Le goût avant tout.",
    },
    "astuce": {
        "label": "💡 Astuce Anti-Gaspi",
        "angle": "anti-gaspillage, valoriser les restes, frigo vide",
        "guidelines": "Recettes à partir de restes, ingrédients banals, techniques anti-gaspi. Malin et créatif.",
    },
}

PILLAR_ORDER = ["leger", "sport", "gourmand", "astuce"]


def load_history() -> dict:
    if POST_HISTORY_PATH.exists():
        h = json.loads(POST_HISTORY_PATH.read_text())
        if isinstance(h, list):
            return {"pillar_index": 0}
        return h
    return {"pillar_index": 0}


def save_history(history: dict):
    POST_HISTORY_PATH.write_text(json.dumps(history, ensure_ascii=False, indent=2))


async def generate_unique_recipe(pillar_key: str, pillar: dict, dedup: ImageDedup) -> tuple:
    """Use Hermes to generate a unique recipe that hasn't been posted recently."""
    from datetime import datetime as _dt

    recent = dedup.get_recent_subjects()
    recent_entries = dedup._recent_entries()
    exclusion_lines = []
    for entry in recent_entries:
        name = entry.get("dish_name", "?")
        kw = entry.get("keywords", [])
        date = entry.get("posted_at", "?")[:10]
        exclusion_lines.append(f"  - {date}: {name} (mots-clés: {', '.join(kw)})")

    exclusion_block = "\n".join(exclusion_lines) if exclusion_lines else "  (aucun post récent)"

    month_names = ["janvier", "février", "mars", "avril", "mai", "juin",
                   "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    current_month = month_names[_dt.now().month - 1]

    result = await asyncio.to_thread(
        structured_output,
        prompt=f"""Tu es le créateur de recettes pour l'app "On Mange Quoi?" (onmangequoi.net).

PILIER DU POST : {pillar['label']}
ANGLE : {pillar['angle']}
GUIDELINES : {pillar['guidelines']}
SAISON : {current_month} 2026

⛔ RECETTES DÉJÀ POSTÉES CES 30 DERNIERS JOURS (NE PAS RÉPÉTER ni s'en approcher) :
{exclusion_block}

RÈGLES STRICTES :
1. Le plat doit être COMPLÈTEMENT DIFFÉRENT de tout ce qui a été posté
2. Varier les cuisines du monde
3. 3-5 ingrédients simples qu'on peut avoir dans son frigo
4. Le plat doit être faisable en moins de 30 minutes

Génère UNE recette unique et originale.""",
        output_schema={
            "type": "object",
            "properties": {
                "recipe_name": {"type": "string", "description": "Nom accrocheur du plat"},
                "ingredients": {"type": "string", "description": "3-5 ingrédients principaux séparés par des virgules"},
                "cuisine_origin": {"type": "string", "description": "Origine culinaire"},
            },
            "required": ["recipe_name", "ingredients", "cuisine_origin"],
        },
    )

    r = result
    recipe_name = r["recipe_name"]
    ingredients = r["ingredients"]

    if dedup.is_duplicate(f"{ingredients} {recipe_name}", threshold=0.4):
        print(f"  ⚠️  AI recipe '{recipe_name}' still too similar, will post anyway")

    print(f"  🎲 AI-generated: {recipe_name} ({r.get('cuisine_origin', '?')})")
    print(f"     Ingrédients: {ingredients}")

    return (ingredients, recipe_name, pillar_key)


def pick_pillar(history: dict, force_pillar: str | None = None) -> str:
    if force_pillar and force_pillar in PILLARS:
        return force_pillar
    idx = history.get("pillar_index", 0) % len(PILLAR_ORDER)
    pillar_key = PILLAR_ORDER[idx]
    history["pillar_index"] = idx + 1
    return pillar_key


async def generate_post_text(pillar_key: str, pillar: dict, scenario: tuple) -> dict:
    """Generate post text via Hermes."""
    ingredients, recipe, angle = scenario
    engagement_cta = get_engagement_cta("mixed")
    hashtags_block = get_hashtags(pillar_key, count=18)

    result = await asyncio.to_thread(
        structured_output,
        prompt=f"""Tu es le créateur de onmangequoi.net, une app IA qui analyse le frigo et génère des recettes.

Tu dois écrire un post Instagram qui raconte cette histoire :
→ L'utilisateur avait ces ingrédients dans son frigo : **{ingredients}**
→ Il a pris une photo et l'a uploadée sur onmangequoi.net
→ L'IA lui a suggéré : **{recipe}**
→ Le résultat était délicieux !

ANGLE de ce post : {pillar['angle']} ({pillar['label']})

STRUCTURE OBLIGATOIRE :
1. **Accroche** : 1 ligne qui crée l'émotion
2. **Le frigo de départ** : liste les ingrédients disponibles
3. **Ce que l'app a généré** : présente la recette {recipe}
4. **La réalité** : 1-2 phrases sensorielles
5. **CTA clair** : "Toi aussi → prends en photo ton frigo sur onmangequoi.net 📸"
6. **Engagement** : "{engagement_cta}"
7. **Mention** : @onmangequoi_app
8. **Hashtags** EXACTEMENT : {hashtags_block}

IMPORTANT : Écris naturellement, authentique, pas de ton pub. POSE UNE QUESTION au lecteur. Max 250 mots (hors hashtags).

Génère aussi :
- dish_name : nom court du plat
- image_description : description EN ANGLAIS pour générer la photo (plat terminé, dressé, PAS d'ingrédients bruts)
- image_caption : courte phrase à superposer sur l'image""",
        output_schema={
            "type": "object",
            "properties": {
                "post_text": {"type": "string"},
                "dish_name": {"type": "string"},
                "image_description": {"type": "string"},
                "image_caption": {"type": "string"},
            },
            "required": ["post_text", "dish_name", "image_description"],
        },
    )
    return result


async def generate_image_fal(dish_name: str, image_description: str) -> tuple[str, str | None]:
    from image_gen import generate_post_image
    return await generate_post_image(dish_name, image_description)


def post_to_facebook(message: str, image_local_path: str) -> dict:
    with open(image_local_path, "rb") as img_file:
        resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"caption": message, "published": "true"},
            files={"source": img_file},
        )
    return resp.json()


def post_to_instagram(message: str, image_url: str) -> dict:
    container_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"image_url": image_url, "caption": message},
    )
    container_data = container_resp.json()
    print(f"IG container: {container_data}")
    if "id" not in container_data:
        return {"error": f"Container failed: {container_data}"}

    creation_id = container_data["id"]
    for attempt in range(12):
        time.sleep(5)
        status_resp = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN},
        )
        status = status_resp.json().get("status_code", "UNKNOWN")
        print(f"IG status ({attempt+1}/12): {status}")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            return {"error": f"Container status: {status}"}

    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id},
    )
    return publish_resp.json()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pillar", choices=list(PILLARS.keys()), help="Force a specific content pillar")
    parser.add_argument("--dry-run", action="store_true", help="Generate text + image but don't post")
    args = parser.parse_args()

    dedup = ImageDedup()
    dedup.cleanup_old()

    recent = dedup.get_recent_subjects()
    if recent:
        print(f"📋 Recent posts (last 30d): {', '.join(recent[-5:])}")

    history = load_history()
    pillar_key = pick_pillar(history, force_pillar=args.pillar)
    pillar = PILLARS[pillar_key]

    print(f"\n🎯 Pilier: {pillar['label']}")
    print("🤖 Generating unique recipe via Hermes...")
    scenario = await generate_unique_recipe(pillar_key, pillar, dedup)
    save_history(history)

    ingredients, recipe, angle = scenario
    print(f"\n🚀 {pillar['label']} — {recipe}")
    print(f"📦 Ingrédients: {ingredients}")

    print("\n✍️  Generating post text...")
    post_data = await generate_post_text(pillar_key, pillar, scenario)
    post_text = post_data["post_text"]
    dish_name = post_data["dish_name"]
    image_description = post_data["image_description"]

    print(f"\n--- POST TEXT ---\n{post_text}\n")
    print(f"Image subject: {dish_name}")

    local_path, image_url = await generate_image_fal(dish_name, image_description)

    if args.dry_run:
        print("🏃 Dry run — skipping actual posting")
        return

    post_ids = {}

    print("\n--- Posting to Facebook ---")
    fb_result = post_to_facebook(post_text, local_path)
    if "id" in fb_result:
        print(f"✅ Facebook: {fb_result['id']}")
        post_ids["facebook"] = fb_result["id"]
    else:
        print(f"❌ Facebook: {fb_result}")

    print("\n--- Posting to Instagram ---")
    if not image_url and local_path:
        print("  No public URL from image provider — uploading to FB CDN...")
        try:
            with open(local_path, "rb") as img_file:
                fb_upload_resp = requests.post(
                    f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
                    params={"access_token": PAGE_TOKEN},
                    data={"published": "false"},
                    files={"source": img_file},
                )
            fb_upload_data = fb_upload_resp.json()
            if "id" in fb_upload_data:
                photo_id = fb_upload_data["id"]
                img_info_resp = requests.get(
                    f"https://graph.facebook.com/v19.0/{photo_id}",
                    params={"fields": "images", "access_token": PAGE_TOKEN},
                )
                images = img_info_resp.json().get("images", [])
                if images:
                    image_url = images[0]["source"]
                    print(f"  FB CDN URL: {image_url[:80]}...")
        except Exception as e:
            print(f"  FB CDN upload failed: {e}")

    if image_url:
        ig_result = post_to_instagram(post_text, image_url)
        if "id" in ig_result:
            print(f"✅ Instagram: {ig_result['id']}")
            post_ids["instagram"] = ig_result["id"]
        else:
            print(f"❌ Instagram: {ig_result}")

    if post_ids:
        dedup.register(
            dish_name=f"{recipe} ({ingredients[:40]})",
            image_prompt=image_description,
            pillar=pillar_key,
            post_ids=post_ids,
        )


if __name__ == "__main__":
    asyncio.run(main())
