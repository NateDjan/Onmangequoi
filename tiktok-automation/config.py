"""TikTok automation config loader — uses relative paths."""
import json
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = _REPO_ROOT / "meta-automation" / "config.json"
TOKEN_PATH = Path(__file__).resolve().parent / "tiktok_tokens.json"

def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())

def load_tokens() -> dict | None:
    if TOKEN_PATH.exists():
        return json.loads(TOKEN_PATH.read_text())
    return None

def save_tokens(tokens: dict):
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2))
