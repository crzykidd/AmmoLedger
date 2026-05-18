# Negative test for custom sanitizer scope

The custom sanitizers in `AmmoLedgerSanitizers.qll` declare
exactly four functions as path-injection sanitizers:

- `utils.firearm_photos._sanitize_filename`
- `utils.firearm_photos._sanitize_firearm_id`
- `utils.firearm_photos._safe_resolve_under_root`
- `utils.firearm_photos._sanitize_uploads_path`

These declarations are **fully-qualified** to the module +
function name. The custom model does NOT match:

- Functions named `_sanitize_*` in any other module
- Functions in `utils.firearm_photos` other than the four listed
- Functions imported from elsewhere into `utils.firearm_photos`

## How to verify the scope manually

If you want to confirm CodeQL still catches path-injection bugs
outside of `firearm_photos.py`, do this **manually in a scratch
branch** (not committed to dev or main):

1. Create `backend/utils/path_injection_canary.py` with the
   following intentionally-vulnerable code:

   ```python
   """DELETE BEFORE COMMITTING. Verification canary for CodeQL
   custom-model scope. This file is INTENTIONALLY VULNERABLE
   and must never reach main."""
   from pathlib import Path
   from fastapi import APIRouter

   router = APIRouter()

   @router.get("/canary/{filename}")
   def canary(filename: str) -> bytes:
       # No sanitization. CodeQL must flag this with
       # py/path-injection. If it does not, the custom model
       # has been over-scoped and is silencing real findings.
       return Path("/data") / filename
   ```

2. Push the scratch branch, wait for CodeQL to run.

3. Open the PR's Security tab. You MUST see a
   `py/path-injection` finding on the `Path("/data") / filename`
   line. If you see one: the scope is correct. **Delete the
   canary file before merging anything from the scratch branch.**

4. If you do NOT see a finding: the custom model has accidentally
   over-broad scope. Read `AmmoLedgerSanitizers.qll` and confirm
   each `PathInjection::Sanitizer` extends with a fully-qualified
   `API::moduleImport(...)` chain, no wildcards.

This verification is documented but not automated — making it
automated would require a CodeQL pre-merge job that injects and
removes the canary, which is operational overhead for a one-time
check.

## Added in second round

Additional sanitizer classes added in the v0.3.0 final cleanup:

**PathInjection::Sanitizer:**

- `routers.backup._sanitize_backup_filename`
- `routers.backup._sanitize_zip_entry_name`
- `routers.backup._safe_resolve_under`
- `routers.backup._safe_resolve_under_backup_root`
- `routers.backup._backup_file_path`

**LogInjection::Sanitizer:**

- `utils.logging.log_safe`
- `utils.firearm_photos._sanitize_filename`
- `utils.firearm_photos._sanitize_firearm_id`
- `utils.firearm_photos._safe_resolve_under_root`
- `utils.firearm_photos._sanitize_uploads_path`

All declarations are fully-qualified to module + function name. The
canary verification procedure described above applies equally to the
new classes — copies of these functions in other modules will NOT be
recognized as sanitizers.
