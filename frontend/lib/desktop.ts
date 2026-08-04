/**
 * Optional bridge when running inside the Electron desktop shell.
 */

export type DesktopBridge = {
  isDesktop: true;
  platform: string;
  getVersion?: () => string | Promise<string>;
  openExternal?: (url: string) => Promise<void> | void;
  downloadUpdate?: (url: string, suggestedName?: string) => Promise<{
    ok: boolean;
    path?: string;
    message?: string;
  }>;
  windowMinimize?: () => Promise<void> | void;
  windowMaximizeToggle?: () => Promise<boolean> | boolean;
  windowClose?: () => Promise<{ ok: boolean; blocked?: boolean; message?: string } | void> | void;
  windowIsMaximized?: () => Promise<boolean> | boolean;
  onMaximizedChanged?: (callback: (maximized: boolean) => void) => () => void;
  /** When false, window close is blocked until the user logs out (data lock). */
  setCloseAllowed?: (allowed: boolean) => Promise<void> | void;
  isCloseAllowed?: () => Promise<boolean> | boolean;
};

declare global {
  interface Window {
    ledgerflowDesktop?: DesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && window.ledgerflowDesktop?.isDesktop === true;
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.ledgerflowDesktop ?? null;
}
