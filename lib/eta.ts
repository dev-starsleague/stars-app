// Data di nascita alla registrazione (privacy, documento GDPR punto 8.3):
// obbligatoria, sotto i 14 anni l'app non si apre da soli — il minore va
// iscritto da un genitore tramite il centro; tra 14 e 18 anni si avvisa
// che per prenotazioni e acquisti serve l'autorizzazione di un genitore.

export const ETA_MINIMA = 14;
export const MAGGIORE_ETA = 18;

/** "GG-MM-AAAA" → "AAAA-MM-GG", null se non è una data valida. */
export function italianoAIso(it: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(it.trim());
  if (!m) return null;
  const [, gg, mm, aaaa] = m;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(gg));
  if (d.getFullYear() !== Number(aaaa) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(gg)) return null;
  return `${aaaa}-${mm}-${gg}`;
}

/** Mentre si scrive: solo cifre, trattini messi da soli (GG-MM-AAAA). */
export function formattaData(testo: string): string {
  const cifre = testo.replace(/\D/g, '').slice(0, 8);
  if (cifre.length > 4) return `${cifre.slice(0, 2)}-${cifre.slice(2, 4)}-${cifre.slice(4)}`;
  if (cifre.length > 2) return `${cifre.slice(0, 2)}-${cifre.slice(2)}`;
  return cifre;
}

export function eta(iso: string, oggi: Date = new Date()): number {
  const [a, m, g] = iso.split('-').map(Number);
  let anni = oggi.getFullYear() - a;
  if (oggi.getMonth() + 1 < m || (oggi.getMonth() + 1 === m && oggi.getDate() < g)) anni -= 1;
  return anni;
}
