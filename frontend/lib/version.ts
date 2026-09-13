/**
 * App version shown in the footer and used for update checks.
 *
 * Source of truth for releases: repo root `VERSION` file.
 * Desktop builds inject NEXT_PUBLIC_APP_VERSION via scripts/build-desktop.ps1.
 * Dev fallback matches VERSION when env is unset.
 */

export const APP_VERSION =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION?.trim()) ||
  "2.1.1";


/**
 * Public HTTPS URL of the update manifest JSON (latest.json).
 * Override with NEXT_PUBLIC_UPDATE_MANIFEST_URL at build time.
 *
 * Manifest shape: see /updates/latest.json.example
 */
export const UPDATE_MANIFEST_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL?.trim()) ||
  "";

export type UpdateManifest = {
  version: string;
  publishedAt?: string;
  releaseNotes?: string;
  downloadUrl: string;
  channel?: string;
  sha256?: string;
  minVersion?: string;
};

/** Compare semver-ish strings: a > b → 1, a < b → -1, equal → 0 */
export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  const pb = b
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isNewerVersion(remote: string, local: string): boolean {
  return compareVersions(remote, local) > 0;
}

export async function fetchUpdateManifest(
  url: string = UPDATE_MANIFEST_URL
): Promise<UpdateManifest> {
  if (!url) {
    throw new Error(
      "Update channel is not configured. The developer must set an update manifest URL."
    );
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      // Mode cors for public HTTPS manifests
    });
  } catch {
    throw new Error(
      "Could not reach the update server. Check your internet connection and try again."
    );
  }
  if (!res.ok) {
    throw new Error(`Update server returned ${res.status}. Try again later.`);
  }
  const data = (await res.json()) as Partial<UpdateManifest>;
  if (!data.version || !data.downloadUrl) {
    throw new Error("Update manifest is incomplete (need version + downloadUrl).");
  }
  return data as UpdateManifest;
}
