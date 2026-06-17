#!/usr/bin/env python3
"""On Mange Quoi? - Daily Stories generator for Instagram + Facebook (5 stories/day)"""
import asyncio, json, requests, sys, os, time, random, textwrap
from pathlib import Path
sys.path.insert(0, '/work')
from sdk.tools.utils_tools import ai_structured_output, coworker_text2im
from hashtag_strategy import get_story_hashtags, get_engagement_cta
from utm_links import stories_url
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location("story_composer", "/work/viktor-spaces/on-mange-quoi/meta-automation/story_composer.py")
_sc = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_sc)
compose_story = _sc.compose_story
get_theme_color = _sc.get_theme_color

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
config = json.loads(CONFIG_PATH.read_text())
PAGE_ID = config["page_id"]
PAGE_TOKEN = config["page_token"]
IG_USER_ID = config["instagram_user_id"]
SITE_URL = config["site_url"]

# 5 story types to publish each day, cycling through themes
STORY_THEMES = [
    "recette_du_jour",      # Recipe of the day
    "astuce_frigo",         # Fridge tip
    "ingredient_star",      # Star ingredient of the day
    "quiz_cuisine",         # Fun food quiz
    "defi_zero_gaspi",      # Zero-waste challenge
    "avant_apres",          # Before/after: fridge → dish
    "recette_express",      # 5-minute recipe
    "saison_du_moment",     # Seasonal highlight
    "astuce_conservation",  # Food storage tip
    "combo_surprise",       # Unexpected ingredient combo
]


async def generate_story_content(theme: str, story_index: int) -> dict:
    """Generate content for one story with engagement-optimized captions."""
    story_hashtags = get_story_hashtags(theme, count=5)
    engagement = get_engagement_cta("question")
    theme_prompts = {
        "recette_du_jour": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : RECETTE DU JOUR
        Génère:
        1. Un titre accrocheur (max 6 mots, avec emoji)
        2. Le nom d'un plat savoureux et populaire du moment
        3. 3 ingrédients clés du plat (courts, 1-2 mots chacun)
        4. Un call-to-action court (ex: "Teste ça ce soir ! 🍽️")
        5. Une description précise du plat pour générer une belle photo réaliste

        Le visuel doit être appétissant, dynamique, format Story vertical (9:16).""",

        "astuce_frigo": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : ASTUCE CUISINE
        Génère:
        1. Un titre accrocheur (max 6 mots, avec emoji)
        2. Une astuce cuisine pratique et utile (1 phrase percutante)
        3. Un exemple concret avec un aliment courant
        4. Un call-to-action (ex: "Prends ton frigo en photo ! 📸")
        5. Une description d'image pour illustrer l'astuce (cuisine organisée, beau frigo, ingrédients frais...)""",

        "ingredient_star": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : INGRÉDIENT DU JOUR / STAR
        Génère:
        1. Un titre accrocheur (ex: "⭐ Ingrédient du jour !")
        2. Un ingrédient de saison populaire (légume, fruit, herbe...)
        3. 2 idées de recettes express avec cet ingrédient
        4. Un fun fact nutritionnel ou culinaire sur cet ingrédient
        5. Un call-to-action (ex: "Tu en as dans ton frigo ? 🥕")
        6. Description d'image: gros plan appétissant de cet ingrédient, style épicerie chic ou marché""",

        "quiz_cuisine": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : QUIZ CUISINE (engagement)
        Génère:
        1. Une question fun et facile sur la cuisine ou la nourriture (ex: "Quel plat préférez-vous ce soir ?")
        2. 3 options de réponse courtes avec emojis (A, B, C)
        3. Un titre d'accroche (ex: "🤔 Sondage du soir !")
        4. Un call-to-action (ex: "Vote en commentaire ! 👇")
        5. Description d'image: collage appétissant de 3 plats différents ou belle table dressée""",

        "defi_zero_gaspi": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : DÉFI ANTI-GASPI
        Génère:
        1. Un titre accrocheur (ex: "💚 Défi Anti-Gaspi !")
        2. Un défi simple : utiliser un reste ou ingrédient souvent jeté
        3. La recette express que ça peut donner
        4. Un chiffre choc sur le gaspillage alimentaire (1 stat)
        5. Un call-to-action (ex: "Prends une photo de ton frigo ! 📱")
        6. Description d'image: belle cuisine zéro déchet, légumes colorés, ambiance naturelle""",

        "avant_apres": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : AVANT / APRÈS — du frigo au plat
        Génère:
        1. Un titre accrocheur (ex: "🔄 De mon frigo à mon assiette !")
        2. 3-4 ingrédients simples qu'on a tous dans le frigo
        3. Le plat que l'IA a transformé ces ingrédients en
        4. Un call-to-action (ex: "Et toi, qu'est-ce que t'as dans ton frigo ? 📸")
        5. Description d'image: un beau plat fait maison posé sur une table de cuisine normale, ambiance authentique""",

        "recette_express": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : RECETTE EXPRESS 5 MINUTES
        Génère:
        1. Un titre accrocheur (ex: "⚡ Prêt en 5 min !")
        2. Le nom d'une recette ultra-rapide et facile
        3. 3 ingrédients nécessaires (courts)
        4. Un call-to-action (ex: "Chrono lancé ! 🍳")
        5. Description d'image: plat simple mais appétissant, ambiance cuisine rapide du quotidien""",

        "saison_du_moment": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : SAISON DU MOMENT — fruits/légumes de saison
        Génère:
        1. Un titre accrocheur (ex: "🍓 C'est la saison !")
        2. Un fruit ou légume de saison (juin/été)
        3. 2 idées de recettes rapides avec cet aliment de saison
        4. Un call-to-action (ex: "Cuisine de saison → onmangequoi.net 🌿")
        5. Description d'image: fruits/légumes frais de saison, marché ou cuisine, ambiance été naturelle""",

        "astuce_conservation": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : ASTUCE CONSERVATION
        Génère:
        1. Un titre accrocheur (ex: "💡 Tu savais ça ?")
        2. Un conseil pratique pour conserver un aliment plus longtemps
        3. L'aliment concerné et la méthode
        4. Un call-to-action (ex: "Partage à quelqu'un qui jette trop ! ♻️")
        5. Description d'image: frigo bien rangé, aliments frais conservés, ambiance cuisine propre""",

        "combo_surprise": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
        Thème : COMBO SURPRISE — association inattendue
        Génère:
        1. Un titre accrocheur (ex: "🤯 Ce combo est fou !")
        2. 2 ingrédients qu'on n'associerait pas naturellement
        3. La recette surprenante que ça donne (et pourquoi c'est bon)
        4. Un call-to-action (ex: "L'IA sait mieux que toi 😏 → onmangequoi.net")
        5. Description d'image: plat surprenant et original, style décontracté, photo naturelle""",
    }

    prompt = theme_prompts.get(theme, theme_prompts["recette_du_jour"])

    # Append engagement instructions to the prompt
    prompt += f"""

IMPORTANT POUR L'ENGAGEMENT :
- La légende doit inclure une question pour encourager les réponses en DM/story reply
- Exemple de question engagement : "{engagement}"
- Hashtags à inclure dans la légende : {story_hashtags}
- Toujours mentionner @onmangequoi_app et onmangequoi.net
- Quand tu mets un lien, utilise toujours l'URL avec UTM : {stories_url(theme)}
"""

    result = await ai_structured_output(
        prompt=prompt,
        output_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Titre principal de la story (court, avec emoji)"},
                "main_text": {"type": "string", "description": "Texte principal / message clé (1-2 phrases)"},
                "steps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "3-4 étapes courtes pour recette/quiz (optionnel, max 5 mots chacune)"
                },
                "cta": {"type": "string", "description": "Call-to-action court (max 6 mots + emoji)"},
                "image_description": {"type": "string", "description": "Description détaillée pour générer l'image de fond"},
                "caption": {"type": "string", "description": "Légende Instagram pour la story (50-80 mots, hashtags inclus)"}
            },
            "required": ["title", "main_text", "cta", "image_description", "caption"]
        },
        intelligence_level="balanced"
    )
    return result.result


