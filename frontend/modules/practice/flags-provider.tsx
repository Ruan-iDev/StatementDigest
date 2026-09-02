"use client";

import * as React from "react";
import { useProfileOptional } from "@/components/profile-provider";
import { practiceApi } from "@/modules/practice/lib/api";
import type { PracticeFlags } from "@/modules/practice/lib/types";

const DEFAULT_FLAGS: PracticeFlags = {
  quotes_enabled: true,
  invoices_enabled: true,
  projects_enabled: true,
};

type Ctx = {
  flags: PracticeFlags;
  ready: boolean;
  refresh: () => Promise<void>;
  setFlag: (key: keyof PracticeFlags, value: boolean) => Promise<void>;
};

const ModuleFlagsContext = React.createContext<Ctx>({
  flags: DEFAULT_FLAGS,
  ready: false,
  refresh: async () => {},
  setFlag: async () => {},
});

export function ModuleFlagsProvider({ children }: { children: React.ReactNode }) {
  const profile = useProfileOptional();
  const activeId = profile?.active?.id;
  const [flags, setFlags] = React.useState<PracticeFlags>(DEFAULT_FLAGS);
  const [ready, setReady] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const next = await practiceApi.flags.get();
      setFlags(next);
    } catch {
      /* API not ready — keep last known */
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh, activeId]);

  const setFlag = React.useCallback(async (key: keyof PracticeFlags, value: boolean) => {
    const next = await practiceApi.flags.update({ [key]: value });
    setFlags(next);
  }, []);

  return (
    <ModuleFlagsContext.Provider value={{ flags, ready, refresh, setFlag }}>
      {children}
    </ModuleFlagsContext.Provider>
  );
}

export function useModuleFlags() {
  return React.useContext(ModuleFlagsContext);
}
