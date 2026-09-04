// Frase contestuale della slide 2 del carosello Home (fix utente esplicito:
// "metterei delle frasi variabili in base all'andamento ed alle
// prenotazioni... se il giocatore ha una serie positiva ed ha una partita a
// breve deve dire qualcosa a riguardo, nello stile ironico e competizionale
// di Stars League") — stesso principio/pattern di lib/saluto.ts (più frasi
// per categoria, scelta casuale, per non essere monotono), ma qui il motore
// combina DUE fonti reali: l'andamento recente (streak/trend) e la prossima
// partita in calendario, con una priorità precisa da quella più "narrativa"
// (streak + partita in arrivo) alla più generica.
import type { AndamentoRecente, ProssimaPartita } from '../types/models';

function pescaCasuale<T>(lista: T[]): T { return lista[Math.floor(Math.random() * lista.length)]; }

// "oggi" / "domani" / "tra N giorni" — mai un numero nudo, si legge meglio
// dentro una frase.
function quando(giorni: number): string {
  if (giorni <= 0) return 'oggi';
  if (giorni === 1) return 'domani';
  return `tra ${giorni} giorni`;
}

export type IconaFrase = 'flame' | 'trending-down' | 'trending-up' | 'calendar' | 'trophy' | 'sparkles';

const STREAK_VINTA_CON_PARTITA = [
  (n: number, q: string) => `${n} vittorie di fila e ${q} sei già in campo: gli avversari iniziano a preoccuparsi 😏`,
  (n: number, q: string) => `In striscia da ${n}. Partita ${q}: occasione per fare poker 🔥`,
  (n: number, q: string) => `${n} vittorie consecutive e non hai nemmeno finito — si torna in campo ${q} 💪`,
];
const STREAK_PERSA_CON_PARTITA = [
  (n: number, q: string) => `${n} sconfitte di fila, ma ${q} hai la chance per la rivincita. Fatti valere 🎯`,
  (n: number, q: string) => `Serie nera di ${n}... la partita di ${q} è il momento di invertire la rotta 😤`,
  (n: number, q: string) => `${n} ko consecutivi. ${q.charAt(0).toUpperCase() + q.slice(1)} si riparte da zero 💥`,
];
const CRESCITA_CON_PARTITA = [
  (q: string) => `Rendimento in crescita 📈 e ${q} hai un'altra occasione per continuare così`,
  (q: string) => `Stai salendo di livello. Partita ${q}: sfrutta l'onda 🌊`,
];
const CALO_CON_PARTITA = [
  (q: string) => `Un filo in calo ultimamente, ma ${q} puoi già rimetterti in carreggiata 🎾`,
  (q: string) => `Piccolo passaggio a vuoto — ${q} riparti alla grande 🚀`,
];
const STREAK_VINTA_SENZA_PARTITA = [
  (n: number) => `${n} vittorie di fila e nessuna partita in vista? Il campo ti aspetta, campione 🏆`,
  (n: number) => `In striscia da ${n}... peccato non avere ancora una partita prenotata. Rimedia 🎾`,
];
const STREAK_PERSA_SENZA_PARTITA = [
  (n: number) => `${n} sconfitte di fila e il calendario è vuoto. La rivincita non si prenota da sola 😏`,
  (n: number) => `Serie di ${n} sconfitte aperta. Prenota una partita e chiudila 💪`,
];
const PARTITA_SENZA_STREAK = [
  (q: string) => `Prossima partita ${q}: preparati, il campo non aspetta 🎾`,
  (q: string) => `${q.charAt(0).toUpperCase() + q.slice(1)} si torna in campo. Tieniti pronto 🔥`,
];
const WINRATE_ALTO_SENZA_PARTITA = [
  () => 'Win rate solido, ma il calendario è vuoto: quando torni a difenderlo? 🏆',
  () => 'Stai giocando bene — peccato non avere ancora una partita in programma 🎾',
];
const WINRATE_BASSO_SENZA_PARTITA = [
  () => 'Il campo è il posto migliore per cambiare rotta. Prenota la prossima partita 🎾',
  () => 'Ogni striscia negativa finisce con una partita prenotata. Che aspetti? 😏',
];
const FALLBACK = [
  () => 'Continua così, ogni partita conta per il tuo ranking ⭐',
  () => "Numeri alla mano: si vede che ci stai prendendo gusto 🎾",
];

/** Genera la frase "ironica e competizionale" della slide 2 combinando
 *  andamento recente (streak/trend/win rate) e prossima partita reale —
 *  sempre derivata dai dati veri, mai casuale nel CONTENUTO (solo nella
 *  scelta del template a parità di caso). Chiamata solo quando
 *  andamento.disputate > 0 (altrimenti la slide mostra il suo stato vuoto). */
export function generaFraseAndamento(andamento: AndamentoRecente, prossima: ProssimaPartita | null): { testo: string; icona: IconaFrase } {
  const partitaVicina = prossima && prossima.giorni <= 4;
  const q = partitaVicina ? quando(prossima!.giorni) : null;

  if (andamento.streak?.tipo === 'vittorie' && andamento.streak.conteggio >= 2) {
    if (q) return { testo: pescaCasuale(STREAK_VINTA_CON_PARTITA)(andamento.streak.conteggio, q), icona: 'flame' };
    return { testo: pescaCasuale(STREAK_VINTA_SENZA_PARTITA)(andamento.streak.conteggio), icona: 'flame' };
  }
  if (andamento.streak?.tipo === 'sconfitte' && andamento.streak.conteggio >= 2) {
    if (q) return { testo: pescaCasuale(STREAK_PERSA_CON_PARTITA)(andamento.streak.conteggio, q), icona: 'trending-down' };
    return { testo: pescaCasuale(STREAK_PERSA_SENZA_PARTITA)(andamento.streak.conteggio), icona: 'trending-down' };
  }
  if (andamento.trend === 'crescita' && q) {
    return { testo: pescaCasuale(CRESCITA_CON_PARTITA)(q), icona: 'trending-up' };
  }
  if (andamento.trend === 'calo' && q) {
    return { testo: pescaCasuale(CALO_CON_PARTITA)(q), icona: 'sparkles' };
  }
  if (q) {
    return { testo: pescaCasuale(PARTITA_SENZA_STREAK)(q), icona: 'calendar' };
  }
  if ((andamento.winRatePercento ?? 0) >= 60) {
    return { testo: pescaCasuale(WINRATE_ALTO_SENZA_PARTITA)(), icona: 'trophy' };
  }
  if (andamento.winRatePercento !== null && andamento.winRatePercento < 50) {
    return { testo: pescaCasuale(WINRATE_BASSO_SENZA_PARTITA)(), icona: 'calendar' };
  }
  return { testo: pescaCasuale(FALLBACK)(), icona: 'sparkles' };
}
