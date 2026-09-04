// Sport attivo globale dell'app — mostrato/scelto dall'header (fix utente
// esplicito: al posto del logo, un selettore che apre una tendina con tutti
// gli sport). Persistito come il tema (stessa AsyncStorage/localStorage via
// lib/theme.tsx), default il primo sport tra i preferiti del giocatore che
// esiste in SPORT_DISPONIBILI, altrimenti il primo della lista.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { SPORT_DISPONIBILI } from './stars';

const CHIAVE = 'stars-sport-attivo';

interface SportContextValue {
  sportAttivo: string;
  setSportAttivo: (sport: string) => void;
  sportDisponibili: string[];
}

const SportContext = createContext<SportContextValue>({
  sportAttivo: SPORT_DISPONIBILI[0], setSportAttivo: () => {}, sportDisponibili: SPORT_DISPONIBILI,
});

export function SportProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const [sportAttivo, setSportAttivoState] = useState<string>(SPORT_DISPONIBILI[0]);
  const [caricatoDaStorage, setCaricatoDaStorage] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHIAVE).then((v) => {
      if (v && SPORT_DISPONIBILI.includes(v)) setSportAttivoState(v);
      setCaricatoDaStorage(true);
    });
  }, []);

  // Se non c'è ancora una scelta salvata, parte dal primo sport preferito
  // del giocatore (appena disponibile) — non sovrascrive una scelta già
  // fatta manualmente o già letta da storage.
  useEffect(() => {
    if (!caricatoDaStorage || !me?.sport_preferiti?.length) return;
    AsyncStorage.getItem(CHIAVE).then((v) => {
      if (v) return;
      const preferito = me.sport_preferiti!.find((sp) => SPORT_DISPONIBILI.includes(sp));
      if (preferito) setSportAttivoState(preferito);
    });
  }, [caricatoDaStorage, me?.id]);

  const setSportAttivo = (sport: string) => {
    setSportAttivoState(sport);
    AsyncStorage.setItem(CHIAVE, sport).catch(() => {});
  };

  const value = useMemo(() => ({ sportAttivo, setSportAttivo, sportDisponibili: SPORT_DISPONIBILI }), [sportAttivo]);
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport() { return useContext(SportContext); }
