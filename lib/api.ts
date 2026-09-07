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
  VariazioneRanking, AndamentoRecente, InsightsSociali, InsightAvversario, ProssimaPartita, RigaClassificaCoppia, Genere,
  NoleggioProdotto, NoleggioPrestito, RoundPartita, OpportunitaMatchmaking, PreferenzaAttesa, CoinTransazione,
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

/** UN giocatore per id — a differenza di getRanking (usata prima per
 *  risolvere anche l'anagrafica del profilo pubblico), non richiede che
 *  abbia già un ranking per lo sport attivo: un giocatore mai valutato non
 *  deve sparire dal proprio profilo pubblico (fix bug reale: nome/cognome/
 *  posizione/mano restavano tutti vuoti per chiunque non avesse ancora un
 *  ranking Padel). */
export async function getGiocatore(id: string): Promise<Giocatore | null> {
  if (isMock()) return mock.mockGiocatori.find((g) => g.id === id) ?? null;
  const { data } = await apiGet<any>(`/giocatori/${id}`);
  return data ? mapGiocatore(data) : null;
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
  // confine esplicito squadra A/B scelto nello schermo "Invita giocatori"
  // (coppie card, fix utente esplicito) — stesso campo JSON del gestionale.
  squadre?: { a: string[]; b: string[] };
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.creata_da)) return { ok: true };
  const { invitati, squadre, ...resto } = input;
  // chi prenota gioca sempre: senza questo la prenotazione non
  // comparirebbe nel suo storico partite (getPartiteGiocatore filtra su
  // giocatori_extra).
  const giocatoriExtra = [input.creata_da, ...(invitati ?? [])];
  const formato = giocatoriExtra.length === 2 ? 'singolo' : giocatoriExtra.length === 4 ? 'doppio' : null;
  const { error } = await apiPost('/prenotazioni', {
    ...resto, origine: 'app', tipo: 'prenotato', stato: 'completa', stato_pagamento: 'da_pagare',
    giocatori_extra: giocatoriExtra, formato, squadre: squadre ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function annullaPrenotazione(id: string): Promise<void> {
  if (isMock()) return;
  await apiDelete(`/prenotazioni/${id}`);
}

/** Aggiorna una prenotazione già esistente — usato per `pagamenti`/
 *  `stato_pagamento` (pagaQuotaPrenotazione/pagaInteroCampo sotto) e per
 *  `giocatori_extra`/`squadre`/`stato` (entraInMatch sotto, matchmaking: si
 *  unisce a una partita già esistente con lo stesso PATCH generico che usa
 *  già lo staff dal Planner — stessi controlli reali di conflitto lato
 *  backend, _valida_conflitto_giocatori compreso). Il PATCH del backend
 *  sostituisce interi campi JSON, non fa merge (stesso comportamento di
 *  updateProfilo per `profilo`): chi chiama deve passare il valore già
 *  unito con quello attuale. */
export async function updatePrenotazione(
  id: string,
  patch: Partial<Pick<Prenotazione, 'pagamenti' | 'stato_pagamento' | 'risultato' | 'giocatori_extra' | 'squadre' | 'stato'>>
): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPatch(`/prenotazioni/${id}`, patch);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Matchmaking (tasto centrale stella) ----------

/** Analizza ranking/preferenze/orari del giocatore e restituisce le
 *  opportunità di gioco già reali nel sistema (partite in attesa o
 *  confermate ma incomplete) ordinate per compatibilità — vedi
 *  GET /matchmaking/cerca sul backend, che fa tutto il lavoro (ricerca +
 *  punteggio): qui solo la chiamata. */
export async function cercaMatchmaking(giocatoreId: string, sport: string): Promise<OpportunitaMatchmaking[]> {
  if (isMock()) return [];
  const { data } = await apiGet<OpportunitaMatchmaking[]>('/matchmaking/cerca', { giocatore_id: giocatoreId, sport });
  return data ?? [];
}

/** Il giocatore entra in lista d'attesa presso un centro invece di unirsi a
 *  un'opportunità trovata — crea una prenotazione "attesa" senza campo/data/
 *  orario (stesso segnaposto che lo staff crea a mano nel pannello laterale
 *  del Planner), visibile da lì e da future ricerche di altri giocatori.
 *  `preferenza` (fix utente esplicito: "devo poter decidere una preferenza
 *  di giorno ed ora") è puramente informativa per lo staff — non incide sul
 *  matchmaking automatico. */
export async function entraInAttesa(input: {
  giocatoreId: string; centroId: string; sport: string; formato?: 'singolo' | 'doppio';
  preferenza?: PreferenzaAttesa | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.giocatoreId)) return { ok: true };
  const { error } = await apiPost('/prenotazioni/attesa', {
    giocatore_id: input.giocatoreId, centro_id: input.centroId, sport: input.sport, formato: input.formato ?? 'doppio',
    preferenza: input.preferenza ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Il giocatore si unisce a un'opportunità trovata dal matchmaking —
 *  aggiunge semplicemente il proprio id a giocatori_extra della
 *  prenotazione esistente (updatePrenotazione sopra fa passare l'update
 *  dagli stessi controlli di conflitto reali del backend). */
export async function entraInMatch(opportunita: OpportunitaMatchmaking, giocatoreId: string): Promise<{ ok: boolean; error?: string }> {
  if (eIlGiocatoreDemo(giocatoreId)) return { ok: true };
  const giocatoriExtra = [...opportunita.giocatori_presenti.map((g) => g.id), giocatoreId];
  return updatePrenotazione(opportunita.prenotazione_id, { giocatori_extra: giocatoriExtra });
}

/** Prenotazioni "attesa" (in lista d'attesa di abbinamento) del giocatore —
 *  stesso idioma di getPrenotazioniGiornoGiocatore: il generico filtra solo
 *  per uguaglianza su una colonna, l'appartenenza a giocatori_extra si
 *  controlla lato client. */
export async function getMiePrenotazioniInAttesa(giocatoreId: string): Promise<Prenotazione[]> {
  if (isMock()) return [];
  const { data } = await apiGet<Prenotazione[]>('/prenotazioni', { stato: 'attesa' });
  return (data ?? []).filter((p) => p.giocatori_extra?.includes(giocatoreId));
}

// ---------- Sfida diretta tra due giocatori (fix utente esplicito: "deve
// esserci un tasto sfida" nel profilo pubblico) ----------

/** Lancia una sfida — crea subito una prenotazione "attesa" con solo il
 *  mittente dentro (vedi POST /prenotazioni/sfida sul backend). */
export async function creaSfida(input: {
  mittenteId: string; destinatarioId: string; centroId: string; sport: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock() || eIlGiocatoreDemo(input.mittenteId)) return { ok: true };
  const { error } = await apiPost('/prenotazioni/sfida', {
    mittente_id: input.mittenteId, destinatario_id: input.destinatarioId, centro_id: input.centroId, sport: input.sport,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Sfide ricevute e ancora da accettare/rifiutare — stesso idioma di
 *  getMiePrenotazioniInAttesa: il generico filtra solo per uguaglianza su
 *  colonne semplici, il contenuto di `sfida` (JSON) si controlla lato
 *  client. */
export async function getSfideRicevute(giocatoreId: string): Promise<Prenotazione[]> {
  if (isMock()) return [];
  const { data } = await apiGet<Prenotazione[]>('/prenotazioni', { stato: 'attesa' });
  return (data ?? []).filter((p) => p.sfida?.a === giocatoreId && p.sfida?.stato === 'in_attesa');
}

/** Accetta una sfida ricevuta — il backend aggiunge lo sfidato a
 *  giocatori_extra e calcola una proposta di giorno/ora dalla sovrapposizione
 *  delle disponibilità orarie di entrambi (fix utente esplicito: "viene
 *  fatta una proposta automatica... in base agli orari ed i giorni
 *  inseriti, se ci sono"). `propostaTrovata: false` quando a uno dei due
 *  mancano gli orari (o non si sovrappongono): il chiamante deve invitare
 *  il giocatore a impostare i suoi in Modifica profilo. */
export async function accettaSfida(prenotazioneId: string): Promise<{ ok: boolean; propostaTrovata?: boolean; error?: string }> {
  const { data, error } = await apiPost<{ prenotazione: Prenotazione; proposta_trovata: boolean }>(`/prenotazioni/${prenotazioneId}/sfida/accetta`);
  if (error) return { ok: false, error: error.message };
  return { ok: true, propostaTrovata: data?.proposta_trovata };
}

/** Rifiuta una sfida ricevuta (o la annulla, se il mittente cambia idea) —
 *  la riga viene eliminata, nessuno stato "rifiutata" da conservare. */
export async function rifiutaSfida(prenotazioneId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await apiPost(`/prenotazioni/${prenotazioneId}/sfida/rifiuta`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Noleggio (attrezzatura) ----------

/** Prodotti noleggiabili attivi di un centro — il giocatore può
 *  assegnarsene uno dalla propria prenotazione (fix utente esplicito), MAI
 *  restituirlo: quello resta un'azione manuale dello staff che verifica
 *  fisicamente il rientro (vedi NoleggioPrestito in types/models.ts). */
export async function getProdottiNoleggio(centroId: string): Promise<NoleggioProdotto[]> {
  if (isMock()) return [];
  const { data } = await apiGet<NoleggioProdotto[]>('/noleggio-prodotti', { centro_id: centroId, attivo: true });
  return data ?? [];
}

/** Prestiti di un centro (di norma filtrati su una prenotazione): la
 *  disponibilità di un prodotto NON è una colonna, va calcolata sottraendo
 *  a `quantita_totale` la somma delle `quantita` dei prestiti 'in_prestito'
 *  di quel prodotto — stesso principio del gestionale. */
export async function getPrestitiNoleggio(filtri: { centro_id: string; prenotazione_id?: string; stato?: string }): Promise<NoleggioPrestito[]> {
  if (isMock()) return [];
  const { data } = await apiGet<NoleggioPrestito[]>('/noleggio-prestiti', filtri);
  return data ?? [];
}

/** Assegna un'unità di un prodotto al giocatore per l'esatta durata della
 *  prenotazione — stesso endpoint atomico del gestionale (verifica
 *  disponibilità e crea il prestito in un solo commit lato server, vedi
 *  backend/app/routers/noleggio.py:assegna_noleggio). Legato a una
 *  prenotazione: il costo NON si incassa qui, si somma alla quota del
 *  giocatore e si paga insieme al resto — vedi quotaGiocatore/
 *  pagaQuotaPrenotazione sotto, stesso principio del planner. */
export async function assegnaNoleggio(input: {
  centroId: string; prodottoId: string; giocatoreId: string; prenotazioneId: string; durataMinuti: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPost('/noleggio-prestiti/assegna', {
    p_prodotto: input.prodottoId, p_quantita: 1, p_giocatore: input.giocatoreId,
    p_prenotazione: input.prenotazioneId, p_durata: input.durataMinuti,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Pagamento prenotazione ----------

/** Accredita/addebita Star Coin — stesso endpoint atomico del gestionale
 *  (POST /coin-transazioni/movimento: aggiorna saldo e registra la
 *  transazione in un solo commit server-side). importo negativo = addebito;
 *  il backend rifiuta da sé se il saldo non basta. */
async function movimentoCoin(input: { centroId: string; giocatoreId: string; importo: number; motivo: string }): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPost('/coin-transazioni/movimento', {
    centro_id: input.centroId, giocatore_id: input.giocatoreId, importo: input.importo,
    riferimento: { motivo: input.motivo },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Quota di un giocatore per una prenotazione: prezzo campo diviso i
 *  giocatori coinvolti, più l'eventuale noleggio assegnato a lui — stessa
 *  formula del gestionale (importoPerGiocatore + sommaNoleggioGiocatore),
 *  NON modificabile a mano: si può solo segnare/pagare. */
export function quotaGiocatore(p: Prenotazione, giocatoreId: string, prestiti: NoleggioPrestito[]): number {
  const nGiocatori = p.giocatori_extra.length || 1;
  const base = p.prezzo / nGiocatori;
  const noleggio = prestiti
    .filter((pr) => pr.prenotazione_id === p.id && pr.giocatore_id === giocatoreId && pr.stato === 'in_prestito')
    .reduce((s, pr) => s + pr.costo, 0);
  return Math.round((base + noleggio) * 100) / 100;
}

/** Il giocatore paga la propria quota — stesso schema NON atomico del
 *  gestionale (prima il movimento Star Coin, solo se va a buon fine si
 *  segna pagato: mai al contrario, altrimenti risulterebbe pagato senza
 *  che il saldo si sia mosso). In 'euro' non c'è una passerella di
 *  pagamento reale in questo progetto: resta da saldare fisicamente al
 *  centro, si segna solo come tracciato — stesso principio già in uso per
 *  acquistaProdotto/acquistaAbbonamento. */
export async function pagaQuotaPrenotazione(input: {
  prenotazione: Prenotazione; giocatoreId: string; importo: number; metodo: 'coin' | 'euro';
}): Promise<{ ok: boolean; error?: string }> {
  const { prenotazione: p, giocatoreId, importo, metodo } = input;
  if (isMock()) return { ok: true };
  if (metodo === 'coin') {
    const esito = await movimentoCoin({ centroId: p.centro_id, giocatoreId, importo: -importo, motivo: 'pagamento_prenotazione' });
    if (!esito.ok) return esito;
  }
  // "euro" non ha un metodo di cassa reale nel gestionale (contanti/
  // elettronico/bonifico presuppongono tutti che lo staff abbia
  // fisicamente incassato) — si scrive "non_categorizzato", stessa
  // etichetta già usata da acquistaProdotto/acquistaAbbonamento per un
  // pagamento self-service senza passerella, riconoscibile allo stesso
  // modo lato gestionale.
  const metodoScritto: 'coin' | 'non_categorizzato' = metodo === 'coin' ? 'coin' : 'non_categorizzato';
  const pagamenti = { ...(p.pagamenti ?? {}), [giocatoreId]: { importo, pagato: true, metodo: metodoScritto } };
  const tuttiPagati = p.giocatori_extra.every((id) => pagamenti[id]?.pagato);
  return updatePrenotazione(p.id, { pagamenti, stato_pagamento: tuttiPagati ? 'saldato' : 'da_pagare' });
}

/** Un giocatore paga TUTTE le quote non ancora saldate (comprese quelle
 *  altrui) in un'unica soluzione dal proprio saldo/metodo — fix utente
 *  esplicito "può pagare la propria quota, o anche tutto il campo". */
export async function pagaInteroCampo(input: {
  prenotazione: Prenotazione; pagatoDa: string; metodo: 'coin' | 'euro'; prestiti: NoleggioPrestito[];
}): Promise<{ ok: boolean; error?: string }> {
  const { prenotazione: p, pagatoDa, metodo, prestiti } = input;
  if (isMock()) return { ok: true };
  const nonPagati = p.giocatori_extra.filter((id) => !p.pagamenti?.[id]?.pagato);
  if (nonPagati.length === 0) return { ok: true };
  const quote = new Map(nonPagati.map((id) => [id, quotaGiocatore(p, id, prestiti)]));
  const totale = Math.round([...quote.values()].reduce((s, v) => s + v, 0) * 100) / 100;
  if (metodo === 'coin') {
    const esito = await movimentoCoin({ centroId: p.centro_id, giocatoreId: pagatoDa, importo: -totale, motivo: 'pagamento_prenotazione_completo' });
    if (!esito.ok) return esito;
  }
  const metodoScritto: 'coin' | 'non_categorizzato' = metodo === 'coin' ? 'coin' : 'non_categorizzato';
  const pagamenti = { ...(p.pagamenti ?? {}) };
  for (const id of nonPagati) pagamenti[id] = { importo: quote.get(id)!, pagato: true, metodo: metodoScritto };
  return updatePrenotazione(p.id, { pagamenti, stato_pagamento: 'saldato' });
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

// ---------- Round (partita con cambio di coppie, formato Americano) ----------
// Porting 1:1 del gestionale (fix utente esplicito "prendi pari pari
// quello che abbiamo fatto sul gestionale"): gli stessi 4 giocatori si
// ridividono in coppie diverse a ogni round, ognuno vale come una partita
// a sé per ranking/classifica — persistenza separata dal `risultato`
// whole-booking della prenotazione (backend/app/routers/round_partita.py).

export async function getRounds(prenotazioneId: string): Promise<RoundPartita[]> {
  if (isMock()) return [];
  const { data } = await apiGet<RoundPartita[]>('/round-partita', { prenotazione_id: prenotazioneId });
  return (data ?? []).sort((a, b) => a.ordine - b.ordine);
}

export async function creaRound(input: {
  prenotazioneId: string; ordine: number; squadre: { a: string[]; b: string[] };
}): Promise<{ ok: boolean; data?: RoundPartita; error?: string }> {
  if (isMock()) {
    // Il chiamante ha bisogno di un id vero per gestire lo stato locale
    // (set inseriti, chip squadra) round per round: qui non c'è un
    // backend che ne assegni uno, quindi se ne fabbrica uno solo
    // client-side, mai persistito.
    return {
      ok: true,
      data: { id: `round-demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, prenotazione_id: input.prenotazioneId, ordine: input.ordine, squadre: input.squadre, risultato: null },
    };
  }
  const { data, error } = await apiPost<RoundPartita>('/round-partita', {
    prenotazione_id: input.prenotazioneId, ordine: input.ordine, squadre: input.squadre,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? undefined };
}

/** Aggiorna solo le squadre di un round — stesso PATCH ad ogni tap sui
 *  chip giocatore del gestionale (nessun bottone "salva squadre" a
 *  parte). */
export async function updateRound(roundId: string, squadre: { a: string[]; b: string[] }): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPatch(`/round-partita/${roundId}`, { squadre });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Non ha una guardia server-side contro l'eliminazione di un round già
 *  giocato (stesso comportamento del gestionale, che semplicemente non
 *  offre il pulsante in quel caso) — chi chiama deve rispettare la stessa
 *  regola lato UI. */
export async function eliminaRound(roundId: string): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiDelete(`/round-partita/${roundId}`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Registra il risultato di UN round — stesso principio di
 *  salvaRisultatoPartita, ma le squadre vengono sempre da `round.squadre`
 *  (mai da un fallback posizionale). Un round senza vincitore (punteggio
 *  pari) non matura punti classifica: a differenza del risultato whole-
 *  booking, qui il backend lo rifiuta — vincitore è obbligatorio. */
export async function salvaRisultatoRound(roundId: string, payload: {
  sets: { a: number; b: number; tb?: boolean }[]; vincitore: 'A' | 'B'; sport: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  const { error } = await apiPost(`/round-partita/${roundId}/risultato`, { ...payload, in_evento: false });
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

// Sotto questa soglia un dato "in comune con qualcuno" non è ancora
// significativo (rischia di eleggere "nemesi" chi si è affrontato una volta
// sola) — il chiamante mostra un messaggio contestuale finché non è
// raggiunta, mai uno 0/percentuale finto (fix utente esplicito: carosello
// Home, slide "social").
const MIN_PARTITE_INSIEME = 3;

/** Rendimento nelle ultime `finestra` partite giocate (qualunque sport passato,
 *  lezioni escluse) — carosello Home, slide "vita sportiva recente" (fix
 *  utente esplicito). `disputate` può essere < finestra se il giocatore non
 *  ne ha ancora giocate abbastanza: il chiamante mostra un messaggio
 *  contestuale quando disputate===0, mai "0 partite"/"0%". */
// Quanti set ha vinto/perso il giocatore in UNA partita — stessa
// individuazione di squadra di haVinto (squadre esplicite, altrimenti
// ordine posizionale in giocatori_extra), applicata a ogni singolo set
// invece che solo all'esito finale. null se la partita non ha set
// registrati (es. solo il vincitore, senza punteggio).
function setVintiPersiPartita(p: Prenotazione, giocatoreId: string): { vinti: number; persi: number } | null {
  if (!p.risultato?.sets?.length) return null;
  const meta = Math.ceil(p.giocatori_extra.length / 2);
  const squadraA = p.squadre?.a ?? p.giocatori_extra.slice(0, meta);
  const inA = squadraA.includes(giocatoreId);
  let vinti = 0, persi = 0;
  for (const set of p.risultato.sets) {
    const miei = inA ? set.a : set.b;
    const avv = inA ? set.b : set.a;
    if (miei > avv) vinti++; else if (avv > miei) persi++;
  }
  return { vinti, persi };
}

/** Rendimento nelle ultime `finestra` partite giocate (qualunque sport passato,
 *  lezioni escluse) — carosello Home, slide "vita sportiva recente" (fix
 *  utente esplicito). `disputate` può essere < finestra se il giocatore non
 *  ne ha ancora giocate abbastanza: il chiamante mostra un messaggio
 *  contestuale quando disputate===0, mai "0 partite"/"0%". */
export async function getAndamentoRecente(giocatoreId: string, sport: string, finestra: number = 10): Promise<AndamentoRecente> {
  const vuoto: AndamentoRecente = { finestra, disputate: 0, vinte: 0, perse: 0, winRatePercento: null, streak: null, formaRecente: [], setVinti: 0, setPersi: 0, trend: null };
  if (isMock()) return vuoto;
  const partite = await getPartiteGiocatore(giocatoreId); // già ordinate dal più recente
  const rilevanti = partite.filter((p) => p.tipo !== 'lezione' && p.campo?.sport === sport && p.risultato?.vincitore);
  const esiti: boolean[] = [];
  const finestraPartite: Prenotazione[] = [];
  for (const p of rilevanti) {
    const v = haVinto(p, giocatoreId);
    if (v === null) continue;
    esiti.push(v);
    finestraPartite.push(p);
    if (esiti.length >= finestra) break;
  }
  const disputate = esiti.length;
  if (disputate === 0) return vuoto;
  const vinte = esiti.filter(Boolean).length;
  // Streak: quante partite consecutive dalla più recente hanno lo stesso
  // esito di quella più recente — sotto 2 non è una "striscia", solo l'ultimo
  // risultato (non abbastanza interessante da raccontare come tale).
  let streakCount = 1;
  while (streakCount < esiti.length && esiti[streakCount] === esiti[0]) streakCount++;
  const streak = streakCount >= 2 ? { tipo: esiti[0] ? ('vittorie' as const) : ('sconfitte' as const), conteggio: streakCount } : null;

  let setVinti = 0, setPersi = 0;
  for (const p of finestraPartite) {
    const esitoSet = setVintiPersiPartita(p, giocatoreId);
    if (esitoSet) { setVinti += esitoSet.vinti; setPersi += esitoSet.persi; }
  }

  // Andamento (fix utente esplicito): confronta la % di vittorie tra le 5
  // partite più vecchie e le 5 più recenti, delle ultime 10 — con meno di
  // 10 partite si dividono a metà quelle disponibili; sotto le 4 partite il
  // confronto non è abbastanza significativo (2 contro 2 al minimo).
  let trend: AndamentoRecente['trend'] = null;
  if (disputate >= 4) {
    const metaSize = Math.floor(disputate / 2);
    const piuRecenti = esiti.slice(0, metaSize);
    const piuVecchie = esiti.slice(disputate - metaSize);
    const rateRecenti = Math.round((piuRecenti.filter(Boolean).length / piuRecenti.length) * 100);
    const rateVecchie = Math.round((piuVecchie.filter(Boolean).length / piuVecchie.length) * 100);
    trend = rateRecenti > rateVecchie ? 'crescita' : rateRecenti < rateVecchie ? 'calo' : 'stabile';
  }

  return {
    finestra, disputate, vinte, perse: disputate - vinte, winRatePercento: Math.round((vinte / disputate) * 100), streak,
    formaRecente: esiti.slice(0, 10), setVinti, setPersi, trend,
  };
}

/** Prima partita futura in calendario per lo sport passato (qualunque
 *  centro, esclude le lezioni) — usata per la frase contestuale della slide
 *  2 del carosello Home (fix utente esplicito: "se ha una serie positiva ed
 *  ha una partita a breve deve dire qualcosa a riguardo"). null = nessuna
 *  partita futura in programma per quello sport. */
export async function getProssimaPartita(giocatoreId: string, sport: string): Promise<ProssimaPartita | null> {
  if (isMock()) return null;
  const partite = await getPartiteGiocatore(giocatoreId);
  const oggi = new Date().toISOString().slice(0, 10);
  const future = partite.filter((p) => p.tipo !== 'lezione' && p.campo?.sport === sport && (p.data ?? '') >= oggi);
  if (future.length === 0) return null;
  const prossima = future.reduce((min, p) => ((p.data as string) < (min.data as string) ? p : min));
  const giorni = Math.round((new Date(prossima.data as string).getTime() - new Date(oggi).getTime()) / 86400000);
  return { data: prossima.data as string, giorni: Math.max(0, giorni) };
}

/** I 3 "insight" social della slide 3 del carosello Home: compagno con cui
 *  si è giocato di più, avversario contro cui si perde di più (nemesi) e
 *  contro cui si vince di più (avversario preferito) — fix utente esplicito:
 *  "voglio mostrare statistiche interessanti e curiose sulla vita del
 *  giocatore... insight personali e divertenti, non statistiche
 *  amministrative". Ogni blocco è indipendente: può risultare null (dati
 *  insufficienti) anche quando gli altri due sono disponibili. */
export async function getInsightsSociali(giocatoreId: string, sport: string): Promise<InsightsSociali> {
  const vuoto: InsightsSociali = { compagnoPreferito: null, nemesi: null, avversarioPreferito: null };
  if (isMock()) return vuoto;
  const [partite, giocatori] = await Promise.all([getPartiteGiocatore(giocatoreId), getGiocatori()]);
  const nomeById = new Map(giocatori.map((g) => [g.id, `${g.nome} ${g.cognome}`]));
  const avatarById = new Map(giocatori.map((g) => [g.id, g.avatar_url ?? null]));
  const genereById = new Map(giocatori.map((g) => [g.id, g.genere ?? null]));
  const rilevanti = partite.filter((p) => p.tipo !== 'lezione' && p.campo?.sport === sport && p.risultato?.vincitore);

  type Aggregato = { partite: number; vittorie: number; sconfitte: number };
  const compagni = new Map<string, Aggregato>();
  const avversari = new Map<string, Aggregato>();
  const incrementa = (mappa: Map<string, Aggregato>, id: string, vinta: boolean) => {
    const riga = mappa.get(id) ?? { partite: 0, vittorie: 0, sconfitte: 0 };
    riga.partite++;
    if (vinta) riga.vittorie++; else riga.sconfitte++;
    mappa.set(id, riga);
  };

  for (const p of rilevanti) {
    const vinta = haVinto(p, giocatoreId);
    if (vinta === null) continue;
    const meta = Math.ceil(p.giocatori_extra.length / 2);
    const squadraA = p.squadre?.a ?? p.giocatori_extra.slice(0, meta);
    const squadraB = p.squadre?.b ?? p.giocatori_extra.slice(meta);
    const inA = squadraA.includes(giocatoreId);
    const miaSquadra = inA ? squadraA : squadraB;
    const squadraAvversaria = inA ? squadraB : squadraA;
    for (const id of miaSquadra) { if (id !== giocatoreId) incrementa(compagni, id, vinta); }
    for (const id of squadraAvversaria) incrementa(avversari, id, vinta);
  }

  // Il "migliore" per un criterio, solo tra chi ha raggiunto la soglia
  // minima di partite in comune — altrimenti null (dati insufficienti).
  const migliore = (mappa: Map<string, Aggregato>, punteggio: (r: Aggregato) => number): InsightAvversario | null => {
    let bestId: string | null = null;
    let bestRiga: Aggregato | null = null;
    for (const [id, riga] of mappa) {
      if (riga.partite < MIN_PARTITE_INSIEME) continue;
      if (!bestRiga || punteggio(riga) > punteggio(bestRiga)) { bestId = id; bestRiga = riga; }
    }
    if (!bestId || !bestRiga) return null;
    return {
      giocatoreId: bestId, nome: nomeById.get(bestId) ?? 'Giocatore', avatarUrl: avatarById.get(bestId) ?? null,
      genere: genereById.get(bestId) ?? null,
      partiteInsieme: bestRiga.partite, vittorie: bestRiga.vittorie, sconfitte: bestRiga.sconfitte,
    };
  };

  return {
    // Compagno preferito: con cui si è giocato PIÙ partite insieme (non il
    // più vincente — è "con chi giochi di più", tie-break sulle vittorie).
    compagnoPreferito: migliore(compagni, (r) => r.partite * 1000 + r.vittorie),
    // Nemesi: contro cui si perde di più.
    nemesi: migliore(avversari, (r) => r.sconfitte),
    // Avversario preferito: contro cui si vince di più.
    avversarioPreferito: migliore(avversari, (r) => r.vittorie),
  };
}

// Sotto questa soglia una coppia non ha ancora giocato abbastanza insieme
// per comparire in classifica — stessa idea di MIN_PARTITE_INSIEME sopra,
// soglia dedicata perché è un'aggregazione di CENTRO (più partite
// disponibili in totale), non del singolo giocatore.
const MIN_PARTITE_COPPIA = 3;

/** Classifica "RanDuo" (fix utente esplicito, tab Classifiche: "classifiche
 *  di coppia... inventati un nome carino") — le coppie di doppio più forti
 *  di UN centro per uno sport, per numero di vittorie insieme (tie-break
 *  win rate poi partite). Solo sport a doppio (vedi lib/stars.ts
 *  SPORT_SINGOLI, applicato dal chiamante). Nessuna tabella dedicata: si
 *  aggregano le prenotazioni reali del centro, stesso principio di
 *  getInsightsSociali ma esteso a TUTTE le coppie, non solo alla mia. */
export async function getClassificaCoppie(centroId: string, sport: string): Promise<RigaClassificaCoppia[]> {
  if (isMock()) return [];
  const [{ data: prenotazioni }, { data: campi }, giocatori] = await Promise.all([
    apiGet<Prenotazione[]>('/prenotazioni', { centro_id: centroId }),
    apiGet<Campo[]>('/campi', { centro_id: centroId }),
    getGiocatori(),
  ]);
  const nomeById = new Map(giocatori.map((g) => [g.id, `${g.nome} ${g.cognome}`]));
  const genereById = new Map(giocatori.map((g) => [g.id, g.genere]));
  const campoById = new Map((campi ?? []).map((c) => [c.id, c]));
  const rilevanti = (prenotazioni ?? []).filter((p) =>
    p.tipo !== 'lezione' && p.risultato?.vincitore && p.giocatori_extra?.length === 4
    && p.campo_id && campoById.get(p.campo_id)?.sport === sport
  );

  type Aggregato = { partite: number; vittorie: number; sconfitte: number };
  const coppie = new Map<string, Aggregato>(); // chiave: "id1_id2" (ordinati, per non contare A+B e B+A separati)

  for (const p of rilevanti) {
    const squadraA = p.squadre?.a ?? p.giocatori_extra.slice(0, 2);
    const squadraB = p.squadre?.b ?? p.giocatori_extra.slice(2);
    const vincitore = p.risultato!.vincitore;
    for (const squadra of [squadraA, squadraB]) {
      if (squadra.length !== 2) continue;
      const chiave = [...squadra].sort().join('_');
      const vinta = squadra === squadraA ? vincitore === 'A' : vincitore === 'B';
      const riga = coppie.get(chiave) ?? { partite: 0, vittorie: 0, sconfitte: 0 };
      riga.partite++;
      if (vinta) riga.vittorie++; else riga.sconfitte++;
      coppie.set(chiave, riga);
    }
  }

  const righe: RigaClassificaCoppia[] = [];
  for (const [chiave, agg] of coppie) {
    if (agg.partite < MIN_PARTITE_COPPIA) continue;
    const [id1, id2] = chiave.split('_');
    righe.push({
      giocatore1Id: id1, giocatore2Id: id2,
      nome1: nomeById.get(id1) ?? 'Giocatore', nome2: nomeById.get(id2) ?? 'Giocatore',
      genere1: genereById.get(id1) ?? null, genere2: genereById.get(id2) ?? null,
      partiteInsieme: agg.partite, vittorie: agg.vittorie, sconfitte: agg.sconfitte,
      winRatePercento: Math.round((agg.vittorie / agg.partite) * 100),
    });
  }
  return righe.sort((a, b) => b.vittorie - a.vittorie || b.winRatePercento - a.winRatePercento || b.partiteInsieme - a.partiteInsieme);
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
export async function getClassifica(genere: 'M' | 'F', sport: string = 'Padel', centroId?: string, mese: string = meseCorrente()): Promise<ClassificaMensile[]> {
  if (isMock()) {
    return mock.mockClassifica
      .filter((c) => c.genere === genere && c.sport === sport && (!centroId || c.centro_id === centroId) && c.mese === mese)
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
export async function getMembriCentri(centroIds: string[]): Promise<Set<string>> {
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

export interface FiltroClassificaRanking {
  tipo: 'globale' | 'centro' | 'zona';
  centroId?: string;
  zonaTipo?: 'regione' | 'provincia';
  zonaValore?: string;
}

/** Classifica Ranking/RanQueen COMPLETA (non solo la mia posizione, a
 *  differenza di posizioneRankingGlobale/Centro/Zona sopra) — tab
 *  "Classifiche" dell'app, sezione 1 (fix utente esplicito: "classifica per
 *  Ranking (maschile) e RanQueen (femminile), filtrabile per zona
 *  geografica, centri e per categoria"). Il filtro per categoria si applica
 *  lato chiamante (vedi lib/stars.ts categoriaRanking), qui solo
 *  genere+ambito perché sono gli unici che richiedono un fetch aggiuntivo. */
export async function getClassificaRanking(sport: string, genere: Genere, filtro: FiltroClassificaRanking): Promise<(RankingGiocatore & { giocatore?: Giocatore })[]> {
  const righe = await getRanking(sport);
  const pari = righe.filter((r) => r.giocatore?.genere === genere);
  if (filtro.tipo === 'centro' && filtro.centroId) {
    const membri = await getMembriCentri([filtro.centroId]);
    return pari.filter((r) => membri.has(r.giocatore_id));
  }
  if (filtro.tipo === 'zona' && filtro.zonaTipo && filtro.zonaValore) {
    const centri = await getCentri();
    const centriZona = centri.filter((c) => (filtro.zonaTipo === 'regione' ? c.regione : c.provincia) === filtro.zonaValore);
    const membri = await getMembriCentri(centriZona.map((c) => c.id));
    return pari.filter((r) => membri.has(r.giocatore_id));
  }
  return pari; // "globale" — già ordinato da getRanking
}

/** Variazione della posizione nel ranking nazionale negli ultimi `giorni`
 *  giorni — carosello Home, slide 1 (fix utente esplicito: "#147 → #129,
 *  +18 posizioni"). Nessun nuovo endpoint/snapshot storico: si ricostruisce
 *  il valore di ranking di OGNI giocatore N giorni fa partendo da quello
 *  ATTUALE e "annullando" i delta di partite/correzioni avvenute dentro la
 *  finestra (stessa aritmetica di getStoricoRanking, applicata all'intera
 *  popolazione invece che a un solo giocatore — /match-ranking e
 *  /ranking-override non filtrati per giocatore restituiscono già tutto il
 *  necessario in una sola chiamata ciascuno). Se il giocatore stesso non ha
 *  nessuna attività PRIMA del cutoff, la sua posizione "di N giorni fa" non
 *  è mai esistita: si ritorna comunque la posizione attuale, ma con
 *  posizionePrecedente=null (mai una variazione inventata). */
export async function getVariazioneRankingGlobale(giocatoreId: string, sport: string, giorni: number = 30): Promise<VariazioneRanking | null> {
  if (isMock()) return null;
  const attuale = await posizioneRankingGlobale(giocatoreId, sport);
  if (!attuale) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - giorni);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [righe, { data: matches }, { data: overrides }] = await Promise.all([
    getRanking(sport),
    apiGet<MatchRanking[]>('/match-ranking', { sport }),
    apiGet<RankingOverride[]>('/ranking-override', { sport }),
  ]);
  const io = righe.find((r) => r.giocatore_id === giocatoreId);
  if (!io?.giocatore?.genere) return null;

  const deltaDopoCutoff = new Map<string, number>();
  const aggiungiDelta = (id: string, delta: number) => deltaDopoCutoff.set(id, (deltaDopoCutoff.get(id) ?? 0) + delta);
  let ioAttivoPrimaDelCutoff = false;
  for (const m of matches ?? []) {
    const coinvolti: [string, number][] = [[m.a1_id, m.a1_delta], [m.a2_id, m.a2_delta], [m.b1_id, m.b1_delta], [m.b2_id, m.b2_delta]];
    if (m.data < cutoffIso) {
      if (coinvolti.some(([id]) => id === giocatoreId)) ioAttivoPrimaDelCutoff = true;
      continue;
    }
    for (const [id, delta] of coinvolti) aggiungiDelta(id, delta);
  }
  for (const o of overrides ?? []) {
    const dataIso = o.data.slice(0, 10);
    if (dataIso < cutoffIso) {
      if (o.giocatore_id === giocatoreId) ioAttivoPrimaDelCutoff = true;
      continue;
    }
    aggiungiDelta(o.giocatore_id, Number(o.ranking_post) - Number(o.ranking_pre));
  }
  if (!ioAttivoPrimaDelCutoff) {
    return { posizioneAttuale: attuale.posizione, totale: attuale.totale, posizionePrecedente: null, giorni };
  }

  const pari = righe.filter((r) => r.giocatore?.genere === io.giocatore!.genere);
  const conValorePrecedente = pari
    .map((r) => ({ id: r.giocatore_id, valore: r.ranking - (deltaDopoCutoff.get(r.giocatore_id) ?? 0) }))
    .sort((a, b) => b.valore - a.valore);
  const posizionePrecedente = conValorePrecedente.findIndex((r) => r.id === giocatoreId) + 1;

  return {
    posizioneAttuale: attuale.posizione, totale: attuale.totale,
    posizionePrecedente: posizionePrecedente > 0 ? posizionePrecedente : null,
    giorni,
  };
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

/** Totale Star Coin spesi da sempre (somma di tutti gli addebiti, in ogni
 *  centro) — sia acquisti Shop/Abbonamenti sia pagamenti campo in coin,
 *  tutti registrati come CoinTransazione con importo negativo dallo stesso
 *  applica_movimento_coin lato backend (fix utente esplicito: "il secondo
 *  box deve visualizzare quanti Stars Coin sono stati spesi da sempre"). */
export async function getTotaleCoinSpeso(giocatoreId: string): Promise<number> {
  if (isMock()) return 0;
  const { data } = await apiGet<CoinTransazione[]>('/coin-transazioni', { giocatore_id: giocatoreId });
  return (data ?? []).filter((t) => t.importo < 0).reduce((acc, t) => acc - t.importo, 0);
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
