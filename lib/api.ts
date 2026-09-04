// ============================================================
// Dati dell'app: stesso backend FastAPI di stars-system (SQLite oggi,
// Postgres in futuro), stessi router CRUD generici — nessun database/API
// separato. Il generico supporta solo filtri di uguaglianza esatta e non
// ha join/order lato server: dove serve, filtriamo/ordiniamo/arricchiamo
// lato client dopo il fetch, stesso approccio già usato in
// stars-system/src/lib/api/*.js (vedi giocatori.js, prenotazioni.js).
// ============================================================

import { apiDelete, apiGet, apiGetFirst, apiPatch, apiPost, apiUpload, isApiConfigured, sortBy } from './apiClient';
import * as mock from './mockData';
import { fasciaDaScore } from './stars';
import type {
  Campo, Centro, ClassificaMensile, EventoCustom, EventoStorico, Giocatore,
  MatchRanking, Prenotazione, RankingGiocatore, RankingOverride, Amicizia, StarsProfilo,
  CircuitoNazionale, RigaClassificaNazionale, Tessera, ShopProdotto, AbbonamentoTemplate,
} from '../types/models';

// "Entra in modalità demo" deve mostrare sempre dati finti, anche quando
// EXPO_PUBLIC_API_URL punta a un backend vero raggiungibile (in sviluppo è
// quasi sempre il caso) — altrimenti la modalità demo chiamerebbe comunque
// le API reali con un giocatore fittizio ("me") che non esiste nel
// database, mostrando liste vuote invece dei dati demo. `let` (non `const`)
// perché lib/auth.tsx la aggiorna a runtime via setDemoDataMode quando
// l'utente entra/esce dalla modalità demo — le funzioni sotto leggono
// sempre il valore corrente, non uno snapshot preso al caricamento.
let forzaMock = false;
export function setDemoDataMode(attiva: boolean) { forzaMock = attiva; }

const isMock = () => forzaMock || !isApiConfigured;

// Secondo raggio di sicurezza, indipendente da forzaMock: forzaMock è una
// variabile di modulo, non stato React — con Fast Refresh in sviluppo (un
// salvataggio su questo stesso file la fa rieseguire da capo) può azzerarsi
// mentre React "ricorda" ancora me=mockMe, e una scrittura finirebbe sul
// backend vero con l'id fittizio "me" (visto succedere: POST /prenotazioni
// → 422 "me" non è uno UUID valido). Qualunque funzione che scrive dati
// legati a un giocatore controlla anche questo, non solo isMock().
const eIlGiocatoreDemo = (giocatoreId?: string | null) => giocatoreId === mock.mockMe.id;

// Il backend non ha colonne dedicate avatar_url/numero_tessera: vivono
// dentro il JSON self-service `profilo` (vedi backend/app/schemas/giocatore.py,
// ProfiloGiocatore). user_id era il collegamento a Supabase Auth: non più
// pertinente senza autenticazione reale, sempre null.
function mapGiocatore(raw: any): Giocatore {
  return {
    ...raw,
    user_id: null,
    numero_tessera: raw?.profilo?.numero_tessera ?? null,
    avatar_url: raw?.profilo?.avatar_url ?? null,
  };
}

// ---------- Centro ----------
export async function getCentro(): Promise<Centro> {
  if (isMock()) return mock.mockCentro;
  const { data } = await apiGetFirst<Centro>('/centri');
  return data ?? mock.mockCentro;
}

/** Elenco di TUTTI i centri affiliati (il backend è condiviso da centinaia
 *  di centri/gestionali, non solo uno — vedi Shop, che aggrega prodotti di
 *  ogni centro e fa scegliere quale). */
export async function getCentri(): Promise<Centro[]> {
  if (isMock()) return [mock.mockCentro];
  const { data } = await apiGet<Centro[]>('/centri');
  return data ?? [];
}

/** Richiede allo staff del centro una valutazione del proprio livello di
 *  gioco: crea la riga giocatori_centri con origine "richiesta_app" (valore
 *  già previsto sul modello backend proprio per questo flusso, vedi
 *  backend/app/models/giocatore_centro.py) — il giocatore compare così
 *  automaticamente nella coda "Giocatori da valutare" del gestionale. */
