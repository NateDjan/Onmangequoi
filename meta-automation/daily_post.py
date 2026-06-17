#!/usr/bin/env python3
"""On Mange Quoi? — Daily post generator for Facebook + Instagram

PHILOSOPHY (updated):
  Every single post tells the SAME story in different ways:
  "J'avais [ingrédients] dans mon frigo → j'ai utilisé onmangequoi.net
   → l'IA m'a suggéré [recette] → voilà le résultat 🤩"

  The content pillars vary the ANGLE (léger / sport / gourmand / astuce)
  but the NARRATIVE always shows the app at work.

  ❌ Never: random food porn with no connection to the app
  ✅ Always: "cette image vient d'une vraie suggestion de l'app"

IMAGE DEDUP: Never repeat the same dish within 30 days.
"""
import asyncio, json, requests, sys, os, random, time, argparse, hashlib
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, '/work')
from sdk.tools.utils_tools import ai_structured_output, quick_ai_search
from image_dedup import ImageDedup
from hashtag_strategy import get_hashtags, get_engagement_cta
from utm_links import feed_url

CONFIG_PATH  = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")

config     = json.loads(CONFIG_PATH.read_text())
PAGE_ID    = config["page_id"]
PAGE_TOKEN = config["page_token"]
IG_USER_ID = config["instagram_user_id"]
SITE_URL   = config["site_url"]

# ─── Content Pillars ──────────────────────────────────────────────────────────
# Recipes are NOW generated dynamically by AI (infinite variety).
# The pillar definitions only provide the angle/label/guidelines.

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

IMAGE_LOG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/image_log.json")


def load_history() -> dict:
    history_path = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/post_history.json")
    if history_path.exists():
        h = json.loads(history_path.read_text())
        if isinstance(h, list):
            return {"pillar_index": 0}
        return h
    return {"pillar_index": 0}


def save_history(history: dict):
    Path("/work/viktor-spaces/on-mange-quoi/meta-automation/post_history.json").write_text(
        json.dumps(history, ensure_ascii=False, indent=2)
    )


async def generate_unique_recipe(pillar_key: str, pillar: dict, dedup: ImageDedup) -> tuple:
    """Use AI to generate a completely unique recipe that hasn't been posted recently."""
    from datetime import datetime as _dt

    recent = dedup.get_recent_subjects()
    # Build exclusion list with ingredients + dish names
    recent_entries = dedup._recent_entries()
    exclusion_lines = []
    for entry in recent_entries:
        name = entry.get("dish_name", "?")
        kw = entry.get("keywords", [])
        date = entry.get("posted_at", "?")[:10]
        exclusion_lines.append(f"  - {date}: {name} (mots-clés: {', '.join(kw)})")

    exclusion_block = "\n".join(exclusion_lines) if exclusion_lines else "  (aucun post récent)"

    # Get current month for seasonal context
    month_names = ["janvier","février","mars","avril","mai","juin",
                   "juillet","août","septembre","octobre","novembre","décembre"]
    current_month = month_names[_dt.now().month - 1]

    result = await ai_structured_output(
        prompt=f"""Tu es le créateur de recettes pour l'app "On Mange Quoi?" (onmangequoi.net).

PILIER DU POST : {pillar['label']}
ANGLE : {pillar['angle']}
GUIDELINES : {pillar['guidelines']}
SAISON : {current_month} 2026

⛔ RECETTES DÉJÀ POSTÉES CES 30 DERNIERS JOURS (NE PAS RÉPÉTER ni s'en approcher) :
{exclusion_block}

RÈGLES STRICTES :
1. Le plat doit être COMPLÈTEMENT DIFFÉRENT de tout ce qui a été posté (pas les mêmes ingrédients principaux, pas le même type de plat)
2. Si on a déjà fait des pâtes → PAS de pâtes. Si on a fait du poulet → PAS de poulet. Si on a fait une salade → PAS de salade similaire.
3. Varier les cuisines du monde : française, italienne, asiatique, mexicaine, libanaise, indienne, grecque, thaï, japonaise, marocaine, coréenne, péruvienne, etc.
4. Varier les TYPES de plats : soupe, salade, bowl, gratin, poêlée, wrap, tartine, curry, risotto, quiche, tarte, wok, etc.
5. Utiliser des ingrédients de SAISON ({current_month})
6. 3-5 ingrédients simples qu'on peut avoir dans son frigo
7. Le plat doit être faisable en moins de 30 minutes

Génère UNE recette unique et originale.""",
        output_schema={
            "type": "object",
            "properties": {
                "recipe_name": {"type": "string", "description": "Nom accrocheur du plat (ex: Wok thaï crevettes-basilic)"},
                "ingredients": {"type": "string", "description": "3-5 ingrédients principaux séparés par des virgules"},
                "cuisine_origin": {"type": "string", "description": "Origine culinaire (française, asiatique, etc.)"},
            },
            "required": ["recipe_name", "ingredients", "cuisine_origin"],
        },
        intelligence_level="balanced",
    )

    r = result.result
    recipe_name = r["recipe_name"]
    ingredients = r["ingredients"]

    # Verify uniqueness via dedup
    if dedup.is_duplicate(f"{ingredients} {recipe_name}", threshold=0.4):
        print(f"  ⚠️  AI recipe '{recipe_name}' still too similar, will post anyway (AI should have avoided this)")

    print(f"  🎲 AI-generated: {recipe_name} ({r.get('cuisine_origin', '?')})")
    print(f"     Ingrédients: {ingredients}")

    return (ingredients, recipe_name, pillar_key)


