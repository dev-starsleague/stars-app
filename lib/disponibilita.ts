// Disponibilità oraria settimanale — stesse regole del gestionale
// (stars-system: backend/app/services/disponibilita.py,
// frontend/src/lib/disponibilita.js): ogni fascia è l'orario MINIMO e
// MASSIMO DI INIZIO PARTITA, ogni 30 minuti, estremi compresi (fix utente
// esplicito). Una "disponibilità" è un giorno con almeno un orario
// d'inizio; più fasce nello stesso giorno contano una volta sola.
import type { FasciaOraria, OrariCentro } from '../types/models';

export const GIORNI_MINIMI = 3;
const BLOCCO = 30;

function minuti(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Inizi possibili {"Lun|1080", ...} di una disponibilità. */
function inizi(disp?: Record<string, FasciaOraria[]> | null): Set<string> {
  const out = new Set<string>();
  for (const [giorno, fasce] of Object.entries(disp ?? {})) {
    for (const f of fasce ?? []) {
      const da = minuti(f.da), a = minuti(f.a);
      if (da == null || a == null || a < da) continue;
      for (let m = da + ((BLOCCO - (da % BLOCCO)) % BLOCCO); m <= a; m += BLOCCO) out.add(`${giorno}|${m}`);
    }
  }
  return out;
}

/** Giorni con almeno un orario d'inizio. */
export function contaGiorniUtili(disp?: Record<string, FasciaOraria[]> | null): number {
  return new Set([...inizi(disp)].map((k) => k.split('|')[0])).size;
}

/** Orari d'inizio selezionabili in un giorno: ogni 30', dall'apertura del
 *  club fino all'ultimo inizio che finisce entro la chiusura. */
export function iniziPossibili(orari: OrariCentro | null | undefined, giorno: string, durata = 90): string[] {
  const g = (orari as any)?.[giorno.toLowerCase()];
  const o = Array.isArray(g) ? { apertura: g[0], chiusura: g[1] } : g;
  const apertura = minuti(o?.apertura) ?? 8 * 60;
  const chiusura = minuti(o?.chiusura) ?? 23 * 60;
  const out: string[] = [];
  for (let m = apertura + ((BLOCCO - (apertura % BLOCCO)) % BLOCCO); m + durata <= chiusura; m += BLOCCO) out.push(hhmm(m));
  return out;
}

export function giorniMinimi(formatConfig?: { [key: string]: unknown } | null): number {
  const n = Number(formatConfig?.disponibilita_minime);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : GIORNI_MINIMI;
}

/** 1 giorno = rosso, 2 = giallo, da 3 in su nessun avviso. */
export function livelloRischio(giorni: number): 'rosso' | 'giallo' | null {
  if (giorni <= 1) return 'rosso';
  if (giorni === 2) return 'giallo';
  return null;
}

/** Fasce in cui sono liberi tutti (per una coppia: entrambi). Chi non ha
 *  indicato nulla non restringe. Stessa regola del gestionale. */
export function intersezione(...disps: (Record<string, FasciaOraria[]> | null | undefined)[]): Record<string, FasciaOraria[]> {
  const note = disps.filter((d) => d && Object.values(d).some((f) => f?.length));
  if (!note.length) return {};
  const [primo, ...altri] = note.map(inizi);
  const comuni = [...primo].filter((k) => altri.every((s) => s.has(k)));
  const perGiorno = new Map<string, number[]>();
  for (const k of comuni) { const [g, m] = k.split('|'); perGiorno.set(g, [...(perGiorno.get(g) ?? []), Number(m)]); }
  const out: Record<string, FasciaOraria[]> = {};
  for (const [g, lista] of perGiorno) {
    lista.sort((x, y) => x - y);
    const fasce: [number, number][] = [];
    for (const m of lista) { const u = fasce[fasce.length - 1]; if (u && u[1] + BLOCCO === m) u[1] = m; else fasce.push([m, m]); }
    out[g] = fasce.map(([a, b]) => ({ da: hhmm(a), a: hhmm(b) }) as FasciaOraria);
  }
  return out;
}
