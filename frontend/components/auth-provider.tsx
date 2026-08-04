"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, getAuthToken, isGuestMode, setAuthToken } from "@/lib/api";
import { AuthScreen } from "@/components/auth-screen";

type AuthContextValue = {
  ready: boolean;
  authenticated: boolean;
  username: string | null;
  hasUsers: boolean;
  isGuest: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  onAuthenticated: (token: string, username: string, opts?: { guest?: boolean }) => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [username, setUsername] = React.useState<string | null>(null);
  const [hasUsers, setHasUsers] = React.useState(false);
  const [isGuest, setIsGuest] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const s = await api.auth.status();
      setHasUsers(s.has_users);
      const token = getAuthToken();
      if (token) {
        try {
          const me = await api.auth.me();
          setAuthenticated(true);
          setUsername(me.username);
          setIsGuest(Boolean(me.is_guest) || isGuestMode());
          if (!me.is_guest) setHasUsers(true);
        } catch {
          setAuthToken(null);
          setAuthenticated(false);
          setUsername(null);
          setIsGuest(false);
        }
      } else {
        setAuthenticated(false);
        setUsername(null);
        setIsGuest(false);
      }
    } catch {
      setAuthenticated(false);
      setIsGuest(false);
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAuthenticated = React.useCallback(
    (token: string, user: string, opts?: { guest?: boolean }) => {
      setAuthToken(token, { guest: Boolean(opts?.guest) });
      setAuthenticated(true);
      setUsername(user);
      setIsGuest(Boolean(opts?.guest));
      if (!opts?.guest) setHasUsers(true);
      // Always land on the main Dashboard / hub after login or register
      router.replace("/");
    },
    [router]
  );

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore */
    }
    setAuthToken(null);
    setAuthenticated(false);
    setUsername(null);
    setIsGuest(false);
    await refresh();
  }, [refresh]);

  const value: AuthContextValue = {
    ready,
    authenticated,
    username,
    hasUsers,
    isGuest,
    refresh,
    logout,
    onAuthenticated,
  };

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Starting LedgerFlow…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AuthContext.Provider value={value}>
        <div className="h-full overflow-y-auto">
          <AuthScreen hasUsers={hasUsers} onAuthenticated={onAuthenticated} />
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      <div className="h-full overflow-hidden">{children}</div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
