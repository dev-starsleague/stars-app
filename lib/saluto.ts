// Saluto adattivo della Home — sostituisce il saluto provvisorio "generico"
// con le regole definitive (vedi saluto-adattivo-psl.md fornito dall'utente):
// varia per fascia oraria, per impegni reali del giocatore, e alterna
// nome/nickname a caso — con più frasi per categoria per non essere monotono.

function pad(n: number) { return String(n).padStart(2, '0'); }
export function oggiISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const MESSAGGI_NOTTE = [
  (n: string) => `${n}, è tardi! Vai a dormire 😴`,
  (n: string) => `Ehi ${n}, gli atleti riposano di notte 🌙`,
  (n: string) => `${n}... dovresti dormire! Il campo ti aspetta domani 🏟️`,
];

const MESSAGGI_SETTIMANA = [
  (t: string, n: string, q: number) => `${t} ${n}! Hai ${q} partite questa settimana 💪`,
  (t: string, n: string, q: number) => `${t} ${n}! Settimana intensa: ${q} partite in programma 🎾`,
  (t: string, n: string, q: number) => `${t} campione! Sei carico per le tue ${q} partite? 🔥`,
];

const MESSAGGI_DEFAULT = [
  (t: string, n: string) => `${t}, ${n}! 👋`,
  (t: string, n: string) => `${t} ${n}! Pronto a giocare? 🎾`,
  (t: string, n: string) => `${t} ${n}! Bella giornata per giocare ⭐`,
];

function pescaCasuale<T>(lista: T[]): T { return lista[Math.floor(Math.random() * lista.length)]; }

/** Genera il saluto della Home: adattivo a orario, impegni reali del
 *  giocatore (partite nei prossimi 7 giorni, evento iscritto oggi) e nome
 *  mostrato (nome o nickname, ~50/50 quando il nickname è presente). */
export function getGreeting(nome: string, nickname: string, partiteSettimana = 0, haEventoOggi = false): string {
  const ora = new Date().getHours();
  const chiMostrare = Math.random() > 0.5 && nickname ? nickname : nome;

  // Notte: 23:00–04:59, nessun saluto "buon-qualcosa", solo l'invito a riposare.
  if (ora >= 23 || ora < 5) {
    return pescaCasuale(MESSAGGI_NOTTE)(chiMostrare);
  }

  const salutoOrario = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';

  if (partiteSettimana > 0) {
    return pescaCasuale(MESSAGGI_SETTIMANA)(salutoOrario, chiMostrare, partiteSettimana);
  }
  if (haEventoOggi) {
    return `${salutoOrario} ${chiMostrare}! Oggi hai un evento, in bocca al lupo! 🍀`;
  }
  return pescaCasuale(MESSAGGI_DEFAULT)(salutoOrario, chiMostrare);
}
