# Themes — how LedgerFlow looks, and how to add another pack

**Last updated:** 2026-08-17

The app has one token set. Every screen — core and Practice — reads the same CSS variables. Changing the pack or light/dark therefore restyles the **whole** product. Do not invent one-off colours in a module.

---

## What the user sees

**Settings → Appearance**

- **Pack:** Ledger (default), Paper, Ocean
- **Light / dark:** applies on top of the pack (same control as the sidebar)

Choice is stored on this machine (`localStorage`). It is not financial data.

The page canvas has a **slow drifting wash** (two radial layers, ~80s and ~120s) tinted from `--neon-*` so packs and light/dark still match. It is meant to be felt, not noticed. `prefers-reduced-motion: reduce` freezes it.

---

## How it is wired

| Piece | Role |
|-------|------|
| `frontend/lib/themes.ts` | Registry of packs (id, name, description, swatches) |
| `frontend/components/theme-provider.tsx` | Applies `data-theme="<id>"` and `.dark` on `<html>` |
| `frontend/app/globals.css` | Token values per pack |
| `frontend/app/settings/appearance/page.tsx` | Picker UI |

UI must use tokens, not hard-coded hex:

```txt
hsl(var(--background))
hsl(var(--neon-cyan))
hsl(var(--neon-amber))
```

Hub tiles already do this. New Practice screens must too.

---

## Add a future pack

1. Add an id to `ThemePackId` and a row in `THEME_PACKS` (`frontend/lib/themes.ts`).
2. In `frontend/app/globals.css`, copy a pack block:

```css
html[data-theme="dusk"] { /* light tokens */ }
html[data-theme="dusk"].dark { /* dark tokens */ }
```

3. Override the **same** names (`--background`, `--card`, `--neon-cyan`, …). Do not invent `--practice-pink`.
4. Open Settings → Appearance and click the new card. Core dashboard, Practice, and settings should all change.

That is the whole contract. No module CSS fork.

---

## Rules

- Default pack is **Ledger** — the look the product shipped with.
- Modules must not ship their own theme file.
- Prefer existing accents (cyan / magenta / lime / violet / amber) for hubs.
- If a colour is not a token, it will not follow the pack.