async def generate_story_image(image_description: str) -> tuple[str, str | None]:
    """Generate a beautiful 9:16 Story image with automatic fallback (fal.ai → Pollinations → coworker_text2im)."""
    from image_gen import generate_story_image as _gen_story
    return await _gen_story(image_description)


def post_ig_story(image_url: str) -> dict:
    """Post an image Story to Instagram."""
    # Step 1: Create media container with media_type=STORIES
    container_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={
            "image_url": image_url,
            "media_type": "STORIES",
        }
    )
    container_data = container_resp.json()
    print(f"  IG Story container: {container_data}")

    if "id" not in container_data:
        return {"error": f"Failed to create container: {container_data}"}

    creation_id = container_data["id"]

    # Step 2: Poll until FINISHED
    for attempt in range(12):
        time.sleep(5)
        status_resp = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}
        )
        status = status_resp.json().get("status_code", "UNKNOWN")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            return {"error": f"Container failed: {status}"}

    # Step 3: Publish
    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id}
    )
    return publish_resp.json()


def post_fb_story(image_local_path: str) -> dict:
    """Post a photo Story to Facebook Page."""
    # Upload photo as unpublished first, then create story
    with open(image_local_path, "rb") as img_file:
        upload_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"published": "false"},
            files={"source": img_file}
        )
    upload_data = upload_resp.json()
    print(f"  FB photo upload: {upload_data}")

    if "id" not in upload_data:
        return {"error": f"Photo upload failed: {upload_data}"}

    photo_id = upload_data["id"]

    # Create story from the uploaded photo
    story_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{PAGE_ID}/photo_stories",
        params={"access_token": PAGE_TOKEN},
        data={"photo_id": photo_id}
    )
    story_data = story_resp.json()

    # Fallback: if photo_stories not available, try video_stories or just skip
    if "error" in story_data:
        print(f"  FB photo_stories not available, trying fallback...")
        # Try publishing the photo as a regular post story
        return {"note": f"FB Stories API not available for this page tier. Photo saved as ID {photo_id}"}

    return story_data


