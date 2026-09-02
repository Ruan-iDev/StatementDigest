"use client";

import * as React from "react";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_THEME_PACK,
  THEME_APPEARANCE_STORAGE_KEY,
  THEME_PACK_STORAGE_KEY,
  isAppearance,
  isThemePackId,
  type ThemeAppearance,
  type ThemePackId,
} from "@/lib/themes";

type ThemeContextValue = {
  theme: ThemeAppearance;
  pack: ThemePackId;
  toggle: () => void;
  setAppearance: (next: ThemeAppearance) => void;
  setPack: (next: ThemePackId) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: DEFAULT_APPEARANCE,
  pack: DEFAULT_THEME_PACK,
  toggle: () => {},
  setAppearance: () => {},
  setPack: () => {},
});

function applyTheme(pack: ThemePackId, appearance: ThemeAppearance) {
  const root = document.documentElement;
  root.dataset.theme = pack;
  root.classList.toggle("dark", appearance === "dark");
}

/**
 * Always render children — never blank the page while resolving theme.
 * Theme class + data-theme are applied on the document element after mount.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<ThemeAppearance>(DEFAULT_APPEARANCE);
  const [pack, setPackState] = React.useState<ThemePackId>(DEFAULT_THEME_PACK);

  React.useEffect(() => {
    const storedPack = localStorage.getItem(THEME_PACK_STORAGE_KEY);
    const storedAppearance = localStorage.getItem(THEME_APPEARANCE_STORAGE_KEY);
    const nextPack = isThemePackId(storedPack) ? storedPack : DEFAULT_THEME_PACK;
    const nextAppearance = isAppearance(storedAppearance) ? storedAppearance : DEFAULT_APPEARANCE;
    setPackState(nextPack);
    setTheme(nextAppearance);
    applyTheme(nextPack, nextAppearance);
  }, []);

  const setAppearance = React.useCallback((next: ThemeAppearance) => {
    setTheme(next);
    localStorage.setItem(THEME_APPEARANCE_STORAGE_KEY, next);
    const storedPack = localStorage.getItem(THEME_PACK_STORAGE_KEY);
    applyTheme(isThemePackId(storedPack) ? storedPack : DEFAULT_THEME_PACK, next);
  }, []);

  const setPack = React.useCallback((next: ThemePackId) => {
    setPackState(next);
    localStorage.setItem(THEME_PACK_STORAGE_KEY, next);
    const storedAppearance = localStorage.getItem(THEME_APPEARANCE_STORAGE_KEY);
    applyTheme(next, isAppearance(storedAppearance) ? storedAppearance : DEFAULT_APPEARANCE);
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((t) => {
      const next: ThemeAppearance = t === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_APPEARANCE_STORAGE_KEY, next);
      const storedPack = localStorage.getItem(THEME_PACK_STORAGE_KEY);
      applyTheme(isThemePackId(storedPack) ? storedPack : DEFAULT_THEME_PACK, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, pack, toggle, setAppearance, setPack }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
