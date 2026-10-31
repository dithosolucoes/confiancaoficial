import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  user_type: "customer" | "technician" | "gestor" | "company_admin";
  company_id?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  retryProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileError: null,
  retryProfile: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshing = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileError(null);
    // Retry transient backend failures (e.g. schema cache 503) before giving up
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        setProfile(data as Profile);
        setProfileError(null);
        return;
      }

      if (!error) {
        setProfileError("Perfil não encontrado para esta conta.");
        return;
      }

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        setProfileError(error.message || "Não foi possível carregar o seu perfil.");
      }
    }
  }, []);

  const retryProfile = useCallback(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user) fetchProfile(s.user.id);
    });
  }, [fetchProfile]);

  // Keep session alive by refreshing token periodically (every 10 min)
  // Only refresh when tab is visible to avoid multi-tab conflicts
  useEffect(() => {
    refreshInterval.current = setInterval(async () => {
      // Skip refresh if tab is hidden or another refresh is in progress
      if (document.visibilityState !== "visible" || isRefreshing.current) return;

      isRefreshing.current = true;
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.warn("Token refresh failed, retrying...", error.message);
            setTimeout(async () => {
              await supabase.auth.refreshSession();
            }, 5000);
          } else if (data.session) {
            setSession(data.session);
          }
        }
      } finally {
        isRefreshing.current = false;
      }
    }, 10 * 60 * 1000); // 10 minutes

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  // Re-validate session when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setSession(currentSession);
          if (!profile || profile.user_id !== currentSession.user.id) {
            fetchProfile(currentSession.user.id);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [profile, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Only clear session on explicit sign out, not on transient events
        if (event === "SIGNED_OUT") {
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (session) {
          setSession(session);
          setTimeout(() => fetchProfile(session.user.id), 0);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    // Only sign out the current device's session, not all sessions
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileError,
        retryProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
