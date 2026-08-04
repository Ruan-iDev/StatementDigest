/**
 * Remember last signed-in person for the returning-user greeting screen.
 * Name/surname come from the workspace full_name when available.
 */

const DISPLAY_NAME_KEY = "ledgerflow-last-display-name";
const USERNAME_KEY = "ledgerflow-last-username";

export function getLastDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(DISPLAY_NAME_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function getLastUsername(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(USERNAME_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setLastUser(opts: { username: string; displayName?: string | null }) {
  if (typeof window === "undefined") return;
  try {
    const u = opts.username.trim();
    if (u) localStorage.setItem(USERNAME_KEY, u);
    const d = (opts.displayName || "").trim();
    if (d) localStorage.setItem(DISPLAY_NAME_KEY, d);
    else if (u) localStorage.setItem(DISPLAY_NAME_KEY, u);
  } catch {
    /* ignore */
  }
}
