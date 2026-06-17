"""
Image deduplication for On Mange Quoi social posts.

Rules:
  1. Never use the same image PROMPT keyword combo within 30 days
  2. Never post the same dish SUBJECT (normalized name) within 30 days  
  3. Stores a rolling log of all posted image prompts + timestamps

Usage:
    from image_dedup import ImageDedup
    dedup = ImageDedup()
    
    # Check before generating
    if dedup.is_duplicate(dish_name):
        dish_name = dedup.suggest_alternative(dish_name, candidates)
    
    # Register after posting
    dedup.register(dish_name, image_prompt)
"""
import json, re, hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

IMAGE_LOG_PATH = Path("/work/viktor-spaces/on-mange-quoi/meta-automation/image_log.json")
DEDUP_DAYS = 30  # Never repeat within this many days


def _normalize(text: str) -> str:
    """Lowercase, remove accents approximation, strip punctuation for fuzzy comparison."""
    text = text.lower().strip()
    # Basic accent normalization
    replacements = {'é':'e','è':'e','ê':'e','ë':'e','à':'a','â':'a','ô':'o','û':'u','ù':'u','î':'i','ï':'i','ç':'c','œ':'oe','æ':'ae'}
    for fr, en in replacements.items():
        text = text.replace(fr, en)
    # Remove punctuation, keep spaces and alphanumeric
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _key_words(text: str) -> set:
    """Extract meaningful keywords (>3 chars) from normalized text."""
    stop = {'avec','pour','les','des','une','sur','par','dans','aux','son','ses','que','qui','est','pas'}
    return {w for w in _normalize(text).split() if len(w) > 3 and w not in stop}


class ImageDedup:
    def __init__(self):
        self.log = self._load()
    
    def _load(self) -> list:
        if IMAGE_LOG_PATH.exists():
            try:
                return json.loads(IMAGE_LOG_PATH.read_text())
            except Exception:
                return []
        return []
    
    def _save(self):
        IMAGE_LOG_PATH.write_text(json.dumps(self.log, ensure_ascii=False, indent=2))
    
    def _recent_entries(self) -> list:
        """Return entries from the last DEDUP_DAYS days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=DEDUP_DAYS)
        recent = []
        for entry in self.log:
            try:
                ts = datetime.fromisoformat(entry["posted_at"])
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if ts > cutoff:
                    recent.append(entry)
            except Exception:
                pass
        return recent
    
    def _similarity_score(self, a: str, b: str) -> float:
        """0.0 (different) → 1.0 (identical) keyword overlap score."""
        words_a = _key_words(a)
        words_b = _key_words(b)
        if not words_a or not words_b:
            return 0.0
        overlap = words_a & words_b
        return len(overlap) / max(len(words_a), len(words_b))
    
    def is_duplicate(self, dish_name: str, threshold: float = 0.4) -> bool:
        """Return True if this dish is too similar to a recent post.
        
        Checks both dish name AND ingredient keywords for overlap.
        Threshold lowered to 0.4 (was 0.5) to catch more near-duplicates.
        """
        recent = self._recent_entries()
        new_kw = _key_words(dish_name)
        for entry in recent:
            # Check dish name similarity
            score = self._similarity_score(dish_name, entry.get("dish_name", ""))
            if score >= threshold:
                days_ago = (datetime.now(timezone.utc) - datetime.fromisoformat(entry["posted_at"]).replace(tzinfo=timezone.utc)).days
                print(f"  ⚠️  DEDUP: '{dish_name}' ~ '{entry['dish_name']}' ({score:.0%} overlap, {days_ago}d ago)")
                return True
            # Also check keyword overlap with stored keywords
            entry_kw = set(entry.get("keywords", []))
            if new_kw and entry_kw:
                kw_overlap = len(new_kw & entry_kw) / max(len(new_kw), len(entry_kw))
                if kw_overlap >= threshold:
                    days_ago = (datetime.now(timezone.utc) - datetime.fromisoformat(entry["posted_at"]).replace(tzinfo=timezone.utc)).days
                    print(f"  ⚠️  DEDUP KW: '{dish_name}' shares keywords with '{entry.get('dish_name','')}' ({kw_overlap:.0%}, {days_ago}d ago)")
                    return True
        return False
    
    def is_prompt_duplicate(self, image_description: str, threshold: float = 0.6) -> bool:
        """Return True if this image prompt is too similar to a recent one."""
        recent = self._recent_entries()
        for entry in recent:
            score = self._similarity_score(image_description, entry.get("image_prompt", ""))
            if score >= threshold:
                print(f"  ⚠️  DEDUP PROMPT: {score:.0%} overlap with post from {entry.get('posted_at','?')[:10]}")
                return True
        return False
    
    def get_recent_subjects(self) -> list[str]:
        """List of dish names posted recently (for logging/debugging)."""
        return [e.get("dish_name", "?") for e in self._recent_entries()]
    
    def register(self, dish_name: str, image_prompt: str, pillar: str = "", post_ids: dict = None):
        """Log a successfully posted image."""
        # Combine dish name + image prompt for richer keyword extraction
        all_keywords = _key_words(dish_name) | _key_words(image_prompt)
        entry = {
            "posted_at": datetime.now(timezone.utc).isoformat(),
            "dish_name": dish_name,
            "image_prompt": image_prompt[:300],  # truncate for storage
            "pillar": pillar,
            "post_ids": post_ids or {},
            "keywords": list(all_keywords),
        }
        self.log.append(entry)
        # Keep only last 200 entries
        if len(self.log) > 200:
            self.log = self.log[-200:]
        self._save()
        print(f"  ✅ Registered: '{dish_name}' ({pillar})")
    
    def cleanup_old(self):
        """Remove entries older than 60 days to keep file small."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=60)
        before = len(self.log)
        self.log = [e for e in self.log if datetime.fromisoformat(e["posted_at"]).replace(tzinfo=timezone.utc) > cutoff]
        removed = before - len(self.log)
        if removed:
            self._save()
            print(f"  🧹 Cleaned {removed} old entries from image log")
    
    def stats(self) -> dict:
        recent = self._recent_entries()
        return {
            "total_logged": len(self.log),
            "recent_30d": len(recent),
            "recent_subjects": [e["dish_name"] for e in recent[-10:]],
        }


if __name__ == "__main__":
    d = ImageDedup()
    print(json.dumps(d.stats(), ensure_ascii=False, indent=2))
