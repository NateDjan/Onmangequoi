#!/usr/bin/env python3
"""
SEO Recipe Mass Generator for onmangequoi.net

Generates recipe content for high-traffic search queries:
- Ingredient pair combinations ("poulet + riz", "oeufs + pommes de terre", etc.)
- "Que manger ce soir" intent queries
- Seasonal and trending combinations

Also generates 1 image per recipe via fal.ai FLUX Schnell and publishes to Convex prod.

Usage:
    uv run python seo_recipe_generator.py [--count N] [--dry-run] [--images-only]
"""

import asyncio
import json
import os
import sys
import argparse
import urllib.request
import time

sys.path.insert(0, "/work")

from sdk.tools.utils_tools import ai_structured_output

CONVEX_URL = "https://tame-cardinal-281.convex.cloud"
FAL_KEY = "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8"

# ─── High-traffic recipe targets ────────────────────────────────────────────

# Ingredient pair combos targeting "que faire avec X et Y"
INGREDIENT_PAIRS = [
    ("poulet", "riz"),
    ("oeufs", "pommes de terre"),
    ("pâtes", "fromage"),
    ("thon", "tomates"),
    ("carottes", "pommes de terre"),
    ("poulet", "champignons"),
    ("lentilles", "épinards"),
    ("saumon", "brocoli"),
    ("boeuf", "oignons"),
    ("courgettes", "tomates"),
    ("poulet", "poireaux"),
    ("oeufs", "courgettes"),
    ("pâtes", "jambon"),
    ("riz", "poulet", "légumes"),
    ("pommes de terre", "fromage"),
    ("haricots verts", "oeuf"),
    ("thon", "pâtes"),
    ("boeuf", "pommes de terre"),
    ("sardines", "tomates"),
    ("pois chiches", "tomates"),
    ("lardons", "pâtes"),
    ("saumon", "pommes de terre"),
    ("poulet", "citron"),
    ("courgettes", "fromage"),
    ("épinards", "oeufs"),
    ("riz", "légumes", "soja"),
    ("pâtes", "courgettes", "tomates"),
    ("lentilles", "carottes", "cumin"),
    ("poulet", "curry", "riz"),
    ("oeufs", "bacon", "fromage"),
]

# "Que manger ce soir" style intent queries → direct recipe topics
EVENING_INTENT_RECIPES = [
    ("Recette rapide du soir en 20 minutes", ["pâtes", "tomates", "ail", "herbes"]),
    ("Dîner facile avec les restes du frigo", ["légumes variés", "oeuf", "fromage"]),
    ("Repas léger du soir pour la semaine", ["poulet", "haricots verts", "citron"]),
    ("Que manger ce soir quand on n'a pas le temps", ["oeufs", "pommes de terre", "oignons"]),
    ("Dîner équilibré sans viande", ["lentilles", "carottes", "cumin"]),
    ("Repas du soir pour toute la famille", ["poulet", "riz", "poivrons"]),
    ("Recette soir sans cuisiner longtemps", ["thon", "tomates", "pâtes"]),
    ("Idée repas soir avec peu d'ingrédients", ["oeufs", "fromage", "herbes"]),
    ("Que manger ce soir avec des pâtes", ["pâtes", "crème", "lardon", "oignons"]),
    ("Repas du soir simple et économique", ["riz", "thon", "maïs", "tomates"]),
]

RECIPE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Nom appétissant de la recette, max 60 caractères"},
        "description": {"type": "string", "description": "Description alléchante en 1-2 phrases, max 150 caractères"},
        "cookingTime": {"type": "string", "description": "Temps total ex: '25 min'"},
        "difficulty": {"type": "string", "enum": ["Facile", "Moyen", "Difficile"]},
        "servings": {"type": "string", "description": "Nombre de personnes ex: '4'"},
        "recipeType": {"type": "string", "enum": ["classique", "allege", "sport", "gourmand"]},
        "ingredients": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Liste des ingrédients avec quantités, ex: ['200g de pâtes', '2 oeufs']"
        },
        "steps": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Étapes de préparation, max 5 étapes claires"
        },
        "imagePrompt": {
            "type": "string",
            "description": "Prompt en ANGLAIS pour générer l'image, style photo culinaire professionnelle"
        }
    },
    "required": ["name", "description", "cookingTime", "difficulty", "servings", "recipeType", "ingredients", "steps", "imagePrompt"]
}


