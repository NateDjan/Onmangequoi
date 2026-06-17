#!/usr/bin/env python3
"""TikTok Content Posting API — video upload and publish."""
import requests, json, os, time, sys
from pathlib import Path

sys.path.insert(0, "/work/viktor-spaces/on-mange-quoi/tiktok-automation")
from auth import get_valid_token
from config import load_tokens

API_BASE = "https://open.tiktokapis.com/v2"


def query_creator_info() -> dict:
    """Query the authorized creator's info (required before posting)."""
    token = get_valid_token()
    if not token:
        return {"error": "No valid token"}

    resp = requests.post(
        f"{API_BASE}/post/publish/creator_info/query/",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
    )
    data = resp.json()
    print(f"Creator info: {json.dumps(data, indent=2)}")
    return data


def post_video_file(
    video_path: str,
    title: str,
    privacy_level: str = "PUBLIC_TO_EVERYONE",
    disable_comment: bool = False,
    disable_duet: bool = False,
    disable_stitch: bool = False,
    cover_timestamp_ms: int = 1000,
) -> dict:
    """Upload and publish a video from local file to TikTok.
    
    privacy_level: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, SELF_ONLY
    """
    token = get_valid_token()
    if not token:
        return {"error": "No valid token"}

    video_size = os.path.getsize(video_path)
    chunk_size = min(video_size, 10_000_000)  # 10MB max chunk
    total_chunks = (video_size + chunk_size - 1) // chunk_size

    print(f"📹 Uploading video: {video_path} ({video_size} bytes, {total_chunks} chunks)")
    print(f"📝 Title: {title}")

    # Step 1: Init upload
    init_resp = requests.post(
        f"{API_BASE}/post/publish/video/init/",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "post_info": {
                "title": title,
                "privacy_level": privacy_level,
                "disable_duet": disable_duet,
                "disable_comment": disable_comment,
                "disable_stitch": disable_stitch,
                "video_cover_timestamp_ms": cover_timestamp_ms,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": video_size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunks,
            },
        },
    )
    init_data = init_resp.json()
    print(f"Init response: {json.dumps(init_data, indent=2)}")

    if init_data.get("error", {}).get("code") != "ok":
        return {"error": f"Init failed: {init_data}"}

    upload_url = init_data["data"]["upload_url"]
    publish_id = init_data["data"]["publish_id"]

    # Step 2: Upload video chunks
    with open(video_path, "rb") as f:
        for chunk_idx in range(total_chunks):
            chunk_data = f.read(chunk_size)
            start = chunk_idx * chunk_size
            end = start + len(chunk_data) - 1

            print(f"  Uploading chunk {chunk_idx + 1}/{total_chunks} (bytes {start}-{end})")
            upload_resp = requests.put(
                upload_url,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{video_size}",
                    "Content-Type": "video/mp4",
                },
                data=chunk_data,
            )
            print(f"  Chunk {chunk_idx + 1} status: {upload_resp.status_code}")
            if upload_resp.status_code not in (200, 201, 206):
                return {"error": f"Upload chunk {chunk_idx + 1} failed: {upload_resp.text}"}

    print(f"✅ Upload complete. Publish ID: {publish_id}")

    # Step 3: Check publish status
    time.sleep(5)
    status = check_publish_status(publish_id)
    return {"publish_id": publish_id, "status": status}


def post_video_url(
    video_url: str,
    title: str,
    privacy_level: str = "PUBLIC_TO_EVERYONE",
    disable_comment: bool = False,
) -> dict:
    """Publish a video from URL (must be from verified domain)."""
    token = get_valid_token()
    if not token:
        return {"error": "No valid token"}

    print(f"📹 Posting video from URL: {video_url}")
    print(f"📝 Title: {title}")

    resp = requests.post(
        f"{API_BASE}/post/publish/video/init/",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "post_info": {
                "title": title,
                "privacy_level": privacy_level,
                "disable_comment": disable_comment,
            },
            "source_info": {
                "source": "PULL_FROM_URL",
                "video_url": video_url,
            },
        },
    )
    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    return data


def check_publish_status(publish_id: str) -> dict:
    """Check the status of a video publish."""
    token = get_valid_token()
    if not token:
        return {"error": "No valid token"}

    resp = requests.post(
        f"{API_BASE}/post/publish/status/fetch/",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={"publish_id": publish_id},
    )
    data = resp.json()
    print(f"Publish status: {json.dumps(data, indent=2)}")
    return data


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "info":
        query_creator_info()
    elif len(sys.argv) > 2:
        result = post_video_file(sys.argv[1], sys.argv[2])
        print(json.dumps(result, indent=2))
    else:
        print("Usage:")
        print("  python post_video.py info                    # Query creator info")
        print("  python post_video.py <video_path> <title>    # Upload and post video")
