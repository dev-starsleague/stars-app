import type {
  Campo, Centro, ClassificaMensile, EventoCustom, Giocatore,
  Prenotazione, RankingGiocatore, Amicizia,
} from '../types/models';

export const CENTRO_ID = '11111111-1111-1111-1111-111111111111';

export const mockCentro: Centro = {
  id: CENTRO_ID,
  nome: 'Padel Stars League',
  citta: 'Viareggio',
  provincia: 'Lucca',
  regione: 'Toscana',
  indirizzo: 'Via del Mare 12',
  logo_url: null,
  copertina_url: null,
  sport_attivi: ['Padel'],
  coin_nome: 'SC',
};

// Altri centri affiliati — solo per popolare in demo la scelta centro dello
// Shop (filtro preferiti/geografico ha senso solo con più di un centro).
export const mockAltriCentri: Centro[] = [
  { id: '11111111-1111-1111-1111-111111111112', nome: 'PSL Firenze', citta: 'Firenze', provincia: 'Firenze', regione: 'Toscana', indirizzo: 'Via dei Campi 4', logo_url: null, copertina_url: null, sport_attivi: ['Padel', 'Tennis'], coin_nome: 'SC' },
  { id: '11111111-1111-1111-1111-111111111113', nome: 'Padel Hero', citta: 'Roma', provincia: 'Roma', regione: 'Lazio', indirizzo: 'Via Appia 100', logo_url: null, copertina_url: null, sport_attivi: ['Padel'], coin_nome: 'SC' },
];

export const mockShopProdotti = [
  { id: 'sp1', centro_id: CENTRO_ID, nome: 'Grip Padel Pro', prezzo_coin: 15, prezzo_euro: null, descrizione: 'Grip antiscivolo, ricambio racchetta', immagine_url: null, stock: 20, varianti: [], attivo: true, condizione: 'nuovo' as const },
  { id: 'sp2', centro_id: CENTRO_ID, nome: 'T-Shirt Stars League', prezzo_coin: 40, prezzo_euro: 12, descrizione: 'Maglietta tecnica del centro', immagine_url: null, stock: 8, varianti: [], attivo: true, condizione: 'nuovo' as const },
  { id: 'sp3', centro_id: '11111111-1111-1111-1111-111111111112', nome: 'Racchetta usata Head', prezzo_coin: 120, prezzo_euro: 35, descrizione: 'Racchetta demo, buone condizioni', immagine_url: null, stock: 1, varianti: [], attivo: true, condizione: 'usato' as const },
  { id: 'sp4', centro_id: '11111111-1111-1111-1111-111111111113', nome: 'Cappellino Padel Hero', prezzo_coin: 25, prezzo_euro: null, descrizione: null, immagine_url: null, stock: 15, varianti: [], attivo: true, condizione: 'nuovo' as const },
];

export const mockCampi: Campo[] = [
  { id: 'c1', centro_id: CENTRO_ID, sport: 'Padel', nome: 'Campo Centrale', tipo: 'Indoor', attivo: true,
    tariffe: [
      { nome: 'Standard', inizio: '08:00', fine: '18:00', prezzo: 40, durata_base_min: 90 },
      { nome: 'Serale', inizio: '18:00', fine: '23:00', prezzo: 52, durata_base_min: 90 },
    ] },
  { id: 'c2', centro_id: CENTRO_ID, sport: 'Padel', nome: 'Campo 2', tipo: 'Indoor', attivo: true,
    tariffe: [
      { nome: 'Standard', inizio: '08:00', fine: '18:00', prezzo: 38, durata_base_min: 90 },
      { nome: 'Serale', inizio: '18:00', fine: '23:00', prezzo: 48, durata_base_min: 90 },
    ] },
  { id: 'c3', centro_id: CENTRO_ID, sport: 'Padel', nome: 'Campo Outdoor A', tipo: 'Outdoor', attivo: true,
    tariffe: [{ nome: 'Standard', inizio: '08:00', fine: '20:00', prezzo: 34, durata_base_min: 90 }] },
];

