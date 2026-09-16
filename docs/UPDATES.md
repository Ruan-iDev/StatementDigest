# App version & in-app updates

> **Status (2026-09-16):** Current release **v2.1.2**. Footer version is live. **Settings → App updates is hidden** until the OTA/air-update channel is ready. Code remains in `frontend/components/app-updates-card.tsx`; re-enable from Settings when hosting is set up. Tracked in `docs/TODO.md`. Full changelog: [RELEASE_NOTES.md](./RELEASE_NOTES.md).

## Version in the UI

| Where | What |
|-------|------|
| **Footer (right)** | `v2.1.2` — always visible for tester feedback |
| **Settings → App updates** | Same version + **Check for updates** (hidden until OTA ready) |
| **API `/api/health`** | `"version": "2.1.2"` (or `LEDGERFLOW_APP_VERSION`) |

**Source of truth:** repo root file `VERSION` (one line, e.g. `2.1.2`).

Bump it **before** every tester build:

```text
VERSION          →  2.1.2
```

`scripts/build-desktop.ps1` reads `VERSION` and injects:

- `NEXT_PUBLIC_APP_VERSION` into the static UI  
- `desktop/package.json` → Electron `app.getVersion()`  
- Portable artifact name `LedgerFlow-<version>-Portable.exe`

## How “Check for updates” works

1. User needs **internet**.
2. App fetches a public **manifest JSON** (HTTPS).
3. Compares `manifest.version` to the installed footer version.
4. If newer → **Download** saves the portable `.exe` to the user’s **Downloads** folder (desktop shell) and opens that folder.
5. User **closes** LedgerFlow, runs the new file, deletes the old portable if they want.

Data stays local (`Documents\LedgerFlow\Data`). Updates only replace the app package.

### Manifest shape

See `updates/latest.json.example`:

```json
{
  "version": "1.0.1",
  "channel": "stable",
  "publishedAt": "2026-08-04T12:00:00Z",
  "releaseNotes": "What changed…",
  "downloadUrl": "https://…/LedgerFlow-1.0.1-Portable.exe"
}
```

### Configure the update URL (builder)

Pick **one**:

1. File `updates/channel.url` containing a single HTTPS URL to `latest.json`  
   (copy from `updates/channel.url.example`)
2. Environment variable `LEDGERFLOW_UPDATE_MANIFEST_URL`
3. Build flag:  
   `.\scripts\build-desktop.ps1 -UpdateManifestUrl "https://…/latest.json"`

If unset, Settings still shows the card but explains that the channel is not configured.

### Publish a new tester build

1. Bump `VERSION` (e.g. `1.0.0` → `1.0.1`).
2. `npm run build:desktop` (with channel URL configured).
3. Upload `desktop/dist/LedgerFlow-1.0.1-Portable.exe` to your host (Drive, S3, GitHub Releases, etc.).
4. Upload `latest.json` (version + public `downloadUrl` pointing at that file).  
   Host must allow browser/`fetch` CORS **or** be same-origin public raw (many CDNs are fine; some Drive links are not).

**GitHub Releases tip:** put `latest.json` in a public raw path or small static site; put the `.exe` on the Release assets and use that asset URL as `downloadUrl`.

### CORS

The UI runs at `http://127.0.0.1:3470` and fetches the manifest. The host of `latest.json` must send:

```http
Access-Control-Allow-Origin: *
```

(or allow `http://127.0.0.1:3470`). If CORS blocks the check, use a small static host (Cloudflare Pages, Netlify, S3 website, etc.).

## Dev (`npm run dev`)

Footer shows `v1.4.0` from the fallback in `frontend/lib/version.ts` unless you set:

```powershell
$env:NEXT_PUBLIC_APP_VERSION = "1.0.1"
$env:NEXT_PUBLIC_UPDATE_MANIFEST_URL = "https://…/latest.json"
npm run dev
```

(restart Next after changing env).
