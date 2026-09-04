// Predicati condivisi tra app/impegni.tsx (le schede "Da fare") e l'header
// (il pallino/lista notifiche) — stessa identica definizione di "impegno che
// richiede un'azione", per non farli divergere in due punti diversi.
import type { Prenotazione } from '../types/models';

export function serveRisultato(p: Prenotazione): boolean {
  return p.tipo !== 'lezione' && Boolean(p.formato) && !p.risultato;
}
export function servePagamento(p: Prenotazione): boolean {
  return p.stato_pagamento === 'da_pagare';
}
