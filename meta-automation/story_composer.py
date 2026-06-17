"""
Story image composer for On Mange Quoi?
Takes a background image and overlays branded text on top.
Output: 1080x1920 (9:16) Story-ready image.
"""
from PIL import Image, ImageDraw, ImageFont
import textwrap, re
from pathlib import Path


# Regex that matches most emoji codepoints (Emoji_Presentation + modifiers + ZWJ sequences)
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U0001F900-\U0001F9FF"  # supplemental
    "\U0001FA00-\U0001FA6F"  # chess/extended-A
    "\U0001FA70-\U0001FAFF"  # extended-A cont.
    "\U00002702-\U000027B0"  # dingbats
    "\U0000FE0F"             # variation selector
    "\U0000200D"             # ZWJ
    "\U000023CF-\U000023FA"  # misc technical
    "\U00002600-\U000026FF"  # misc symbols
    "\U00002B50-\U00002B55"  # stars
    "\U0000203C-\U00003299"  # misc
    "]+",
    flags=re.UNICODE,
)


def _strip_emoji(text: str) -> str:
    """Remove emoji characters that Lato can't render (avoids ? glyphs)."""
    return _EMOJI_RE.sub("", text).strip()

FONT_BLACK  = "/usr/share/fonts/truetype/lato/Lato-Black.ttf"
FONT_BOLD   = "/usr/share/fonts/truetype/lato/Lato-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/lato/Lato-Regular.ttf"
FONT_SEMI   = "/usr/share/fonts/truetype/lato/Lato-Semibold.ttf"