async def generate_recipe_content(ingredients: list[str], topic_hint: str = "") -> dict:
    """Generate a recipe JSON from an ingredient list using AI."""
    ing_str = ", ".join(ingredients)
    topic_str = f' sur le thème "{topic_hint}"' if topic_hint else ""

    prompt = f"""Génère une recette française{topic_str} utilisant principalement ces ingrédients : {ing_str}.

La recette doit être :
- Réaliste et délicieuse
- Max 5 étapes de préparation claires
- Temps total réaliste (20-45 min généralement)
- Type adapté au contenu (allege=léger/santé, sport=protéiné, gourmand=plaisir, classique=traditionnel)
- imagePrompt en anglais, style photographique alimentaire naturel et appétissant (lumière naturelle, fond bois)
- nom accrocheur et original, pas générique"""

    result = await ai_structured_output(
        prompt=prompt,
        output_schema=RECIPE_SCHEMA,
        intelligence_level="balanced",
    )
    return result.result


async def generate_image(prompt: str) -> str | None:
    """Generate recipe image via fal.ai FLUX Schnell, returns URL."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://fal.run/fal-ai/flux/schnell",
                headers={
                    "Authorization": f"Key {FAL_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": f"food photography, {prompt}, natural light, wooden table, appetizing, professional shot, shallow depth of field",
                    "image_size": "landscape_4_3",
                    "num_images": 1,
                    "num_inference_steps": 4,
                },
            )

            if resp.status_code != 200:
                print(f"    ⚠️  fal.ai HTTP {resp.status_code}: {resp.text[:100]}")
                return None

            data = resp.json()
            if "images" not in data or not data["images"]:
                return None

            return data["images"][0]["url"]
    except Exception as e:
        print(f"    ⚠️  Image generation failed: {e}")
        return None


def publish_recipe(recipe: dict) -> dict:
    """Publish a recipe to Convex production via REST API."""
    payload = json.dumps({
        "path": "publicRecipes:publish",
        "args": {
            "name": recipe["name"],
            "description": recipe["description"],
            "cookingTime": recipe["cookingTime"],
            "difficulty": recipe["difficulty"],
            "servings": str(recipe.get("servings", "4")),
            "ingredients": recipe["ingredients"],
            "steps": recipe["steps"],
            "imageUrl": recipe.get("imageUrl") or None,
            "recipeType": recipe.get("recipeType", "classique"),
        },
        "format": "json"
    }).encode()

    req = urllib.request.Request(
        f"{CONVEX_URL}/api/mutation",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def get_existing_recipes() -> list[dict]:
    """Get all existing published recipes."""
    payload = json.dumps({
        "path": "publicRecipes:listRecent",
        "args": {"limit": 200},
        "format": "json"
    }).encode()

    req = urllib.request.Request(
        f"{CONVEX_URL}/api/query",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return data.get("value", [])


async def process_recipe(ingredients: list[str], topic_hint: str = "", dry_run: bool = False) -> bool:
    """Generate, illustrate, and publish one recipe. Returns True on success."""
    ing_str = ", ".join(ingredients[:3])
    print(f"\n  📝 {ing_str}{' — ' + topic_hint if topic_hint else ''}")

    try:
        # 1. Generate recipe content
        recipe = await generate_recipe_content(ingredients, topic_hint)
        print(f"     → {recipe['name']}")

        # 2. Generate image
        image_prompt = recipe.get("imagePrompt", ing_str)
        print(f"     🖼️  Generating image...")
        image_url = await generate_image(image_prompt)
        if image_url:
            recipe["imageUrl"] = image_url
            print(f"     ✅ Image: {image_url[:70]}...")
        else:
            print(f"     ⚠️  No image generated (will publish without)")

        if dry_run:
            print(f"     [DRY RUN] Would publish: {recipe['name']}")
            return True

        # 3. Publish to Convex
        result = publish_recipe(recipe)
        if result.get("status") == "success":
            val = result.get("value", {})
            action = "updated" if val.get("updated") else "created"
            print(f"     ✅ Published ({action}): /recette/{val.get('slug', '?')}")
            return True
        else:
            print(f"     ❌ Publish failed: {result}")
            return False

    except Exception as e:
        print(f"     ❌ Error: {e}")
        return False


async def add_images_to_existing(dry_run: bool = False):
    """Add images to existing recipes that don't have one."""
    all_recipes = get_existing_recipes()
    no_image = [r for r in all_recipes if not r.get("imageUrl")]
    print(f"📸 Found {len(no_image)} recipes without images (out of {len(all_recipes)} total)")

    success = 0
    for recipe in no_image:
        print(f"\n  🖼️  {recipe['name'][:60]}")

        ingredients_str = ", ".join(recipe.get("ingredients", [])[:3])
        image_prompt = f"{recipe['name']}, {ingredients_str}, French cuisine"

        image_url = await generate_image(image_prompt)
        if not image_url:
            print(f"     ⚠️  Skipping (image failed)")
            continue

        print(f"     ✅ Image: {image_url[:70]}...")

        if dry_run:
            print(f"     [DRY RUN] Would update")
            continue

        updated = dict(recipe)
        updated["imageUrl"] = image_url
        result = publish_recipe(updated)
        if result.get("status") == "success":
            print(f"     ✅ Updated!")
            success += 1
        else:
            print(f"     ❌ Failed: {result}")

        await asyncio.sleep(0.5)

    print(f"\n✅ Added images to {success}/{len(no_image)} recipes")


