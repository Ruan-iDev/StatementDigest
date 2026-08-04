"use client";

import * as React from "react";
import { api, setStoredProfileId, type UserProfile } from "@/lib/api";
import { ProfileSwitchModal } from "@/components/profile-switch-modal";

type ProfileContextValue = {
  profiles: UserProfile[];
  active: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Direct switch (e.g. just-created profile with known credentials).
   * Prefer requestSwitchProfile from UI so the full-app gate appears.
   */
  switchProfile: (
    id: number,
    opts?: { password?: string; workspace_username?: string }
  ) => Promise<void>;
  /** Full-app gate: credentials if locked → switch → reload data. */
  requestSwitchProfile: (id: number) => void;
};

const ProfileContext = React.createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = React.useState<UserProfile[]>([]);
  const [active, setActive] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = React.useState<UserProfile | null>(null);

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
    void refresh();
  }, [refresh]);

  const switchProfile = React.useCallback(
    async (id: number, opts?: { password?: string; workspace_username?: string }) => {
      const p = await api.profiles.switch(id, opts);
      setStoredProfileId(p.id);
      setPendingSwitch(null);
      await refresh();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
    [refresh]
  );

  const requestSwitchProfile = React.useCallback(
    (id: number) => {
      if (active?.id === id) return;
      const target = profiles.find((p) => p.id === id);
      if (!target) return;
      setPendingSwitch(target);
    },
    [active?.id, profiles]
  );

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        active,
        loading,
        error,
        refresh,
        switchProfile,
        requestSwitchProfile,
      }}
    >
      {children}
      <ProfileSwitchModal
        open={!!pendingSwitch}
        profileName={pendingSwitch?.name || "profile"}
        requiresPassword={Boolean(pendingSwitch?.has_password)}
        onClose={() => setPendingSwitch(null)}
        onConfirm={async ({ username, password }) => {
          if (!pendingSwitch) return;
          await switchProfile(
            pendingSwitch.id,
            pendingSwitch.has_password
              ? { workspace_username: username, password }
              : undefined
          );
        }}
      />
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = React.useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
