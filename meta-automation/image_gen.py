#!/usr/bin/env python3
"""
Shared image generation module for On Mange Quoi?

Fallback chain:
  1. fal.ai FLUX Schnell  (fast, ~$0.001/image)
  2. Pollinations AI       (free, rate-limited)
  3. coworker_text2im      (SDK built-in, always works)

Usage:
    from image_gen import generate_image
    path, url = await generate_image(prompt, width=1024, height=1024)
"""
import asyncio, hashlib, os, sys, urllib.parse, traceback
from pathlib import Path

sys.path.insert(0, "/work")

FAL_KEY = "17bcb4c4-5cb9-4d73-9388-fca3d3df4d8d:48c41bc54ce90d8b27a3dcad90d5e5d8"


async def _generate_fal(prompt: str, width: int, height: int, suffix: str) -> tuple[str, str]:
    """Primary: fal.ai FLUX Schnell."""
    import httpx

    # Map dimensions to named sizes for square
    size_param: dict | str
    if width == height:
        size_param = "square_hd"
    else:
        size_param = {"width": width, "height": height}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://fal.run/fal-ai/flux/schnell",
            headers={
                "Authorization": f"Key {FAL_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "prompt": prompt,
                "image_size": size_param,
                "num_images": 1,
                "num_inference_steps": 4,
            },
        )

        if resp.status_code != 200:
            raise RuntimeError(f"fal.ai HTTP {resp.status_code}: {resp.text[:300]}")

        data = resp.json()

        if "images" not in data or not data["images"]:
            detail = data.get("detail", data)
            raise RuntimeError(f"fal.ai returned no images: {detail}")

        img_url = data["images"][0]["url"]

        # Download the image
        img_resp = await client.get(img_url)
        if img_resp.status_code != 200:
            raise RuntimeError(f"fal.ai image download failed: HTTP {img_resp.status_code}")

        h = hashlib.md5(prompt.encode()).hexdigest()[:8]
        ext = "webp" if "webp" in img_resp.headers.get("content-type", "") else "png"
        local_path = f"/tmp/omq_{suffix}_{h}.{ext}"
        Path(local_path).write_bytes(img_resp.content)
        return local_path, img_url


async def _generate_pollinations(prompt: str, width: int, height: int, suffix: str) -> tuple[str, str]:
    """Fallback 1: Pollinations AI (free, no API key needed)."""
    import httpx

    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&nologo=true&nofeed=true&model=flux"
    )

    # Pollinations can be slow — give it a longer timeout and retry
    for attempt in range(3):
        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
            try:
                resp = await client.get(url)
                content_type = resp.headers.get("content-type", "")

                if resp.status_code == 200 and "image" in content_type:
                    h = hashlib.md5(prompt.encode()).hexdigest()[:8]
                    local_path = f"/tmp/omq_{suffix}_{h}_poll.jpg"
                    Path(local_path).write_bytes(resp.content)
                    # Pollinations doesn't give a stable URL for IG,
                    # so return None for url (caller should upload to FB CDN)
                    return local_path, None

                # Rate limited or queue full — wait and retry
                if resp.status_code in (402, 429):
                    wait_time = 10 * (attempt + 1)
                    print(f"  Pollinations rate-limited (attempt {attempt+1}/3), waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue

                raise RuntimeError(f"Pollinations HTTP {resp.status_code}: {resp.text[:200]}")
            except httpx.TimeoutException:
                if attempt < 2:
                    print(f"  Pollinations timeout (attempt {attempt+1}/3), retrying...")
                    await asyncio.sleep(5)
                    continue
                raise

    raise RuntimeError("Pollinations: all 3 attempts failed (rate-limited)")


async def _generate_coworker(prompt: str, width: int, height: int, suffix: str) -> tuple[str, str]:
    """Fallback 2: coworker_text2im via SDK (always available)."""
    from sdk.tools.utils_tools import coworker_text2im

    # Determine aspect ratio
    ratio = width / height
    if abs(ratio - 1.0) < 0.1:
        aspect = "1:1"
    elif ratio > 1:
        aspect = "3:2"
    else:
        aspect = "2:3"

    # Use gemini-flash-image (faster, less artifacts for food photos)
    result = await coworker_text2im(
        prompt=prompt,
        model="gemini-flash-image",
        aspect_ratio=aspect,
    )

    if result and result.file_path:
        return result.file_path, getattr(result, "url", None)

    # Try gpt-image-2 as last resort
    result = await coworker_text2im(
        prompt=prompt,
        model="gpt-image-2",
        aspect_ratio=aspect,
    )

    if result and result.file_path:
        return result.file_path, getattr(result, "url", None)

    raise RuntimeError("coworker_text2im: both models failed")


async def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    suffix: str = "img",
) -> tuple[str, str | None]:
    """
    Generate an image with automatic fallback chain.

    Returns:
        (local_path, image_url_or_None)
        image_url may be None if fallback provider doesn't give public URLs.
    """
    providers = [
        ("fal.ai", _generate_fal),
        ("Pollinations", _generate_pollinations),
        ("coworker_text2im", _generate_coworker),
    ]

    last_error = None
    for name, gen_fn in providers:
        try:
            print(f"  🖼️  [{name}] Generating image...")
            local_path, img_url = await gen_fn(prompt, width, height, suffix)
            print(f"  ✅ [{name}] Image generated: {local_path}")
            return local_path, img_url
        except Exception as e:
            last_error = e
            print(f"  ⚠️  [{name}] Failed: {e}")
            traceback.print_exc()
            continue

    raise RuntimeError(f"All image providers failed. Last error: {last_error}")


# Convenience aliases for specific use cases
async def generate_post_image(dish_name: str, image_description: str) -> tuple[str, str | None]:
    """Generate a square post image."""
    prompt = (
        f"Casual home-cooked {dish_name}, photographed with a smartphone on a real kitchen table. "
        f"{image_description}. "
        f"Natural daylight, slightly imperfect plating, authentic homemade feel, "
        f"real kitchen background visible, warm cozy atmosphere, everyday tableware. "
        f"NOT studio photography, NOT perfectly styled. Genuine and appetizing. No text, no watermark."
    )
    return await generate_image(prompt, width=1024, height=1024, suffix="post")


async def generate_story_image(image_description: str) -> tuple[str, str | None]:
    """Generate a 9:16 story background image."""
    prompt = (
        f"Casual smartphone-style food photo for Instagram Story, vertical 9:16 format. "
        f"{image_description}. "
        f"Natural daylight, authentic homemade feel, real kitchen setting, "
        f"slightly imperfect and genuine, warm cozy vibe, everyday dishes and tableware. "
        f"NOT professional studio, NOT overly styled. Looks like a real person took this photo. "
        f"No text, no logos, no watermarks."
    )
    return await generate_image(prompt, width=768, height=1344, suffix="story")


async def generate_reel_image(prompt: str, width: int, height: int, suffix: str) -> tuple[str, str | None]:
    """Generate a reel image (bg or dish)."""
    return await generate_image(prompt, width=width, height=height, suffix=suffix)


if __name__ == "__main__":
    # Quick self-test
    async def _test():
        print("Testing image generation fallback chain...")
        path, url = await generate_image(
            "A delicious pasta carbonara on a plate, home kitchen, natural light",
            width=512, height=512, suffix="test",
        )
        print(f"\nResult: {path} | URL: {url}")

    asyncio.run(_test())
