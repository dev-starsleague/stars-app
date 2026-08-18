// Tipi allineati allo schema del gestionale (stars-system).
// Solo i campi rilevanti per l'app giocatori.

export type Genere = 'M' | 'F';
export type Posizione = 'destra' | 'sinistra' | 'entrambe';
export type ManoDominante = 'destro' | 'mancino' | 'ambidestro';

export interface Giocatore {
  id: string;
  user_id: string | null; // collega auth.users -> giocatore (nuovo per l'app)
  nome: string;
  cognome: string;
  genere: Genere | null;
  data_nascita: string | null;
  telefono: string | null;
  email: string | null;
  profilo: { nickname?: string; ranking?: number; avatar_url?: string } | null;
  sport_preferiti: string[];
  mano_dominante: ManoDominante | null;
  posizione: Posizione | null;
  numero_tessera: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

export interface Centro {
  id: string;
  nome: string;
  citta: string | null;
  indirizzo: string | null;
  logo_url: string | null;
  copertina_url: string | null;
  sport_attivi: string[];
  coin_nome: string; // es. "SC"
}

export interface Campo {
  id: string;
  centro_id: string;
  sport: string;
  nome: string;
  tipo: string; // Indoor / Outdoor
  tariffe: Tariffa[];
  attivo: boolean;
}

export interface Tariffa {
  nome: string;
  inizio: string; // HH:MM
  fine: string; // HH:MM
  prezzo: number;
  durata_base_min: number;
}

export type StatoPrenotazione = 'attesa' | 'completa';
export type StatoPagamento = 'da_pagare' | 'saldato';
export type TipoPrenotazione = 'rank' | 'amich' | 'lezione' | 'torneo' | 'prenotato';

export interface Prenotazione {
  id: string;
  centro_id: string;
  campo_id: string | null;
  data: string | null; // YYYY-MM-DD
  inizio: string | null; // HH:MM
  fine: string | null; // HH:MM
  tipo: TipoPrenotazione;
  stato: StatoPrenotazione;
  stato_pagamento: StatoPagamento;
  prezzo: number;
  giocatori_extra: string[]; // id giocatori
  formato: 'singolo' | 'doppio' | null;
  risultato: Risultato | null;
  // join lato client
  campo?: Campo;
  giocatori?: Giocatore[];
}

export interface Risultato {
  sets: { a: number; b: number; tb?: boolean }[];
  vincitore: 'A' | 'B';
  set_a?: number;
  set_b?: number;
  game_a?: number;
  game_b?: number;
}

export interface RankingGiocatore {
  id: string;
  giocatore_id: string;
  sport: string;
  ranking: number;
  stato: 'in_verifica' | 'attivo';
}

export interface ClassificaMensile {
  id: string;
  centro_id: string;
  giocatore_id: string;
  mese: string; // YYYY-MM-01
  genere: Genere;
  punti: number;
  partite: number;
  vittorie: number;
  giocatore?: Giocatore;
}

export type StatoEvento = 'draft' | 'ready' | 'in_corso' | 'completed' | 'cancelled';

export interface EventoCustom {
  id: string;
  centro_id: string;
  nome: string;
  descrizione: string | null;
  divisione: 'maschile' | 'femminile' | 'misto';
  stato: StatoEvento;
  unita_competitiva: string;
  min_partecipanti: number;
  max_partecipanti: number | null;
  apertura_iscrizioni_at: string | null;
  chiusura_iscrizioni_at: string | null;
  data_evento?: string | null;
  // conteggi lato client
  iscritti_count?: number;
  iscritto?: boolean;
}

export interface EventoPartecipante {
  id: string;
  evento_id: string;
  giocatore_1_id: string;
  giocatore_2_id: string;
  ranking_coppia: number;
  seed: number | null;
  stato: 'iscritto' | 'ritirato';
}

export interface CoinSaldo {
  giocatore_id: string;
  centro_id: string;
  saldo: number;
}

// ---- Concetti Stars League (allineati alla demo) ----

// Fascia di gioco: Spark (non ancora stimato) poi 1★..8★
export type Fascia = 'Spark' | '1★' | '2★' | '3★' | '4★' | '5★' | '6★' | '7★' | '8★';

export type StatoStima = 'in_prova' | 'stimato';

export interface StarsProfilo {
  fascia: Fascia;
  ranking_globale: number | null; // posizione nazionale, null se in prova
  score: number; // punteggio ranking (es. 0.00)
  stato_stima: StatoStima;
  stima_pts: number; // reputazione/stima 0-1000
  posizione_nazionale: number | null;
  punti_circuito: number;
  trend: number; // +3, -1, 0...
  partite_giocate: number;
  partite_confermate: number;
  vittorie: number;
}

export interface StarsCoin {
  saldo: number;
}

export interface Tessera {
  numero: string;
  stato: 'attiva' | 'scaduta' | 'da_rinnovare';
  scadenza: string | null; // YYYY-MM-DD
  quota: number;
}

export interface CircuitoNazionale {
  nome: string; // "Circuito Primavera"
  stagione: string; // "2026"
  centri: number;
  giocatori: number;
  progresso: number; // 0-100
}

export interface RigaClassificaNazionale {
  posizione: number;
  giocatore_id: string;
  nome: string;
  centro: string;
  punti: number;
  trend: number;
}

export interface Badge {
  id: string;
  nome: string;
  descrizione: string;
  icona: string; // emoji
  ottenuto: boolean;
}

export type StatoAmicizia = 'in_attesa' | 'accettata';

export interface Amicizia {
  id: string;
  richiedente_id: string;
  destinatario_id: string;
  stato: StatoAmicizia;
  created_at: string;
  amico?: Giocatore;
}