def pick_pillar(history: dict, force_pillar: str | None = None) -> str:
    """Pick next pillar in rotation."""
    if force_pillar and force_pillar in PILLARS:
        return force_pillar
    idx = history.get("pillar_index", 0) % len(PILLAR_ORDER)
    pillar_key = PILLAR_ORDER[idx]
    history["pillar_index"] = idx + 1
    return pillar_key


async def generate_post_text(pillar_key: str, pillar: dict, scenario: tuple) -> dict:
    """Generate post text that tells the app's story."""
    ingredients, recipe, angle = scenario

    # Get dynamic engagement CTA and hashtags from strategy module
    engagement_cta = get_engagement_cta("mixed")
    hashtags_block = get_hashtags(pillar_key, count=18)

    prompt = f"""Tu es le créateur de onmangequoi.net, une app IA qui analyse le frigo et génère des recettes.

Tu dois écrire un post Instagram qui raconte cette histoire VRAIE :
→ L'utilisateur avait ces ingrédients dans son frigo : **{ingredients}**
→ Il a pris une photo et l'a uploadée sur onmangequoi.net
→ L'IA lui a suggéré : **{recipe}**
→ Le résultat était délicieux !

ANGLE de ce post : {pillar['angle']} ({pillar['label']})

STRUCTURE OBLIGATOIRE :
1. **Accroche** : 1 ligne qui crée l'émotion (curiosité, envie, humour) — ex: "Ce soir j'avais quasi rien... 👀" ou "Cette recette vient d'un frigo à moitié vide 😅"
2. **Le frigo de départ** : liste les ingrédients disponibles (emoji par ingrédient, style naturel)
3. **Ce que l'app a généré** : présente la recette {recipe} avec enthousiasme
4. **La réalité** : 1-2 phrases sensorielles décrivant le résultat (goût, texture, odeur)
5. **CTA clair** : "Toi aussi → prends en photo ton frigo sur onmangequoi.net 📸 (lien en bio)"
6. **Engagement** : une question ou interaction pour le lecteur, par exemple : "{engagement_cta}"
7. **Mention** : @onmangequoi_app
8. **Hashtags** : utilise EXACTEMENT ces hashtags (déjà optimisés) :
{hashtags_block}

IMPORTANT :
- Écris naturellement, comme une vraie personne qui partage sa découverte
- Le lecteur doit comprendre EN 2 SECONDES que c'est une app IA qui a généré cette recette depuis des ingrédients du frigo
- Évite le ton pub/commercial, sois authentique
- POSE UNE QUESTION au lecteur pour encourager les commentaires (engagement = croissance)
- Encourage de sauvegarder 📌 ou partager 📲 le post
- Maximum 250 mots (hors hashtags)

Génère aussi :
- dish_name : nom court du plat pour la légende de la photo
- image_description : description EN ANGLAIS précise pour générer la photo du plat (plat terminé, dressé sur assiette, appétissant, PAS d'ingrédients bruts). Inclure le style exact du plat.
- image_caption : courte phrase à superposer sur l'image (optionnel, style "Généré par IA depuis ton frigo 🍽️")
"""

    result = await ai_structured_output(
        prompt=prompt,
        output_schema={
            "type": "object",
            "properties": {
                "post_text":         {"type": "string"},
                "dish_name":         {"type": "string"},
                "image_description": {"type": "string"},
                "image_caption":     {"type": "string"},
            },
            "required": ["post_text", "dish_name", "image_description"],
        },
        intelligence_level="balanced",
    )
    return result.result


async def generate_image_fal(dish_name: str, image_description: str) -> tuple[str, str | None]:
    """Generate image with automatic fallback (fal.ai → Pollinations → coworker_text2im)."""
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

    # Show recent posted subjects for debug
    recent = dedup.get_recent_subjects()
    if recent:
        print(f"📋 Recent posts (last 30d): {', '.join(recent[-5:])}")

    history = load_history()
    pillar_key = pick_pillar(history, force_pillar=args.pillar)
    pillar = PILLARS[pillar_key]

    # Generate a unique recipe via AI (no more fixed pool!)
    print(f"\n🎯 Pilier: {pillar['label']}")
    print("🤖 Generating unique recipe via AI...")
    scenario = await generate_unique_recipe(pillar_key, pillar, dedup)
    save_history(history)

    ingredients, recipe, angle = scenario
    print(f"\n🚀 {pillar['label']} — {recipe}")
    print(f"📦 Ingrédients: {ingredients}")

    # Generate post text
    print("\n✍️  Generating post text...")
    post_data = await generate_post_text(pillar_key, pillar, scenario)
    post_text = post_data["post_text"]
    dish_name = post_data["dish_name"]
    image_description = post_data["image_description"]

    print(f"\n--- POST TEXT ---\n{post_text}\n")
    print(f"Image subject: {dish_name}")

    # Generate image
    local_path, image_url = await generate_image_fal(dish_name, image_description)

    if args.dry_run:
        print("🏃 Dry run — skipping actual posting")
        return

    post_ids = {}

    # ── Facebook ──────────────────────────────────────────────────────────────
    print("\n--- Posting to Facebook ---")
    fb_result = post_to_facebook(post_text, local_path)
    if "id" in fb_result:
        print(f"✅ Facebook: {fb_result['id']}")
        post_ids["facebook"] = fb_result["id"]
    else:
        print(f"❌ Facebook: {fb_result}")

    # ── Instagram ─────────────────────────────────────────────────────────────
    print("\n--- Posting to Instagram ---")
    # If fallback provider didn't return a URL, upload to FB CDN first
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

    # ── Register in dedup log ─────────────────────────────────────────────────
    if post_ids:
        dedup.register(
            dish_name=f"{recipe} ({ingredients[:40]})",
            image_prompt=image_description,
            pillar=pillar_key,
            post_ids=post_ids,
        )


if __name__ == "__main__":
    asyncio.run(main())
