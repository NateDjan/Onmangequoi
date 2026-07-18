#!/usr/bin/env python3
"""
On Mange Quoi? - Daily Stories generator for Instagram + Facebook
Uses Hermes bridge for content, fal.ai for images.
"""
import asyncio, json, requests, os, time, random
from datetime import datetime

from shared_config import get_page_id, get_page_token, get_ig_user_id, get_site_url
from hermes_bridge import structured_output
from hashtag_strategy import get_story_hashtags, get_engagement_cta
from utm_links import stories_url
from story_composer import compose_story, get_theme_color

PAGE_ID = get_page_id()
PAGE_TOKEN = get_page_token()
IG_USER_ID = get_ig_user_id()
SITE_URL = get_site_url()

STORY_THEMES = [
    "recette_du_jour", "astuce_frigo", "ingredient_star", "quiz_cuisine",
    "defi_zero_gaspi", "avant_apres", "recette_express", "saison_du_moment",
    "astuce_conservation", "combo_surprise",
]


async def generate_story_content(theme: str, story_index: int) -> dict:
    story_hashtags = get_story_hashtags(theme, count=5)
    engagement = get_engagement_cta("question")

    theme_prompts = {
        "recette_du_jour": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?" (app IA de recettes depuis photo frigo).
Thème : RECETTE DU JOUR. Génère: titre accrocheur (max 6 mots, emoji), nom d'un plat populaire, 3 ingrédients clés, CTA court, description d'image réaliste format Story 9:16.""",

        "astuce_frigo": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : ASTUCE CUISINE. Génère: titre accrocheur (max 6 mots, emoji), astuce pratique (1 phrase), exemple concret, CTA, description d'image cuisine organisée.""",

        "ingredient_star": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : INGRÉDIENT STAR. Génère: titre accrocheur, ingrédient de saison, 2 idées recettes express, fun fact, CTA, description image gros plan appétissant.""",

        "quiz_cuisine": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : QUIZ CUISINE. Génère: question fun sur la nourriture, 3 options A/B/C avec emojis, titre d'accroche, CTA vote, description image collage appétissant.""",

        "defi_zero_gaspi": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : DÉFI ANTI-GASPI. Génère: titre accrocheur, défi simple avec reste/ingrédient souvent jeté, recette express, stat choc gaspillage, CTA, description image cuisine zéro déchet.""",

        "avant_apres": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : AVANT/APRÈS frigo→plat. Génère: titre accrocheur, 3-4 ingrédients qu'on a tous, le plat transformé, CTA, description image plat fait maison authentique.""",

        "recette_express": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : RECETTE EXPRESS 5 MIN. Génère: titre accrocheur, nom recette ultra-rapide, 3 ingrédients, CTA, description image plat simple et appétissant.""",

        "saison_du_moment": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : SAISON DU MOMENT. Génère: titre accrocheur, fruit/légume de saison (juillet), 2 idées recettes, CTA, description image fruits/légumes frais ambiance été.""",

        "astuce_conservation": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : ASTUCE CONSERVATION. Génère: titre accrocheur, conseil conservation aliment, aliment + méthode, CTA, description image frigo bien rangé.""",

        "combo_surprise": f"""Tu crées un visuel Story Instagram pour "On Mange Quoi?".
Thème : COMBO SURPRISE. Génère: titre accrocheur, 2 ingrédients inattendus, recette surprenante + pourquoi c'est bon, CTA, description image plat original décontracté.""",
    }

    prompt = theme_prompts.get(theme, theme_prompts["recette_du_jour"])
    prompt += f"""

IMPORTANT POUR L'ENGAGEMENT :
- Légende avec question pour encourager les réponses
- Question engagement : "{engagement}"
- Hashtags inclus : {story_hashtags}
- Toujours @onmangequoi_app et onmangequoi.net
- URL avec UTM : {stories_url(theme)}"""

    result = await asyncio.to_thread(
        structured_output,
        prompt=prompt,
        output_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Titre principal (court, emoji)"},
                "main_text": {"type": "string", "description": "Texte principal (1-2 phrases)"},
                "steps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "3-4 étapes courtes (optionnel)"
                },
                "cta": {"type": "string", "description": "Call-to-action court (max 6 mots + emoji)"},
                "image_description": {"type": "string", "description": "Description détaillée pour générer l'image de fond"},
                "caption": {"type": "string", "description": "Légende Instagram (50-80 mots, hashtags inclus)"}
            },
            "required": ["title", "main_text", "cta", "image_description", "caption"]
        },
    )
    return result


