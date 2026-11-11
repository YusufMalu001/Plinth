/**
 * Rebrand-safe storage keys (Addendum #9): values saved under the legacy
 * `plinth-*` keys keep working; new writes always use the `plinth-*` key.
 */
export function readStorageValue(key: string, legacyKey?: string): string | null {
  try {
    const current = window.localStorage.getItem(key);
    if (current !== null) return current;
    if (legacyKey) return window.localStorage.getItem(legacyKey);
  } catch {
    // storage unavailable
  }
  return null;
}
