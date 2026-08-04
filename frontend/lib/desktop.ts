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
  windowClose?: () => Promise<void> | void;
  windowIsMaximized?: () => Promise<boolean> | boolean;
  onMaximizedChanged?: (callback: (maximized: boolean) => void) => () => void;
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
