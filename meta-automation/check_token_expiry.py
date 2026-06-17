#!/usr/bin/env python3
"""Check if the Facebook page token is about to expire and alert via Slack"""
import json, sys, datetime, asyncio
from pathlib import Path
sys.path.insert(0, '/work')

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
config = json.loads(CONFIG_PATH.read_text())

expires_ts = config.get("token_expires_ts", 0)
if not expires_ts:
    print("No expiry info found")
    sys.exit(0)

now_ts = datetime.datetime.now().timestamp()
days_remaining = (expires_ts - now_ts) / 86400

print(f"Token expires in {days_remaining:.1f} days")

if days_remaining < 10:
    # Send Slack alert
    from sdk.utils.slack_sender import send_slack_message
    import asyncio
    
    async def alert():
        await send_slack_message(
            channel="C0B4XEB4U64",  # #on-mange-quoi
            text=f"⚠️ @Natanel DJAN le token Facebook d'*On Mange Quoi?* expire dans *{days_remaining:.0f} jours*. Pour renouveler, génère un nouveau token sur developers.facebook.com et envoie-le moi !",
        )
    
    asyncio.run(alert())
    print(f"Alert sent! {days_remaining:.1f} days remaining")
