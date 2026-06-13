"""SSRF (Server-Side Request Forgery) guard for user-supplied URLs.

Provides a hostname resolver that rejects non-public IP ranges before any
outbound connection is made, and an httpx event hook that re-validates the
target after each redirect so a public URL cannot 302 into an internal one.

Usage:
    from utils.ssrf_guard import assert_public_url, ssrf_guard_event_hooks

    # Before connecting (fast path, no network):
    assert_public_url("https://example.com/image.jpg")

    # As httpx event hooks (re-validates on every redirect):
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        event_hooks=ssrf_guard_event_hooks(),
    ) as client:
        ...
"""
import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException

# ---------------------------------------------------------------------------
# Private / non-public IP ranges to block
# ---------------------------------------------------------------------------

_BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    # RFC 1918 private
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Link-local (includes AWS/GCP/Azure metadata 169.254.169.254)
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
    # Unique Local Address (IPv6 private)
    ipaddress.ip_network("fc00::/7"),
    # Unspecified / "this host"
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::/128"),
    # Carrier-grade NAT
    ipaddress.ip_network("100.64.0.0/10"),
    # Multicast
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("ff00::/8"),
    # Other reserved (documentation, benchmarking, etc.)
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("240.0.0.0/4"),
]


def _is_blocked_ip(addr: str) -> bool:
    """Return True if the resolved IP address falls in a non-public range."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        # Not a parseable IP — treat as blocked (shouldn't happen after resolution)
        return True
    return any(ip in net for net in _BLOCKED_NETWORKS)


def _resolve_and_check(hostname: str) -> None:
    """Resolve *hostname* to IP addresses and raise HTTPException(422) if any
    resolved address is in a non-public range.

    Uses getaddrinfo so it works for both A and AAAA records.
    """
    try:
        results = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not resolve host '{hostname}': {exc}",
        )

    for _family, _type, _proto, _canonname, sockaddr in results:
        ip_str = sockaddr[0]
        if _is_blocked_ip(ip_str):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"URL resolves to a non-public address ({ip_str}) "
                    "and cannot be fetched server-side"
                ),
            )


def assert_public_url(url: str) -> None:
    """Validate *url* scheme and resolve hostname; raise HTTPException(422) if
    the URL is not a public HTTP/HTTPS target.

    Call this before opening any outbound connection to a user-supplied URL.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=422, detail="source_url must be http(s)")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=422, detail="source_url has no hostname")
    _resolve_and_check(hostname)


def ssrf_guard_event_hooks() -> dict:
    """Return an httpx ``event_hooks`` dict that re-validates the target URL
    after every redirect response.

    Pass this to ``httpx.AsyncClient(event_hooks=ssrf_guard_event_hooks())``.
    Each redirect response carries the ``Location`` header the client is about
    to follow; we validate that destination before the follow happens.
    """

    async def _on_response(response) -> None:  # type: ignore[no-untyped-def]
        # Redirect responses (3xx) carry the next Location. Validate it before
        # the client follows the redirect. Non-redirect responses are no-ops.
        if response.is_redirect:
            location = response.headers.get("location", "")
            if location:
                try:
                    assert_public_url(location)
                except HTTPException as exc:
                    # Re-raise so the caller gets a clean 422; httpx will not
                    # follow this redirect.
                    raise exc

    return {"response": [_on_response]}
