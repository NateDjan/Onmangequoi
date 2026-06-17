"""TikTok automation config loader."""
import json
from pathlib import Path

CONFIG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/config.json")
TOKEN_PATH = Path("/work/viktor-spaces/on-mange-quoi/tiktok-automation/tiktok_tokens.json")

def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())

def load_tokens() -> dict | None:
    if TOKEN_PATH.exists():
        return json.loads(TOKEN_PATH.read_text())
    return None

def save_tokens(tokens: dict):
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2))
