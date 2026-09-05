// ============================================================
// Valida un set inserito manualmente — porting 1:1 di
// stars-system/src/lib/risultato.js (stessa regola, stesso testo
// d'errore) così un punteggio accettato in un progetto è accettato
// identico nell'altro. `sport` opzionale: se omesso si applica la regola
// "racchetta" classica (Padel/Tennis).
//
// Pickleball: un "set" è in realtà un GIOCO a 11 punti, vinto con almeno
// 2 di scarto, SENZA limite massimo.
//
// Beach Tennis: un set può essere "a 6" (regola classica) o "a 4" (si
// arriva a 4 senza dover avere 2 di scarto; sul 3-3 tie-break, il
// punteggio finale si registra comunque 4-3) — si accettano entrambi.
// ============================================================
export interface SetInput { a: string; b: string; tb: boolean }

export function erroreSet(s: SetInput, sport?: string): string | null {
  if (s.a === '' || s.b === '') return 'Inserisci entrambi i punteggi.';
  const a = Number(s.a), b = Number(s.b);
  if (a === b) return 'Il set non può finire in parità.';
  const hi = Math.max(a, b), lo = Math.min(a, b);

  if (sport === 'Pickleball') {
    if (hi < 11) return 'Si vince arrivando ad almeno 11 punti.';
    if (hi - lo < 2) return 'Si vince con almeno 2 punti di scarto.';
    return null;
  }

  if (s.tb) {
    if (hi < 10) return 'Il tie-break si vince arrivando ad almeno 10 punti.';
    if (hi - lo < 2) return 'Il tie-break si vince con almeno 2 punti di scarto.';
  } else {
    let ok = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
    if (sport === 'Beach Tennis') ok = ok || (hi === 4 && lo <= 3);
    if (!ok) {
      return sport === 'Beach Tennis'
        ? 'Punteggio non valido (es. 6-4, 7-5, 7-6, 4-2, 4-3).'
        : 'Punteggio non valido (es. 6-4, 7-5, 7-6).';
    }
  }
  return null;
}

/** Il vincitore si DERIVA dal punteggio (maggioranza set vinti), mai
 *  scelto a mano — stesso principio di salvaRisultato in +page.svelte.
 *  null = pareggio (es. 1-1 senza terzo set): si salva comunque il
 *  punteggio, ma senza punti classifica/ranking. */
export function vincitoreDaSets(sets: { a: number; b: number }[]): 'A' | 'B' | null {
  const vinteA = sets.filter((s) => s.a > s.b).length;
  const vinteB = sets.length - vinteA;
  return vinteA === vinteB ? null : (vinteA > vinteB ? 'A' : 'B');
}
