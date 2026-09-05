import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiGet, apiPost, isApiConfigured } from './apiClient';
import { getMioProfilo, isMock, setDemoDataMode } from './api';
import type { Giocatore } from '../types/models';
import { mockMe } from './mockData';

// Nessuna autenticazione reale per ora (decisione esplicita: si aggiungerà
// in un secondo momento). La "sessione" è solo l'id del Giocatore scelto/
// creato con email+nome, senza verifica della password — persistito in
// locale così l'app ricorda chi sei tra un riavvio e l'altro.
const SESSION_KEY = 'stars-app:giocatore-id';

async function leggiGiocatoreIdSalvato(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
    } catch {
      return null;
    }
  }
  return AsyncStorage.getItem(SESSION_KEY);
}

async function salvaGiocatoreId(id: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage === 'undefined') return;
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // storage non disponibile (es. SSR/build): nessuna sessione persistita
    }
    return;
  }
  if (id) await AsyncStorage.setItem(SESSION_KEY, id);
  else await AsyncStorage.removeItem(SESSION_KEY);
}

interface Sessione {
  giocatoreId: string;
}

interface AuthState {
  session: Sessione | null;
  me: Giocatore | null;
  loading: boolean;
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, nome: string, cognome: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  enterDemo: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Sessione | null>(null);
  const [me, setMe] = useState<Giocatore | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const caricaProfilo = async (giocatoreId: string) => {
    const g = await getMioProfilo(giocatoreId);
    setMe(g);
  };

  const refreshMe = async () => {
    if (!session) return;
    await caricaProfilo(session.giocatoreId);
  };

  useEffect(() => {
    (async () => {
      const idSalvato = await leggiGiocatoreIdSalvato();
      if (idSalvato) {
        setSession({ giocatoreId: idSalvato });
        await caricaProfilo(idSalvato);
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, _password: string) => {
    const { data, error } = await apiGet<any[]>('/giocatori', { email });
    if (error) return { error: error.message };
    const trovato = data && data.length > 0 ? data[0] : null;
    if (!trovato) return { error: 'Email o password non corretti.' };
    setDemoDataMode(false);
    setDemoMode(false);
    await salvaGiocatoreId(trovato.id);
    setSession({ giocatoreId: trovato.id });
    await caricaProfilo(trovato.id);
    return {};
  };

  const signUp = async (email: string, _password: string, nome: string, cognome: string) => {
    const { data: esistenti, error: errRicerca } = await apiGet<any[]>('/giocatori', { email });
    if (errRicerca) return { error: errRicerca.message };
    if (esistenti && esistenti.length > 0) return { error: 'Email già registrata: prova ad accedere.' };

    const { data: nuovo, error } = await apiPost<any>('/giocatori', { nome, cognome, email });
    if (error) return { error: error.message };
    setDemoDataMode(false);
    setDemoMode(false);
    await salvaGiocatoreId(nuovo.id);
    setSession({ giocatoreId: nuovo.id });
    await caricaProfilo(nuovo.id);
    return {};
  };

  const signOut = async () => {
    setDemoDataMode(false);
    await salvaGiocatoreId(null);
    setDemoMode(false);
    setMe(null);
    setSession(null);
  };

  // "Entra in modalità demo" NON deve isolare l'app dal gestionale reale
  // (fix utente esplicito, ribadito più volte: finché non esiste un vero
  // login, questo bottone è l'unico modo di entrare — deve comunque parlare
  // col backend vero, non con dati finti). Se un backend è raggiungibile,
  // "demo" accede come l'account reale del giocatore che sta sviluppando/
  // testando l'app (fix utente esplicito: "a questo account voglio
  // accedere cliccando modalità demo") — stesso identico percorso di un
  // signIn vero, dati reali, scritture reali sul planner. Se quell'email
  // non si trova (backend diverso, es. altro ambiente) si ripiega sul
  // primo giocatore censito, così il bottone resta comunque utilizzabile.
  // I dati finti (mockMe) restano SOLO l'ultima spiaggia: nessun backend
  // configurato/raggiungibile, o nessun giocatore ancora censito.
  const EMAIL_DEMO_PREFERITA = 'panegosriccardo@gmail.com';
  const enterDemo = async () => {
    if (isApiConfigured) {
      const { data: mio } = await apiGet<any[]>('/giocatori', { email: EMAIL_DEMO_PREFERITA });
      const preferito = mio && mio.length > 0 ? mio[0] : null;
      if (preferito) {
        setDemoDataMode(false);
        setDemoMode(false);
        await salvaGiocatoreId(preferito.id);
        setSession({ giocatoreId: preferito.id });
        await caricaProfilo(preferito.id);
        return;
      }
      const { data } = await apiGet<any[]>('/giocatori');
      const primo = data && data.length > 0 ? data[0] : null;
      if (primo) {
        setDemoDataMode(false);
        setDemoMode(false);
        await salvaGiocatoreId(primo.id);
        setSession({ giocatoreId: primo.id });
        await caricaProfilo(primo.id);
        return;
      }
    }
    setDemoDataMode(true);
    setDemoMode(true);
    setMe(mockMe);
  };

  const value: AuthState = {
    session, me, loading, demoMode: demoMode || isMock(),
    signIn, signUp, signOut, enterDemo, refreshMe,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
