import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type UserProfile = {
  id: string;
  email: string;
  name?: string;
  role: string;
  accessible_modules?: string[];
};

const ALL_MODULES = ['cablefill'];
const ADMIN_EMAIL = 'rafael.azevedo.93@live.com';

/** Patch a parsed user profile: if it's the admin, always give all modules */
function patchAdminModules(parsed: any): any {
  if (parsed?.email === ADMIN_EMAIL) {
    parsed.role = 'admin';
    parsed.accessible_modules = ALL_MODULES;
  }
  return parsed;
}

interface AuthContextType {
  user: UserProfile | null;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  isSessionVerified: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('cablefill_user');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        if (parsed.username && !parsed.email) {
          parsed.email = parsed.username;
        }
        if (parsed.email) {
          // ── Immediately patch admin modules from stale cache ──
          parsed = patchAdminModules(parsed);
          localStorage.setItem('cablefill_user', JSON.stringify(parsed));
          return parsed;
        }
      } catch (e) {
        // Ignore parse error
      }
    }
    return null;
  });
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        if (error.message?.includes('Refresh Token Not Found') || error.message?.includes('invalid_grant')) {
          supabase.auth.signOut().catch(() => {});
        } else {
          console.error('Auth session error:', error);
        }
        setUser(null);
        localStorage.removeItem('cablefill_user');
        setIsSessionVerified(true);
        return;
      }

      if (session?.user) {
        try {
          const { data: profile } = await supabase
            .from('User')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            const isAdmin = profile.email === ADMIN_EMAIL;

            // Auto-name patch for admin if name is missing
            if (isAdmin && !profile.name) {
              supabase.from('User')
                .update({ name: 'Rafael Azevedo', full_name: 'Rafael Azevedo' })
                .eq('id', profile.id)
                .then(({ error: e }) => { if (e) console.error('Name patch failed:', e); });
            }

            if (isAdmin || profile.is_approved === 1) {
              const loggedUser: UserProfile = {
                id:                 profile.id,
                email:              profile.email,
                name:               isAdmin && !profile.name
                                      ? 'Rafael Azevedo'
                                      : (profile.name || profile.full_name || profile.nome ||
                                         profile.display_name || profile.username ||
                                         session.user.user_metadata?.name ||
                                         session.user.user_metadata?.full_name),
                role:               isAdmin ? 'admin' : profile.role,
                accessible_modules: isAdmin
                                      ? ALL_MODULES
                                      : (profile.accessible_modules || ['cablefill', 'capitolato']),
              };
              setUser(loggedUser);
              localStorage.setItem('cablefill_user', JSON.stringify(loggedUser));
            }
          }
        } catch (fetchErr) {
          console.error('Profile fetch error:', fetchErr);
        }
      }

      setIsSessionVerified(true);
    }).catch((err) => {
      console.error('Auth catch error:', err);
      setUser(null);
      localStorage.removeItem('cablefill_user');
      setIsSessionVerified(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session) || !session) {
        setUser(null);
        localStorage.removeItem('cablefill_user');
      }
      if (event === 'USER_UPDATED' && !session) {
        setUser(null);
        localStorage.removeItem('cablefill_user');
      }
    });

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMsg = typeof event.reason === 'string' ? event.reason : (event.reason?.message || '');
      if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token') || errorMsg.includes('invalid_grant')) {
        event.preventDefault();
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        localStorage.removeItem('cablefill_user');
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('cablefill_user');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, isSessionVerified, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
