#!/usr/bin/env python3
"""On Mange Quoi? - Weekly Reel generator for Instagram + Facebook
Creates a short 15-30s animated recipe Reel using Remotion.
"""
import asyncio, json, requests, sys, os, time, subprocess, textwrap, shutil
from pathlib import Path

# Ensure ffmpeg is on PATH (static binary fallback)
_FFMPEG_STATIC = "/tmp/ffmpeg-7.0.2-amd64-static"
if os.path.isdir(_FFMPEG_STATIC) and _FFMPEG_STATIC not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _FFMPEG_STATIC + ":" + os.environ.get("PATH", "")
sys.path.insert(0, '/work')
from sdk.tools.utils_tools import ai_structured_output, coworker_text2im, quick_ai_search
from hashtag_strategy import get_reel_hashtags, get_engagement_cta
from utm_links import reels_url

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
config = json.loads(CONFIG_PATH.read_text())
PAGE_ID = config["page_id"]
PAGE_TOKEN = config["page_token"]
IG_USER_ID = config["instagram_user_id"]
SITE_URL = config["site_url"]

REMOTION_DIR = Path("/work/omq-tiktok")


async def get_trending_recipe() -> str:
    """Get a trending recipe idea."""
    from datetime import datetime
    month_names = ["janvier","février","mars","avril","mai","juin",
                   "juillet","août","septembre","octobre","novembre","décembre"]
    month = month_names[datetime.now().month - 1]
    try:
        result = await quick_ai_search(
            f"recettes tendance France {month} 2026 les plus populaires Instagram TikTok"
        )
        return result.search_response
    except Exception as e:
        print(f"Trending search failed: {e}")
        return ""


async def generate_reel_concept(trending_context: str) -> dict:
    """Generate the reel concept: recipe, steps, visuals."""
    trending_section = f"\nRECETTES TENDANCES:\n{trending_context[:600]}\n" if trending_context else ""

    # Get optimized reel hashtags and engagement CTA
    reel_hashtags = get_reel_hashtags(count=20)
    engagement_cta = get_engagement_cta("question")

    result = await ai_structured_output(
        prompt=f"""Crée un concept de Reel Instagram court et viral pour "On Mange Quoi?" (app IA de recettes depuis photo du frigo).
        {trending_section}
        
        Le Reel doit:
        - Durer ~20 secondes (format TikTok/Reel)
        - Montrer une recette tendance et rapide faite à partir d'ingrédients du frigo
        - Avoir un accroche forte en 0-3 secondes (ex: "T'as ça dans ton frigo ? Regarde ça !")
        - Inclure 3-4 étapes visuelles claires
        - Se terminer par le résultat final appétissant + CTA vers l'app
        
        NARRATIVE OBLIGATOIRE : "frigo → photo → recette IA → résultat"
        
        Génère:
        1. Le nom de la recette (tendante, populaire)
        2. L'accroche (texte overlay frame 1, max 8 mots, percutant, doit donner envie de regarder)
        3. 4 étapes courtes de la recette (max 5 mots chacune)
        4. Une description détaillée du plat final pour générer une belle image
        5. Une description de l'image de fond/hero (cuisine, ingrédients frais, ambiance)
        6. La légende Instagram (150 mots max) avec:
           - une accroche engageante
           - mention @onmangequoi_app
           - CTA : "{engagement_cta}"
           - lien : onmangequoi.net (lien en bio — UTM: {reels_url()})
           - EXACTEMENT ces hashtags : {reel_hashtags}
        """,
        output_schema={
            "type": "object",
            "properties": {
                "recipe_name": {"type": "string"},
                "hook_text": {"type": "string", "description": "Accroche percutante, max 8 mots"},
                "steps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "4 étapes courtes de la recette"
                },
                "final_dish_description": {"type": "string", "description": "Description précise du plat final pour l'image"},
                "background_description": {"type": "string", "description": "Description du fond/ambiance cuisine"},
                "caption": {"type": "string", "description": "Légende Instagram complète avec hashtags"}
            },
            "required": ["recipe_name", "hook_text", "steps", "final_dish_description", "background_description", "caption"]
        },
        intelligence_level="balanced"
    )
    return result.result


