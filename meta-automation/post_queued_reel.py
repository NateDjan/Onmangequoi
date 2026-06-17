#!/usr/bin/env python3
"""Post a queued reel from the reels_queue.json file — run daily at 16:00 UTC (18:00 Brussels)."""
import json, os, requests, sys, time
from pathlib import Path

sys.path.insert(0, '/work/viktor-spaces/on-mange-quoi/meta-automation')

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
QUEUE_PATH  = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/reels_queue.json")
config      = json.loads(CONFIG_PATH.read_text())
PAGE_TOKEN  = config["page_token"]
IG_USER_ID  = config["instagram_user_id"]


def post_ig_reel(video_path: str, caption: str) -> dict:
    """Post a Reel to Instagram via resumable upload."""
    file_size = os.path.getsize(video_path)

    # Step 1 — init resumable upload
    init_resp = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media",
        params={"access_token": PAGE_TOKEN},
        data={"media_type": "REELS", "upload_type": "resumable",
              "caption": caption, "share_to_feed": "true"},
    )
    init_data = init_resp.json()
    print(f"  IG init: {init_data}")
    if "id" not in init_data:
        return {"error": f"Init failed: {init_data}"}

    creation_id = init_data["id"]
    upload_url  = init_data.get("uri", f"https://rupload.facebook.com/ig-api-upload/{creation_id}")

    # Step 2 — upload bytes
    with open(video_path, "rb") as f:
        up = requests.post(
            upload_url,
            headers={"Authorization": f"OAuth {PAGE_TOKEN}",
                     "offset": "0", "file_size": str(file_size),
                     "Content-Type": "video/mp4"},
            data=f,
        )
    print(f"  Upload: {up.status_code} {up.text[:200]}")
    if up.status_code not in (200, 201):
        return {"error": f"Upload failed: {up.text[:200]}"}

    # Step 3 — poll processing
    for i in range(24):
        time.sleep(5)
        st = requests.get(
            f"https://graph.facebook.com/v19.0/{creation_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN},
        ).json().get("status_code", "UNKNOWN")
        print(f"  Status {i+1}/24: {st}")
        if st == "FINISHED":
            break
        if st in ("ERROR", "EXPIRED"):
            return {"error": f"Processing {st}"}

    # Step 4 — publish
    pub = requests.post(
        f"https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish",
        params={"access_token": PAGE_TOKEN},
        data={"creation_id": creation_id},
    )
    return pub.json()


def main():
    if not QUEUE_PATH.exists():
        print("No reels_queue.json — nothing to post.")
        return

    queue = json.loads(QUEUE_PATH.read_text())
    pending = [r for r in queue if not r.get("posted")]

    if not pending:
        print("All queued reels already posted.")
        return

    reel = pending[0]
    video_path = reel["video_path"]
    caption    = reel["caption"]

    if not Path(video_path).exists():
        print(f"ERROR: video file not found: {video_path}")
        return

    print(f"Posting reel: {reel['title']}")
    result = post_ig_reel(video_path, caption)
    print(f"Result: {result}")

    if "id" in result:
        reel["posted"] = True
        reel["ig_media_id"] = result["id"]
        QUEUE_PATH.write_text(json.dumps(queue, indent=2, ensure_ascii=False))
        print(f"✅ Posted! IG media ID: {result['id']}")
    else:
        print(f"❌ Post failed: {result}")


if __name__ == "__main__":
    main()