async def main():
    parser = argparse.ArgumentParser(description="Generate SEO recipes for onmangequoi.net")
    parser.add_argument("--count", type=int, default=15, help="Recipes to generate (default: 15)")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't publish")
    parser.add_argument("--images-only", action="store_true", help="Only add images to existing recipes")
    args = parser.parse_args()

    print("🍽️  On Mange Quoi — SEO Recipe Mass Generator")
    print(f"   Backend: {CONVEX_URL}")

    if args.images_only:
        print(f"   Mode: images-only\n")
        await add_images_to_existing(args.dry_run)
        return

    print(f"   Count: {args.count} | Dry run: {args.dry_run}\n")

    existing = get_existing_recipes()
    existing_names = {r["name"].lower() for r in existing}
    print(f"📊 Existing recipes: {len(existing)}\n")

    # Build task list: ingredient pairs + evening intents
    tasks: list[tuple[list[str], str]] = []
    for pair in INGREDIENT_PAIRS:
        tasks.append((list(pair), ""))
    for topic, ings in EVENING_INTENT_RECIPES:
        tasks.append((ings, topic))

    tasks = tasks[:args.count]
    print(f"🚀 Generating {len(tasks)} recipes...\n")

    success_count = 0
    for ingredients, topic in tasks:
        await asyncio.sleep(0.5)
        ok = await process_recipe(ingredients, topic, args.dry_run)
        if ok:
            success_count += 1

    print(f"\n{'=' * 50}")
    print(f"✅ Done! {success_count}/{len(tasks)} recipes published")
    print(f"\n📈 SEO impact:")
    print(f"   • {success_count} new indexable recipe pages")
    print(f"   • Targets ingredient combo searches (\"que faire avec X et Y\")")
    print(f"   • Each page has an image → Google Image Search traffic")
    print(f"   • Maillage interne via /recettes index page")


if __name__ == "__main__":
    asyncio.run(main())
