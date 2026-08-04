"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, getAuthToken, isGuestMode, setAuthToken } from "@/lib/api";
import { AuthScreen } from "@/components/auth-screen";
import { AppSplash } from "@/components/app-splash";
import { FirstTimeSetup } from "@/components/first-time-setup";
import { AuthenticatedApp } from "@/components/authenticated-app";
import { DesktopTitlebar } from "@/components/desktop-titlebar";
import { getDesktopBridge, isDesktopApp } from "@/lib/desktop";
import { FORCE_FIRST_TIME_SETUP } from "@/lib/first-time-flags";
import { resetAppGuideSeenIfForced } from "@/components/first-time-app-guide";

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

/** Min time the splash stays visible so the user can read at least one quote. */
const SPLASH_MIN_MS = 6000;
const SPLASH_FADE_MS = 700;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [username, setUsername] = React.useState<string | null>(null);
  const [hasUsers, setHasUsers] = React.useState(false);
  const [isGuest, setIsGuest] = React.useState(false);

  const [splashVisible, setSplashVisible] = React.useState(true);
  const [splashExiting, setSplashExiting] = React.useState(false);
  const splashStartedAt = React.useRef<number>(Date.now());
  const [desktop, setDesktop] = React.useState(false);

  React.useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  const syncClosePolicy = React.useCallback((sessionLocked: boolean) => {
    if (!isDesktopApp()) return;
    // When locked, close is blocked until logout (data lock).
    void getDesktopBridge()?.setCloseAllowed?.(!sessionLocked);
  }, []);

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
          const guest = Boolean(me.is_guest) || isGuestMode();
          setIsGuest(guest);
          if (!me.is_guest) setHasUsers(true);
          // Registered sessions must log out before close
          syncClosePolicy(!guest);
        } catch {
          setAuthToken(null);
          setAuthenticated(false);
          setUsername(null);
          setIsGuest(false);
          syncClosePolicy(false);
        }
      } else {
        setAuthenticated(false);
        setUsername(null);
        setIsGuest(false);
        syncClosePolicy(false);
      }
    } catch {
      setAuthenticated(false);
      setIsGuest(false);
      syncClosePolicy(false);
    } finally {
      setReady(true);
    }
  }, [syncClosePolicy]);

  React.useEffect(() => {
    // TEMP preview: wipe saved session + guide “seen” so first-run UIs always appear
    if (FORCE_FIRST_TIME_SETUP) {
      setAuthToken(null);
    }
    resetAppGuideSeenIfForced();
    void refresh();
  }, [refresh]);

  // Fade splash out once auth status is known (and min display time elapsed)
  React.useEffect(() => {
    if (!ready || !splashVisible || splashExiting) return;

    const elapsed = Date.now() - splashStartedAt.current;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);

    const t = window.setTimeout(() => {
      setSplashExiting(true);
      window.setTimeout(() => {
        setSplashVisible(false);
        setSplashExiting(false);
      }, SPLASH_FADE_MS);
    }, wait);

    return () => window.clearTimeout(t);
  }, [ready, splashVisible, splashExiting]);

  const onAuthenticated = React.useCallback(
    (token: string, user: string, opts?: { guest?: boolean }) => {
      setAuthToken(token, { guest: Boolean(opts?.guest) });
      setAuthenticated(true);
      setUsername(user);
      setIsGuest(Boolean(opts?.guest));
      if (!opts?.guest) setHasUsers(true);
      // Lock close for real accounts; guest may still close (nothing saved)
      syncClosePolicy(!opts?.guest);
      router.replace("/");
    },
    [router, syncClosePolicy]
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
    syncClosePolicy(false);
    await refresh();
  }, [refresh, syncClosePolicy]);

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

  return (
    <AuthContext.Provider value={value}>
      {splashVisible && <AppSplash exiting={splashExiting} />}

      {!ready ? (
        <div className="flex h-screen flex-col bg-black">
          {desktop && <DesktopTitlebar variant="ghost" />}
          <div className="min-h-0 flex-1 bg-black" aria-hidden />
        </div>
      ) : !authenticated ? (
        <div className="flex h-screen flex-col overflow-hidden bg-black">
          {desktop && <DesktopTitlebar variant="ghost" />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!hasUsers || FORCE_FIRST_TIME_SETUP ? (
              <FirstTimeSetup onAuthenticated={onAuthenticated} />
            ) : (
              <AuthScreen hasUsers={hasUsers} onAuthenticated={onAuthenticated} />
            )}
          </div>
        </div>
      ) : (
        <AuthenticatedApp>{children}</AuthenticatedApp>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
