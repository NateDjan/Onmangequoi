"""
UTM link builder for Instagram / social media posts.

Usage:
    from utm_links import utm_url

    url = utm_url("feed", campaign="poulet_curry")
    # → https://onmangequoi.net?utm_source=instagram&utm_medium=social&utm_campaign=feed&utm_content=poulet_curry
"""

from urllib.parse import urlencode

BASE_URL = "https://onmangequoi.net"


def utm_url(
    campaign: str = "bio",
    content: str | None = None,
    source: str = "instagram",
    medium: str = "social",
    base: str = BASE_URL,
) -> str:
    """Build a URL with UTM parameters.

    Args:
        campaign: stories | feed | reels | bio | triptych
        content:  optional post identifier (slug, topic, etc.)
        source:   traffic source (default: instagram)
        medium:   traffic medium (default: social)
        base:     base URL
    """
    params: dict[str, str] = {
        "utm_source": source,
        "utm_medium": medium,
        "utm_campaign": campaign,
    }
    if content:
        # keep it URL-safe and short
        params["utm_content"] = content[:80].replace(" ", "_").lower()
    return f"{base}?{urlencode(params)}"


# Short aliases
def feed_url(content: str | None = None) -> str:
    return utm_url("feed", content=content)

def stories_url(content: str | None = None) -> str:
    return utm_url("stories", content=content)

def reels_url(content: str | None = None) -> str:
    return utm_url("reels", content=content)

def bio_url() -> str:
    return utm_url("bio")

def triptych_url(content: str | None = None) -> str:
    return utm_url("triptych", content=content)


if __name__ == "__main__":
    print("Feed:", feed_url("poulet_curry"))
    print("Stories:", stories_url("astuce_conservation"))
    print("Reels:", reels_url("recette_express"))
    print("Bio:", bio_url())
    print("Triptych:", triptych_url("3_plats_from_frigo"))
