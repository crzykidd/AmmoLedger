/**
 * Custom sanitizer models for AmmoLedger.
 *
 * Declares specific functions as path-injection sanitizers so
 * CodeQL's py/path-injection query recognizes them. Each sanitizer
 * is scoped to a fully-qualified module + function name — a copy
 * of the function elsewhere in the codebase will NOT be treated
 * as a sanitizer unless explicitly added here.
 *
 * Background on why this exists:
 *   backend/utils/firearm_photos.py implements three layers of
 *   defense against path injection in firearm photo storage:
 *
 *   1. _sanitize_filename(str) -> str
 *      Whitelist regex matching exactly `<32-hex-chars>(_thumb)?.jpg`.
 *      Reject anything else with ValueError before filesystem use.
 *
 *   2. _sanitize_firearm_id(int) -> int
 *      Type-check + non-negative guard. FastAPI's int typing
 *      handles type enforcement at the route boundary, but this
 *      makes the helper safe to call from any future code path.
 *
 *   3. _safe_resolve_under_root(Path) -> Path
 *      Resolves the candidate and asserts it stays under
 *      ${UPLOADS_PATH}/firearm_photos/. Catches symlink escape
 *      and ".." escapes.
 *
 *   The CodeQL default py/path-injection query doesn't model these
 *   functions, so it traces taint through them and flags every
 *   downstream filesystem operation. This library teaches it that
 *   our specific functions break the taint flow.
 */

import python
import semmle.python.dataflow.new.DataFlow
import semmle.python.dataflow.new.TaintTracking
import semmle.python.ApiGraphs
import semmle.python.security.dataflow.PathInjectionCustomizations

/**
 * `_sanitize_filename` enforces a strict whitelist via a regex that
 * rejects any character outside `[0-9a-f._]` and any non-matching
 * filename. The returned string is safe to use in path construction.
 */
private class FilenameSanitizer extends PathInjection::Sanitizer {
  FilenameSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_filename")
          .getACall()
  }
}

/**
 * `_sanitize_firearm_id` enforces `isinstance(x, int) and not bool
 * and x >= 0`. The returned int is safe for path construction.
 */
private class FirearmIdSanitizer extends PathInjection::Sanitizer {
  FirearmIdSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_firearm_id")
          .getACall()
  }
}

/**
 * `_safe_resolve_under_root` resolves a candidate Path and raises
 * ValueError if the result escapes the configured photos root.
 * Returns a Path guaranteed to live under that root.
 */
private class RootContainmentSanitizer extends PathInjection::Sanitizer {
  RootContainmentSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_safe_resolve_under_root")
          .getACall()
  }
}

/**
 * `_sanitize_uploads_path` validates UPLOADS_PATH at module load
 * and returns the absolute-path string. The cached
 * `_SAFE_UPLOADS_PATH` flows from this function's return value.
 */
private class UploadsPathSanitizer extends PathInjection::Sanitizer {
  UploadsPathSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_uploads_path")
          .getACall()
  }
}
