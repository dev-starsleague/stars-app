// Disponibilità oraria settimanale — stesse regole del gestionale
// (stars-system: backend/app/services/disponibilita.py,
// frontend/src/lib/disponibilita.js): una "disponibilità" è un giorno con
// almeno una fascia da 2 ore; più fasce nello stesso giorno contano una
// volta sola (fix utente esplicito).
import type { FasciaOraria } from '../types/models';

export const GIORNI_MINIMI = 3;
const FASCIA_MINUTI = 120;
const BLOCCO = 30;

function minuti(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Giorni con almeno 2 ore libere di fila (fasce contigue unite). */
export function contaGiorniUtili(disp?: Record<string, FasciaOraria[]> | null): number {
  let giorni = 0;
  for (const fasce of Object.values(disp ?? {})) {
    const blocchi = new Set<number>();
    for (const f of fasce ?? []) {
      const da = minuti(f.da), a = minuti(f.a);
      if (da == null || a == null || a <= da) continue;
      for (let m = da - (da % BLOCCO); m < a; m += BLOCCO) if (m >= da && m + BLOCCO <= a) blocchi.add(m);
    }
    const inizi = [...blocchi].sort((x, y) => x - y);
    let corsa = 0, migliore = 0, prec = -Infinity;
    for (const m of inizi) { corsa = m === prec + BLOCCO ? corsa + BLOCCO : BLOCCO; prec = m; migliore = Math.max(migliore, corsa); }
    if (migliore >= FASCIA_MINUTI) giorni += 1;
  }
  return giorni;
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
  const note = disps.filter((d) => d && Object.values(d).some((f) => f?.length)) as Record<string, FasciaOraria[]>[];
  if (!note.length) return {};
  const blocchiDi = (d: Record<string, FasciaOraria[]>) => {
    const out = new Set<string>();
    for (const [giorno, fasce] of Object.entries(d)) {
      for (const f of fasce ?? []) {
        const da = minuti(f.da), a = minuti(f.a);
        if (da == null || a == null || a <= da) continue;
        for (let m = da - (da % BLOCCO); m < a; m += BLOCCO) if (m >= da && m + BLOCCO <= a) out.add(`${giorno}|${m}`);
      }
    }
    return out;
  };
  const [primo, ...altri] = note.map(blocchiDi);
  const comuni = [...primo].filter((k) => altri.every((s) => s.has(k)));
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out: Record<string, FasciaOraria[]> = {};
  const perGiorno = new Map<string, number[]>();
  for (const k of comuni) { const [g, m] = k.split('|'); perGiorno.set(g, [...(perGiorno.get(g) ?? []), Number(m)]); }
  for (const [g, inizi] of perGiorno) {
    inizi.sort((x, y) => x - y);
    const fasce: [number, number][] = [];
    for (const m of inizi) { const u = fasce[fasce.length - 1]; if (u && u[1] === m) u[1] = m + BLOCCO; else fasce.push([m, m + BLOCCO]); }
    out[g] = fasce.map(([a, b]) => ({ da: hhmm(a), a: hhmm(b) }) as FasciaOraria);
  }
  return out;
}