async def generate_reel_images(concept: dict) -> dict:
    """Generate hero image and dish image with automatic fallback (fal.ai → Pollinations → coworker_text2im)."""
    from image_gen import generate_reel_image

    bg_prompt = (
        f"Beautiful finished {concept['recipe_name']} on a plate or cutting board, "
        f"real home kitchen table, natural daylight, warm cozy atmosphere, "
        f"authentic everyday cooking vibe, not overly styled, close-up appetizing view. "
        f"No text, no watermark."
    )
    dish_prompt = (
        f"Home-cooked {concept['final_dish_description']}, "
        f"served on everyday plates, slightly imperfect plating, "
        f"natural daylight on kitchen table, genuine homemade look, "
        f"warm atmosphere, smartphone-style food photo. No text, no watermark."
    )

    # Generate both images in parallel with fallback support
    bg_result, dish_result = await asyncio.gather(
        generate_reel_image(bg_prompt, width=768, height=1344, suffix="reel_bg"),
        generate_reel_image(dish_prompt, width=1024, height=1024, suffix="reel_dish"),
    )
    return {
        "bg_path": bg_result[0],
        "bg_url": bg_result[1],
        "dish_path": dish_result[0],
        "dish_url": dish_result[1],
    }


def render_reel_video(concept: dict, images: dict) -> str:
    """Render the Reel video using Remotion (omq-tiktok project)."""
    output_path = f"/work/temp/reel_{int(time.time())}.mp4"

    # Check if remotion project exists and has the right composition
    if not REMOTION_DIR.exists():
        print("⚠️ omq-tiktok Remotion project not found, using image slideshow fallback")
        return create_ffmpeg_slideshow(concept, images, output_path)

    # Try to render with Remotion
    props = json.dumps({
        "recipeName": concept["recipe_name"],
        "hookText": concept["hook_text"],
        "steps": concept["steps"],
        "bgImagePath": images["bg_path"],
        "dishImagePath": images["dish_path"],
        "siteUrl": SITE_URL,
    })

    try:
        result = subprocess.run(
            ["bunx", "remotion", "render", "--props", props, "ReelVideo", output_path],
            cwd=REMOTION_DIR,
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode == 0 and Path(output_path).exists():
            print(f"✅ Remotion render successful: {output_path}")
            return output_path
        else:
            print(f"Remotion render failed: {result.stderr[:500]}")
    except Exception as e:
        print(f"Remotion error: {e}")

    # Fallback: ffmpeg slideshow
    return create_ffmpeg_slideshow(concept, images, output_path)


def _esc_ffmpeg(text: str) -> str:
    """Escape text for ffmpeg drawtext filter."""
    import re as _re
    # Remove emoji (can't render in default font)
    emoji_re = _re.compile("["
        "\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FAFF"
        "\U00002702-\U000027B0\U0000FE0F\U0000200D\U00002600-\U000026FF"
        "\U00002B50-\U00002B55\U0000203C-\U00003299"
        "]+", flags=_re.UNICODE)
    text = emoji_re.sub("", text).strip()
    # Escape special chars for drawtext
    for ch in ("\\", "'", ":", "%"):
        text = text.replace(ch, f"\\{ch}")
    return text


def create_ffmpeg_slideshow(concept: dict, images: dict, output_path: str) -> str:
    """Create a reel video: compose frames with PIL, then encode with ffmpeg."""
    from PIL import Image, ImageDraw, ImageFont
    import re as _re, tempfile

    W, H = 1080, 1920
    FPS = 30
    DURATION = 20  # seconds

    # Strip emoji helper
    emoji_re = _re.compile("["
        "\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FAFF"
        "\U00002702-\U000027B0\U0000FE0F\U0000200D\U00002600-\U000026FF"
        "\U00002B50-\U00002B55\U0000203C-\U00003299"
        "]+", flags=_re.UNICODE)
    def strip_e(t): return emoji_re.sub("", t).strip()

    recipe = strip_e(concept["recipe_name"])
    hook = strip_e(concept["hook_text"])
    steps = [strip_e(s) for s in concept["steps"][:4]]

    FONT_B = "/usr/share/fonts/truetype/lato/Lato-Black.ttf"
    FONT_R = "/usr/share/fonts/truetype/lato/Lato-Bold.ttf"

    # Load and resize images
    bg = Image.open(images["bg_path"]).convert("RGB")
    bg_r = bg.width / bg.height
    tr = W / H
    if bg_r > tr:
        nw = int(bg.height * tr)
        l = (bg.width - nw) // 2
        bg = bg.crop((l, 0, l + nw, bg.height))
    elif bg_r < tr:
        nh = int(bg.width / tr)
        t = (bg.height - nh) // 2
        bg = bg.crop((0, t, bg.width, t + nh))
    bg = bg.resize((W, H), Image.LANCZOS)

    dish = Image.open(images["dish_path"]).convert("RGBA")
    dish = dish.resize((700, 700), Image.LANCZOS)

    # Pre-compose 3 key frames, then create video from them
    def _centered_text(d, text, font, y, fill="white", max_w=W-120):
        """Draw centered text, wrapping if needed."""
        lines = []
        words = text.split()
        cur = ""
        for w in words:
            test = f"{cur} {w}".strip()
            bb = d.textbbox((0, 0), test, font=font)
            if bb[2] - bb[0] > max_w and cur:
                lines.append(cur)
                cur = w
            else:
                cur = test
        if cur:
            lines.append(cur)
        for line in lines:
            bb = d.textbbox((0, 0), line, font=font)
            lw = bb[2] - bb[0]
            d.text(((W - lw) // 2, y), line, font=font, fill=fill)
            y += bb[3] - bb[1] + 12
        return y

    def _light_overlay(base, alpha=60):
        """Gentle semi-transparent overlay — keeps food visible."""
        f = base.copy().convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, alpha))
        f = Image.alpha_composite(f, ov)
        return f.convert("RGB")

    def _gradient_bar(d, y, h, color=(255, 140, 0), alpha=200):
        """Draw a horizontal gradient bar."""
        for i in range(h):
            a = int(alpha * (1 - abs(i - h/2) / (h/2)) ** 0.5)
            d.rectangle([(0, y+i), (W, y+i+1)], fill=(*color, a))

    def make_frame_hook():
        """Frame 1: food bg visible, recipe name + hook centered"""
        f = _light_overlay(bg, alpha=70)
        d = ImageDraw.Draw(f)
        ft = ImageFont.truetype(FONT_B, 68)
        fs = ImageFont.truetype(FONT_R, 46)
        fb = ImageFont.truetype(FONT_R, 32)
        # Brand pill top center
        bp = "onmangequoi.net"
        bb = d.textbbox((0, 0), bp, font=fb)
        bpw = bb[2] - bb[0] + 40
        bph = bb[3] - bb[1] + 20
        bpx = (W - bpw) // 2
        d.rounded_rectangle([bpx, 160, bpx+bpw, 160+bph], radius=20, fill=(255, 140, 0, 220))
        d.text((bpx+20, 170), bp, font=fb, fill="white")
        # Recipe name centered in the middle
        y = _centered_text(d, recipe, ft, 780, fill="white")
        # Hook below
        _centered_text(d, hook, fs, y + 20, fill=(255, 230, 120))
        return f

    def make_frame_steps():
        """Frame 2: food bg, numbered steps centered"""
        f = _light_overlay(bg, alpha=80)
        d = ImageDraw.Draw(f)
        ft = ImageFont.truetype(FONT_B, 54)
        fs = ImageFont.truetype(FONT_R, 44)
        # Title
        _centered_text(d, recipe, ft, 250, fill="white")
        # Steps centered
        y = 500
        for i, step in enumerate(steps):
            num = str(i + 1)
            # Number circle
            cx = 120
            d.ellipse([cx-25, y-5, cx+25, y+45], fill=(255, 140, 0))
            nb = d.textbbox((0,0), num, font=fs)
            d.text((cx - (nb[2]-nb[0])//2, y), num, font=fs, fill="white")
            # Step text
            d.text((cx + 40, y), step, font=fs, fill="white")
            y += 90
        return f

    def make_frame_cta():
        """Frame 3: dish image prominent + CTA"""
        f = _light_overlay(bg, alpha=50)
        # Paste dish centered and large
        d_size = 750
        dish_r = dish.resize((d_size, d_size), Image.LANCZOS)
        dx = (W - d_size) // 2
        dy = 450
        f.paste(dish_r, (dx, dy), dish_r)
        d = ImageDraw.Draw(f)
        ft = ImageFont.truetype(FONT_B, 52)
        fs = ImageFont.truetype(FONT_R, 36)
        # CTA button centered
        cta = "Scanne ton frigo !"
        bb = d.textbbox((0, 0), cta, font=ft)
        cw = bb[2] - bb[0]
        bx = (W - cw - 70) // 2
        by = 1400
        d.rounded_rectangle([bx, by, bx + cw + 70, by + 85], radius=42, fill=(255, 140, 0))
        d.text((bx + 35, by + 16), cta, font=ft, fill="white")
        # URL
        url = "onmangequoi.net"
        ub = d.textbbox((0, 0), url, font=fs)
        d.text(((W - (ub[2]-ub[0])) // 2, 1510), url, font=fs, fill=(240, 240, 240))
        return f

    # Save frames as temp images
    frames = [
        (make_frame_hook(), 5),    # 5 seconds
        (make_frame_steps(), 10),  # 10 seconds
        (make_frame_cta(), 5),     # 5 seconds
    ]

    tmpdir = tempfile.mkdtemp()
    frame_idx = 0
    for img, dur in frames:
        for _ in range(dur * FPS):
            img.save(f"{tmpdir}/frame_{frame_idx:05d}.jpg", "JPEG", quality=90)
            frame_idx += 1

    # Encode with ffmpeg
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", f"{tmpdir}/frame_%05d.jpg",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast",
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0 and Path(output_path).exists():
            print(f"✅ Video created: {output_path} ({os.path.getsize(output_path)//1024}KB)")
            return output_path
        else:
            print(f"FFmpeg encode error: {result.stderr[-300:]}")
            return None
    except Exception as e:
        print(f"FFmpeg exception: {e}")
        return None
    finally:
        import shutil as _sh
        _sh.rmtree(tmpdir, ignore_errors=True)


def upload_video_to_fb_cdn(video_path: str) -> str:
    """Upload video to Facebook CDN and return the video ID."""
    with open(video_path, "rb") as f:
        resp = requests.post(
            f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
            params={"access_token": PAGE_TOKEN},
            data={
                "media_type": "REELS",
                "video_url": "",  # We'll use multipart upload
                "share_to_feed": "true",
            },
            files={"video": f}
        )
    return resp.json()


def post_ig_reel(video_path: str, caption: str, thumb_url: str = None) -> dict:
    """Post a Reel to Instagram via resumable upload."""
    file_size = os.path.getsize(video_path)

    # Step 1: Initialize resumable upload session
    init_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={
            "media_type": "REELS",
            "upload_type": "resumable",
            "caption": caption,
            "share_to_feed": "true",
        }
    )
    init_data = init_resp.json()
    print(f"  IG Reel init: {init_data}")

    if "id" not in init_data:
        # Fallback: try with video URL approach using a public hosting
        print("  Resumable upload not available, trying video_url approach...")
        return post_ig_reel_url(video_path, caption, thumb_url)

    # Step 2: Upload video bytes
    upload_url = init_data.get("uri", f"https://rupload.facebook.com/ig-api-upload/{init_data['id']}")
    with open(video_path, "rb") as f:
        upload_resp = requests.post(
            upload_url,
            headers={
                "Authorization": f"OAuth {PAGE_TOKEN}",
                "offset": "0",
                "file_size": str(file_size),
                "Content-Type": "video/mp4",
            },
            data=f
        )
    print(f"  Upload response: {upload_resp.status_code} {upload_resp.text[:200]}")

    if upload_resp.status_code not in (200, 201):
        return {"error": f"Upload failed: {upload_resp.text[:200]}"}

    creation_id = init_data["id"]

    # Step 3: Poll for processing
    for attempt in range(24):  # up to 2 minutes
        time.sleep(5)
        status_resp = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}
        )
        status = status_resp.json().get("status_code", "UNKNOWN")
        print(f"  Reel status ({attempt+1}/24): {status}")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            return {"error": f"Reel processing failed: {status}"}

    # Step 4: Publish
    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id}
    )
    return publish_resp.json()


