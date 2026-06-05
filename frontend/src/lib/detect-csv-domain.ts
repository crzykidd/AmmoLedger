// Lightweight client-side detection of which import flow a CSV belongs to.
// Reads only the header row and scores domain-unique marker columns. Shared
// columns (caliber, manufacturer, dealer, notes) are deliberately excluded so
// they don't muddy the signal. Returns null when the header matches neither
// (or both equally) — callers should leave the user on their chosen tab.

export type ImportDomain = 'ammo' | 'firearms'

// Columns that appear only in the ammo template / export.
const AMMO_MARKERS = [
  'qty_original',
  'qty_remaining',
  'product_name',
  'ammo_condition',
  'container',
  'legacy_id',
]

// Columns that appear only in the firearms template / export.
const FIREARM_MARKERS = [
  'firearm_type',
  'action_type',
  'serial',
  'nickname',
  'barrel_length_in',
  'frame_size',
  'optic_cut',
  'rail_type',
  'firearm_condition',
  'standard_capacity',
]

function parseHeader(line: string): Set<string> {
  // Template/export headers are plain tokens with no embedded commas, so a
  // simple split is sufficient. Strip surrounding quotes/whitespace, lowercase.
  return new Set(
    line.split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase()),
  )
}

export async function detectCsvDomain(file: File): Promise<ImportDomain | null> {
  let text: string
  try {
    // The header is in the first line; reading a small slice avoids loading a
    // large CSV into memory just to sniff column names.
    text = await file.slice(0, 65536).text()
  } catch {
    return null
  }

  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)
  if (!firstLine) return null

  const headers = parseHeader(firstLine)
  let ammo = 0
  let firearm = 0
  for (const m of AMMO_MARKERS) if (headers.has(m)) ammo++
  for (const m of FIREARM_MARKERS) if (headers.has(m)) firearm++

  if (firearm > ammo) return 'firearms'
  if (ammo > firearm) return 'ammo'
  return null
}
