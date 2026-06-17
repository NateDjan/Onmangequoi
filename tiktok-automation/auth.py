#!/usr/bin/env python3
"""TikTok OAuth2 token exchange and refresh."""
import requests, json, sys, time
from config import load_config, load_tokens, save_tokens

API_BASE = "https://open.tiktokapis.com/v2"


def exchange_code(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    cfg = load_config()
    resp = requests.post(
        f"{API_BASE}/oauth/token/",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_key": cfg["tiktok_client_key"],
            "client_secret": cfg["tiktok_client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": cfg["tiktok_redirect_uri"],
        },
    )
    data = resp.json()
    print(json.dumps(data, indent=2))

    if "access_token" in data:
        tokens = {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "open_id": data["open_id"],
            "expires_in": data.get("expires_in", 86400),
            "refresh_expires_in": data.get("refresh_expires_in", 31536000),
            "obtained_at": int(time.time()),
            "scope": data.get("scope", ""),
        }
        save_tokens(tokens)
        print(f"\n✅ Tokens saved! Open ID: {tokens['open_id']}")
        return tokens
    else:
        print(f"\n❌ Error: {data}")
        return data


def refresh_access_token() -> dict | None:
    """Refresh the access token using the refresh token."""
    cfg = load_config()
    tokens = load_tokens()
    if not tokens:
        print("❌ No tokens found. Run exchange_code first.")
        return None

    resp = requests.post(
        f"{API_BASE}/oauth/token/",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_key": cfg["tiktok_client_key"],
            "client_secret": cfg["tiktok_client_secret"],
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
        },
    )
    data = resp.json()

    if "access_token" in data:
        tokens["access_token"] = data["access_token"]
        tokens["refresh_token"] = data.get("refresh_token", tokens["refresh_token"])
        tokens["expires_in"] = data.get("expires_in", 86400)
        tokens["obtained_at"] = int(time.time())
        save_tokens(tokens)
        print("✅ Access token refreshed.")
        return tokens
    else:
        print(f"❌ Refresh failed: {data}")
        return None


def get_valid_token() -> str | None:
    """Get a valid access token, refreshing if expired."""
    tokens = load_tokens()
    if not tokens:
        return None

    elapsed = int(time.time()) - tokens["obtained_at"]
    if elapsed >= tokens["expires_in"] - 300:  # 5 min buffer
        print("Token expired, refreshing...")
        tokens = refresh_access_token()
        if not tokens:
            return None

    return tokens["access_token"]


if __name__ == "__main__":
    if len(sys.argv) > 1:
        code = sys.argv[1]
        exchange_code(code)
    else:
        # Try to refresh
        token = get_valid_token()
        if token:
            print(f"✅ Valid token: {token[:20]}...")
        else:
            print("❌ No valid token. Pass auth code as argument: python auth.py <code>")
