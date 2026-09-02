// Porting diretto di stars-system src/routes/prenotazioni/+page.svelte
// (orariGiorno/orariSlots) — stesso planner che lo staff usa per la griglia
// del centro, per non ricalcolare orari/slot con una logica divergente.
import type { Centro } from '../types/models';

const CHIAVI_GIORNO = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export function orariGiorno(centro: Centro | null, dataISO: string): { apertura: string; chiusura: string } {
  const chiave = CHIAVI_GIORNO[new Date(`${dataISO}T12:00:00`).getDay()];
  const g = centro?.orari?.[chiave];
  if (!g) return { apertura: '08:00', chiusura: '23:00' };
  if (Array.isArray(g)) return { apertura: g[0] || '08:00', chiusura: g[1] || '23:00' };
  return { apertura: g.apertura || '08:00', chiusura: g.chiusura || '23:00' };
}

export function orariSlots(centro: Centro | null, dataISO: string): string[] {
  const { apertura: ap, chiusura: ch } = orariGiorno(centro, dataISO);
  let [h, m] = ap.split(':').map(Number);
  const [ch2, cm2] = ch.split(':').map(Number);
  const slots: string[] = [];
  while (h < ch2 || (h === ch2 && m < cm2)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { h++; m = 0; }
  }
  return slots;
}
