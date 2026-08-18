import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { getMioProfilo, USE_MOCK } from './api';
import type { Giocatore } from '../types/models';
import { mockMe } from './mockData';

interface AuthState {
  session: Session | null;
  me: Giocatore | null;
  loading: boolean;
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, nome: string, cognome: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  enterDemo: () => void;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Giocatore | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const refreshMe = async () => {
    const g = await getMioProfilo();
    setMe(g);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Nessuna chiave: l'app funziona in modalità demo (mock) senza login reale.
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshMe();
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) await refreshMe();
      else setMe(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp = async (email: string, password: string, nome: string, cognome: string) => {
    const { error } = await supabase.auth.signUp({
      email, password, options: { data: { nome, cognome } },
    });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setDemoMode(false);
    setMe(null);
    setSession(null);
  };

  const enterDemo = () => {
    setDemoMode(true);
    setMe(mockMe);
  };

  const value: AuthState = {
    session, me, loading, demoMode: demoMode || USE_MOCK,
    signIn, signUp, signOut, enterDemo, refreshMe,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