async def generate_story_image(image_description: str) -> tuple[str, str | None]:
    from image_gen import generate_story_image as _gen_story
    return await _gen_story(image_description)


def post_ig_story(image_url: str) -> dict:
    container_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"image_url": image_url, "media_type": "STORIES"}
    )
    container_data = container_resp.json()
    print(f"  IG Story container: {container_data}")
    if "id" not in container_data:
        return {"error": f"Failed to create container: {container_data}"}

    creation_id = container_data["id"]
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

    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id}
    )
    return publish_resp.json()


def post_fb_story(image_local_path: str) -> dict:
    with open(image_local_path, "rb") as img_file:
        upload_resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"published": "false"},
            files={"source": img_file}
        )
    upload_data = upload_resp.json()
    if "id" not in upload_data:
        return {"error": f"Photo upload failed: {upload_data}"}
    photo_id = upload_data["id"]

    story_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{PAGE_ID}/photo_stories",
        params={"access_token": PAGE_TOKEN},
        data={"photo_id": photo_id}
    )
    story_data = story_resp.json()
    if "error" in story_data:
        return {"note": f"FB Stories API not available for this page tier. Photo ID {photo_id}"}
    return story_data


async def process_one_story(theme: str, story_index: int) -> bool:
    print(f"\n--- Story {story_index+1}/4: {theme} ---")
    composed_path = None
    try:
        content = await generate_story_content(theme, story_index)
        print(f"  Title: {content['title']}")

        bg_path, bg_url = await generate_story_image(content["image_description"])
        print(f"  Background: {bg_path}")

        composed_path = bg_path.replace(".webp", "_composed.jpg").replace(".png", "_composed.jpg")
        if not composed_path.endswith("_composed.jpg"):
            composed_path = bg_path + "_composed.jpg"

        steps = content.get("steps") if theme in ("recette_du_jour", "quiz_cuisine") else None

        compose_story(
            bg_path=bg_path, title=content["title"], main_text=content["main_text"],
            cta=content["cta"], output_path=composed_path,
            theme_color=get_theme_color(theme), steps=steps,
        )
        print(f"  Composed: {composed_path}")

        # Upload to FB CDN for IG
        public_url = None
        try:
            with open(composed_path, "rb") as img_file:
                fb_upload_resp = requests.post(
                    f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
                    params={"access_token": PAGE_TOKEN},
                    data={"published": "false"}, files={"source": img_file}
                )
            fb_upload_data = fb_upload_resp.json()
            if "id" in fb_upload_data:
                img_info_resp = requests.get(
                    f"https://graph.facebook.com/v19.0/{fb_upload_data['id']}",
                    params={"fields": "images", "access_token": PAGE_TOKEN}
                )
                images = img_info_resp.json().get("images", [])
                if images:
                    public_url = images[0]["source"]
        except Exception as e:
            print(f"  FB CDN upload failed: {e}")

        # Post IG
        ig_url = public_url or bg_url
        if ig_url:
            ig_result = post_ig_story(ig_url)
            print(f"  {'✅' if 'id' in ig_result else '⚠️'} IG: {ig_result}")
        else:
            print("  ⚠️ No public URL — skipping IG")

        # Post FB
        fb_result = post_fb_story(composed_path)
        print(f"  {'✅' if 'id' in fb_result or 'note' in fb_result else '⚠️'} FB: {fb_result}")

        return True
    except Exception as e:
        import traceback
        print(f"  ❌ Error: {e}")
        traceback.print_exc()
        return False
    finally:
        if composed_path and os.path.exists(composed_path):
            try: os.unlink(composed_path)
            except: pass


async def main():
    STORIES_PER_DAY = 4
    print(f"🎬 Generating {STORIES_PER_DAY} daily stories...")

    day_offset = datetime.now().weekday()
    themes_today = STORY_THEMES[day_offset % len(STORY_THEMES):] + STORY_THEMES[:day_offset % len(STORY_THEMES)]
    themes_today = themes_today[:STORIES_PER_DAY]
    print(f"Today's themes: {themes_today}")

    results = []
    for i, theme in enumerate(themes_today):
        success = await process_one_story(theme, i)
        results.append(success)
        if i < len(themes_today) - 1:
            await asyncio.sleep(3)

    print(f"\n✅ Done: {sum(results)}/{STORIES_PER_DAY} stories")


if __name__ == "__main__":
    asyncio.run(main())
