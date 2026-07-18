#!/usr/bin/env python3
"""
On Mange Quoi? - Weekly Reel generator for Instagram + Facebook
Uses Hermes bridge for content, fal.ai for images, ffmpeg for video.
"""
import asyncio, json, requests, sys, os, time, subprocess
from pathlib import Path

from shared_config import get_page_id, get_page_token, get_ig_user_id, get_site_url
from hermes_bridge import structured_output, quick_search
from hashtag_strategy import get_reel_hashtags, get_engagement_cta
from utm_links import reels_url

PAGE_ID = get_page_id()
PAGE_TOKEN = get_page_token()
IG_USER_ID = get_ig_user_id()
SITE_URL = get_site_url()


async def get_trending_recipe() -> str:
    from datetime import datetime
    month_names = ["janvier","février","mars","avril","mai","juin",
                   "juillet","août","septembre","octobre","novembre","décembre"]
    month = month_names[datetime.now().month - 1]
    try:
        result = await asyncio.to_thread(
            quick_search,
            query=f"recettes tendance France {month} 2026 les plus populaires Instagram TikTok"
        )
        return result
    except Exception as e:
        print(f"Trending search failed: {e}")
        return ""


async def generate_reel_concept(trending_context: str) -> dict:
    trending_section = f"\nRECETTES TENDANCES:\n{trending_context[:600]}\n" if trending_context else ""
    reel_hashtags = get_reel_hashtags(count=20)
    engagement_cta = get_engagement_cta("question")

    result = await asyncio.to_thread(
        structured_output,
        prompt=f"""Crée un concept de Reel Instagram court et viral pour "On Mange Quoi?" (app IA de recettes depuis photo du frigo).
{trending_section}

Le Reel doit:
- Durer ~20 secondes
- Montrer une recette tendance faite à partir d'ingrédients du frigo
- Accroche forte en 0-3 secondes
- 3-4 étapes visuelles claires
- Résultat final appétissant + CTA

NARRATIVE OBLIGATOIRE : "frigo → photo → recette IA → résultat"

Génère: nom recette, accroche (max 8 mots), 4 étapes (max 5 mots), description plat final, description fond cuisine, légende Instagram (150 mots max) avec @onmangequoi_app, CTA: "{engagement_cta}", lien onmangequoi.net, hashtags: {reel_hashtags}""",
        output_schema={
            "type": "object",
            "properties": {
                "recipe_name": {"type": "string"},
                "hook_text": {"type": "string", "description": "Accroche percutante, max 8 mots"},
                "steps": {"type": "array", "items": {"type": "string"}, "description": "4 étapes courtes"},
                "final_dish_description": {"type": "string"},
                "background_description": {"type": "string"},
                "caption": {"type": "string", "description": "Légende Instagram complète avec hashtags"}
            },
            "required": ["recipe_name", "hook_text", "steps", "final_dish_description", "background_description", "caption"]
        },
    )
    return result


async def generate_reel_images(concept: dict) -> dict:
    from image_gen import generate_reel_image
    bg_prompt = (
        f"Beautiful finished {concept['recipe_name']} on a plate, "
        f"real home kitchen table, natural daylight, warm cozy atmosphere. "
        f"No text, no watermark."
    )
    dish_prompt = (
        f"Home-cooked {concept['final_dish_description']}, "
        f"natural daylight, genuine homemade look. No text, no watermark."
    )
    bg_result, dish_result = await asyncio.gather(
        generate_reel_image(bg_prompt, width=768, height=1344, suffix="reel_bg"),
        generate_reel_image(dish_prompt, width=1024, height=1024, suffix="reel_dish"),
    )
    return {"bg_path": bg_result[0], "bg_url": bg_result[1], "dish_path": dish_result[0], "dish_url": dish_result[1]}


