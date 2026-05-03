from functools import lru_cache

import pycountry
from fastapi import APIRouter, Depends

from utils.rbac import require_auth

router = APIRouter(tags=["geo"])


@lru_cache(maxsize=1)
def _countries() -> list[dict]:
    return sorted(
        [{"code": c.alpha_2, "name": c.name} for c in pycountry.countries],
        key=lambda x: x["name"],
    )


@router.get("/countries")
def list_countries(_=Depends(require_auth)):
    return _countries()


@router.get("/subdivisions/{country_code}")
def list_subdivisions(country_code: str, _=Depends(require_auth)):
    subs = pycountry.subdivisions.get(country_code=country_code.upper()) or []
    result = []
    for sub in sorted(subs, key=lambda s: s.name):
        short_code = sub.code.split("-", 1)[-1]
        result.append({"code": short_code, "name": sub.name, "type": sub.type})
    return result
