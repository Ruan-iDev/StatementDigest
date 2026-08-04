"use client";

import * as React from "react";
import { api, type LicenseStatus } from "@/lib/api";

type LicenseContextValue = {
  status: LicenseStatus | null;
  ready: boolean;
  readOnly: boolean;
  refresh: () => Promise<void>;
  activate: (key: string) => Promise<LicenseStatus>;
};

const LicenseContext = React.createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<LicenseStatus | null>(null);
  const [ready, setReady] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const s = await api.license.status();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = React.useCallback(async (key: string) => {
    const s = await api.license.activate(key);
    setStatus(s);
    return s;
  }, []);

  const value: LicenseContextValue = {
    status,
    ready,
    readOnly: Boolean(status?.read_only),
    refresh,
    activate,
  };

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const ctx = React.useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}

/** Safe hook when provider may be missing (e.g. auth screens). */
export function useLicenseOptional(): LicenseContextValue | null {
  return React.useContext(LicenseContext);
}