W, H = 1080, 1920  # 9:16


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current = ""
    dummy = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(dummy)
    for word in words:
        test = (current + " " + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def compose_story(
    bg_path: str,
    title: str,
    main_text: str,
    cta: str,
    output_path: str,
    theme_color: tuple = (255, 165, 0),  # orange default
    steps: list[str] = None,
) -> str:
    """
    Compose a branded Story image with text overlays.
    Returns the output path.
    """
    # Load and resize background to exactly 1080x1920
    bg = Image.open(bg_path).convert("RGBA")
    # Crop to 9:16 ratio then resize
    bg_ratio = bg.width / bg.height
    target_ratio = W / H
    if bg_ratio > target_ratio:
        # Too wide - crop sides
        new_w = int(bg.height * target_ratio)
        left = (bg.width - new_w) // 2
        bg = bg.crop((left, 0, left + new_w, bg.height))
    elif bg_ratio < target_ratio:
        # Too tall - crop top/bottom
        new_h = int(bg.width / target_ratio)
        top = (bg.height - new_h) // 2
        bg = bg.crop((0, top, bg.width, top + new_h))
    bg = bg.resize((W, H), Image.LANCZOS)

    # Dark overlay to make text readable
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_ov = ImageDraw.Draw(overlay)
    # Top gradient band for title
    draw_ov.rectangle([(0, 0), (W, 420)], fill=(0, 0, 0, 160))
    # Bottom gradient band for CTA + branding
    draw_ov.rectangle([(0, H - 280), (W, H)], fill=(0, 0, 0, 175))
    # If steps: middle band
    if steps:
        draw_ov.rectangle([(0, 440), (W, H - 300)], fill=(0, 0, 0, 120))

    bg = Image.alpha_composite(bg, overlay)
    draw = ImageDraw.Draw(bg)

    PAD = 60  # horizontal padding
    text_w = W - PAD * 2

    # Strip emojis from all text inputs (Lato font can't render them)
    title = _strip_emoji(title)
    main_text = _strip_emoji(main_text)
    cta = _strip_emoji(cta)
    if steps:
        steps = [_strip_emoji(s) for s in steps]

    # ── Title (moved up, below IG safe zone ~120px) ─────────────────────
    font_title = ImageFont.truetype(FONT_BLACK, 72)
    title_lines = _wrap_text(title, font_title, text_w)
    title_y = 130
    for line in title_lines[:3]:
        bbox = draw.textbbox((0, 0), line, font=font_title)
        lw = bbox[2] - bbox[0]
        x = (W - lw) // 2
        # Shadow
        draw.text((x + 3, title_y + 3), line, font=font_title, fill=(0, 0, 0, 150))
        draw.text((x, title_y), line, font=font_title, fill="white")
        title_y += (bbox[3] - bbox[1]) + 12

    # ── App logo / brand pill (below title, not overlapping IG header) ────
    font_brand = ImageFont.truetype(FONT_BOLD, 30)
    brand_text = "onmangequoi.net"
    brand_bbox = draw.textbbox((0, 0), brand_text, font=font_brand)
    bw = brand_bbox[2] - brand_bbox[0] + 28
    bh = brand_bbox[3] - brand_bbox[1] + 16
    pill_x = (W - bw) // 2  # centered
    pill_y = title_y + 15
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + bw, pill_y + bh],
        radius=20,
        fill=(*theme_color, 200)
    )
    draw.text((pill_x + 14, pill_y + 8), brand_text, font=font_brand, fill="white")

    # ── Steps (if provided) ────────────────────────────────────────────────
    if steps:
        font_step = ImageFont.truetype(FONT_SEMI, 46)
        font_step_num = ImageFont.truetype(FONT_BLACK, 46)
        step_y = pill_y + bh + 40  # start steps below brand pill
        circle_r = 28
        for i, step in enumerate(steps[:4]):
            # Numbered circle
            cx, cy = PAD + circle_r, step_y + circle_r
            draw.ellipse(
                [cx - circle_r, cy - circle_r, cx + circle_r, cy + circle_r],
                fill=(*theme_color, 220)
            )
            num = str(i + 1)
            nb = draw.textbbox((0, 0), num, font=font_step_num)
            nx = cx - (nb[2] - nb[0]) // 2
            ny = cy - (nb[3] - nb[1]) // 2
            draw.text((nx, ny), num, font=font_step_num, fill="white")

            # Step text
            step_lines = _wrap_text(step, font_step, text_w - circle_r * 2 - 20)
            tx = PAD + circle_r * 2 + 18
            ty = step_y + 6
            for sl in step_lines[:2]:
                draw.text((tx, ty), sl, font=font_step, fill="white")
                sb = draw.textbbox((0, 0), sl, font=font_step)
                ty += sb[3] - sb[1] + 4
            step_y = max(ty, step_y + circle_r * 2 + 24) + 18
    else:
        # ── Main text (when no steps) ────────────────────────────────────
        font_main = ImageFont.truetype(FONT_REGULAR, 50)
        main_lines = _wrap_text(main_text, font_main, text_w)
        main_y = pill_y + bh + 30  # start below brand pill
        for line in main_lines[:5]:
            bbox = draw.textbbox((0, 0), line, font=font_main)
            lw = bbox[2] - bbox[0]
            x = (W - lw) // 2
            draw.text((x, main_y), line, font=font_main, fill=(240, 240, 240, 255))
            main_y += bbox[3] - bbox[1] + 10

    # ── CTA button area ────────────────────────────────────────────────────
    font_cta = ImageFont.truetype(FONT_BOLD, 52)
    cta_bbox = draw.textbbox((0, 0), cta, font=font_cta)
    cw = cta_bbox[2] - cta_bbox[0]
    btn_x = (W - cw - 60) // 2
    btn_y = H - 230
    draw.rounded_rectangle(
        [btn_x, btn_y, btn_x + cw + 60, btn_y + 80],
        radius=40,
        fill=(*theme_color, 240)
    )
    draw.text((btn_x + 30, btn_y + 14), cta, font=font_cta, fill="white")

    # ── Site URL ───────────────────────────────────────────────────────────
    font_url = ImageFont.truetype(FONT_REGULAR, 38)
    url_text = "onmangequoi.net"
    ub = draw.textbbox((0, 0), url_text, font=font_url)
    ux = (W - (ub[2] - ub[0])) // 2
    draw.text((ux, H - 110), url_text, font=font_url, fill=(200, 200, 200, 200))

    # Save as JPEG
    final = bg.convert("RGB")
    final.save(output_path, "JPEG", quality=95)
    return output_path


def get_theme_color(theme: str) -> tuple:
    """Return brand color per story theme."""
    colors = {
        "recette_du_jour":    (255, 140, 0),   # Orange
        "astuce_frigo":       (34, 197, 94),    # Green
        "ingredient_star":    (251, 191, 36),   # Yellow
        "quiz_cuisine":       (168, 85, 247),   # Purple
        "defi_zero_gaspi":    (20, 184, 166),   # Teal
        "avant_apres":        (59, 130, 246),   # Blue
        "recette_express":    (239, 68, 68),    # Red
        "saison_du_moment":   (132, 204, 22),   # Lime
        "astuce_conservation":(14, 165, 233),   # Sky blue
        "combo_surprise":     (236, 72, 153),   # Pink
    }
    return colors.get(theme, (255, 140, 0))


if __name__ == "__main__":
    # Quick test
    import sys
    if len(sys.argv) > 1:
        out = compose_story(
            bg_path=sys.argv[1],
            title="🍕 Recette du Jour !",
            main_text="Gratin d'asperges blanches au parmesan — simple, rapide et délicieux !",
            cta="📸 Prends ton frigo en photo !",
            output_path="/work/temp/story_test.jpg",
            steps=["Épluche les asperges", "Mélange crème + parmesan", "Gratine 20 min à 200°C", "Déguste ! 🎉"],
        )
        print(f"Output: {out}")
