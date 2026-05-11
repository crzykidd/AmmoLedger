/**
 * Compute Levenshtein distance between two strings (case-insensitive).
 * Mirrors the Python implementation in backend/routers/importer.py.
 */
export function levenshtein(a: string, b: string): number {
  const sa = a.toLowerCase()
  const sb = b.toLowerCase()
  let [s1, s2] = sa.length < sb.length ? [sb, sa] : [sa, sb]
  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i)
  for (const chA of s1) {
    const curr = [prev[0] + 1]
    for (let j = 0; j < s2.length; j++) {
      curr.push(
        Math.min(
          prev[j + 1] + 1,
          curr[j] + 1,
          prev[j] + (chA !== s2[j] ? 1 : 0),
        ),
      )
    }
    prev = curr
  }
  return prev[prev.length - 1]
}

/**
 * Mirrors backend/routers/importer.py::_is_similar (simplified — no
 * caliber/container number-extraction heuristics).
 *
 * Returns true if `val` looks like a typo of `existing` but is not an
 * exact match. Threshold is 1 for short strings (≤ 6 chars on either
 * side), 2 otherwise.
 */
export function isSimilar(val: string, existing: string): boolean {
  if (val.toLowerCase() === existing.toLowerCase()) return false
  const maxDist = val.length <= 6 || existing.length <= 6 ? 1 : 2
  const dist = levenshtein(val, existing)
  return dist > 0 && dist <= maxDist
}

/**
 * Return the existing names most similar to `val`, sorted by ascending
 * distance. Used by LookupCombobox to surface "Did you mean…" before
 * the inline-create POST fires.
 */
export function findSimilar(
  val: string,
  existing: string[],
  maxResults = 3,
): { name: string; distance: number }[] {
  const threshold = val.length <= 6 ? 1 : 2
  const scored = existing
    .map((name) => ({ name, distance: levenshtein(val, name) }))
    .filter((s) => s.distance > 0 && s.distance <= threshold)
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, maxResults)
}