export async function richiediValutazione(giocatoreId: string, centroId: string): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(giocatoreId)) return { ok: true };
  const { error } = await apiPost('/giocatori-centri', {
    giocatore_id: giocatoreId, centro_id: centroId, stato_valutazione: 'da_valutare', origine: 'richiesta_app',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Profilo dell'utente loggato ----------
export async function getMioProfilo(giocatoreId: string | null): Promise<Giocatore | null> {
  if (isMock()) return mock.mockMe;
  if (!giocatoreId) return null;
  const { data } = await apiGet<any>(`/giocatori/${giocatoreId}`);
  return data ? mapGiocatore(data) : null;
}

export async function updateProfilo(id: string, patch: Partial<Giocatore>): Promise<void> {
  if (isMock() || eIlGiocatoreDemo(id)) return;
  const { avatar_url, numero_tessera, profilo: profiloPatch, ...resto } = patch as any;
  const backendPatch: Record<string, unknown> = { ...resto };
  if (avatar_url !== undefined || numero_tessera !== undefined || profiloPatch !== undefined) {
    // il PATCH sostituisce l'intero JSON `profilo`: leggiamo quello attuale
    // prima di scriverlo, altrimenti aggiornare solo l'avatar cancellerebbe
    // nickname/ranking già salvati.
    const { data: attuale } = await apiGet<any>(`/giocatori/${id}`);
    backendPatch.profilo = {
      ...(attuale?.profilo ?? {}),
      ...(profiloPatch ?? {}),
      ...(avatar_url !== undefined ? { avatar_url } : {}),
      ...(numero_tessera !== undefined ? { numero_tessera } : {}),
    };
  }
  await apiPatch(`/giocatori/${id}`, backendPatch);
}

/** Carica la foto profilo e ne restituisce l'url (relativo, da comporre con
 *  apiUrl per mostrarla, o da salvare così com'è in profilo.avatar_url via
 *  updateProfilo). In demo mode non c'è un vero upload: si ripropone l'uri
 *  locale così l'anteprima nell'app funziona comunque. */
export async function caricaFotoProfilo(uri: string, mimeType: string): Promise<{ url: string | null; error?: string }> {
  if (isMock()) return { url: uri };
  const { data, error } = await apiUpload<{ url: string }>('/upload-immagine', uri, mimeType);
  return error ? { url: null, error: error.message } : { url: data?.url ?? null };
}

/** Elenco completo dei giocatori — usato per risolvere i nomi di
 *  compagno/avversari nello storico ranking (vedi getStoricoRanking). */
export async function getGiocatori(): Promise<Giocatore[]> {
  if (isMock()) return mock.mockGiocatori;
  const { data } = await apiGet<any[]>('/giocatori');
  return (data ?? []).map(mapGiocatore);
}

// ---------- Campi ----------
/** Campi prenotabili di UN centro (il backend è condiviso da centinaia di
 *  centri: senza filtro centro_id vedremmo i campi di tutti insieme — vedi
 *  Prenota, che per questo chiede sempre prima il centro). Esclude, come il
 *  planner del gestionale (campiVisti in prenotazioni/+page.svelte), i campi
 *  nascosti (`visibile===false`) e quelli prenotabili solo dallo staff per
 *  lezioni (`solo_lezioni`). */
export async function getCampi(centroId: string): Promise<Campo[]> {
  const visibili = (campi: Campo[]) => campi.filter((c) => c.visibile !== false && !c.solo_lezioni);
  if (isMock()) return visibili(mock.mockCampi.filter((c) => c.centro_id === centroId));
  const { data } = await apiGet<Campo[]>('/campi', { attivo: true, centro_id: centroId });
  return sortBy(visibili(data ?? []), (c) => c.nome);
}

// ---------- Prenotazioni ----------
export async function getPrenotazioniGiorno(campoIds: string[], data: string): Promise<Prenotazione[]> {
  if (isMock()) return mock.mockPrenotazioni().filter((p) => p.data === data);
  const { data: rows } = await apiGet<Prenotazione[]>('/prenotazioni', { data });
  return (rows ?? []).filter((p) => p.campo_id && campoIds.includes(p.campo_id));
}

/** Prenotazioni del giocatore in un giorno, su QUALSIASI campo/sport/centro
 *  — usata da Prenota per bloccare in anticipo, in UI, uno slot che si
 *  accavallerebbe con un impegno già preso per un altro sport (fix utente
 *  esplicito: "se ho una prenotazione per uno sport non devo poter fare una
 *  prenotazione che si accavalli alla prima per qualsiasi sport"). Il
 *  backend rifiuta comunque la sovrapposizione a prescindere da questo
 *  controllo lato client (_valida_conflitto_giocatori, per persona non per
 *  campo) — questo serve solo a non far scoprire il conflitto al giocatore
 *  solo alla conferma finale, dopo aver già scelto orario/campo/invitati.
 *  Le lezioni non contano come impegno qui, stessa esclusione del backend. */
export async function getPrenotazioniGiornoGiocatore(giocatoreId: string, data: string): Promise<Prenotazione[]> {
  if (isMock()) return mock.mockPrenotazioni().filter((p) => p.data === data && p.giocatori_extra?.includes(giocatoreId));
  const { data: rows } = await apiGet<Prenotazione[]>('/prenotazioni', { data });
  return (rows ?? []).filter((p) => p.tipo !== 'lezione' && p.giocatori_extra?.includes(giocatoreId));
}

export async function getMiePrenotazioni(giocatoreId: string): Promise<Prenotazione[]> {
  if (isMock()) return mock.mockPrenotazioni();
  const oggi = new Date().toISOString().slice(0, 10);
  const [{ data: rows }, { data: campi }] = await Promise.all([
    apiGet<Prenotazione[]>('/prenotazioni', { creata_da: giocatoreId }),
    apiGet<Campo[]>('/campi'),
  ]);
  const campoById = new Map((campi ?? []).map((c) => [c.id, c]));
  const arricchite = (rows ?? [])
    .filter((p) => (p.data ?? '') >= oggi)
    .map((p) => ({ ...p, campo: p.campo_id ? campoById.get(p.campo_id) : undefined }));
  return sortBy(arricchite, (p) => p.data ?? '');
}

export async function creaPrenotazione(input: {
  centro_id: string; campo_id: string; creata_da: string;
  data: string; inizio: string; fine: string; prezzo: number;
  // giocatori invitati oltre a chi prenota (che c'è sempre, aggiunto qui
  // sotto) — usati anche per derivare formato singolo/doppio, stessa
  // convenzione del gestionale (2 giocatori → singolo, 4 → doppio).
  invitati?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.creata_da)) return { ok: true };
  const { invitati, ...resto } = input;
  // chi prenota gioca sempre: senza questo la prenotazione non
  // comparirebbe nel suo storico partite (getPartiteGiocatore filtra su
  // giocatori_extra).
  const giocatoriExtra = [input.creata_da, ...(invitati ?? [])];
  const formato = giocatoriExtra.length === 2 ? 'singolo' : giocatoriExtra.length === 4 ? 'doppio' : null;
  const { error } = await apiPost('/prenotazioni', {
    ...resto, origine: 'app', tipo: 'prenotato', stato: 'completa', stato_pagamento: 'da_pagare',
    giocatori_extra: giocatoriExtra, formato,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function annullaPrenotazione(id: string): Promise<void> {
  if (isMock()) return;
  await apiDelete(`/prenotazioni/${id}`);
}

/** Registra il risultato di una partita già giocata — stesso endpoint del
 *  planner (POST /prenotazioni/{id}/risultato), che alimenta sia i punti
 *  classifica sia il PSL Ranking Engine. Richiede almeno un set e un
 *  formato singolo/doppio già assegnato alla prenotazione. */
export async function salvaRisultatoPartita(prenotazioneId: string, payload: {
  sets: { a: number; b: number; tb?: boolean }[];
  vincitore: 'A' | 'B';
  sport: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPost(`/prenotazioni/${prenotazioneId}/risultato`, payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Tutte le partite (passate e future) a cui il giocatore ha preso parte,
 *  dal più recente. Il generico non supporta filtri su colonne JSON come
 *  giocatori_extra: si prendono le prenotazioni del centro e si filtra lato
 *  client, stesso pattern di getPrenotazioniCentro in
 *  stars-system/src/lib/api/giocatori.js. A differenza di getMiePrenotazioni
 *  (solo prenotazioni future, usata in Home) questa copre tutto lo storico. */
export async function getPartiteGiocatore(giocatoreId: string): Promise<Prenotazione[]> {
  if (isMock()) return mock.mockPrenotazioni();
  // Nessun filtro centro_id qui: un giocatore può aver giocato in centri
  // diversi (era un bug, non una scelta — filtrava sempre sul centro demo).
  const [{ data: rows }, { data: campi }] = await Promise.all([
    apiGet<Prenotazione[]>('/prenotazioni'),
    apiGet<Campo[]>('/campi'),
  ]);
  const campoById = new Map((campi ?? []).map((c) => [c.id, c]));
  const mie = (rows ?? [])
    .filter((p) => p.giocatori_extra?.includes(giocatoreId))
    .map((p) => ({ ...p, campo: p.campo_id ? campoById.get(p.campo_id) : undefined }));
  return sortBy(mie, (p) => p.data ?? '', { desc: true });
}

/** true se il giocatore ha vinto questa prenotazione — usa `squadre` se
 *  presente, altrimenti l'ordine posizionale in giocatori_extra (a1/a2 poi
 *  b1/b2 per il doppio) come da convenzione documentata sul modello backend.
 *  null se non determinabile (nessun risultato registrato). */
export function haVinto(p: Prenotazione, giocatoreId: string): boolean | null {
  if (!p.risultato?.vincitore) return null;
  let squadraA: string[];
  if (p.squadre) {
    squadraA = p.squadre.a;
  } else {
    const meta = Math.ceil(p.giocatori_extra.length / 2);
    squadraA = p.giocatori_extra.slice(0, meta);
  }
  const inSquadraA = squadraA.includes(giocatoreId);
  return p.risultato.vincitore === 'A' ? inSquadraA : !inSquadraA;
}

// ---------- Ranking ----------
export async function getRanking(sport: string = 'Padel'): Promise<(RankingGiocatore & { giocatore?: Giocatore })[]> {
  if (isMock()) {
    return mock.mockRanking
      .map((r) => ({ ...r, giocatore: mock.mockGiocatori.find((g) => g.id === r.giocatore_id) }))
      .sort((a, b) => b.ranking - a.ranking);
  }
  const [{ data: ranking }, { data: giocatori }] = await Promise.all([
    apiGet<RankingGiocatore[]>('/ranking-giocatori', { sport }),
    apiGet<any[]>('/giocatori'),
  ]);
  const giocatoreById = new Map((giocatori ?? []).map((g) => [g.id, mapGiocatore(g)]));
  const arricchito = (ranking ?? []).map((r) => ({ ...r, giocatore: giocatoreById.get(r.giocatore_id) }));
  return sortBy(arricchito, (r) => r.ranking, { desc: true });
}

/** Storico ranking (partite + correzioni) di un giocatore per uno sport,
 *  ordinato cronologicamente — porting diretto di
 *  stars-system/src/lib/rankingStorico.js (costruisciStoricoRanking): le
 *  correzioni contano quanto le partite, altrimenti un giocatore
 *  "in verifica" mostrerebbe una riga piatta seguita da un salto
 *  ingiustificato. Vuoto per un giocatore mai valutato (nessuna riga né in
 *  match-ranking né in ranking-override), che è lo stato demo di default. */
export async function getStoricoRanking(giocatoreId: string, sport: string): Promise<EventoStorico[]> {
  if (isMock()) return [];
  const [{ data: matches }, { data: overrides }, giocatori] = await Promise.all([
    apiGet<MatchRanking[]>('/match-ranking', { sport }),
    apiGet<RankingOverride[]>('/ranking-override', { giocatore_id: giocatoreId, sport }),
    getGiocatori(),
  ]);
  const nomeGiocatore = (id: string) => {
    const g = giocatori.find((x) => x.id === id);
    return g ? `${g.nome} ${g.cognome[0]}.` : null;
  };
  const mieMatch = (matches ?? []).filter(
    (m) => m.a1_id === giocatoreId || m.a2_id === giocatoreId || m.b1_id === giocatoreId || m.b2_id === giocatoreId
  );
  const eventiMatch: EventoStorico[] = mieMatch.map((m) => {
    const slot = m.a1_id === giocatoreId ? 'a1' : m.a2_id === giocatoreId ? 'a2' : m.b1_id === giocatoreId ? 'b1' : 'b2';
    const delta = Number((m as any)[`${slot}_delta`] ?? 0);
    const pre = Number((m as any)[`${slot}_pre`] ?? 0);
    const squadra = slot === 'a1' || slot === 'a2' ? ['a1', 'a2'] : ['b1', 'b2'];
    const squadraAvv = squadra[0] === 'a1' ? ['b1', 'b2'] : ['a1', 'a2'];
    const compagnoId = (m as any)[`${squadra.find((s) => s !== slot)}_id`];
    return {
      tipo: 'match', id: m.id, data: m.data, pre, post: +(pre + delta).toFixed(2), delta,
      vinta: (slot === 'a1' || slot === 'a2') ? m.vincitore === 'A' : m.vincitore === 'B',
      compagno: nomeGiocatore(compagnoId),
      avversari: squadraAvv.map((s) => nomeGiocatore((m as any)[`${s}_id`])).filter(Boolean).join(' / '),
    };
  });
  const eventiOverride: EventoStorico[] = (overrides ?? []).map((o) => ({
    tipo: 'override', id: o.id, data: o.data, overrideTipo: o.tipo, motivazione: o.motivazione,
    pre: Number(o.ranking_pre), post: Number(o.ranking_post), delta: Number(o.ranking_post) - Number(o.ranking_pre),
  }));
  // concatenati con le partite prima: Array.prototype.sort è stabile, quindi
  // a parità di istante la partita resta prima della correzione che ne è
  // scaturita (es. chiusura verifica nello stesso momento).
  return [...eventiMatch, ...eventiOverride].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
}

/** Ranking attuale di un giocatore per uno sport specifico — null se non è
 *  ancora mai stato valutato per quello sport (vedi richiediValutazione). */
export async function getRankingAttuale(giocatoreId: string, sport: string): Promise<{ ranking: number; stato: string } | null> {
  if (isMock()) return null; // mockMe è deliberatamente "in prova" — vedi mockData.ts
  const { data } = await apiGetFirst<RankingGiocatore>('/ranking-giocatori', { giocatore_id: giocatoreId, sport });
  return data ? { ranking: data.ranking, stato: data.stato } : null;
}

// ---------- Classifica mensile ----------
/** `centroId` opzionale: senza, mescola le righe di TUTTI i centri (comportamento
 *  storico, invariato) — con, filtra alla "Star del mese" di quel solo centro
 *  (fix utente esplicito: widget Home "classifica star del mese di un
 *  determinato centro"). ClassificaMensile è già scoped per centro_id nel
 *  backend (una riga per centro/sport/giocatore/mese/genere), qui si passa
 *  solo il filtro in più al generico. */
export async function getClassifica(genere: 'M' | 'F', sport: string = 'Padel', centroId?: string): Promise<ClassificaMensile[]> {
  const mese = meseCorrente();
  if (isMock()) {
    return mock.mockClassifica
      .filter((c) => c.genere === genere && c.sport === sport && (!centroId || c.centro_id === centroId))
      .sort(ordinaClassifica);
  }
  const params: Record<string, string> = { mese, genere, sport };
  if (centroId) params.centro_id = centroId;
  const [{ data: righe }, { data: giocatori }] = await Promise.all([
    apiGet<ClassificaMensile[]>('/classifica-mensile', params),
    apiGet<any[]>('/giocatori'),
  ]);
  const giocatoreById = new Map((giocatori ?? []).map((g) => [g.id, mapGiocatore(g)]));
  const arricchita = (righe ?? []).map((c) => ({ ...c, giocatore: giocatoreById.get(c.giocatore_id) }));
  return arricchita.sort(ordinaClassifica);
}

export interface PosizioneClassifica { posizione: number; totale: number; valore: number }

/** Giocatori affiliati a un centro (righe giocatori_centri) — usato per
 *  restringere una classifica ranking "di un centro" o "di una zona" ai
 *  soli giocatori di quel/quei centri (fix utente esplicito, widget Home). */
async function getMembriCentri(centroIds: string[]): Promise<Set<string>> {
  if (isMock() || centroIds.length === 0) return new Set();
  const risultati = await Promise.all(centroIds.map((id) => apiGet<any[]>('/giocatori-centri', { centro_id: id })));
  const ids = new Set<string>();
  for (const { data } of risultati) for (const riga of data ?? []) ids.add(riga.giocatore_id);
  return ids;
}

/** Posizione del giocatore nel ranking (PSL Ranking Engine) tra i pari
 *  categoria (stesso sport + stesso genere) — "globale" = tra TUTTI i
 *  centri, il vero ranking nazionale (fix utente esplicito: "ranking
 *  globale del giocatore nella propria categoria"). Nessun nuovo endpoint:
 *  /ranking-giocatori è già globale (non scoped per centro), si calcola la
 *  posizione lato client sull'elenco già ordinato da getRanking. */
export async function posizioneRankingGlobale(giocatoreId: string, sport: string): Promise<PosizioneClassifica | null> {
  const righe = await getRanking(sport);
  const io = righe.find((r) => r.giocatore_id === giocatoreId);
  if (!io || !io.giocatore?.genere) return null;
  const pari = righe.filter((r) => r.giocatore?.genere === io.giocatore!.genere);
  const posizione = pari.findIndex((r) => r.giocatore_id === giocatoreId);
  if (posizione < 0) return null;
  return { posizione: posizione + 1, totale: pari.length, valore: io.ranking };
}

/** Come sopra, ma ristretto ai giocatori affiliati a UN centro (widget Home
 *  "classifica per ranking di un determinato centro"). */
export async function posizioneRankingCentro(giocatoreId: string, sport: string, centroId: string): Promise<PosizioneClassifica | null> {
  const [righe, membri] = await Promise.all([getRanking(sport), getMembriCentri([centroId])]);
  const io = righe.find((r) => r.giocatore_id === giocatoreId);
  if (!io || !io.giocatore?.genere) return null;
  const pari = righe.filter((r) => r.giocatore?.genere === io.giocatore!.genere && membri.has(r.giocatore_id));
  const posizione = pari.findIndex((r) => r.giocatore_id === giocatoreId);
  if (posizione < 0) return null;
  return { posizione: posizione + 1, totale: pari.length, valore: io.ranking };
}

/** Come sopra, ma ristretto ai giocatori affiliati a un qualunque centro di
 *  una regione/provincia (widget Home "classifica per ranking di una zona,
 *  provincia ecc"). */
export async function posizioneRankingZona(
  giocatoreId: string, sport: string, tipo: 'regione' | 'provincia', valore: string
): Promise<PosizioneClassifica | null> {
  const centri = await getCentri();
  const centriZona = centri.filter((c) => (tipo === 'regione' ? c.regione : c.provincia) === valore);
  const [righe, membri] = await Promise.all([getRanking(sport), getMembriCentri(centriZona.map((c) => c.id))]);
  const io = righe.find((r) => r.giocatore_id === giocatoreId);
  if (!io || !io.giocatore?.genere) return null;
  const pari = righe.filter((r) => r.giocatore?.genere === io.giocatore!.genere && membri.has(r.giocatore_id));
  const posizione = pari.findIndex((r) => r.giocatore_id === giocatoreId);
  if (posizione < 0) return null;
  return { posizione: posizione + 1, totale: pari.length, valore: io.ranking };
}

function ordinaClassifica(a: ClassificaMensile, b: ClassificaMensile) {
  return b.punti - a.punti || b.partite - a.partite || b.vittorie - a.vittorie;
}

// ---------- Eventi ----------
export async function getEventi(): Promise<EventoCustom[]> {
  if (isMock()) return mock.mockEventi;
  const [{ data: eventi }, { data: partecipanti }] = await Promise.all([
    apiGet<EventoCustom[]>('/eventi-custom'),
    apiGet<any[]>('/eventi-partecipanti'),
  ]);
  const conteggi = new Map<string, number>();
  for (const p of partecipanti ?? []) conteggi.set(p.evento_id, (conteggi.get(p.evento_id) ?? 0) + 1);
  const filtrati = (eventi ?? [])
    .filter((e) => e.stato === 'ready' || e.stato === 'in_corso')
    .map((e) => ({ ...e, iscritti_count: conteggi.get(e.id) ?? 0 }));
  return sortBy(filtrati, (e) => e.data_evento ?? '');
}

/** Eventi che il centro ha scelto di promuovere nel carosello ADV della
 *  Home (fix utente esplicito) — flag "in_evidenza" impostato dal
 *  gestionale sull'evento (stars-system/src/routes/eventi/[id]/+page.svelte),
 *  non tutti gli eventi pubblicati automaticamente. */
export async function getEventiInEvidenza(): Promise<EventoCustom[]> {
  if (isMock()) return mock.mockEventi.filter((e) => e.in_evidenza);
  const eventi = await getEventi();
  return eventi.filter((e) => e.in_evidenza);
}

/** Eventi a cui il giocatore è iscritto (in qualunque centro), per i
 *  pallini "evento" del calendario Home — il generico filtra solo per
 *  uguaglianza su UNA colonna alla volta, quindi giocatore_1_id/
 *  giocatore_2_id vanno interrogati separatamente e uniti lato client. */
export async function getEventiIscritti(giocatoreId: string): Promise<EventoCustom[]> {
  if (isMock()) return mock.mockEventi.slice(0, 1);
  const [{ data: p1 }, { data: p2 }, { data: eventi }] = await Promise.all([
    apiGet<any[]>('/eventi-partecipanti', { giocatore_1_id: giocatoreId }),
    apiGet<any[]>('/eventi-partecipanti', { giocatore_2_id: giocatoreId }),
    apiGet<EventoCustom[]>('/eventi-custom'),
  ]);
  const eventoIds = new Set([...(p1 ?? []), ...(p2 ?? [])].map((p) => p.evento_id));
  return (eventi ?? []).filter((e) => eventoIds.has(e.id));
}

export async function iscrivitiEvento(eventoId: string, giocatoreId: string): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(giocatoreId)) return { ok: true };
  // NOTA/limite noto: il backend richiede sempre una coppia completa
  // (giocatore_1_id + giocatore_2_id) per un'iscrizione — coerente col
  // motore tornei del gestionale, che genera i bracket solo su coppie
  // fisse. L'iscrizione "da solo" (in attesa di un compagno) non è
  // supportata: qui sotto propaghiamo l'errore 422 del backend così com'è,
  // non lo mascheriamo — serve una decisione di prodotto prima di poter
  // sbloccare questo flusso.
  const { error } = await apiPost('/eventi-partecipanti', {
    evento_id: eventoId, giocatore_1_id: giocatoreId, ranking_coppia: 0, stato: 'iscritto',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Amici ----------
// Nessuna entità "amicizie" nel backend condiviso: decisione esplicita di
// non aggiungerne una nuova in questa migrazione. Resta mock finché non si
// deciderà di aggiungere la feature al gestionale.
export async function getAmici(_giocatoreId: string): Promise<Amicizia[]> {
  return mock.mockAmicizie;
}

export async function cercaGiocatori(q: string): Promise<Giocatore[]> {
  const s = q.toLowerCase();
  if (isMock()) {
    return mock.mockGiocatori.filter((g) => `${g.nome} ${g.cognome} ${g.profilo?.nickname ?? ''}`.toLowerCase().includes(s));
  }
  const { data } = await apiGet<any[]>('/giocatori');
  return (data ?? [])
    .map(mapGiocatore)
    .filter((g) => `${g.nome} ${g.cognome} ${g.profilo?.nickname ?? ''}`.toLowerCase().includes(s))
    .slice(0, 20);
}

export async function inviaRichiestaAmicizia(_richiedenteId: string, _destinatarioId: string): Promise<void> {
  // vedi nota su getAmici
}

export async function accettaAmicizia(_id: string): Promise<void> {
  // vedi nota su getAmici
}

// ---------- Stars League ----------
export async function getStars(giocatoreId: string, sport: string = 'Padel'): Promise<StarsProfilo> {
  if (isMock()) return mock.mockStars;
  const { data } = await apiGetFirst<any>('/ranking-giocatori', { giocatore_id: giocatoreId, sport });
  const score = data?.ranking ?? 0;
  const stimato = data?.stato === 'attivo';
  return {
    fascia: fasciaDaScore(score, stimato),
    ranking_globale: null, score, stato_stima: stimato ? 'stimato' : 'in_prova',
    stima_pts: 1000, posizione_nazionale: null, punti_circuito: 0, trend: 0,
    partite_giocate: 0, partite_confermate: 0, vittorie: 0,
  };
}

export async function getCircuito(): Promise<CircuitoNazionale> {
  return mock.mockCircuito; // il circuito nazionale è un aggregato: per ora demo
}

export async function getClassificaNazionale(): Promise<RigaClassificaNazionale[]> {
  return mock.mockClassificaNazionale;
}

export async function getStarsCoin(giocatoreId: string): Promise<number> {
  if (isMock()) return mock.mockStarsCoin.saldo;
  const { data } = await apiGetFirst<any>('/coin-saldi', { giocatore_id: giocatoreId });
  return data?.saldo ?? 0;
}

/** Saldo Stars Coin diviso per centro (un giocatore può aver maturato coin
 *  in più centri) — join lato client coin-saldi × centri, stesso principio
 *  di getCentro/getCentri (il generico non fa join lato server). */
export async function getStarsCoinPerCentro(giocatoreId: string): Promise<{ centro: Centro; saldo: number }[]> {
  if (isMock()) return [{ centro: mock.mockCentro, saldo: mock.mockStarsCoin.saldo }];
  const [{ data: saldi }, centri] = await Promise.all([
    apiGet<any[]>('/coin-saldi', { giocatore_id: giocatoreId }),
    getCentri(),
  ]);
  const centriMap = new Map(centri.map((c) => [c.id, c]));
  return (saldi ?? [])
    .filter((s) => s.saldo > 0 && centriMap.has(s.centro_id))
    .map((s) => ({ centro: centriMap.get(s.centro_id)!, saldo: s.saldo }));
}

// ---------- Shop ----------

/** Centri preferiti del giocatore — vivono nel JSON self-service `profilo`
 *  (stesso posto di avatar_url/numero_tessera, nessuna colonna/entità
 *  dedicata: è una preferenza personale dell'app, non un dato che il
 *  gestionale deve leggere). */
export function centriPreferiti(giocatore: Giocatore | null): Set<string> {
  return new Set(giocatore?.profilo?.centri_preferiti ?? []);
}

export async function toggleCentroPreferito(giocatore: Giocatore, centroId: string): Promise<string[]> {
  const attuali = giocatore.profilo?.centri_preferiti ?? [];
  const nuovi = attuali.includes(centroId) ? attuali.filter((id) => id !== centroId) : [...attuali, centroId];
  await updateProfilo(giocatore.id, { profilo: { centri_preferiti: nuovi } } as any);
  return nuovi;
}

/** Prodotti attivi dello shop di un centro. */
export async function getProdottiShop(centroId: string): Promise<ShopProdotto[]> {
  if (isMock()) return mock.mockShopProdotti.filter((p) => p.centro_id === centroId);
  const { data } = await apiGet<ShopProdotto[]>('/shop-prodotti', { centro_id: centroId, attivo: true });
  return data ?? [];
}

/** Acquista un prodotto dello shop — stesso endpoint atomico del
 *  gestionale (POST /shop-acquisti/acquista: scala le scorte, incassa e
 *  crea l'acquisto in un solo commit, vedi backend/app/routers/shop.py).
 *  `metodo`: 'coin' scala subito il saldo Star Coin del giocatore (il
 *  backend rifiuta da sé se il saldo non basta) — 'euro' non è un vero
 *  pagamento online (questo progetto non ha una passerella di pagamento,
 *  vedi la sponsorizzazione "demo"): registra l'acquisto con metodo
 *  "non_categorizzato", da saldare e ritirare fisicamente al centro,
 *  stesso principio già in uso per le prenotazioni campo "da pagare"
 *  (fix utente esplicito: "decidere se pagarlo in Star Coin o €"). */
export async function acquistaProdotto(input: {
  giocatoreId: string; prodottoId: string; variante?: string | null; metodo: 'coin' | 'euro';
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.giocatoreId)) return { ok: true };
  const { error } = await apiPost('/shop-acquisti/acquista', {
    p_giocatore: input.giocatoreId, p_prodotto: input.prodottoId, p_variante: input.variante ?? null,
    p_quantita: 1, metodo: input.metodo === 'coin' ? 'coin' : 'non_categorizzato',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Acquisto vero di un pacchetto abbonamento (lezioni o campo) — stesso
 *  principio di acquistaProdotto: in Star Coin scala subito il saldo (il
 *  backend rifiuta se non basta), in € registra l'acquisto da saldare al
 *  centro (nessuna passerella di pagamento reale in questo progetto). */
export async function acquistaAbbonamento(input: {
  giocatoreId: string; templateId: string; metodo: 'coin' | 'euro';
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.giocatoreId)) return { ok: true };
  const { error } = await apiPost('/abbonamento-istanza/acquista', {
    p_giocatore: input.giocatoreId, p_template: input.templateId,
    metodo: input.metodo === 'coin' ? 'coin' : 'non_categorizzato',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Prodotti sponsorizzati (a pagamento, dal gestionale del centro) di
 *  TUTTI i centri — carosello ADV della Home (fix utente esplicito). Nessun
 *  filtro sport qui: lo applica il chiamante con sportAttivo, stessa regola
 *  già in uso per lo Shop. */
export async function getProdottiSponsorizzati(): Promise<ShopProdotto[]> {
  if (isMock()) return mock.mockShopProdotti.filter((p) => p.sponsorizzato);
  const { data } = await apiGet<ShopProdotto[]>('/shop-prodotti', { sponsorizzato: true, attivo: true });
  // Il flag sponsorizzato da solo non basta: una campagna scaduta resta
  // sponsorizzato=true finché lo staff non la tocca di nuovo (nessun cron
  // di scadenza, vedi backend/app/models/shop.py) — "attivo davvero" è
  // sempre il confronto con sponsorizzato_fino, qui e in ogni altro punto
  // che legge questo flag (fix utente esplicito: durata della campagna).
  return (data ?? []).filter((p) => p.sponsorizzato_fino && p.sponsorizzato_fino >= oggiISO());
}

/** Pacchetti abbonamento in vendita in un centro (lezioni o campo) — stessa
 *  entità/endpoint del gestionale (AbbonamentoTemplate, "Shop → Abbonamenti").
 *  Acquistabili anche dall'app, vedi acquistaAbbonamento. */
export async function getAbbonamentiShop(centroId: string): Promise<AbbonamentoTemplate[]> {
  if (isMock()) return mock.mockAbbonamentiTemplate.filter((a) => a.centro_id === centroId);
  const { data } = await apiGet<AbbonamentoTemplate[]>('/abbonamento-template', { centro_id: centroId, attivo: true });
  return data ?? [];
}

/** Abbonamenti sponsorizzati (a pagamento, dal gestionale) di TUTTI i
 *  centri — carosello ADV della Home, stesso principio di
 *  getProdottiSponsorizzati (fix utente esplicito: "Sponsorizza" ora vale
 *  anche per gli abbonamenti, non solo per i prodotti shop). */
export async function getAbbonamentiSponsorizzati(): Promise<AbbonamentoTemplate[]> {
  if (isMock()) return mock.mockAbbonamentiTemplate.filter((a) => a.sponsorizzato);
  const { data } = await apiGet<AbbonamentoTemplate[]>('/abbonamento-template', { sponsorizzato: true, attivo: true });
  return (data ?? []).filter((a) => a.sponsorizzato_fino && a.sponsorizzato_fino >= oggiISO());
}

// ---------- Statistiche sponsorizzazioni (impression/click) ----------
/** Un'impressione: la scheda ADV di quel prodotto/abbonamento è diventata
 *  la pagina attiva del carosello Home — fire-and-forget, nessun impatto
 *  sull'esperienza se fallisce (mai await-ata dal chiamante per bloccare
 *  lo scroll). @param tipoTarget 'prodotto' | 'abbonamento' */
export async function registraImpressioneSponsor(centroId: string, tipoTarget: 'prodotto' | 'abbonamento', targetId: string, giocatoreId?: string): Promise<void> {
  if (isMock()) return;
  await apiPost('/sponsor-eventi', { centro_id: centroId, tipo_target: tipoTarget, target_id: targetId, tipo_evento: 'impression', giocatore_id: giocatoreId ?? null });
}

/** Un click: il giocatore ha toccato la scheda/la tile di quell'elemento
 *  sponsorizzato — usato dal cruscotto statistiche del centro per CTR e
 *  per attribuire le conversioni (fix utente esplicito). */
export async function registraClickSponsor(centroId: string, tipoTarget: 'prodotto' | 'abbonamento', targetId: string, giocatoreId?: string): Promise<void> {
  if (isMock()) return;
  await apiPost('/sponsor-eventi', { centro_id: centroId, tipo_target: tipoTarget, target_id: targetId, tipo_evento: 'click', giocatore_id: giocatoreId ?? null });
}

export async function getTessera(): Promise<Tessera> {
  return mock.mockTessera;
}

export function meseCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function oggiISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { isMock };
