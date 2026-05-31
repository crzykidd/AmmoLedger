"""Pydantic request/response schemas, split into per-domain modules.

This package re-exports every schema class so existing imports
(`from schemas import X`) keep working unchanged. Where things live:

- _base       — shared base (`_OrmBase`, `_Date`, UTC serializer, naive-ISO regex)
- lookups     — calibers/manufacturers/dealers/locations/containers lookups
- firearms    — firearm lookups, registry, event log, and photos
- products    — product catalog + image-search/crop helpers
- ammo        — ammo boxes, expenditures, and split box
- range       — range sessions and their lines
- users       — users, registration, password mgmt, invitations
- thresholds  — caliber/location stock thresholds and low-stock status
- system      — bulk update, recent expenditures, tasks, notifications
"""

from __future__ import annotations

# Incidental re-exports. These stdlib / typing / pydantic names leaked into the
# old flat `schemas` module's namespace; preserving them here keeps `dir(schemas)`
# and any `from schemas import <name>` resolving exactly as before. They are not
# part of the domain schema surface — listed in __all__ only to document the
# backward-compatibility shim.
import json  # noqa: F401
import re  # noqa: F401
from datetime import date, datetime  # noqa: F401
from typing import List, Optional  # noqa: F401

from pydantic import (  # noqa: F401
    BaseModel,
    ConfigDict,
    field_validator,
    model_serializer,
)

from . import (
    ammo,
    firearms,
    lookups,
    products,
    range,
    system,
    thresholds,
    users,
)
from .ammo import *  # noqa: F401,F403
from .firearms import *  # noqa: F401,F403
from .lookups import *  # noqa: F401,F403
# Private helper re-export — routers/lookups.py imports it via `from schemas import _validate_mfr_types`.
from .lookups import _validate_mfr_types  # noqa: F401
from .products import *  # noqa: F401,F403
from .range import *  # noqa: F401,F403
from .system import *  # noqa: F401,F403
from .thresholds import *  # noqa: F401,F403
from .users import *  # noqa: F401,F403

__all__ = [
    *lookups.__all__,
    *firearms.__all__,
    *products.__all__,
    *ammo.__all__,
    *range.__all__,
    *users.__all__,
    *thresholds.__all__,
    *system.__all__,
    # Incidental stdlib / typing / pydantic re-exports (compat shim, see above).
    "json",
    "re",
    "date",
    "datetime",
    "List",
    "Optional",
    "BaseModel",
    "ConfigDict",
    "field_validator",
    "model_serializer",
]
