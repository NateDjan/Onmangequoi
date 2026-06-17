#!/usr/bin/env python3
"""One-shot script: post the Plazam launch post to Instagram + Facebook."""
import asyncio, json, requests, sys, time
from pathlib import Path

sys.path.insert(0, '/work')
sys.path.insert(0, '/work/viktor-spaces/on-mange-quoi/meta-automation')

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
config      = json.loads(CONFIG_PATH.read_text())
PAGE_ID     = config["page_id"]
PAGE_TOKEN  = config["page_token"]
IG_USER_ID  = config["instagram_user_id"]

CAPTION_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/plazam_post_caption.txt")
IMAGE_PATH   = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/plazam_post_image.webp")

DONE_FLAG = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/plazam_post_done.flag")


def upload_image_to_fb_cdn() -> str:
    """Upload image to Facebook and get a shareable URL via the unpublished photo trick."""
    with open(IMAGE_PATH, "rb") as img:
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"published": "false"},
            files={"source": ("plazam.jpg", img, "image/jpeg")},
        )
    data = r.json()
    print("FB upload:", data)
    photo_id = data.get("id")
    if not photo_id:
        raise RuntimeError(f"FB photo upload failed: {data}")

    # Get the picture URL
    r2 = requests.get(
        f"https://graph.facebook.com/v19.0/{photo_id}",
        params={"fields": "images", "access_token": PAGE_TOKEN},
    )
    images = r2.json().get("images", [])
    if not images:
        raise RuntimeError(f"Could not get image URL: {r2.json()}")
    return images[0]["source"]


def post_to_instagram(caption: str, image_url: str) -> dict:
    container = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"image_url": image_url, "caption": caption},
    ).json()
    print("IG container:", container)
    if "id" not in container:
        return {"error": container}

    creation_id = container["id"]
    for _ in range(12):
        time.sleep(5)
        status = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN},
        ).json()
        if status.get("status_code") == "FINISHED":
            break

    publish = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id},
    ).json()
    print("IG publish:", publish)
    return publish


def post_to_facebook(caption: str) -> dict:
    with open(IMAGE_PATH, "rb") as img:
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/photos",
            params={"access_token": PAGE_TOKEN},
            data={"caption": caption, "published": "true"},
            files={"source": ("plazam.jpg", img, "image/jpeg")},
        )
    data = r.json()
    print("FB post:", data)
    return data


async def main():
    if DONE_FLAG.exists():
        print("Already posted — skipping.")
        return

    caption = CAPTION_PATH.read_text().strip()

    print("=== Posting to Facebook ===")
    fb_result = post_to_facebook(caption)
    fb_ok = "id" in fb_result

    print("\n=== Uploading image for Instagram ===")
    image_url = upload_image_to_fb_cdn()
    print("Image URL:", image_url)

    print("\n=== Posting to Instagram ===")
    ig_result = post_to_instagram(caption, image_url)
    ig_ok = "id" in ig_result

    print(f"\nFacebook: {'✅' if fb_ok else '❌'}")
    print(f"Instagram: {'✅' if ig_ok else '❌'}")

    if fb_ok or ig_ok:
        DONE_FLAG.write_text("done")

    # Notify Slack
    import os
    slack_token = None
    try:
        from sdk.tools.slack_tools import post_slack_message
        await post_slack_message(
            channel="on-mange-quoi",
            text=f"📸 Post Plazam publié !\nFacebook: {'✅' if fb_ok else '❌'} | Instagram: {'✅' if ig_ok else '❌'}",
        )
    except Exception as e:
        print("Slack notify error:", e)


if __name__ == "__main__":
    asyncio.run(main())
