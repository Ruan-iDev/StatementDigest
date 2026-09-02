/**
 * Theme packs. Add a new pack here AND a matching CSS block in app/globals.css.
 * See docs/THEME.md.
 */

export type ThemeAppearance = "light" | "dark";

export type ThemePackId = "ledger" | "paper" | "ocean";

export type ThemePack = {
  id: ThemePackId;
  name: string;
  description: string;
  /** Swatches shown on the Appearance picker (CSS hsl without hsl()). */
  swatches: [string, string, string];
};

export const THEME_PACKS: ThemePack[] = [
  {
    id: "ledger",
    name: "Ledger",
    description: "Soft stone in light, neon hubs in dark. A quiet drifting canvas either way.",
    swatches: ["185 100% 48%", "268 100% 68%", "318 100% 58%"],
  },
  {
    id: "paper",
    name: "Paper",
    description: "Warm ink on cream. Calmer accents, same layout.",
    swatches: ["32 55% 42%", "25 30% 28%", "152 40% 36%"],
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool slate and teal. Same components, cooler light.",
    swatches: ["192 80% 38%", "222 40% 32%", "172 55% 36%"],
  },
];

export const DEFAULT_THEME_PACK: ThemePackId = "ledger";
export const DEFAULT_APPEARANCE: ThemeAppearance = "dark";

export const THEME_PACK_STORAGE_KEY = "ledgerflow-theme-pack";
export const THEME_APPEARANCE_STORAGE_KEY = "ledgerflow-theme";

export function isThemePackId(value: string | null): value is ThemePackId {
  return THEME_PACKS.some((p) => p.id === value);
}

export function isAppearance(value: string | null): value is ThemeAppearance {
  return value === "light" || value === "dark";
}