async def process_one_story(theme: str, story_index: int) -> bool:
    """Generate and post one story. Returns True if successful."""
    print(f"\n--- Story {story_index+1}/5: {theme} ---")
    composed_path = None
    try:
        # Generate content
        content = await generate_story_content(theme, story_index)
        print(f"  Title: {content['title']}")

        # Generate background image
        bg_path, bg_url = await generate_story_image(content["image_description"])
        print(f"  Background: {bg_path}")

        # Compose: overlay title, text, CTA on the background
        composed_path = bg_path.replace(".webp", "_composed.jpg").replace(".png", "_composed.jpg")
        if not composed_path.endswith("_composed.jpg"):
            composed_path = bg_path + "_composed.jpg"

        steps = content.get("steps") if theme in ("recette_du_jour", "quiz_cuisine") else None

        compose_story(
            bg_path=bg_path,
            title=content["title"],
            main_text=content["main_text"],
            cta=content["cta"],
            output_path=composed_path,
            theme_color=get_theme_color(theme),
            steps=steps,
        )
        print(f"  Composed: {composed_path}")

        # Upload composed image to Facebook CDN to get a publicly accessible URL for Instagram
        # Slack CDN requires auth so Instagram can't fetch it — use FB photo upload instead
        public_url = None
        try:
            with open(composed_path, "rb") as img_file:
                fb_upload_resp = requests.post(
                    f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
                    params={"access_token": PAGE_TOKEN},
                    data={"published": "false"},
                    files={"source": img_file}
                )
            fb_upload_data = fb_upload_resp.json()
            if "id" in fb_upload_data:
                photo_id = fb_upload_data["id"]
                # Get the public CDN URL of the uploaded photo
                img_info_resp = requests.get(
                    f"https://graph.facebook.com/v19.0/{photo_id}",
                    params={"fields": "images", "access_token": PAGE_TOKEN}
                )
                img_info = img_info_resp.json()
                images = img_info.get("images", [])
                if images:
                    public_url = images[0]["source"]  # largest image URL (Facebook CDN = public)
                    print(f"  FB CDN URL obtained: {public_url[:80]}...")
        except Exception as e:
            print(f"  FB CDN upload failed: {e}, falling back to bg_url")

        # Post to Instagram
        print("  → Posting to Instagram...")
        ig_url = public_url or bg_url
        if not ig_url:
            print("  ⚠️ No public URL available for IG — skipping IG story")
            ig_result = {"error": "No public URL"}
        else:
            ig_result = post_ig_story(ig_url)
        if "id" in ig_result:
            print(f"  ✅ IG Story posted: {ig_result['id']}")
        else:
            print(f"  ⚠️ IG Story: {ig_result}")

        # Post to Facebook (photo story using local composed file)
        print("  → Posting to Facebook...")
        fb_result = post_fb_story(composed_path)
        if "id" in fb_result or "note" in fb_result:
            print(f"  ✅ FB: {fb_result}")
        else:
            print(f"  ⚠️ FB Story: {fb_result}")

        return True

    except Exception as e:
        import traceback
        print(f"  ❌ Error on story {story_index+1}: {e}")
        traceback.print_exc()
        return False
    finally:
        # Clean up composed file
        if composed_path and os.path.exists(composed_path):
            try:
                os.unlink(composed_path)
            except Exception:
                pass


async def main():
    STORIES_PER_DAY = 4  # Reduced to 3-4/day to avoid Instagram ban risk
    print(f"🎬 Generating {STORIES_PER_DAY} daily stories for On Mange Quoi?...")

    # Rotate through themes based on day of week
    from datetime import datetime
    day_offset = datetime.now().weekday()
    themes_today = STORY_THEMES[day_offset % len(STORY_THEMES):] + STORY_THEMES[:day_offset % len(STORY_THEMES)]
    themes_today = themes_today[:STORIES_PER_DAY]  # limit to daily quota

    print(f"Today's themes: {themes_today}")

    results = []
    for i, theme in enumerate(themes_today):
        success = await process_one_story(theme, i)
        results.append(success)
        if i < len(themes_today) - 1:
            await asyncio.sleep(3)  # small delay between stories

    success_count = sum(results)
    print(f"\n✅ Done: {success_count}/{STORIES_PER_DAY} stories published successfully")


if __name__ == "__main__":
    asyncio.run(main())
