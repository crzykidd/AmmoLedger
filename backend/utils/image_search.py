from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from utils.config import get_config
from utils.logging import get_logger

logger = get_logger(__name__)


class ImageSearchNotConfigured(Exception):
    """Raised when the image search feature is disabled or misconfigured."""


@dataclass
class ImageSearchResult:
    url: str
    thumbnail_url: str
    width: int | None
    height: int | None
    source_page_url: str | None
    title: str | None


class ImageSearchProvider(Protocol):
    async def search(self, query: str, page: int = 0) -> list[ImageSearchResult]: ...


class BraveImageSearchProvider:
    ENDPOINT = "https://api.search.brave.com/res/v1/images/search"

    def __init__(self, api_key: str, results_per_page: int, safe_search: str):
        self.api_key = api_key
        self.results_per_page = results_per_page
        self.safe_search = safe_search

    async def search(self, query: str, page: int = 0) -> list[ImageSearchResult]:
        params = {
            "q": query,
            "count": self.results_per_page,
            "offset": page * self.results_per_page,
            "safesearch": self.safe_search,
            "country": "US",
        }
        headers = {
            "X-Subscription-Token": self.api_key,
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.ENDPOINT, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        results: list[ImageSearchResult] = []
        for item in data.get("results", []):
            thumb = item.get("thumbnail", {}).get("src") or item.get("url")
            full = item.get("properties", {}).get("url") or item.get("url")
            if not full:
                continue
            results.append(ImageSearchResult(
                url=full,
                thumbnail_url=thumb or full,
                width=item.get("properties", {}).get("width"),
                height=item.get("properties", {}).get("height"),
                source_page_url=item.get("source") or item.get("page_fetched"),
                title=item.get("title"),
            ))
        return results


def get_provider() -> ImageSearchProvider:
    cfg = get_config().get("image_search", {})
    if not cfg.get("enabled"):
        raise ImageSearchNotConfigured("Image search is disabled in config")
    api_key = cfg.get("api_key", "")
    if not api_key:
        raise ImageSearchNotConfigured("Image search API key not set")
    provider_name = cfg.get("provider", "brave")
    if provider_name == "brave":
        return BraveImageSearchProvider(
            api_key=api_key,
            results_per_page=cfg.get("results_per_page", 10),
            safe_search=cfg.get("safe_search", "strict"),
        )
    raise ImageSearchNotConfigured(f"Unknown image search provider: {provider_name}")


def is_enabled() -> bool:
    """Cheap check used by /system/version — does not raise."""
    cfg = get_config().get("image_search", {})
    return bool(cfg.get("enabled")) and bool(cfg.get("api_key"))