export const mockGiocatori: Giocatore[] = [
  mk('a0000000-0000-0000-0000-000000000001', 'Marco', 'Bianchi', 'M', 'MB Smash', 'destra', 'destro'),
  mk('a0000000-0000-0000-0000-000000000002', 'Luca', 'Rossi', 'M', 'Il Muro', 'sinistra', 'mancino'),
  mk('a0000000-0000-0000-0000-000000000003', 'Giulia', 'Verdi', 'F', 'GV', 'destra', 'destro'),
  mk('a0000000-0000-0000-0000-000000000004', 'Sara', 'Conti', 'F', 'Volee', 'sinistra', 'destro'),
  mk('a0000000-0000-0000-0000-000000000005', 'Andrea', 'Ferrari', 'M', 'Drop', 'entrambe', 'destro'),
  mk('a0000000-0000-0000-0000-000000000006', 'Paolo', 'Neri', 'M', 'Bandeja', 'destra', 'destro'),
  mk('a0000000-0000-0000-0000-000000000007', 'Chiara', 'Gallo', 'F', 'Chichi', 'destra', 'mancino'),
  mk('a0000000-0000-0000-0000-000000000008', 'Davide', 'Costa', 'M', 'Vibora', 'sinistra', 'destro'),
];

function mk(id: string, nome: string, cognome: string, genere: 'M' | 'F', nickname: string, posizione: any, mano: any): Giocatore {
  return {
    id, user_id: null, nome, cognome, genere, data_nascita: null, telefono: null, email: null,
    profilo: { nickname }, sport_preferiti: ['Padel'], mano_dominante: mano, posizione,
    numero_tessera: null,
  };
}

export const mockRanking: RankingGiocatore[] = [
  r('a0000000-0000-0000-0000-000000000005', 4.20),
  r('a0000000-0000-0000-0000-000000000008', 3.95),
  r('a0000000-0000-0000-0000-000000000001', 3.85),
  r('a0000000-0000-0000-0000-000000000006', 3.60),
  r('a0000000-0000-0000-0000-000000000002', 3.40),
  r('a0000000-0000-0000-0000-000000000003', 3.10),
  r('a0000000-0000-0000-0000-000000000004', 2.95),
  r('a0000000-0000-0000-0000-000000000007', 2.70),
];
function r(giocatore_id: string, ranking: number): RankingGiocatore {
  return { id: 'rk-' + giocatore_id, giocatore_id, sport: 'padel', ranking, stato: 'attivo' };
}

const meseCorrente = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();

export const mockClassifica: ClassificaMensile[] = [
  cm('a0000000-0000-0000-0000-000000000005', 'M', 128, 14, 11),
  cm('a0000000-0000-0000-0000-000000000001', 'M', 115, 15, 10),
  cm('a0000000-0000-0000-0000-000000000008', 'M', 102, 13, 9),
  cm('a0000000-0000-0000-0000-000000000006', 'M', 88, 12, 7),
  cm('a0000000-0000-0000-0000-000000000002', 'M', 74, 11, 6),
  cm('a0000000-0000-0000-0000-000000000003', 'F', 96, 12, 9),
  cm('a0000000-0000-0000-0000-000000000004', 'F', 81, 11, 7),
  cm('a0000000-0000-0000-0000-000000000007', 'F', 63, 10, 5),
];
function cm(giocatore_id: string, genere: 'M' | 'F', punti: number, partite: number, vittorie: number): ClassificaMensile {
  return { id: 'cm-' + giocatore_id, centro_id: CENTRO_ID, giocatore_id, mese: meseCorrente, genere, punti, partite, vittorie,
    giocatore: mockGiocatori.find((g) => g.id === giocatore_id) };
}

