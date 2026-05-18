/**
 * Build a consistent label for a firearm across all display surfaces.
 *
 * Rules:
 * - If nickname is set: primary = "{nickname} — {manufacturer} {display_model}"
 * - If nickname is null: primary = "{manufacturer} {display_model}"
 * - Caliber is always secondary (muted, parenthesized in most surfaces)
 *
 * This is the canonical firearm-label builder. Every render site that
 * shows "what firearm is this" should call this function — never build
 * the label inline.
 */

/** Minimum shape required to build a label. Accepting a structural type
 *  rather than the full FirearmRead lets call sites pass partial objects
 *  (e.g. a slim firearm reference embedded in another response shape). */
export interface FirearmLabelSource {
  nickname?: string | null
  manufacturer_name?: string | null
  display_model?: string | null
  custom_model_name?: string | null
  caliber_name?: string | null
}

/** Pre-split label, for JSX rendering where the two halves get different
 *  styles (e.g. nickname bold, make/model muted). */
export interface FirearmLabelParts {
  /** What to render as the headline. Always non-empty (falls back to
   *  "Firearm" if everything else is missing). */
  primary: string
  /** Make/model context when nickname is the primary. Empty string when
   *  nickname is null (since make/model is already the primary then). */
  contextSuffix: string
  /** Caliber suffix, never empty unless the firearm has no caliber row.
   *  Includes the parens for the caller's convenience. */
  caliberSuffix: string
}

function makeMakeModel(f: FirearmLabelSource): string {
  const mfr = (f.manufacturer_name ?? '').trim()
  const model = (f.display_model ?? f.custom_model_name ?? '').trim()
  return [mfr, model].filter(Boolean).join(' ')
}

/**
 * Single-string label, suitable for plain-text contexts:
 *   <option> values, document.title, screen-reader announcements.
 *
 * Format:
 *   nickname set:  "Bedside Carry — SIG Sauer P365 (9mm Luger)"
 *   nickname null: "SIG Sauer P365 (9mm Luger)"
 */
export function firearmLabel(f: FirearmLabelSource | null | undefined): string {
  if (!f) return 'Firearm'
  const nickname = (f.nickname ?? '').trim()
  const makeModel = makeMakeModel(f)
  const caliber = (f.caliber_name ?? '').trim()

  const head = nickname
    ? makeModel
      ? `${nickname} — ${makeModel}`
      : nickname
    : makeModel || 'Firearm'

  return caliber ? `${head} (${caliber})` : head
}

/**
 * Parts variant, for JSX-rendering contexts where the caller styles
 * each fragment differently.
 */
export function firearmLabelParts(f: FirearmLabelSource | null | undefined): FirearmLabelParts {
  if (!f) return { primary: 'Firearm', contextSuffix: '', caliberSuffix: '' }
  const nickname = (f.nickname ?? '').trim()
  const makeModel = makeMakeModel(f)
  const caliber = (f.caliber_name ?? '').trim()

  if (nickname) {
    return {
      primary: nickname,
      contextSuffix: makeModel,
      caliberSuffix: caliber ? `(${caliber})` : '',
    }
  }
  return {
    primary: makeModel || 'Firearm',
    contextSuffix: '',
    caliberSuffix: caliber ? `(${caliber})` : '',
  }
}

/**
 * Compact label for toasts — nickname (if set) plus make/model, no caliber.
 * Used in success messages like "Logged 30 rounds through Bedside Carry — SIG Sauer P365".
 */
export function firearmLabelForToast(f: FirearmLabelSource | null | undefined): string {
  if (!f) return ''
  const { primary, contextSuffix } = firearmLabelParts(f)
  return contextSuffix ? `${primary} — ${contextSuffix}` : primary
}
