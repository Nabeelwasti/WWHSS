import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api, setAccessToken, restoreSession, setSessionExpiredHandler, type Me } from "./api";

type AuthState = {
  user: Me | null;
  loading: boolean;
  // True only during the very first moments after the app opens, while it
  // checks whether a previous sign-in can be quietly resumed. Without this,
  // a returning user would see the public page (or a login form) flash up
  // for a moment before being taken to their dashboard.
  booting: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resume a previous sign-in if the browser still holds a valid refresh
  // cookie — so reloading the page, or coming back tomorrow, doesn't force
  // a new login every time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await restoreSession()) {
          const me = await api.me();
          if (!cancelled) setUser(me.user);
        }
      } catch {
        // No resumable session — perfectly normal for a first visit.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the session can't be renewed later (e.g. an admin deactivated the
  // account, or the refresh cookie expired), return to the sign-in screen.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(email, password);
      setAccessToken(result.accessToken);
      const me = await api.me();
      setUser(me.user);
    } catch (e) {
      // Real error from the server, surfaced as-is — never swallowed into
      // a fake "success" state.
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, booting, error, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
