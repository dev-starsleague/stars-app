// Tipi allineati allo schema del gestionale (stars-system).
// Solo i campi rilevanti per l'app giocatori.

export type Genere = 'M' | 'F';
export type Posizione = 'destra' | 'sinistra' | 'entrambe';
export type ManoDominante = 'destro' | 'mancino' | 'ambidestro';

export interface FasciaOraria {
  da: string; // HH:MM
  a: string; // HH:MM
}

export interface Giocatore {
  id: string;
  user_id: string | null; // collega auth.users -> giocatore (nuovo per l'app)
  nome: string;
  cognome: string;
  genere: Genere | null;
  data_nascita: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale?: string | null;
  profilo: { nickname?: string; ranking?: number; avatar_url?: string; centri_preferiti?: string[] } | null;
  sport_preferiti: string[];
  mano_dominante: ManoDominante | null;
  posizione: Posizione | null;
  disponibilita_oraria?: Record<string, FasciaOraria[]> | null;
  numero_tessera: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

// Orari di apertura per giorno della settimana (chiave = lun/mar/mer/gio/
// ven/sab/dom). Il gestionale salva anche una forma legacy [apertura,
// chiusura] per i centri creati prima dell'introduzione della pausa — vedi
// lib/orari.ts, porting di stars-system src/routes/prenotazioni/+page.svelte
// orariGiorno/orariSlots.
export interface OrarioGiorno {
  apertura: string; // HH:MM
  chiusura: string; // HH:MM
  pausa?: { inizio: string; fine: string } | null;
}
export type OrariCentro = Record<string, OrarioGiorno | [string, string]>;

export interface Centro {
  id: string;
  nome: string;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
  logo_url: string | null;
  copertina_url: string | null;
  sport_attivi: string[];
  coin_nome: string; // es. "SC"
  orari?: OrariCentro | null;
}

export interface ShopProdotto {
  id: string;
  centro_id: string;
  nome: string;
  prezzo_coin: number;
  prezzo_euro: number | null;
  descrizione: string | null;
  immagine_url: string | null;
  stock: number | null;
  varianti: { nome: string; stock: number }[];
  attivo: boolean;
  condizione: 'nuovo' | 'usato';
  // sport a cui è vincolato il prodotto; null = qualsiasi sport (fix utente
  // esplicito: lo shop deve essere filtrato per sport come il resto
  // dell'app, non solo per centro — vedi useSport()/sportAttivo).
  sport: string | null;
  // sponsorizzato dal centro (a pagamento, gestito dal gestionale): compare
  // nel carosello ADV della Home per sponsorizzato_giorni giorni, da
  // sponsorizzato_dal a sponsorizzato_fino (fix utente esplicito: "bisogna
  // scegliere per quanto tempo fare la sponsorizzata") — "attivo davvero" è
  // sempre `sponsorizzato && sponsorizzato_fino >= oggi`, mai il solo flag,
  // vedi getProdottiSponsorizzati().
  sponsorizzato: boolean;
  sponsorizzato_dal: string | null;
  sponsorizzato_fino: string | null;
  sponsorizzato_giorni: number | null;
  sponsorizzato_costo_totale: number | null;
}

export interface AbbonamentoTemplate {
  id: string;
  centro_id: string;
  nome: string;
  tipo: 'lezioni' | 'campo';
  quantita_inclusa: number;
  prezzo_coin: number;
  prezzo_euro: number | null;
  validita_giorni: number | null;
  coach_id: string | null;
  sport: string | null; // null = qualsiasi sport
  attivo: boolean;
  sponsorizzato: boolean;
  sponsorizzato_dal: string | null;
  sponsorizzato_fino: string | null;
  sponsorizzato_giorni: number | null;
  sponsorizzato_costo_totale: number | null;
}

export interface Campo {
  id: string;
  centro_id: string;
  sport: string;
  nome: string;
  tipo: string; // Indoor / Outdoor
  tariffe: Tariffa[];
  attivo: boolean;
  // false = nascosto da tutte le superfici operative (planner incluso);
  // solo_lezioni = prenotabile solo dallo staff per lezioni col maestro,
  // mai per una prenotazione libera — stesso filtro campiVisti del planner.
  visibile?: boolean;
  solo_lezioni?: boolean;
}

export interface Tariffa {
  nome: string;
  inizio: string; // HH:MM
  fine: string; // HH:MM
  prezzo: number;
  durata_base_min: number;
  prezzo_tesserati?: number | null;
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
  // squadra A/B esplicita (fallback: ordine posizionale in giocatori_extra,
  // a1/a2 poi b1/b2, per prenotazioni create prima che questo campo esistesse)
  squadre?: { a: string[]; b: string[] } | null;
  creata_da?: string | null;
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

// Esito del PSL Ranking Engine per una partita — vedi backend/app/models/ranking.py.
// Solo i campi usati per ricostruire lo storico ranking del giocatore.
export interface MatchRanking {
  id: string;
  sport: string;
  data: string; // YYYY-MM-DD
  prenotazione_id: string;
  vincitore: 'A' | 'B' | null;
  a1_id: string; a2_id: string; b1_id: string; b2_id: string;
  a1_pre: number; a2_pre: number; b1_pre: number; b2_pre: number;
  a1_delta: number; a2_delta: number; b1_delta: number; b2_delta: number;
}

// Correzione al ranking non legata a una singola partita (chiusura verifica,
// radar, correzione centro/maestro) — vedi backend/app/models/ranking.py.
export interface RankingOverride {
  id: string;
  giocatore_id: string;
  sport: string;
  tipo: 'centro' | 'radar' | 'verifica' | 'maestro';
  ranking_pre: number;
  ranking_post: number;
  motivazione: string | null;
  data: string; // ISO datetime
}

// Riga unificata (partita o correzione) dello storico ranking di un
// giocatore, ordinata cronologicamente — vedi lib/api.ts getStoricoRanking,
// porting di stars-system/src/lib/rankingStorico.js.
export interface EventoStorico {
  tipo: 'match' | 'override';
  id: string;
  data: string;
  pre: number;
  post: number;
  delta: number;
  // solo tipo 'match'
  vinta?: boolean;
  compagno?: string | null;
  avversari?: string | null;
  // solo tipo 'override'
  overrideTipo?: RankingOverride['tipo'];
  motivazione?: string | null;
}

// ---------- Carosello Home: slide personali (fix utente esplicito,
// "vita sportiva recente del giocatore") — strutture pulite pensate per
// essere alimentate da un endpoint di aggregazione dedicato in futuro
// (oggi calcolate lato client dalle prenotazioni reali, vedi lib/api.ts
// getAndamentoRecente/getInsightsSociali/getVariazioneRankingGlobale).
// Ogni struttura è SEMPRE "abbastanza dati sì/no" esplicito (mai 0/null
// silenziosi): il chiamante mostra un messaggio contestuale quando manca.

/** Prossima partita reale in calendario (qualunque sport passato) — usata
 *  per la frase contestuale della slide 2 (fix utente esplicito: "se il
 *  giocatore ha una serie positiva ed ha una partita a breve deve dire
 *  qualcosa a riguardo"). null = nessuna partita futura in programma. */
export interface ProssimaPartita {
  data: string; // YYYY-MM-DD
  giorni: number; // 0 = oggi, 1 = domani, ecc.
}

/** Variazione di posizione nel ranking nazionale negli ultimi N giorni. */
export interface VariazioneRanking {
  posizioneAttuale: number;
  totale: number;
  // null = non ricostruibile (es. il giocatore non era ancora in
  // classifica N giorni fa) — il chiamante mostra solo la posizione
  // attuale, senza inventare una variazione.
  posizionePrecedente: number | null;
  giorni: number;
}

/** Rendimento nelle ultime N partite giocate (qualunque sport/centro). */
export interface AndamentoRecente {
  finestra: number; // quante partite considerate al massimo (N richiesto)
  disputate: number; // quante ne ha davvero giocate (<= finestra)
  vinte: number;
  perse: number;
  winRatePercento: number | null; // null se disputate === 0
  streak: { tipo: 'vittorie' | 'sconfitte'; conteggio: number } | null; // null se < 2 di fila
  // Esito delle ultime partite, la più recente per prima (true = vittoria) —
  // fino a 10, per il "form guide" della slide 2 (fix utente esplicito:
  // pallini 🟢/🔴 dalla meno recente alla più recente).
  formaRecente: boolean[];
  // Set vinti/persi nelle stesse partite considerate sopra (fix utente
  // esplicito: "Set vinti"/"Set persi" al posto di "Punti fatti/subiti").
  setVinti: number;
  setPersi: number;
  // Andamento: confronta la percentuale di vittorie tra le 5 partite più
  // vecchie e le 5 più recenti (delle ultime 10) — null se ci sono troppo
  // poche partite per un confronto sensato (fix utente esplicito).
  trend: 'crescita' | 'calo' | 'stabile' | null;
}

/** Un "insight" su un altro giocatore (compagno/nemesi/avversario preferito). */
export interface InsightAvversario {
  giocatoreId: string;
  nome: string;
  avatarUrl: string | null;
  partiteInsieme: number; // partite in comune (come compagni o avversari, a seconda del blocco)
  vittorie: number; // vittorie MIE in quelle partite
  sconfitte: number; // sconfitte MIE in quelle partite
}

/** I 3 blocchi "social" della slide 3 — ciascuno null quando non ci sono
 *  ancora abbastanza partite in comune con qualcuno per essere significativo
 *  (soglia minima applicata da getInsightsSociali, non dalla UI). */
export interface InsightsSociali {
  compagnoPreferito: InsightAvversario | null;
  nemesi: InsightAvversario | null;
  avversarioPreferito: InsightAvversario | null;
}

/** Una riga della classifica "RanDuo" — coppie più forti di un centro, per
 *  sport (fix utente esplicito, tab Classifiche: "classifiche di coppia").
 *  Solo per sport a doppio: vedi lib/stars.ts SPORT_SINGOLI. */
export interface RigaClassificaCoppia {
  giocatore1Id: string;
  giocatore2Id: string;
  nome1: string;
  nome2: string;
  genere1: Genere | null;
  genere2: Genere | null;
  partiteInsieme: number;
  vittorie: number;
  sconfitte: number;
  winRatePercento: number;
}

export interface ClassificaMensile {
  id: string;
  centro_id: string;
  giocatore_id: string;
  mese: string; // YYYY-MM-01
  sport: string;
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
  // promozione nel carosello ADV della Home (fix utente esplicito)
  in_evidenza: boolean;
  immagine_url: string | null;
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
