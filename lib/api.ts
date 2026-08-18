import { supabase, isSupabaseConfigured } from './supabase';
import * as mock from './mockData';
import type {
  Campo, Centro, ClassificaMensile, EventoCustom, Giocatore,
  Prenotazione, RankingGiocatore, Amicizia,
} from '../types/models';

const USE_MOCK = !isSupabaseConfigured;

// ---------- Centro ----------
export async function getCentro(): Promise<Centro> {
  if (USE_MOCK) return mock.mockCentro;
  const { data } = await supabase.from('centri').select('*').limit(1).single();
  return (data as Centro) ?? mock.mockCentro;
}

// ---------- Profilo dell'utente loggato ----------
export async function getMioProfilo(): Promise<Giocatore | null> {
  if (USE_MOCK) return mock.mockMe;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('giocatori').select('*').eq('user_id', auth.user.id).single();
  return (data as Giocatore) ?? null;
}

export async function updateProfilo(id: string, patch: Partial<Giocatore>): Promise<void> {
  if (USE_MOCK) return;
  await supabase.from('giocatori').update(patch).eq('id', id);
}

// ---------- Campi ----------
export async function getCampi(): Promise<Campo[]> {
  if (USE_MOCK) return mock.mockCampi;
  const { data } = await supabase.from('campi').select('*').eq('attivo', true).order('nome');
  return (data as Campo[]) ?? [];
}

// ---------- Prenotazioni ----------
export async function getPrenotazioniGiorno(campoIds: string[], data: string): Promise<Prenotazione[]> {
  if (USE_MOCK) return mock.mockPrenotazioni().filter((p) => p.data === data);
  const { data: rows } = await supabase
    .from('prenotazioni').select('*').eq('data', data).in('campo_id', campoIds);
  return (rows as Prenotazione[]) ?? [];
}

export async function getMiePrenotazioni(giocatoreId: string): Promise<Prenotazione[]> {
  if (USE_MOCK) return mock.mockPrenotazioni();
  const oggi = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('prenotazioni')
    .select('*, campo:campi(*)')
    .eq('creata_da', giocatoreId)
    .gte('data', oggi)
    .order('data');
  return (data as Prenotazione[]) ?? [];
}

export async function creaPrenotazione(input: {
  centro_id: string; campo_id: string; creata_da: string;
  data: string; inizio: string; fine: string; prezzo: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (USE_MOCK) return { ok: true };
  const { error } = await supabase.from('prenotazioni').insert({
    ...input, origine: 'app', tipo: 'prenotato', stato: 'completa', stato_pagamento: 'da_pagare',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function annullaPrenotazione(id: string): Promise<void> {
  if (USE_MOCK) return;
  await supabase.from('prenotazioni').delete().eq('id', id);
}

// ---------- Ranking ----------
export async function getRanking(): Promise<(RankingGiocatore & { giocatore?: Giocatore })[]> {
  if (USE_MOCK) {
    return mock.mockRanking
      .map((r) => ({ ...r, giocatore: mock.mockGiocatori.find((g) => g.id === r.giocatore_id) }))
      .sort((a, b) => b.ranking - a.ranking);
  }
  const { data } = await supabase
    .from('ranking_giocatori')
    .select('*, giocatore:giocatori(*)')
    .eq('sport', 'padel')
    .order('ranking', { ascending: false });
  return (data as any[]) ?? [];
}

// ---------- Classifica mensile ----------
export async function getClassifica(genere: 'M' | 'F'): Promise<ClassificaMensile[]> {
  const mese = meseCorrente();
  if (USE_MOCK) {
    return mock.mockClassifica.filter((c) => c.genere === genere).sort(ordinaClassifica);
  }
  const { data } = await supabase
    .from('classifica_mensile')
    .select('*, giocatore:giocatori(*)')
    .eq('mese', mese).eq('genere', genere);
  return ((data as ClassificaMensile[]) ?? []).sort(ordinaClassifica);
}

function ordinaClassifica(a: ClassificaMensile, b: ClassificaMensile) {
  return b.punti - a.punti || b.partite - a.partite || b.vittorie - a.vittorie;
}

// ---------- Eventi ----------
export async function getEventi(): Promise<EventoCustom[]> {
  if (USE_MOCK) return mock.mockEventi;
  const { data } = await supabase
    .from('eventi_custom')
    .select('*, eventi_partecipanti(count)')
    .in('stato', ['ready', 'in_corso'])
    .order('data_evento');
  return (data as any[])?.map((e) => ({
    ...e, iscritti_count: e.eventi_partecipanti?.[0]?.count ?? 0,
  })) ?? [];
}

export async function iscrivitiEvento(eventoId: string, giocatoreId: string): Promise<{ ok: boolean; error?: string }> {
  if (USE_MOCK) return { ok: true };
  const { error } = await supabase.from('eventi_partecipanti').insert({
    evento_id: eventoId, giocatore_1_id: giocatoreId, ranking_coppia: 0, stato: 'iscritto',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Amici ----------
export async function getAmici(giocatoreId: string): Promise<Amicizia[]> {
  if (USE_MOCK) return mock.mockAmicizie;
  const { data } = await supabase
    .from('amicizie')
    .select('*, richiedente:giocatori!amicizie_richiedente_id_fkey(*), destinatario:giocatori!amicizie_destinatario_id_fkey(*)')
    .or(`richiedente_id.eq.${giocatoreId},destinatario_id.eq.${giocatoreId}`);
  return ((data as any[]) ?? []).map((a) => ({
    ...a,
    amico: a.richiedente_id === giocatoreId ? a.destinatario : a.richiedente,
  }));
}

export async function cercaGiocatori(q: string): Promise<Giocatore[]> {
  if (USE_MOCK) {
    const s = q.toLowerCase();
    return mock.mockGiocatori.filter((g) => `${g.nome} ${g.cognome} ${g.profilo?.nickname ?? ''}`.toLowerCase().includes(s));
  }
  const { data } = await supabase
    .from('giocatori').select('*')
    .or(`nome.ilike.%${q}%,cognome.ilike.%${q}%`).limit(20);
  return (data as Giocatore[]) ?? [];
}

export async function inviaRichiestaAmicizia(richiedenteId: string, destinatarioId: string): Promise<void> {
  if (USE_MOCK) return;
  await supabase.from('amicizie').insert({ richiedente_id: richiedenteId, destinatario_id: destinatarioId, stato: 'in_attesa' });
}

export async function accettaAmicizia(id: string): Promise<void> {
  if (USE_MOCK) return;
  await supabase.from('amicizie').update({ stato: 'accettata' }).eq('id', id);
}

export function meseCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export { USE_MOCK };
