// Porting di stars-system src/lib/prezziCampi.js (calcPrezzoCampo) — stessa
// tariffa a fasce orarie del planner, con proporzione sulla durata effettiva
// rispetto a durata_base_min. La tariffa tesserati (prezzo_tesserati) non è
// applicata qui: l'app non raccoglie ancora i giocatori al momento della
// prenotazione, solo chi prenota — quando quel flusso esisterà, questa
// funzione può essere estesa esattamente come nel gestionale.
import type { Campo } from '../types/models';

function toMin(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + m;
}

export function calcPrezzoCampo(campo: Campo | null, inizio: string, fine: string): number {
  if (!campo?.tariffe?.length) return 0;
  const durMin = toMin(fine) - toMin(inizio);
  if (durMin <= 0) return 0;
  const ini = toMin(inizio);
  const t = campo.tariffe.find((x) => ini >= toMin(x.inizio) && ini < toMin(x.fine));
  if (!t) return 0;
  const base = Number(t.durata_base_min) || 90;
  const prezzoPieno = (Number(t.prezzo) || 0) * (durMin / base);
  return +prezzoPieno.toFixed(2);
}
