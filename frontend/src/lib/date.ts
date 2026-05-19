/**
 * Parse a plain date string ("YYYY-MM-DD") as midnight in the user's
 * local timezone. Use this for any backend field typed as `date`
 * (Python `datetime.date`, not `datetime.datetime`) — Pydantic serializes
 * those without a time component or timezone, and treating them as UTC
 * midnight (which is what `parseISO` does) shifts the displayed day by
 * up to one day depending on the user's TZ.
 *
 * For full ISO datetime strings ("2026-05-17T14:30:00Z") continue to
 * use `parseISO` — those are correctly anchored to UTC and the
 * subsequent `format()` correctly displays them in local time.
 */
export function parseLocalDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const [, y, m, d] = match
  const year = parseInt(y, 10)
  const month = parseInt(m, 10) - 1 // JS months are 0-indexed
  const day = parseInt(d, 10)
  const date = new Date(year, month, day)
  if (isNaN(date.getTime())) return undefined
  return date
}

/**
 * Convert a fetch/axios error response into a human-readable string.
 *
 * Pydantic v2 returns validation errors as an array of error objects:
 *   { detail: [{ loc: ["body", "date"], msg: "Input should be a valid date", type: "..." }] }
 *
 * Simple errors return:
 *   { detail: "Cannot fire 50 rounds from box #3 — only 20 remaining" }
 *
 * Network errors arrive as plain Error instances with a `message` field.
 *
 * This helper handles all three shapes and returns a single string the
 * UI can show without producing `[object Object]`.
 */
export function formatBackendError(err: unknown, fallback = 'Request failed'): string {
  if (err == null) return fallback

  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message

  const e = err as { detail?: unknown; message?: string }

  if (typeof e.detail === 'string') return e.detail

  if (Array.isArray(e.detail)) {
    const messages = e.detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const obj = item as { msg?: string; loc?: unknown[] }
          if (obj.msg) {
            const field = Array.isArray(obj.loc)
              ? obj.loc.filter((p) => p !== 'body').join('.')
              : ''
            return field ? `${field}: ${obj.msg}` : obj.msg
          }
        }
        return null
      })
      .filter((m): m is string => m != null && m.length > 0)
    if (messages.length > 0) return messages.join('; ')
  }

  if (typeof e.message === 'string') return e.message

  return fallback
}
