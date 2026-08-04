# Desktop build (Windows portable .exe)

**Goal:** one file you can send a tester — double-click, no Python/Node install.

## Architecture

```
LedgerFlow-*-Portable.exe   (Electron shell)
   ├── starts  ledgerflow-api.exe   → http://127.0.0.1:8000
   └── serves  static UI            → http://127.0.0.1:3000
Data (SQLite + uploads) →  Documents\LedgerFlow\Data  (on the tester’s PC)
```

## Prerequisites (your machine — builder only)

| Tool | Version |
|------|---------|
| Python | 3.11+ on PATH |
| Node.js | 18+ and npm |
| Windows | x64 |

Tester does **not** need these.

## Version

Edit root **`VERSION`** (e.g. `1.0.1`) before building. Footer + Settings + portable filename use that value.  
In-app updates: see [UPDATES.md](./UPDATES.md).

## One-command build

From the **repo root**:

```powershell
.\scripts\build-desktop.ps1
# optional update channel for Settings → Check for updates:
.\scripts\build-desktop.ps1 -UpdateManifestUrl "https://your-host/latest.json"
```

This will:

1. Read `VERSION` and sync `desktop/package.json`
2. Ensure backend venv + install **PyInstaller**
3. Build API sidecar → `desktop/resources/api/ledgerflow-api/`
4. Static-export the UI (`LEDGERFLOW_DESKTOP=1`, inject version + update URL) → `desktop/resources/ui/`
5. Run **electron-builder** portable → `desktop/dist/LedgerFlow-<version>-Portable.exe`

### Partial rebuilds

```powershell
.\scripts\build-desktop.ps1 -SkipApi          # UI + electron only
.\scripts\build-desktop.ps1 -SkipUi           # API + electron only
.\scripts\build-desktop.ps1 -SkipElectron     # only resources (no .exe)
```

## Output to send the tester

| File | Where |
|------|--------|
| **LedgerFlow-1.0.0-Portable.exe** | `desktop/dist/` |

Optional later: `npm run dist:nsis` in `desktop/` for a Setup installer.

## Tester instructions (short)

1. Download `LedgerFlow-*-Portable.exe`
2. Double-click (Windows may show SmartScreen — **More info → Run anyway** for unsigned builds)
3. Wait a few seconds for the window
4. Register or use Guest (guest does not keep data)
5. Create a bank profile → upload statements
6. Their data lives in:  
   `Documents\LedgerFlow\Data`  
   (never uploaded to a cloud by the app)

## Dev note

Normal day-to-day still uses:

```powershell
npm run dev
```

Desktop packaging is a **separate road** (`desktop/` + `scripts/build-desktop.ps1`). It does not replace local web development.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| “API did not become healthy” | Port **8000** free? Close other `npm run dev` / API windows |
| Blank window | Rebuild UI with `LEDGERFLOW_DESKTOP=1`; ensure `desktop/resources/ui/index.html` exists |
| Antivirus delete | Common for unsigned portable + PyInstaller — add exception or sign later |
| PyInstaller import errors | Re-run with a clean venv; extend `hiddenimports` in `backend/packaging/ledgerflow-api.spec` |

## Signing (later)

First-tester builds are **unsigned**. For wider distribution, code-sign the Electron and API binaries (Authenticode) so SmartScreen stops warning.
