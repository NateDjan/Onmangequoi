"""
Shared configuration for On Mange Quoi? automation scripts.
Loads from the meta-automation/config.json relative to the repo root.
"""
import json
from pathlib import Path

# Auto-detect repo root (3 levels up from this file, or set explicitly)
_REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = _REPO_ROOT / "meta-automation" / "config.json"
IMAGE_LOG_PATH = _REPO_ROOT / "meta-automation" / "image_log.json"
POST_HISTORY_PATH = _REPO_ROOT / "meta-automation" / "post_history.json"

_config_cache = None

def load_config() -> dict:
    global _config_cache
    if _config_cache is None:
        _config_cache = json.loads(CONFIG_PATH.read_text())
    return _config_cache

def get_page_id() -> str:
    return load_config()["page_id"]

def get_page_token() -> str:
    return load_config()["page_token"]

def get_ig_user_id() -> str:
    return load_config()["instagram_user_id"]

def get_site_url() -> str:
    return load_config()["site_url"]
