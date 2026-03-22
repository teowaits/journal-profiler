/**
 * persistence.js — sessionStorage save/restore for analysis results.
 * Survives browser tab discard on sleep. Cleared when the browser is closed.
 * save() silently swallows QuotaExceededError — caller does not need to handle it.
 */

const KEY = "jpa_session_v1";

/**
 * Save session data. Returns true on success, false if quota was exceeded.
 * @param {{ journal, yearRange, analysis }} data
 */
export function saveSession(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    // QuotaExceededError — data too large for sessionStorage. Silently skip.
    return false;
  }
}

/**
 * Load saved session data. Returns null if nothing is saved or parse fails.
 * @returns {{ journal, yearRange, analysis } | null}
 */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
