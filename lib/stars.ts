import type { Fascia } from '../types/models';
import type { AppColors } from '../constants/theme';

// Stesso tasso fisso, uguale per tutti i centri, di stars-system/src/lib/
// coin.js (1 Stars Coin = €0,01 — fix utente esplicito lì, non
// configurabile): usato qui per mostrare SEMPRE un controvalore in € anche
// quando il prodotto/abbonamento non ne ha uno impostato esplicitamente
// dallo staff (fix utente esplicito: "voglio poter vedere i prodotti con
// cifra in Stars Coin e in €"). Il prezzo in € impostato a mano dallo staff
// (prezzo_euro) resta sempre la fonte di verità quando c'è — questo è solo
// il fallback per mostrare comunque un controvalore stimato.
export const VALORE_COIN_EURO = 0.01;
export function coinInEuro(coin: number): number {
  return (Number(coin) || 0) * VALORE_COIN_EURO;
}
/** "4,50 €" — stessa notazione italiana (virgola) usata per i prezzi in
 *  euro impostati a mano dallo staff, per un controvalore stimato. */
export function formattaEuro(euro: number): string {
  return `${euro.toFixed(2).replace('.', ',')} €`;
}

// Soglie fasce basate sullo score di ranking (padel), stile PSL.
// Spark = non ancora stimato / nessuna partita.
const SOGLIE: { fascia: Fascia; min: number }[] = [
  { fascia: '8★', min: 6.5 },
  { fascia: '7★', min: 5.5 },
  { fascia: '6★', min: 4.5 },
  { fascia: '5★', min: 3.8 },
  { fascia: '4★', min: 3.1 },
  { fascia: '3★', min: 2.4 },
  { fascia: '2★', min: 1.7 },
  { fascia: '1★', min: 1.0 },
];

export function fasciaDaScore(score: number | null | undefined, stimato = true): Fascia {
  if (!stimato || !score || score <= 0) return 'Spark';
  for (const s of SOGLIE) if (score >= s.min) return s.fascia;
  return '1★';
}

// Colori pallino per fascia (come i chip colorati nella schermata Classifica).
// Funzione (non oggetto statico) perché Spark/5★ leggono dal tema corrente
// via useTheme() nel chiamante — vedi lib/theme.tsx.
export function coloreFascia(fascia: Fascia, colors: AppColors): string {
  const mappa: Record<Fascia, string> = {
    Spark: colors.slate,
    '1★': '#3B82F6',
    '2★': '#06B6D4',
    '3★': '#22C55E',
    '4★': '#84CC16',
    '5★': colors.gold,
    '6★': '#F97316',
    '7★': '#EF4444',
    '8★': '#A855F7',
  };
  return mappa[fascia];
}

export const FASCE_ORDINATE: Fascia[] = ['Spark', '1★', '2★', '3★', '4★', '5★', '6★'];

// Elenco sport della piattaforma — unica fonte (prima duplicato localmente
// in modifica-profilo.tsx), usato anche dal selettore sport nell'header
// (vedi lib/sport.tsx).
export const SPORT_DISPONIBILI = ['Padel', 'Tennis', 'Pickleball', 'Beach Tennis'];

// Sport individuali: niente doppio, quindi niente classifica di coppia
// "RanDuo" (fix utente esplicito, tab Classifiche: "per il Tennis e gli
// sport singolari non mettere le classifiche di coppia"). Elenco esplicito
// (non dedotto dai dati) così un nuovo sport a doppio funziona da subito
// anche prima che esistano partite, e uno singolare non fa comparire la
// scheda per un attimo prima che i dati confermino che è vuota.
export const SPORT_SINGOLI = ['Tennis'];

// Categoria del giocatore per il PSL Ranking Engine — stessa identica
// formula del gestionale (stars-system/src/routes/classifiche/+page.svelte
// categoriaRanking), portata qui 1:1 per restare coerenti tra le due app:
// "mai valutato" (nessuna riga in ranking-giocatori per quello sport) è
// diverso da un ranking basso genuinamente valutato.
export function categoriaRanking(valore: number | null | undefined): string {
  if (valore == null) return 'Non valutato';
  if (valore < 1) return 'Spark';
  return `${Math.min(8, Math.floor(valore))}⭐`;
}
// Bande selezionabili nel filtro "categoria" della classifica Ranking/
// RanQueen (fix utente esplicito) — stesso ordine dal più forte al più
// debole, "Non valutato" per ultimo perché non è davvero una fascia di
// livello.
export const CATEGORIE_RANKING = ['8⭐', '7⭐', '6⭐', '5⭐', '4⭐', '3⭐', '2⭐', '1⭐', 'Spark', 'Non valutato'];

export const BADGE_CATALOGO = [
  { id: 'b1', nome: 'Prima partita', descrizione: 'Ha giocato la sua prima partita PSL', icona: '🎾' },
  { id: 'b2', nome: 'Prima vittoria', descrizione: 'Ha vinto la sua prima partita', icona: '🏆' },
  { id: 'b3', nome: 'Star of the Match', descrizione: 'Miglior giocatore di una partita', icona: '⭐' },
  { id: 'b4', nome: 'Streak x3', descrizione: 'Tre vittorie di fila', icona: '🔥' },
  { id: 'b5', nome: 'Veterano', descrizione: '50 partite confermate', icona: '🎖️' },
  { id: 'b6', nome: 'Tesserato PSL', descrizione: 'Tessera annuale attiva', icona: '💳' },
];
