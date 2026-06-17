#!/usr/bin/env python3
"""
Refresh the Facebook page token.
Run this when notified that the token is about to expire (every ~55 days).
Natanel needs to provide a new user token from the Graph API Explorer.
"""
import json, requests, sys
from pathlib import Path

APP_ID = "1434811375344063"
APP_SECRET = "6e297cf7a49c460b66ee26618052e01f"
PAGE_ID = "1079436381928091"
CONFIG_PATH = Path(__file__).parent / "config.json"

def refresh(user_token: str):
    # Exchange for long-lived user token
    resp = requests.get("https://graph.facebook.com/v19.0/oauth/access_token",
        params={"grant_type": "fb_exchange_token", "client_id": APP_ID,
                "client_secret": APP_SECRET, "fb_exchange_token": user_token})
    data = resp.json()
    if "access_token" not in data:
        print(f"❌ Failed to exchange token: {data}")
        sys.exit(1)
    
    ll_user_token = data["access_token"]
    
    # Get permanent page token
    resp2 = requests.get("https://graph.facebook.com/v19.0/me/accounts",
        params={"access_token": ll_user_token})
    page_token = None
    for p in resp2.json().get("data", []):
        if "Mange" in p.get("name", ""):
            page_token = p["access_token"]
    
    if not page_token:
        print("❌ Could not get page token")
        sys.exit(1)
    
    # Check expiry
    resp3 = requests.get("https://graph.facebook.com/v19.0/debug_token",
        params={"input_token": page_token, "access_token": f"{APP_ID}|{APP_SECRET}"})
    info = resp3.json().get("data", {})
    expires_at = info.get("expires_at")
    
    # Update config
    import datetime
    config = json.loads(CONFIG_PATH.read_text())
    config["page_token"] = page_token
    config["token_expires_ts"] = expires_at
    config["token_expires_readable"] = datetime.datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d") if expires_at else "never"
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    print(f"✅ Token refreshed! Expires: {config['token_expires_readable']}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3.12 refresh_token.py <new_user_token>")
        sys.exit(1)
    refresh(sys.argv[1])