def post_ig_reel_url(video_path: str, caption: str, thumb_url: str = None) -> dict:
    """Post IG Reel using coworker upload for public URL."""
    # We can't directly upload via URL without a public video host
    # Upload to Slack as a workaround to get a public URL isn't ideal
    # Instead, use the Graph API video upload directly
    with open(video_path, "rb") as video_file:
        resp = requests.post(
            f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
            params={"access_token": PAGE_TOKEN},
            data={
                "media_type": "REELS",
                "caption": caption,
                "share_to_feed": "true",
            },
            files={"video_file": ("reel.mp4", video_file, "video/mp4")}
        )
    data = resp.json()
    print(f"  Direct upload response: {data}")

    if "id" not in data:
        return {"error": f"Upload failed: {data}"}

    creation_id = data["id"]

    # Poll
    for attempt in range(24):
        time.sleep(5)
        status_resp = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}
        )
        status = status_resp.json().get("status_code", "UNKNOWN")
        print(f"  Reel status ({attempt+1}/24): {status}")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            return {"error": f"Processing failed: {status}"}

    publish_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id}
    )
    return publish_resp.json()


def post_fb_reel(video_path: str, caption: str) -> dict:
    """Post a Reel/video to Facebook Page."""
    with open(video_path, "rb") as f:
        resp = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/videos",
            params={"access_token": PAGE_TOKEN},
            data={
                "description": caption,
                "title": "On Mange Quoi? - Recette du jour",
            },
            files={"source": f}
        )
    return resp.json()