function inDays(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export const mockEventi: EventoCustom[] = [
  { id: 'ev1', centro_id: CENTRO_ID, nome: 'Torneo di Primavera', descrizione: 'Girone all\'italiana + eliminazione diretta. Categoria mista aperta a tutti.', divisione: 'misto', stato: 'ready', unita_competitiva: 'coppia_fissa', min_partecipanti: 8, max_partecipanti: 16, apertura_iscrizioni_at: null, chiusura_iscrizioni_at: inDays(10), data_evento: inDays(14), iscritti_count: 6 },
  { id: 'ev2', centro_id: CENTRO_ID, nome: 'Americano del Venerdì', descrizione: 'Formula americano, coppie a rotazione. Serata a premi.', divisione: 'misto', stato: 'ready', unita_competitiva: 'coppia_fissa', min_partecipanti: 8, max_partecipanti: 24, apertura_iscrizioni_at: null, chiusura_iscrizioni_at: inDays(2), data_evento: inDays(3), iscritti_count: 12 },
  { id: 'ev3', centro_id: CENTRO_ID, nome: 'Open Maschile P1000', descrizione: 'Tabellone principale + consolazione.', divisione: 'maschile', stato: 'in_corso', unita_competitiva: 'coppia_fissa', min_partecipanti: 16, max_partecipanti: 32, apertura_iscrizioni_at: null, chiusura_iscrizioni_at: inDays(-2), data_evento: inDays(-1), iscritti_count: 24 },
];

export function mockPrenotazioni(): Prenotazione[] {
  return [
    { id: 'p1', centro_id: CENTRO_ID, campo_id: 'c1', data: inDays(1), inizio: '18:00', fine: '19:30', tipo: 'rank', stato: 'completa', stato_pagamento: 'da_pagare', prezzo: 52, giocatori_extra: ['a0000000-0000-0000-0000-000000000002'], formato: 'doppio', risultato: null, campo: mockCampi[0] },
    { id: 'p2', centro_id: CENTRO_ID, campo_id: 'c2', data: inDays(4), inizio: '20:00', fine: '21:30', tipo: 'amich', stato: 'completa', stato_pagamento: 'da_pagare', prezzo: 48, giocatori_extra: [], formato: 'doppio', risultato: null, campo: mockCampi[1] },
  ];
}

export const mockAmicizie: Amicizia[] = [
  { id: 'am1', richiedente_id: 'me', destinatario_id: 'a0000000-0000-0000-0000-000000000002', stato: 'accettata', created_at: '', amico: mockGiocatori[1] },
  { id: 'am2', richiedente_id: 'me', destinatario_id: 'a0000000-0000-0000-0000-000000000005', stato: 'accettata', created_at: '', amico: mockGiocatori[4] },
  { id: 'am3', richiedente_id: 'a0000000-0000-0000-0000-000000000003', destinatario_id: 'me', stato: 'in_attesa', created_at: '', amico: mockGiocatori[2] },
];

// Giocatore "io" fittizio per la modalità demo (senza login).
// Allineato alla demo: "Prova Prova", in prova, score 0.00, fascia Spark.
export const mockMe: Giocatore = {
  id: 'me', user_id: 'demo', nome: 'Prova', cognome: 'Prova', genere: 'M', data_nascita: null,
  telefono: null, email: 'demo@starsleague.it', profilo: { nickname: undefined, ranking: 0 },
  sport_preferiti: ['Padel'], mano_dominante: 'destro', posizione: 'destra', numero_tessera: 'PSL-0001',
};

// ---- Stars League: dati demo aggiuntivi ----

export const mockCentriNazionali = [
  'Padel Hero Versilia', 'Lucca Padel SSD', 'Padel Plus Massa', 'Padel Hero Pisa',
  'PSL Firenze', 'PSL Roma', 'Dodo Club Massarosa', 'Centro Padel Taddei',
];

export const mockStars = {
  fascia: 'Spark' as const,
  ranking_globale: null,
  score: 0,
  stato_stima: 'in_prova' as const,
  stima_pts: 1000,
  posizione_nazionale: null,
  punti_circuito: 0,
  trend: 0,
  partite_giocate: 0,
  partite_confermate: 0,
  vittorie: 0,
};

export const mockStarsCoin = { saldo: 10 };

export const mockTessera = {
  numero: 'PSL-2026-0001',
  stato: 'da_rinnovare' as const,
  scadenza: '2026-12-31',
  quota: 25,
};

export const mockCircuito = {
  nome: 'Circuito Primavera',
  stagione: '2026',
  centri: 47,
  giocatori: 2340,
  progresso: 64,
};

export const mockClassificaNazionale = [
  { posizione: 1, giocatore_id: 'n1', nome: 'Elena Marchi', centro: 'PSL Firenze', punti: 1240, trend: 2 },
  { posizione: 2, giocatore_id: 'n2', nome: 'Lorenzo Mori', centro: 'Padel Hero', punti: 1180, trend: 0 },
  { posizione: 3, giocatore_id: 'n3', nome: 'Valentina Ricci', centro: 'PSL Roma', punti: 1090, trend: 1 },
  { posizione: 4, giocatore_id: 'n4', nome: 'Fabio Russo', centro: 'PSL Firenze', punti: 980, trend: -1 },
  { posizione: 5, giocatore_id: 'n5', nome: 'Chiara Romano', centro: 'Lucca Padel SSD', punti: 910, trend: 3 },
  { posizione: 6, giocatore_id: 'n6', nome: 'Marco Bianchi', centro: 'Padel Plus Massa', punti: 870, trend: 0 },
  { posizione: 7, giocatore_id: 'n7', nome: 'Giulia Verdi', centro: 'Padel Hero Pisa', punti: 820, trend: -2 },
];

