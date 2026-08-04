"use client";

import * as React from "react";
import { api, setStoredProfileId, type UserProfile } from "@/lib/api";

type ProfileContextValue = {
  profiles: UserProfile[];
  active: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchProfile: (id: number) => Promise<void>;
};

const ProfileContext = React.createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = React.useState<UserProfile[]>([]);
  const [active, setActive] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const list = await api.profiles.list();
      setProfiles(list);
      const current = list.find((p) => p.is_active) || list[0] || null;
      setActive(current);
      if (current) setStoredProfileId(current.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const switchProfile = React.useCallback(
    async (id: number) => {
      setStoredProfileId(id);
      const p = await api.profiles.switch(id);
      setStoredProfileId(p.id);
      await refresh();
      // Full reload so all pages drop stale profile data
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
    [refresh]
  );

  return (
    <ProfileContext.Provider
      value={{ profiles, active, loading, error, refresh, switchProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = React.useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
