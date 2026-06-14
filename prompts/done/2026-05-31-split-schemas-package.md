---
name: 2026-05-31-split-schemas-package
status: completed        # pending | completed | failed
created: 2026-05-31
model: sonnet            # opus = research/planning, sonnet = coding
completed: 2026-05-31    # filled when the work is done
result: Split schemas.py (1,417 LOC / 102 classes) into schemas/ package (_base + 8 domain modules + re-exporting __init__); drop-in, zero behavioral change. Parity/import/ruff clean; pytest 221 passed (1 pre-existing unrelated fail).
---

# Task: Split backend/schemas.py into a per-domain schemas/ package

`backend/schemas.py` is 1,417 LOC / 103 Pydantic classes in one file, so every
backend task that touches any schema loads all 103. Split it into a `backend/schemas/`
package of small per-domain modules with a re-exporting `__init__.py`, so **every
existing `from schemas import X` keeps working unchanged**. Pure restructuring — ZERO
behavioral change. This is a token-footprint reduction (see decisions.md entry from the
context-engine ROI audit); it is not a feature.

## Before you start

- Read `CLAUDE.md` (commit style, check-in rules) and `standards.md`.
- Imports across the app are flat (`from schemas import ...`, `from models import ...`),
  run with `backend/` on the path. Do NOT introduce an `app.` or `backend.` prefix.
- You should NOT need to free-search: the full class→module map is in this prompt. If the
  vexp daemon is healthy, honor the guard hook (no `Grep`/`Glob`); use `get_skeleton`/`Read`
  only to confirm a class body before moving it. The vexp index will be stale after this
  split — that is expected and out of scope.

## Working tree check

Before making any edits, run `git status --porcelain` and cross-reference the files this
plan modifies (`backend/schemas.py` → `backend/schemas/`). If any have uncommitted
changes, list them and ask before touching. Surface unrelated dirty files once; don't
block. This prompt file is exempt.

## What to do

1. Create branch per CLAUDE.md (work on `dev` or a short-lived branch off `dev`).
2. Capture the baseline public API BEFORE editing — this is the contract to preserve:
   `python -c "import schemas, json; print(json.dumps(sorted(n for n in dir(schemas) if not n.startswith('_'))))"`
   Save the output.
3. Create `backend/schemas/_base.py` with the shared pieces, copied verbatim:
   `from __future__ import annotations`, the stdlib/pydantic imports it needs,
   `_NAIVE_ISO_RE`, `_Date` (the `date` alias WITH its explanatory comment), and
   `_OrmBase` (the `from_attributes=True` base + the `_serialize_utc` model_serializer).
