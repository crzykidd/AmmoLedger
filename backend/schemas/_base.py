from __future__ import annotations

import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_serializer

# Matches naive ISO datetime strings: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SS.ffffff
_NAIVE_ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$')

# PEP 563 (`from __future__ import annotations`) defers annotation evaluation.
# When Pydantic resolves `Optional[date]` on a field also named `date`, the
# class attribute `date = None` shadows the imported `datetime.date` in the
# local namespace, yielding `NoneType` instead of the intended type. Using a
# private alias breaks the shadow without changing any public interface.
_Date = date


class _OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="wrap")
    def _serialize_utc(self, handler):
        data = handler(self)
        if not isinstance(data, dict):
            return data
        for key in list(data.keys()):
            v = data[key]
            if isinstance(v, datetime) and v.tzinfo is None:
                data[key] = v.isoformat() + "Z"
            elif isinstance(v, str) and _NAIVE_ISO_RE.match(v):
                data[key] = v + "Z"
        return data
