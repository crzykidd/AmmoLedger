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

// ===========================================================================
// Section 2 — backup.py path-injection sanitizers
// ===========================================================================

/**
 * `routers.backup._sanitize_backup_filename` enforces a strict regex
 * matching the filename shapes AmmoLedger generates:
 *   ammoledger(_<word>)?_<YYYY-MM-DD>(_<HH-MM>)?.(db|zip|json)
 * Returns the validated filename. Raises HTTPException(400) otherwise.
 */
private class BackupFilenameSanitizer extends PathInjection::Sanitizer {
  BackupFilenameSanitizer() {
    this =
      API::moduleImport("routers")
          .getMember("backup")
          .getMember("_sanitize_backup_filename")
          .getACall()
  }
}

/**
 * `routers.backup._sanitize_zip_entry_name` validates a zip archive
 * entry name before extraction. Rejects absolute paths, null bytes,
 * Windows drive prefixes, and any '..' component.
 */
private class ZipEntryNameSanitizer extends PathInjection::Sanitizer {
  ZipEntryNameSanitizer() {
    this =
      API::moduleImport("routers")
          .getMember("backup")
          .getMember("_sanitize_zip_entry_name")
          .getACall()
  }
}

/**
 * `routers.backup._safe_resolve_under` resolves a candidate Path and
 * confirms it lives under an explicit root. Raises HTTPException(400)
 * on escape.
 */
private class BackupRootContainmentSanitizer extends PathInjection::Sanitizer {
  BackupRootContainmentSanitizer() {
    this =
      API::moduleImport("routers")
          .getMember("backup")
          .getMember("_safe_resolve_under")
          .getACall()
  }
}

/**
 * `routers.backup._safe_resolve_under_backup_root` — convenience wrapper
 * for `_safe_resolve_under(_, _backup_dir())`.
 */
private class BackupDirContainmentSanitizer extends PathInjection::Sanitizer {
  BackupDirContainmentSanitizer() {
    this =
      API::moduleImport("routers")
          .getMember("backup")
          .getMember("_safe_resolve_under_backup_root")
          .getACall()
  }
}

/**
 * `routers.backup._backup_file_path` combines `_sanitize_backup_filename`
 * + existence check + containment. The public-API helper used by the
 * download and delete endpoints.
 */
private class BackupFilePathSanitizer extends PathInjection::Sanitizer {
  BackupFilePathSanitizer() {
    this =
      API::moduleImport("routers")
          .getMember("backup")
          .getMember("_backup_file_path")
          .getACall()
  }
}

// ===========================================================================
// Section 3 — Log injection sanitizers
// ===========================================================================

import semmle.python.security.dataflow.LogInjectionCustomizations

/**
 * `utils.logging.log_safe` strips control characters (LF, CR, TAB,
 * C0 range, DEL) from any value before it's interpolated into a log
 * entry. The returned string is safe for logger.{info,warning,...} calls.
 */
private class LogSafeSanitizer extends LogInjection::Sanitizer {
  LogSafeSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("logging")
          .getMember("log_safe")
          .getACall()
  }
}

/**
 * `utils.firearm_photos._sanitize_filename` returns a regex-locked
 * UUID hex string with no control characters — safe for log use.
 */
private class FilenameLogSanitizer extends LogInjection::Sanitizer {
  FilenameLogSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_filename")
          .getACall()
  }
}

/**
 * `utils.firearm_photos._sanitize_firearm_id` returns an int which
 * %s-formats to digits only — no control characters possible.
 */
private class FirearmIdLogSanitizer extends LogInjection::Sanitizer {
  FirearmIdLogSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_firearm_id")
          .getACall()
  }
}

/**
 * `utils.firearm_photos._safe_resolve_under_root` returns a Path whose
 * string form is constrained to UPLOADS_PATH descendants — no newlines.
 */
private class RootContainmentLogSanitizer extends LogInjection::Sanitizer {
  RootContainmentLogSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_safe_resolve_under_root")
          .getACall()
  }
}

/**
 * `utils.firearm_photos._sanitize_uploads_path` validates UPLOADS_PATH
 * and returns an absolute path string constrained to safe characters.
 */
private class UploadsPathLogSanitizer extends LogInjection::Sanitizer {
  UploadsPathLogSanitizer() {
    this =
      API::moduleImport("utils")
          .getMember("firearm_photos")
          .getMember("_sanitize_uploads_path")
          .getACall()
  }
}