4. Create the 8 domain modules below, copying each class verbatim. Each module starts with
   `from __future__ import annotations`, imports what it needs from `._base`
   (e.g. `from ._base import _OrmBase, _Date`), re-imports its own stdlib/pydantic deps,
   and keeps its own private helpers/constants:
   - `_validate_mfr_types`, `_VALID_MFR_TYPES` → lookups
   - `_validate_hex_color`, `_HEX_COLOR_RE` → firearms
   - `_VALID_FIREARM_TYPES`, `_VALID_FIREARM_EVENT_TYPES`, `_VALID_WEIGHT_UNITS` → firearms

   **schemas/lookups.py** — LookupRead, LookupCreate, ManufacturerRead,
   ManufacturerCreate, ManufacturerUpdate, DealerRead, DealerCreate, DealerUpdate,
   LocationRead, LocationCreate, ContainerRead, ContainerCreate, LookupUpdate

   **schemas/firearms.py** (lookups + registry + log + photos kept together — FirearmRead
   references FirearmComplianceTagRead/FirearmUserTagRead) — FirearmActionTypeRead,
   FirearmActionTypeCreate, FirearmActionTypeUpdate, FirearmModelRead, FirearmModelCreate,
   FirearmModelUpdate, FirearmFrameSizeRead, FirearmFrameSizeCreate, FirearmFrameSizeUpdate,
   FirearmConditionRead, FirearmConditionCreate, FirearmConditionUpdate, FirearmOpticCutRead,
   FirearmOpticCutCreate, FirearmOpticCutUpdate, FirearmRailTypeRead, FirearmRailTypeCreate,
   FirearmRailTypeUpdate, FirearmFinishRead, FirearmFinishCreate, FirearmFinishUpdate,
   FirearmComplianceTagRead, FirearmComplianceTagCreate, FirearmComplianceTagUpdate,
   FirearmUserTagRead, FirearmUserTagCreate, FirearmUserTagUpdate, FirearmCreate,
   FirearmPhotoRead, FirearmPhotoReorderItem, FirearmPhotoReorderRequest, FirearmRead,
   FirearmUpdate, FirearmLogCreate, FirearmLogRead, FirearmLogUpdate

   **schemas/products.py** — ProductRead, ProductCreate, ProductUpdate,
   ProductUpdateResponse, AutoGenerateResponse, ImagePreviewRequest, ImageCropBox,
   ImageFromSearchRequest

   **schemas/ammo.py** (ammo box + expenditure — ExpendResponse/SplitResponse reference
   AmmoBoxRead/ExpenditureRead) — AmmoBoxRead, AmmoBoxCreate, AmmoBoxUpdate,
   AmmoListResponse, SplitParentRead, ExpenditureRead, ExpendRequest, ExpendResponse,
   SplitChildSpec, SplitRequest, SplitResponse

   **schemas/range.py** — RangeSessionLineCreate, RangeSessionLineRead,
   RangeSessionLineUpdate, RangeSessionCreate, RangeSessionRead, RangeSessionUpdate,
   RangeSessionListItem  (RangeSessionUpdate.date uses `_Date` from `._base` — keep it)

   **schemas/users.py** — UserRead, UserUpdate, RegisterRequest, PasswordResetRequest,
   ChangePasswordRequest, InvitationCreate, InvitationRead, InviteRead

   **schemas/thresholds.py** — ThresholdDefaultUpdate, CaliberThresholdRead,
   CaliberThresholdCreate, LocationThresholdRead, LocationThresholdCreate,
   LowStockCaliberItem, LowStockLocationItem, LowStockResponse, CaliberStatus,
   LocationStatus, ThresholdStatusResponse

   **schemas/system.py** — BulkAmmoUpdate, BulkUpdateRequest, BulkUpdateResponse,
   RecentExpenditureRead, TaskHistoryRead, TaskRegistryRead, TaskRegistryUpdate,
   NotificationRead

5. Give each domain module an explicit `__all__` listing its public class names.
6. Write `backend/schemas/__init__.py`: a module docstring that is a "where things live"
   map (one line per module), then `from .<module> import *` for all 8 domains, then a
   package-level `__all__` = the union. Do NOT re-export the private `_`-prefixed helpers.
7. Delete `backend/schemas.py`.
8. If Pydantic raises forward-ref / `model_rebuild` errors on import, a class landed in the
   wrong module (every reference in the map is within-module) — fix placement first; call
   `model_rebuild()` only if genuinely needed.

## Conventions to honor

- No behavioral change: do not add/remove fields, validators, configs, or `extra="forbid"`.
  Copy classes verbatim; only file location changes.
- Do not edit any router, test, model, or migration import line. The package is a drop-in.
- `chore:` commit (no-behavior refactor). `dev` branch, never `main`. No `Co-authored-by:`.
- PRD/README likely need no update (internal code layout, no user/operator/arch change) —
  confirm and skip unless you judge a one-liner is warranted; if so, same commit.

## Verification — all must pass before done

1. **Public-API parity:** re-run the step-2 command; assert the sorted public-name list is
   IDENTICAL to baseline (same 103 names, none missing/extra). Print a diff if not.
2. **App import smoke test:** `python -c "import main"` from `backend/` succeeds (proves
   `from schemas import X` still resolves across every router).
3. **Test suite:** find the invocation in CLAUDE.md or the `running-backend-tests`
   auto-memory (do not guess); run it; results must match pre-change (all green).
4. **Lint:** `ruff check backend/schemas/` clean per the repo `ruff.toml`.

## When done

1. Update this file's frontmatter: `status`, `completed` (2026-05-31 or actual), `result`.
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record decisions in `docs/decisions.md` (newest at top) — see the prepared entry.
4. Propose ONE commit covering the modified paths (including the prompt move). Present the
   file list and ask `commit these as "chore: split backend schemas.py into per-domain
   schemas/ package"? (y/n)`. On `y`, stage those specific paths and commit on `dev`.
   Never `git add -A`. Never push.