def create_ffmpeg_slideshow(concept: dict, images: dict, output_path: str) -> str:
    """Create a reel video using PIL + ffmpeg (no Remotion dependency)."""
    from PIL import Image, ImageDraw, ImageFont
    import re as _re, tempfile

    W, H = 1080, 1920
    FPS, DURATION = 30, 20

    emoji_re = _re.compile("["
        "\\U0001F600-\\U0001F64F\\U0001F300-\\U0001F5FF\\U0001F680-\\U0001F6FF"
        "\\U0001F1E0-\\U0001F1FF\\U0001F900-\\U0001F9FF\\U0001FA00-\\U0001FAFF"
        "\\U00002702-\\U000027B0\\U0000FE0F\\U0000200D\\U00002600-\\U000026FF"
        "\\U00002B50-\\U00002B55\\U0000203C-\\U00003299"
        "]+", flags=_re.UNICODE)
    def strip_e(t): return emoji_re.sub("", t).strip()

    recipe = strip_e(concept["recipe_name"])
    hook = strip_e(concept["hook_text"])
    steps = [strip_e(s) for s in concept["steps"][:4]]

    import os as _os
    _font_base = _os.path.expanduser("~/.local/share/fonts/truetype/lato")
    if not _os.path.isdir(_font_base):
        _font_base = "/usr/share/fonts/truetype/lato"
    FONT_B = _os.path.join(_font_base, "Lato-Black.ttf")
    FONT_R = _os.path.join(_font_base, "Lato-Bold.ttf")

    bg = Image.open(images["bg_path"]).convert("RGB")
    bg_r = bg.width / bg.height
    tr = W / H
    if bg_r > tr:
        nw = int(bg.height * tr)
        bg = bg.crop(((bg.width - nw) // 2, 0, (bg.width + nw) // 2, bg.height))
    elif bg_r < tr:
        nh = int(bg.width / tr)
        bg = bg.crop((0, (bg.height - nh) // 2, bg.width, (bg.height + nh) // 2))
    bg = bg.resize((W, H), Image.LANCZOS)

    dish = Image.open(images["dish_path"]).convert("RGBA")
    dish = dish.resize((700, 700), Image.LANCZOS)

    def _centered_text(d, text, font, y, fill="white", max_w=W-120):
        lines, cur = [], ""
        for w in text.split():
            test = f"{cur} {w}".strip()
            bb = d.textbbox((0, 0), test, font=font)
            if bb[2] - bb[0] > max_w and cur:
                lines.append(cur); cur = w
            else: cur = test
        if cur: lines.append(cur)
        for line in lines:
            bb = d.textbbox((0, 0), line, font=font)
            d.text(((W - (bb[2] - bb[0])) // 2, y), line, font=font, fill=fill)
            y += bb[3] - bb[1] + 12
        return y

    def _light_overlay(base, alpha=60):
        f = base.copy().convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, alpha))
        f = Image.alpha_composite(f, ov)
        return f.convert("RGB")

    def make_frame_hook():
        f = _light_overlay(bg, alpha=70)
        d = ImageDraw.Draw(f)
        ft = ImageFont.truetype(FONT_B, 68)
        fs = ImageFont.truetype(FONT_R, 46)
        fb = ImageFont.truetype(FONT_R, 32)
        bp = "onmangequoi.net"
        bb = d.textbbox((0, 0), bp, font=fb)
        bpw, bph = bb[2] - bb[0] + 40, bb[3] - bb[1] + 20
        bpx = (W - bpw) // 2
        d.rounded_rectangle([bpx, 160, bpx+bpw, 160+bph], radius=20, fill=(255, 140, 0, 220))
        d.text((bpx+20, 170), bp, font=fb, fill="white")
        y = _centered_text(d, recipe, ft, 780, fill="white")
        _centered_text(d, hook, fs, y + 20, fill=(255, 230, 120))
        return f

    def make_frame_steps():
        f = _light_overlay(bg, alpha=80)
        d = ImageDraw.Draw(f)
        ft, fs = ImageFont.truetype(FONT_B, 54), ImageFont.truetype(FONT_R, 44)
        _centered_text(d, recipe, ft, 250, fill="white")
        y = 500
        for i, step in enumerate(steps):
            num = str(i + 1)
            d.ellipse([95, y-5, 145, y+45], fill=(255, 140, 0))
            nb = d.textbbox((0,0), num, font=fs)
            d.text((120 - (nb[2]-nb[0])//2, y), num, font=fs, fill="white")
            d.text((160, y), step, font=fs, fill="white")
            y += 90
        return f

    def make_frame_cta():
        f = _light_overlay(bg, alpha=50)
        dish_r = dish.resize((750, 750), Image.LANCZOS)
        dx, dy = (W - 750) // 2, 450
        f.paste(dish_r, (dx, dy), dish_r)
        d = ImageDraw.Draw(f)
        ft = ImageFont.truetype(FONT_B, 52)
        fs = ImageFont.truetype(FONT_R, 36)
        cta = "Scanne ton frigo !"
        bb = d.textbbox((0, 0), cta, font=ft)
        cw, bx, by = bb[2] - bb[0], (W - (bb[2] - bb[0]) - 70) // 2, 1400
        d.rounded_rectangle([bx, by, bx + cw + 70, by + 85], radius=42, fill=(255, 140, 0))
        d.text((bx + 35, by + 16), cta, font=ft, fill="white")
        url = "onmangequoi.net"
        ub = d.textbbox((0, 0), url, font=fs)
        d.text(((W - (ub[2]-ub[0])) // 2, 1510), url, font=fs, fill=(240, 240, 240))
        return f

    frames = [(make_frame_hook(), 5), (make_frame_steps(), 10), (make_frame_cta(), 5)]
    tmpdir = tempfile.mkdtemp()
    frame_idx = 0
    for img, dur in frames:
        for _ in range(dur * FPS):
            img.save(f"{tmpdir}/frame_{frame_idx:05d}.jpg", "JPEG", quality=90)
            frame_idx += 1

    cmd = ["ffmpeg", "-y", "-framerate", str(FPS), "-i", f"{tmpdir}/frame_%05d.jpg",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", output_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0 and Path(output_path).exists():
            print(f"✅ Video: {output_path} ({os.path.getsize(output_path)//1024}KB)")
            return output_path
        else:
            print(f"FFmpeg error: {result.stderr[-300:]}")
            return None
    except Exception as e:
        print(f"FFmpeg exception: {e}")
        return None
    finally:
        import shutil as _sh
        _sh.rmtree(tmpdir, ignore_errors=True)


def post_ig_reel(video_path: str, caption: str) -> dict:
    file_size = os.path.getsize(video_path)
    init_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"media_type": "REELS", "upload_type": "resumable", "caption": caption, "share_to_feed": "true"}
    )
    init_data = init_resp.json()
    if "id" not in init_data:
        return {"error": f"Init failed: {init_data}"}

    upload_url = init_data.get("uri", f"https://rupload.facebook.com/ig-api-upload/{init_data['id']}")
    with open(video_path, "rb") as f:
        upload_resp = requests.post(
            upload_url,
            headers={"Authorization": f"OAuth {PAGE_TOKEN}", "offset": "0", "file_size": str(file_size), "Content-Type": "video/mp4"},
            data=f
        )
    creation_id = init_data["id"]

    for attempt in range(24):
        time.sleep(5)
        status_resp = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}
        )
        status = status_resp.json().get("status_code", "UNKNOWN")
        if status == "FINISHED": break
        if status in ("ERROR", "EXPIRED"): return {"error": f"Processing failed: {status}"}

    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN}, data={"creation_id": creation_id}
    )
    return publish_resp.json()


def post_fb_reel(video_path: str, caption: str) -> dict:
    with open(video_path, "rb") as f:
        resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/videos",
            params={"access_token": PAGE_TOKEN},
            data={"description": caption},
            files={"source": f}
        )
    return resp.json()


async def main():
    print("=" * 60)
    print(f"🎬 WEEKLY REEL — {time.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # Get trending context
    trending = await get_trending_recipe()

    # Generate concept
    concept = await generate_reel_concept(trending)
    print(f"\n🎯 Recipe: {concept['recipe_name']}")
    print(f"📝 Hook: {concept['hook_text']}")

    # Generate images
    images = await generate_reel_images(concept)

    # Create video via ffmpeg (no Remotion dependency)
    output_path = f"/tmp/omq_reel_{int(time.time())}.mp4"
    video_path = create_ffmpeg_slideshow(concept, images, output_path)
    if not video_path:
        print("❌ Failed to create video")
        return

    caption = concept["caption"]
    print(f"\n--- CAPTION ---\n{caption[:200]}...\n")

    # Post
    print("📤 Posting to Instagram...")
    ig_result = post_ig_reel(video_path, caption)
    print(f"  IG: {ig_result}")

    print("📤 Posting to Facebook...")
    fb_result = post_fb_reel(video_path, caption)
    print(f"  FB: {fb_result}")

    # Cleanup
    if os.path.exists(video_path):
        os.unlink(video_path)


if __name__ == "__main__":
    asyncio.run(main())
