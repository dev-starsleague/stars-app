import type { Fascia } from '../types/models';
import type { AppColors } from '../constants/theme';

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

export const BADGE_CATALOGO = [
  { id: 'b1', nome: 'Prima partita', descrizione: 'Ha giocato la sua prima partita PSL', icona: '🎾' },
  { id: 'b2', nome: 'Prima vittoria', descrizione: 'Ha vinto la sua prima partita', icona: '🏆' },
  { id: 'b3', nome: 'Star of the Match', descrizione: 'Miglior giocatore di una partita', icona: '⭐' },
  { id: 'b4', nome: 'Streak x3', descrizione: 'Tre vittorie di fila', icona: '🔥' },
  { id: 'b5', nome: 'Veterano', descrizione: '50 partite confermate', icona: '🎖️' },
  { id: 'b6', nome: 'Tesserato PSL', descrizione: 'Tessera annuale attiva', icona: '💳' },
];
