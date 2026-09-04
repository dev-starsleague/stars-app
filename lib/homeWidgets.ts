// Configurazione dei 2 widget personalizzabili nella prima scheda del
// carosello Home (fix utente esplicito: "a destra altre due parti
// personalizzabili, il giocatore può decidere cosa mettere") — persistita
// come tema/sport/notifiche lette, stesso AsyncStorage, per dispositivo.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TipoWidgetHome = 'classifica_centro' | 'ranking_centro' | 'ranking_zona';

export interface ConfigWidgetHome {
  tipo: TipoWidgetHome;
  // per 'classifica_centro' / 'ranking_centro': centro scelto — assente =
  // "il primo centro disponibile" (funziona da solo finché esiste un solo
  // centro reale, come altrove nell'app — vedi prenota.tsx).
  centroId?: string;
  centroNome?: string;
  // per 'ranking_zona'
  zonaTipo?: 'regione' | 'provincia';
  zonaValore?: string;
}

export const DEFAULT_WIDGET_SINISTRA: ConfigWidgetHome = { tipo: 'classifica_centro' };
export const DEFAULT_WIDGET_DESTRA: ConfigWidgetHome = { tipo: 'ranking_centro' };

const CHIAVE = 'stars-home-widgets';

export async function caricaConfigWidget(): Promise<[ConfigWidgetHome, ConfigWidgetHome]> {
  try {
    const raw = await AsyncStorage.getItem(CHIAVE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 2) return [parsed[0], parsed[1]];
    }
  } catch {}
  return [DEFAULT_WIDGET_SINISTRA, DEFAULT_WIDGET_DESTRA];
}

export async function salvaConfigWidget(config: [ConfigWidgetHome, ConfigWidgetHome]): Promise<void> {
  await AsyncStorage.setItem(CHIAVE, JSON.stringify(config)).catch(() => {});
}

export function etichettaTipoWidget(tipo: TipoWidgetHome): string {
  return tipo === 'classifica_centro' ? 'Star del mese' : tipo === 'ranking_centro' ? 'Ranking centro' : 'Ranking zona';
}