async def main():
    print("🎬 Creating weekly Reel for On Mange Quoi?...")

    # Step 1: Get trending context
    print("\n[1/5] Finding trending recipe...")
    trending = await get_trending_recipe()
    print(f"Trending: {trending[:200]}...")

    # Step 2: Generate concept
    print("\n[2/5] Generating reel concept...")
    concept = await generate_reel_concept(trending)
    print(f"Recipe: {concept['recipe_name']}")
    print(f"Hook: {concept['hook_text']}")
    print(f"Steps: {concept['steps']}")

    # Step 3: Generate images in parallel
    print("\n[3/5] Generating images...")
    images = await generate_reel_images(concept)
    print(f"Background: {images['bg_path']}")
    print(f"Dish: {images['dish_path']}")

    # Step 4: Render video
    print("\n[4/5] Rendering video...")
    video_path = render_reel_video(concept, images)
    if not video_path or not Path(video_path).exists():
        print("❌ Video rendering failed")
        return

    print(f"Video: {video_path} ({os.path.getsize(video_path) // 1024}KB)")

    # Step 5: Post to Instagram and Facebook
    print("\n[5/5] Publishing Reel...")

    print("→ Posting to Instagram Reels...")
    ig_result = post_ig_reel(video_path, concept["caption"], images.get("dish_url"))
    if "id" in ig_result:
        print(f"✅ Instagram Reel posted: {ig_result['id']}")
    else:
        print(f"⚠️ Instagram Reel: {ig_result}")

    print("→ Posting to Facebook...")
    fb_result = post_fb_reel(video_path, concept["caption"])
    if "id" in fb_result:
        print(f"✅ Facebook video posted: {fb_result['id']}")
    else:
        print(f"⚠️ Facebook: {fb_result}")

    # Cleanup
    if Path(video_path).exists():
        os.unlink(video_path)

    print("\n🎉 Reel done!")


if __name__ == "__main__":
    asyncio.run(main())
