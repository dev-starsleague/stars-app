import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator,
  Animated, PanResponder, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import {
  getPartiteGiocatore, getEventiIscritti, getGiocatori, getCentri, salvaRisultatoPartita, haVinto,
  getProdottiNoleggio, getPrestitiNoleggio, assegnaNoleggio, pagaQuotaPrenotazione, pagaInteroCampo,
  quotaGiocatore, getStarsCoinPerCentro, updatePrenotazione,
  getRounds, creaRound, updateRound, eliminaRound, salvaRisultatoRound,
} from '../../lib/api';
import { erroreSet, vincitoreDaSets, type SetInput } from '../../lib/risultato';
import { avvisa } from '../../lib/avviso';
import { serveRisultato, servePagamento } from '../../lib/impegni';
import { AppHeader } from '../../components/AppHeader';
import { Card, IconBadge, IconButton, Muted, Button, Chip, Avatar } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../../constants/theme';
import type { Prenotazione, EventoCustom, Giocatore, Centro, NoleggioProdotto, NoleggioPrestito, RoundPartita } from '../../types/models';

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function oggiISO() { return new Date().toISOString().slice(0, 10); }
function etichettaData(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

// Id dei giocatori di entrambe le squadre — stessa convenzione di
// api.ts:haVinto (squadre esplicite, altrimenti ordine posizionale in
// giocatori_extra: prima metà = A) — usato per gli avatar in testa al
// risultato/riga impegno.
function squadreIds(p: Prenotazione): { a: string[]; b: string[] } {
  if (p.squadre) return p.squadre;
  const meta = Math.ceil(p.giocatori_extra.length / 2);
  return { a: p.giocatori_extra.slice(0, meta), b: p.giocatori_extra.slice(meta) };
}
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

// Necessario su Android per abilitare LayoutAnimation (già di serie su iOS/
// web) — usata per animare lo scambio del giocatore NON trascinato, che
// altrimenti "teletrasporterebbe" all'istante nel nuovo slot.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SET_VUOTO = (): SetInput => ({ a: '', b: '', tb: false });
const MASSIMO_SET = 5;
// Coppia A/B nel round "cambio di coppie": blu vs arancione, fisso in
// entrambi i temi (come l'oro dell'app non cambia col toggle) — fix
// utente esplicito "non si distinguono bene i giocatori", il navy usato
// prima per Coppia A si confondeva con lo sfondo scuro delle card.
const COLORE_COPPIA_A = '#3B82F6';
const COLORE_COPPIA_B = '#F97316';

// "I miei impegni": non solo i prossimi, ma anche i passati che richiedono
// un'azione — pagamento da saldare o risultato ancora da inserire (fix
// utente esplicito). Sostituisce la lista compatta che prima si apriva
// inline nella Home: qui ogni impegno è una scheda con tutte le info
// (centro, campo, orario, compagni/avversari, prezzo, esito).
export default function Impegni() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);

  const [partite, setPartite] = useState<Prenotazione[]>([]);
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [giocatori, setGiocatori] = useState<Giocatore[]>([]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [caricato, setCaricato] = useState(false);
  // Sezioni collassabili (fix utente esplicito) — aperte di default.
  const [sospesoAperto, setSospesoAperto] = useState(true);
  const [prossimiAperto, setProssimiAperto] = useState(true);

  const load = useCallback(async () => {
    if (!me) return;
    const [pt, ev, gio, cen] = await Promise.all([
      getPartiteGiocatore(me.id), getEventiIscritti(me.id), getGiocatori(), getCentri(),
    ]);
    setPartite(pt); setEventi(ev); setGiocatori(gio); setCentri(cen);
    setCaricato(true);
  }, [me]);
  useEffect(() => { load(); }, [load]);

  const giocatoriMap = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);
  const centriMap = useMemo(() => new Map(centri.map((c) => [c.id, c])), [centri]);

  const daFare = useMemo(() => {
    const oggi = oggiISO();
    return partite
      .filter((p) => p.data && p.data < oggi && (servePagamento(p) || serveRisultato(p)))
      .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
  }, [partite]);

  const inArrivo = useMemo(() => {
    const oggi = oggiISO();
    const daPartite = partite.filter((p) => p.data && p.data >= oggi).map((p) => ({ tipo: 'partita' as const, data: p.data!, p }));
    const daEventi = eventi.filter((e) => e.data_evento && e.data_evento >= oggi).map((e) => ({ tipo: 'evento' as const, data: e.data_evento!, e }));
    return [...daPartite, ...daEventi].sort((x, y) => x.data.localeCompare(y.data));
  }, [partite, eventi]);

  // ---- modale "inserisci risultato" — stesso schema del gestionale
  // (COPPIA A/COPPIA B, set-grid con TB, vincitore DERIVATO dal punteggio
  // — mai scelto a mano, vedi lib/risultato.ts) ----
  const [modaleRisultato, setModaleRisultato] = useState<Prenotazione | null>(null);
  const [sets, setSets] = useState<SetInput[]>([SET_VUOTO(), SET_VUOTO()]);
  const [terzoSetRifiutato, setTerzoSetRifiutato] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const sportRisultato = modaleRisultato?.campo?.sport;

  // ---- round (partita con cambio di coppie, formato Americano) — porting
  // 1:1 del gestionale (fix utente esplicito "prendi pari pari quello che
  // abbiamo fatto sul gestionale"): gli stessi 4 giocatori si ridividono
  // in coppie diverse a ogni round, ognuno vale come una partita a sé per
  // ranking/classifica, con persistenza (e salvataggio) indipendenti per
  // round — mai un merge nel `risultato` whole-booking. ----
  const [rounds, setRounds] = useState<RoundPartita[]>([]);
  const [roundEditorAttivo, setRoundEditorAttivo] = useState(false);
  const [roundSetsInput, setRoundSetsInput] = useState<Record<string, SetInput[]>>({});
  const [roundLibero, setRoundLibero] = useState<Record<string, boolean>>({});
  const [roundTerzoRifiutato, setRoundTerzoRifiutato] = useState<Record<string, boolean>>({});
  const [roundModifica, setRoundModifica] = useState<Record<string, boolean>>({});
  const [roundSalvando, setRoundSalvando] = useState<string | null>(null);
  const [caricandoRounds, setCaricandoRounds] = useState(false);

  const apriRisultato = async (p: Prenotazione) => {
    setSets([SET_VUOTO(), SET_VUOTO()]);
    setTerzoSetRifiutato(false);
    setModaleRisultato(p);
    setRounds([]); setRoundEditorAttivo(false); setRoundSetsInput({}); setRoundLibero({}); setRoundModifica({});
    setCaricandoRounds(true);
    const rr = await getRounds(p.id);
    setCaricandoRounds(false);
    if (rr.length > 0) {
      setRounds(rr);
      setRoundEditorAttivo(true);
      const inputs: Record<string, SetInput[]> = {};
      for (const r of rr) inputs[r.id] = r.risultato ? r.risultato.sets.map((s) => ({ a: String(s.a), b: String(s.b), tb: !!s.tb })) : [SET_VUOTO()];
      setRoundSetsInput(inputs);
    }
  };

  // Gli stessi 4 giocatori fissi della prenotazione, pescabili per le
  // coppie di ogni round — mai riassegnabile round per round (stesso
  // principio di `giocatoriRound` in +page.svelte).
  const giocatoriRound = useMemo(() => {
    if (!modaleRisultato) return [];
    const { a, b } = squadreIds(modaleRisultato);
    return [...a, ...b].map((id) => giocatoriMap.get(id)).filter((g): g is Giocatore => !!g);
  }, [modaleRisultato, giocatoriMap]);

  // Round su Padel doppio (4 giocatori) soltanto — stessa restrizione del
  // gestionale (tipoAutomatico(): n===4 && sportCampo==='Padel'), non
  // un'omissione: la porto "pari pari" com'è.
  const puoCambioCoppie = modaleRisultato?.formato === 'doppio' && sportRisultato === 'Padel' && giocatoriRound.length === 4;

  const attivaRoundEditor = async () => {
    if (!modaleRisultato) return;
    const squadre = squadreIds(modaleRisultato);
    const res = await creaRound({ prenotazioneId: modaleRisultato.id, ordine: 1, squadre });
    if (!res.ok || !res.data) { avvisa('Errore', res.error ?? 'Impossibile creare il round.'); return; }
    setRounds([res.data]);
    setRoundEditorAttivo(true);
    setRoundSetsInput({ [res.data.id]: [SET_VUOTO()] });
  };
  // Come nel gestionale: solo finché nessun round ha ancora un risultato
  // salvato — dopo, la prenotazione resta bloccata in modalità round.
  const disattivaRoundEditor = async () => {
    for (const r of rounds) await eliminaRound(r.id);
    setRounds([]); setRoundEditorAttivo(false); setRoundSetsInput({}); setRoundLibero({}); setRoundModifica({});
  };

  const aggiungiRound = async () => {
    if (!modaleRisultato || rounds.length === 0) return;
    const ultimo = rounds[rounds.length - 1];
    const squadre = { a: [...ultimo.squadre.a], b: [...ultimo.squadre.b] };
    const res = await creaRound({ prenotazioneId: modaleRisultato.id, ordine: rounds.length + 1, squadre });
    if (!res.ok || !res.data) { avvisa('Errore', res.error ?? 'Impossibile creare il round.'); return; }
    setRounds((cur) => [...cur, res.data!]);
    setRoundSetsInput((cur) => ({ ...cur, [res.data!.id]: [SET_VUOTO()] }));
  };
  const eliminaRoundUI = async (round: RoundPartita) => {
    const res = await eliminaRound(round.id);
    if (!res.ok) { avvisa('Errore', res.error ?? 'Impossibile rimuovere il round.'); return; }
    setRounds((cur) => cur.filter((r) => r.id !== round.id));
  };

  // Un round nasce SEMPRE 2+2 (seminato da squadreIds della prenotazione o
  // dall'ultimo round, vedi attivaRoundEditor/aggiungiRound) — qui non si
  // "assegna" più un giocatore libero, si SCAMBIANO due slot occupati (fix
  // utente esplicito: "non voglio doverli selezionare e deselezionare ma
  // proprio spostare" — 2 a sinistra e 2 a destra sempre, mai uno stato a
  // metà). `idxDest` è lo slot preciso su cui è stato rilasciato il
  // trascinamento (vedi DraggableGiocatoreRound sotto).
  const spostaGiocatoreRound = async (round: RoundPartita, giocatoreId: string, latoDest: 'a' | 'b', idxDest: 0 | 1) => {
    const latoOrig: 'a' | 'b' = round.squadre.a.includes(giocatoreId) ? 'a' : 'b';
    const idxOrig = round.squadre[latoOrig].indexOf(giocatoreId);
    if (latoOrig === latoDest && idxOrig === idxDest) return;
    const squadre = { a: [...round.squadre.a], b: [...round.squadre.b] };
    const idDestinatario = squadre[latoDest][idxDest];
    squadre[latoDest][idxDest] = giocatoreId;
    if (idxOrig >= 0) squadre[latoOrig][idxOrig] = idDestinatario;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRounds((cur) => cur.map((r) => (r.id === round.id ? { ...r, squadre } : r)));
    const res = await updateRound(round.id, squadre);
    if (!res.ok) avvisa('Errore', res.error ?? 'Impossibile aggiornare le squadre del round.');
  };

  const modificaSetRound = (roundId: string, i: number, campo: 'a' | 'b', valore: string) => {
    setRoundSetsInput((cur) => ({
      ...cur, [roundId]: (cur[roundId] ?? []).map((set, idx) => (idx === i ? { ...set, [campo]: valore.replace(/[^0-9]/g, '') } : set)),
    }));
  };
  const toggleTbRound = (roundId: string, i: number) => {
    setRoundSetsInput((cur) => ({ ...cur, [roundId]: (cur[roundId] ?? []).map((set, idx) => (idx === i ? { ...set, tb: !set.tb } : set)) }));
  };
  const aggiungiSetRound = (roundId: string) => {
    setRoundSetsInput((cur) => ({ ...cur, [roundId]: (cur[roundId] ?? []).length < MASSIMO_SET ? [...(cur[roundId] ?? []), SET_VUOTO()] : (cur[roundId] ?? []) }));
  };
  const rimuoviSetRound = (roundId: string, i: number) => {
    setRoundSetsInput((cur) => {
      const nuovi = (cur[roundId] ?? []).filter((_, idx) => idx !== i);
      if (nuovi.length === 2) setRoundTerzoRifiutato((c) => ({ ...c, [roundId]: true }));
      return { ...cur, [roundId]: nuovi };
    });
  };
  // Stessa reattività del terzo set whole-booking, applicata a ogni round.
  useEffect(() => {
    for (const round of rounds) {
      const inputs = roundSetsInput[round.id];
      if (!inputs || inputs.length !== 2 || roundTerzoRifiutato[round.id]) continue;
      if (!inputs.every((s) => s.a !== '' && s.b !== '')) continue;
      const vinteA = inputs.filter((s) => Number(s.a) > Number(s.b)).length;
      if (vinteA === 1) aggiungiSetRound(round.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundSetsInput, rounds, roundTerzoRifiutato]);

  const erroreSetRound = (round: RoundPartita, s: SetInput): string | null => {
    if (roundLibero[round.id]) {
      if (s.a === '' || s.b === '') return 'Inserisci entrambi i punteggi.';
      if (Number(s.a) === Number(s.b)) return 'Il set non può finire in parità.';
      return null;
    }
    return erroreSet(s, sportRisultato);
  };

  const avviaModificaRound = (round: RoundPartita) => {
    setRoundSetsInput((cur) => ({
      ...cur, [round.id]: round.risultato ? round.risultato.sets.map((s) => ({ a: String(s.a), b: String(s.b), tb: !!s.tb })) : [SET_VUOTO()],
    }));
    setRoundModifica((cur) => ({ ...cur, [round.id]: true }));
  };
  const annullaModificaRound = (round: RoundPartita) => setRoundModifica((cur) => ({ ...cur, [round.id]: false }));

  const salvaRisultatoRoundUI = async (round: RoundPartita) => {
    const inputs = roundSetsInput[round.id] ?? [];
    for (const s of inputs) {
      const err = erroreSetRound(round, s);
      if (err) { avvisa('Errore', err); return; }
    }
    if (inputs.length < 1) { avvisa('Manca qualcosa', 'Serve almeno un set.'); return; }
    const setsValidi = inputs.map((s) => ({ a: Number(s.a), b: Number(s.b), tb: s.tb }));
    const vincitore = vincitoreDaSets(setsValidi);
    if (!vincitore) { avvisa('Round in parità', 'Un round senza vincitore non matura punti classifica: aggiungi un set decisivo.'); return; }
    setRoundSalvando(round.id);
    const res = await salvaRisultatoRound(round.id, { sets: setsValidi, vincitore, sport: sportRisultato ?? 'Padel' });
    setRoundSalvando(null);
    if (res.ok) {
      setRounds((cur) => cur.map((r) => (r.id === round.id ? { ...r, risultato: { sets: setsValidi, vincitore } } : r)));
      setRoundModifica((cur) => ({ ...cur, [round.id]: false }));
      load();
    } else {
      avvisa('Errore', res.error ?? 'Impossibile salvare il risultato del round.');
    }
  };
  const modificaSet = (i: number, campo: 'a' | 'b', valore: string) => {
    setSets((cur) => cur.map((set, idx) => (idx === i ? { ...set, [campo]: valore.replace(/[^0-9]/g, '') } : set)));
  };
  const toggleTb = (i: number) => setSets((cur) => cur.map((set, idx) => (idx === i ? { ...set, tb: !set.tb } : set)));
  const aggiungiSet = () => setSets((cur) => (cur.length < MASSIMO_SET ? [...cur, SET_VUOTO()] : cur));
  const rimuoviSet = (i: number) => setSets((cur) => {
    const nuovi = cur.filter((_, idx) => idx !== i);
    if (nuovi.length === 2) setTerzoSetRifiutato(true);
    return nuovi;
  });
  // Appena i primi due set sono completi e 1 pari, il terzo si apre da
  // solo — a meno che l'utente l'abbia già rimosso a mano (stessa
  // reattività di +page.svelte).
  useEffect(() => {
    if (sets.length !== 2 || terzoSetRifiutato) return;
    if (!sets.every((s) => s.a !== '' && s.b !== '')) return;
    const vinteA = sets.filter((s) => Number(s.a) > Number(s.b)).length;
    if (vinteA === 1) aggiungiSet();
  }, [sets, terzoSetRifiutato]);

  const erroriSet = sets.map((s) => (s.a !== '' && s.b !== '' ? erroreSet(s, sportRisultato) : null));
  const risultatoValido = sets.length >= 2 && sets.every((s) => s.a !== '' && s.b !== '') && erroriSet.every((e) => !e);

  const salvaRisultato = async () => {
    if (!modaleRisultato || !risultatoValido) return;
    const setsValidi = sets.map((s) => ({ a: Number(s.a), b: Number(s.b), tb: s.tb }));
    const vincitore = vincitoreDaSets(setsValidi);
    setSalvando(true);
    // Un punteggio pari (niente terzo set rifiutato manualmente) non ha un
    // vincitore/perdente da premiare: si salva solo il punteggio, senza
    // punti classifica/ranking — stesso principio del gestionale.
    const res = vincitore
      ? await salvaRisultatoPartita(modaleRisultato.id, { sets: setsValidi, vincitore, sport: sportRisultato ?? 'Padel' })
      : await updatePrenotazione(modaleRisultato.id, { risultato: { sets: setsValidi, vincitore: null } });
    setSalvando(false);
    if (res.ok) {
      avvisa('Risultato salvato', 'Grazie! Il risultato è stato registrato.');
      setModaleRisultato(null);
      load();
    } else {
      avvisa('Errore', res.error ?? 'Impossibile salvare il risultato.');
    }
  };

  // ---- modale pagamento + noleggio ----
  const [modalePagamento, setModalePagamento] = useState<Prenotazione | null>(null);
  const [prodottiNoleggio, setProdottiNoleggio] = useState<NoleggioProdotto[]>([]);
  const [prestitiNoleggio, setPrestitiNoleggio] = useState<NoleggioPrestito[]>([]);
  const [saldoCentro, setSaldoCentro] = useState(0);
  const [metodoScelto, setMetodoScelto] = useState<'coin' | 'euro' | null>(null);
  const [assegnandoProdotto, setAssegnandoProdotto] = useState<string | null>(null);
  const [pagando, setPagando] = useState<'mia' | 'tutti' | null>(null);

  const ricaricaNoleggio = useCallback((centroId: string) => {
    getPrestitiNoleggio({ centro_id: centroId, stato: 'in_prestito' }).then(setPrestitiNoleggio);
  }, []);

  const apriPagamento = (p: Prenotazione) => {
    setModalePagamento(p);
    setMetodoScelto(null);
    getProdottiNoleggio(p.centro_id).then(setProdottiNoleggio);
    ricaricaNoleggio(p.centro_id);
    if (me) getStarsCoinPerCentro(me.id).then((righe) => setSaldoCentro(righe.find((r) => r.centro.id === p.centro_id)?.saldo ?? 0));
  };

  const assegnaProdottoNoleggio = async (prodotto: NoleggioProdotto) => {
    if (!modalePagamento || !me || !modalePagamento.inizio || !modalePagamento.fine) return;
    setAssegnandoProdotto(prodotto.id);
    const durata = toMin(modalePagamento.fine.slice(0, 5)) - toMin(modalePagamento.inizio.slice(0, 5));
    const res = await assegnaNoleggio({
      centroId: modalePagamento.centro_id, prodottoId: prodotto.id, giocatoreId: me.id,
      prenotazioneId: modalePagamento.id, durataMinuti: durata > 0 ? durata : 60,
    });
    setAssegnandoProdotto(null);
    if (res.ok) ricaricaNoleggio(modalePagamento.centro_id);
    else avvisa('Errore', res.error ?? 'Impossibile assegnare il noleggio.');
  };

  const pagaMiaQuota = async () => {
    if (!modalePagamento || !me || !metodoScelto) return;
    setPagando('mia');
    const importo = quotaGiocatore(modalePagamento, me.id, prestitiNoleggio);
    const res = await pagaQuotaPrenotazione({ prenotazione: modalePagamento, giocatoreId: me.id, importo, metodo: metodoScelto });
    setPagando(null);
    if (res.ok) { setModalePagamento(null); load(); } else avvisa('Errore', res.error ?? 'Impossibile registrare il pagamento.');
  };

  const pagaTuttoIlCampo = async () => {
    if (!modalePagamento || !me || !metodoScelto) return;
    setPagando('tutti');
    const res = await pagaInteroCampo({ prenotazione: modalePagamento, pagatoDa: me.id, metodo: metodoScelto, prestiti: prestitiNoleggio });
    setPagando(null);
    if (res.ok) { setModalePagamento(null); load(); } else avvisa('Errore', res.error ?? 'Impossibile registrare il pagamento.');
  };

  const infoSquadre = useCallback((p: Prenotazione): { mia: Giocatore[]; avv: Giocatore[] } => {
    const { a, b } = squadreIds(p);
    const miaSquadra = me && a.includes(me.id) ? a : b;
    const avvSquadra = me && a.includes(me.id) ? b : a;
    const toG = (id: string) => giocatoriMap.get(id);
    return {
      mia: miaSquadra.map(toG).filter((g): g is Giocatore => Boolean(g)),
      avv: avvSquadra.map(toG).filter((g): g is Giocatore => Boolean(g)),
    };
  }, [me, giocatoriMap]);

  const schedaPartita = (p: Prenotazione, contesto: 'daFare' | 'inArrivo') => {
    const centro = p.campo ? centriMap.get(p.campo.centro_id) : undefined;
    const { mia, avv } = infoSquadre(p);
    const vinta = haVinto(p, me?.id ?? '');
    return (
      <Card key={p.id} style={s.scheda}>
        <View style={s.schedaHead}>
          <IconBadge icon={p.tipo === 'lezione' ? 'school' : 'tennisball'} />
          <View style={{ flex: 1 }}>
            <Text style={s.schedaTitolo}>{centro?.nome ? `${centro.nome} · ` : ''}{p.campo?.nome ?? 'Campo'}</Text>
            <Muted>{p.data ? etichettaData(p.data) : ''}{p.inizio ? ` · ${p.inizio.slice(0, 5)}–${p.fine?.slice(0, 5) ?? ''}` : ''}</Muted>
          </View>
        </View>

        {(mia.length > 0 || avv.length > 0) && (
          <View style={s.squadreMini}>
            {mia.length > 0 && (
              <View style={s.squadraMiniCol}>
                <Muted style={s.squadraMiniLabel}>La tua squadra</Muted>
                <View style={s.squadraMiniAvatars}>
                  {mia.map((g) => (
                    <View key={g.id} style={s.miniGiocatore}>
                      <Avatar name={`${g.nome} ${g.cognome}`} size={30} squircle gold={g.id === me?.id} />
                      <Text style={s.miniNome} numberOfLines={1}>{g.id === me?.id ? 'Tu' : g.nome}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {avv.length > 0 && (
              <View style={s.squadraMiniCol}>
                <Muted style={s.squadraMiniLabel}>Avversari</Muted>
                <View style={s.squadraMiniAvatars}>
                  {avv.map((g) => (
                    <View key={g.id} style={s.miniGiocatore}>
                      <Avatar name={`${g.nome} ${g.cognome}`} size={30} squircle />
                      <Text style={s.miniNome} numberOfLines={1}>{g.nome}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={s.schedaFooter}>
          <Pressable
            onPress={() => (servePagamento(p) ? apriPagamento(p) : undefined)}
            style={[s.badge, { backgroundColor: (servePagamento(p) ? colors.red : colors.green) + '18' }]}
          >
            <Text style={[s.badgeTesto, { color: servePagamento(p) ? colors.red : colors.green }]}>
              {servePagamento(p) ? `Da pagare · €${p.prezzo}` : 'Pagato'}
            </Text>
          </Pressable>

          {p.risultato ? (
            <View style={[s.badge, { backgroundColor: (vinta === null ? colors.slate : vinta ? colors.green : colors.red) + '18' }]}>
              <Text style={[s.badgeTesto, { color: vinta === null ? colors.slate : vinta ? colors.green : colors.red }]}>
                {vinta === null ? 'Pareggio' : vinta ? '🏆 Vittoria' : 'Sconfitta'} · {p.risultato.sets.map((set) => `${set.a}-${set.b}`).join(', ')}
              </Text>
            </View>
          ) : contesto === 'daFare' && serveRisultato(p) ? (
            <Pressable onPress={() => apriRisultato(p)} style={[s.badge, { backgroundColor: colors.gold + '22' }]}>
              <Text style={[s.badgeTesto, { color: colors.gold }]}>Inserisci risultato</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
    );
  };

  const squadreRisultato = modaleRisultato ? squadreIds(modaleRisultato) : null;
  const giocatoriSquadraA = (squadreRisultato?.a ?? []).map((id) => giocatoriMap.get(id)).filter((g): g is Giocatore => !!g);
  const giocatoriSquadraB = (squadreRisultato?.b ?? []).map((id) => giocatoriMap.get(id)).filter((g): g is Giocatore => !!g);

  const quotaMia = modalePagamento && me ? quotaGiocatore(modalePagamento, me.id, prestitiNoleggio) : 0;
  const mioPagamento = modalePagamento && me ? modalePagamento.pagamenti?.[me.id] : undefined;
  const giaPagata = !!mioPagamento?.pagato;
  const nonPagati = modalePagamento ? modalePagamento.giocatori_extra.filter((id) => !modalePagamento.pagamenti?.[id]?.pagato) : [];
  const totaleDaPagare = modalePagamento
    ? Math.round(nonPagati.reduce((sum, id) => sum + quotaGiocatore(modalePagamento, id, prestitiNoleggio), 0) * 100) / 100
    : 0;
  const mieiNoleggi = modalePagamento && me
    ? prestitiNoleggio.filter((pr) => pr.prenotazione_id === modalePagamento.id && pr.giocatore_id === me.id)
    : [];
  const disponibiliProdotto = (prodotto: NoleggioProdotto) =>
    prodotto.quantita_totale - prestitiNoleggio.filter((pr) => pr.prodotto_id === prodotto.id).reduce((sum, pr) => sum + pr.quantita, 0);

  const schedaEvento = (e: EventoCustom) => (
    <Card key={e.id} style={s.scheda}>
      <View style={s.schedaHead}>
        <IconBadge icon="trophy" color={colors.viola} />
        <View style={{ flex: 1 }}>
          <Text style={s.schedaTitolo}>{e.nome}</Text>
          <Muted>{e.data_evento ? etichettaData(e.data_evento) : ''} · Evento</Muted>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>I miei impegni</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!caricato ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            {daFare.length > 0 && (
              <>
                <Pressable onPress={() => setSospesoAperto((v) => !v)} style={s.sectionHead}>
                  <Text style={s.sectionTitle}>In sospeso</Text>
                  <Ionicons name={sospesoAperto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} />
                </Pressable>
                {sospesoAperto && (
                  <View style={{ gap: Spacing.sm, marginBottom: Spacing.xl }}>
                    {daFare.map((p) => schedaPartita(p, 'daFare'))}
                  </View>
                )}
              </>
            )}

            <Pressable onPress={() => setProssimiAperto((v) => !v)} style={s.sectionHead}>
              <Text style={s.sectionTitle}>Prossimi</Text>
              <Ionicons name={prossimiAperto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} />
            </Pressable>
            {prossimiAperto && (
              inArrivo.length === 0 ? (
                <Muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>Nessun impegno in arrivo.</Muted>
              ) : (
                <View style={{ gap: Spacing.sm }}>
                  {inArrivo.map((r) => (r.tipo === 'partita' ? schedaPartita(r.p, 'inArrivo') : schedaEvento(r.e)))}
                </View>
              )
            )}
            <View style={{ height: 20 }} />
          </>
        )}
      </ScrollView>

      <Modal visible={!!modaleRisultato} transparent animationType="fade" onRequestClose={() => setModaleRisultato(null)}>
        <Pressable style={s.modaleSfondo} onPress={() => setModaleRisultato(null)}>
          <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modaleTitolo}>Risultato</Text>
              <Muted style={s.modaleSottotitolo}>{modaleRisultato?.campo?.nome} · {modaleRisultato?.data ? etichettaData(modaleRisultato.data) : ''}</Muted>

              <View style={s.coppieHead}>
                <View style={s.coppiaHeadCol}>
                  <Text style={s.coppiaHeadLabel}>COPPIA A</Text>
                  <View style={s.squadraMiniAvatars}>
                    {giocatoriSquadraA.map((g) => <Avatar key={g.id} name={`${g.nome} ${g.cognome}`} size={30} squircle gold={g.id === me?.id} />)}
                  </View>
                </View>
                <View style={s.coppiaHeadCol}>
                  <Text style={[s.coppiaHeadLabel, { color: colors.gold }]}>COPPIA B</Text>
                  <View style={s.squadraMiniAvatars}>
                    {giocatoriSquadraB.map((g) => <Avatar key={g.id} name={`${g.nome} ${g.cognome}`} size={30} squircle gold={g.id === me?.id} />)}
                  </View>
                </View>
              </View>

              {caricandoRounds ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />
            ) : !roundEditorAttivo ? (
              <>
                {sets.map((set, i) => (
                  <View key={i} style={s.setCard}>
                    <View style={s.setRiga}>
                      <Muted style={{ width: 40 }}>Set {i + 1}</Muted>
                      <TextInput
                        value={set.a} onChangeText={(v) => modificaSet(i, 'a', v)} keyboardType="number-pad" maxLength={2}
                        style={s.setInput} placeholder="0" placeholderTextColor={colors.slate}
                      />
                      <Text style={{ color: colors.slate }}>–</Text>
                      <TextInput
                        value={set.b} onChangeText={(v) => modificaSet(i, 'b', v)} keyboardType="number-pad" maxLength={2}
                        style={s.setInput} placeholder="0" placeholderTextColor={colors.slate}
                      />
                      <Chip label="TB" active={set.tb} onPress={() => toggleTb(i)} />
                      {sets.length > 2 && (
                        <Pressable onPress={() => rimuoviSet(i)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={colors.slate} />
                        </Pressable>
                      )}
                    </View>
                    {erroriSet[i] && <Muted style={s.setErrore}>⚠ {erroriSet[i]}</Muted>}
                  </View>
                ))}
                {sets.length < MASSIMO_SET && (
                  <Pressable onPress={aggiungiSet} style={s.aggiungiSetBtn}>
                    <Text style={s.aggiungiSetTesto}>+ Set</Text>
                  </Pressable>
                )}
                <Muted style={{ marginTop: Spacing.sm, marginBottom: Spacing.xl, fontSize: Font.tiny, textAlign: 'center' }}>
                  Il vincitore si calcola da solo dal punteggio — non serve indicarlo a mano.
                </Muted>

                <Button title="Salva risultato" onPress={salvaRisultato} loading={salvando} disabled={!risultatoValido || salvando} />

                {puoCambioCoppie && (
                  <Pressable onPress={attivaRoundEditor} style={s.roundSwitchBtn}>
                    <Text style={s.roundSwitchTesto}>🔄 Partita con cambio di coppie</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <View style={s.roundHeadRow}>
                  <Text style={s.roundTitolo}>Round (cambio di coppie)</Text>
                  {rounds.every((r) => !r.risultato) && (
                    <Pressable onPress={disattivaRoundEditor}>
                      <Text style={s.roundBackTesto}>← Risultato singolo</Text>
                    </Pressable>
                  )}
                </View>
                <Muted style={{ marginBottom: Spacing.md, fontSize: Font.tiny, textAlign: 'center' }}>
                  Gli stessi {giocatoriRound.length} giocatori si ridividono in coppie diverse a ogni round: ogni round vale come una partita a sé per ranking e classifica.
                </Muted>

                {rounds.map((round) => (
                  <RoundCard
                    key={round.id}
                    round={round}
                    giocatori={giocatoriRound}
                    setsInput={roundSetsInput[round.id] ?? []}
                    libero={!!roundLibero[round.id]}
                    modifica={!!roundModifica[round.id]}
                    salvando={roundSalvando === round.id}
                    onSposta={(gid, lato, idx) => spostaGiocatoreRound(round, gid, lato, idx)}
                    onModificaSet={(i, campo, valore) => modificaSetRound(round.id, i, campo, valore)}
                    onToggleTb={(i) => toggleTbRound(round.id, i)}
                    onAggiungiSet={() => aggiungiSetRound(round.id)}
                    onRimuoviSet={(i) => rimuoviSetRound(round.id, i)}
                    onToggleLibero={() => setRoundLibero((cur) => ({ ...cur, [round.id]: !cur[round.id] }))}
                    onSalva={() => salvaRisultatoRoundUI(round)}
                    onAvviaModifica={() => avviaModificaRound(round)}
                    onAnnullaModifica={() => annullaModificaRound(round)}
                    onElimina={() => eliminaRoundUI(round)}
                    erroreSetFn={(set) => erroreSetRound(round, set)}
                    colors={colors} s={s}
                  />
                ))}

                <Pressable onPress={aggiungiRound} style={s.aggiungiSetBtn}>
                  <Text style={s.aggiungiSetTesto}>+ Nuovo round</Text>
                </Pressable>
              </>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!modalePagamento} transparent animationType="fade" onRequestClose={() => setModalePagamento(null)}>
        <Pressable style={s.modaleSfondo} onPress={() => setModalePagamento(null)}>
          <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modaleTitolo}>Pagamento</Text>
              <Muted style={{ marginBottom: Spacing.lg }}>{modalePagamento?.campo?.nome} · {modalePagamento?.data ? etichettaData(modalePagamento.data) : ''}</Muted>

              {prodottiNoleggio.length > 0 && (
                <>
                  <Text style={s.sottoTitoloModale}>↔ Noleggio</Text>
                  <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
                    {prodottiNoleggio.map((prod) => {
                      const disponibili = disponibiliProdotto(prod);
                      const giaMio = mieiNoleggi.some((pr) => pr.prodotto_id === prod.id);
                      return (
                        <View key={prod.id} style={s.noleggioRiga}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.noleggioNome}>{prod.nome}</Text>
                            <Muted style={{ fontSize: Font.tiny }}>
                              {giaMio ? 'Già assegnato a te' : disponibili > 0 ? `${disponibili} disponibili` : 'Esaurito'}
                            </Muted>
                          </View>
                          <Text style={s.noleggioPrezzo}>€{prod.costo_60.toFixed(2)}</Text>
                          {giaMio ? (
                            <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                          ) : (
                            <Pressable
                              onPress={() => assegnaProdottoNoleggio(prod)}
                              disabled={disponibili <= 0 || assegnandoProdotto === prod.id}
                              style={[s.noleggioBtn, disponibili <= 0 && { opacity: 0.4 }]}
                            >
                              {assegnandoProdotto === prod.id
                                ? <ActivityIndicator size="small" color={colors.navyDeep} />
                                : <Ionicons name="add" size={16} color={colors.navyDeep} />}
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <Muted style={{ fontSize: Font.tiny, marginBottom: Spacing.lg }}>
                    La riconsegna la verifica il centro fisicamente — non puoi restituirla dall'app.
                  </Muted>
                </>
              )}

              {giaPagata ? (
                <View style={[s.badge, { backgroundColor: colors.green + '18', alignSelf: 'flex-start' }]}>
                  <Text style={[s.badgeTesto, { color: colors.green }]}>✓ Quota già pagata</Text>
                </View>
              ) : (
                <>
                  <Text style={s.sottoTitoloModale}>Come vuoi pagare?</Text>
                  <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
                    <Pressable
                      onPress={() => setMetodoScelto('coin')} disabled={saldoCentro < quotaMia}
                      style={[s.metodoRiga, metodoScelto === 'coin' && s.metodoRigaAttiva, saldoCentro < quotaMia && { opacity: 0.45 }]}
                    >
                      <Ionicons name={metodoScelto === 'coin' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'coin' ? colors.gold : colors.slate} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.metodoTitolo}>⭐ Star Coin</Text>
                        <Muted style={{ fontSize: Font.tiny }}>
                          {saldoCentro < quotaMia ? `Saldo insufficiente (hai ${saldoCentro} SC)` : `Il tuo saldo: ${saldoCentro} SC`}
                        </Muted>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => setMetodoScelto('euro')} style={[s.metodoRiga, metodoScelto === 'euro' && s.metodoRigaAttiva]}>
                      <Ionicons name={metodoScelto === 'euro' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'euro' ? colors.gold : colors.slate} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.metodoTitolo}>€ Euro</Text>
                        <Muted style={{ fontSize: Font.tiny }}>Paghi e saldi direttamente al centro</Muted>
                      </View>
                    </Pressable>
                  </View>

                  <Button
                    title={`Paga la tua quota · €${quotaMia.toFixed(2)}`} onPress={pagaMiaQuota}
                    loading={pagando === 'mia'} disabled={!metodoScelto || !!pagando}
                    style={{ marginBottom: Spacing.sm }}
                  />
                  {nonPagati.length > 1 && (
                    <Pressable onPress={pagaTuttoIlCampo} disabled={!metodoScelto || !!pagando} style={[s.btnGhostFull, (!metodoScelto || !!pagando) && { opacity: 0.4 }]}>
                      {pagando === 'tutti'
                        ? <ActivityIndicator size="small" color={colors.navyDeep} />
                        : <Text style={s.btnGhostFullTesto}>Paga tutto il campo · €{totaleDaPagare.toFixed(2)}</Text>}
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Un round della modalità "cambio di coppie" — nasce SEMPRE 2+2 (mai un
// giocatore "libero"): si trascina un giocatore da uno slot all'altro e si
// SCAMBIA con chi lo occupa (fix utente esplicito: "non voglio doverli
// selezionare e deselezionare ma proprio spostare... 2 giocatori a sx e 2
// a dx"). Sotto: set-grid con "punteggio libero" per i round a tempo, e la
// vista di sola lettura una volta salvato.
function RoundCard({
  round, giocatori, setsInput, libero, modifica, salvando,
  onSposta, onModificaSet, onToggleTb, onAggiungiSet, onRimuoviSet, onToggleLibero,
  onSalva, onAvviaModifica, onAnnullaModifica, onElimina, erroreSetFn, colors, s,
}: {
  round: RoundPartita; giocatori: Giocatore[]; setsInput: SetInput[]; libero: boolean; modifica: boolean; salvando: boolean;
  onSposta: (giocatoreId: string, lato: 'a' | 'b', idx: 0 | 1) => void;
  onModificaSet: (i: number, campo: 'a' | 'b', valore: string) => void;
  onToggleTb: (i: number) => void;
  onAggiungiSet: () => void;
  onRimuoviSet: (i: number) => void;
  onToggleLibero: () => void;
  onSalva: () => void;
  onAvviaModifica: () => void;
  onAnnullaModifica: () => void;
  onElimina: () => void;
  erroreSetFn: (s: SetInput) => string | null;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const mostraLettura = !!round.risultato && !modifica;
  const grigliaRef = useRef<any>(null);
  const giocatoreById = useMemo(() => new Map(giocatori.map((g) => [g.id, g])), [giocatori]);

  return (
    <View style={s.roundCard}>
      <View style={s.roundCardHead}>
        <Text style={s.roundNr}>Round {round.ordine}</Text>
        {!round.risultato && (
          <Pressable onPress={onElimina} hitSlop={8} style={s.roundElimina}>
            <Ionicons name="close-circle" size={18} color={colors.slate} />
          </Pressable>
        )}
      </View>

      <View style={s.roundGrid} ref={grigliaRef} collapsable={false}>
        {(['a', 'b'] as const).map((lato) => {
          const coloreLato = lato === 'a' ? COLORE_COPPIA_A : COLORE_COPPIA_B;
          return (
            <View key={lato} style={s.roundLato}>
              <View style={s.roundLatoHead}>
                <Ionicons name="trophy" size={13} color={coloreLato} />
                <Text style={[s.roundLatoTesto, { color: coloreLato }]}>Coppia {lato.toUpperCase()}</Text>
              </View>
              {([0, 1] as const).map((idx) => {
                const g = giocatoreById.get(round.squadre[lato][idx]);
                return g ? (
                  <DraggableGiocatoreRound
                    key={g.id} giocatore={g} colore={coloreLato} disabled={!!round.risultato} grigliaRef={grigliaRef}
                    onSposta={onSposta} colors={colors} s={s}
                  />
                ) : (
                  <View key={idx} style={s.roundSlot} />
                );
              })}
            </View>
          );
        })}
      </View>

      {mostraLettura ? (
        <View style={s.roundRisultatoRow}>
          {round.risultato!.sets.map((set, i) => (
            <View key={i} style={s.roundSetPill}>
              <Text style={s.roundSetTesto}>{set.a}–{set.b}</Text>
              {set.tb && <Text style={s.roundSetTb}>tb</Text>}
            </View>
          ))}
          <Text style={s.roundVincitore}>Vince Coppia {round.risultato!.vincitore}</Text>
          <Pressable onPress={onAvviaModifica}><Text style={s.roundModificaTesto}>Modifica</Text></Pressable>
        </View>
      ) : (
        <>
          {setsInput.map((set, i) => {
            const err = set.a !== '' && set.b !== '' ? erroreSetFn(set) : null;
            return (
              <View key={i} style={s.setCard}>
                <View style={s.setRiga}>
                  <Muted style={{ width: 40 }}>Set {i + 1}</Muted>
                  <TextInput
                    value={set.a} onChangeText={(v) => onModificaSet(i, 'a', v)} keyboardType="number-pad" maxLength={2}
                    style={s.setInput} placeholder="0" placeholderTextColor={colors.slate}
                  />
                  <Text style={{ color: colors.slate }}>–</Text>
                  <TextInput
                    value={set.b} onChangeText={(v) => onModificaSet(i, 'b', v)} keyboardType="number-pad" maxLength={2}
                    style={s.setInput} placeholder="0" placeholderTextColor={colors.slate}
                  />
                  <Chip label="TB" active={set.tb} onPress={() => onToggleTb(i)} />
                  {setsInput.length > 1 && (
                    <Pressable onPress={() => onRimuoviSet(i)} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.slate} />
                    </Pressable>
                  )}
                </View>
                {err && <Muted style={s.setErrore}>⚠ {err}</Muted>}
              </View>
            );
          })}
          {setsInput.length < MASSIMO_SET && (
            <Pressable onPress={onAggiungiSet} style={s.aggiungiSetBtn}>
              <Text style={s.aggiungiSetTesto}>+ Set</Text>
            </Pressable>
          )}
          <Pressable onPress={onToggleLibero} style={s.roundLiberoRow}>
            <Ionicons name={libero ? 'checkbox' : 'square-outline'} size={18} color={libero ? colors.gold : colors.slate} />
            <Muted style={{ flexShrink: 1, fontSize: Font.tiny, textAlign: 'center' }}>⏱ Tempo scaduto: accetta il punteggio così com'è, anche senza il margine standard</Muted>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <Pressable onPress={onSalva} disabled={salvando} style={[s.roundSalvaBtn, salvando && { opacity: 0.6 }]}>
              {salvando ? <ActivityIndicator size="small" color={colors.navyDeep} /> : <Text style={s.roundSalvaTesto}>Salva risultato round</Text>}
            </Pressable>
            {modifica && <Pressable onPress={onAnnullaModifica}><Text style={s.roundAnnullaTesto}>Annulla</Text></Pressable>}
          </View>
        </>
      )}
    </View>
  );
}

// Un giocatore trascinabile all'interno della griglia 2+2 del round —
// PanResponder/Animated di React Native core, nessuna libreria di gesture
// aggiuntiva. Il rilascio calcola in quale metà (sx/dx) e riga (alto/
// basso) della griglia è caduto il dito, e scambia con chi occupa quello
// slot — mai uno stato "senza squadra" (fix utente esplicito).
function DraggableGiocatoreRound({
  giocatore, colore, disabled, grigliaRef, onSposta, colors, s,
}: {
  giocatore: Giocatore; colore: string; disabled: boolean; grigliaRef: React.RefObject<any>;
  onSposta: (giocatoreId: string, lato: 'a' | 'b', idx: 0 | 1) => void;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [trascinando, setTrascinando] = useState(false);
  const zonaRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onStartShouldSetPanResponderCapture: () => !disabled,
      onMoveShouldSetPanResponder: (_, g) => !disabled && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      onMoveShouldSetPanResponderCapture: (_, g) => !disabled && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      // Il round vive dentro una ScrollView: senza questo, uno strascico
      // verticale/diagonale fa passare la responder-ship allo scroll a metà
      // trascinamento (onPanResponderTerminate) invece di completare lo
      // spostamento con onPanResponderRelease.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        setTrascinando(true);
        grigliaRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          zonaRef.current = { x, y, width, height };
        });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        setTrascinando(false);
        const zona = zonaRef.current;
        if (zona && zona.width > 0) {
          const relX = gestureState.moveX - zona.x;
          const relY = gestureState.moveY - zona.y;
          const latoDest: 'a' | 'b' = relX < zona.width / 2 ? 'a' : 'b';
          const idxDest: 0 | 1 = relY < zona.height / 2 ? 0 : 1;
          onSposta(giocatore.id, latoDest, idxDest);
        }
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 20, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        setTrascinando(false);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      {...(disabled ? {} : panResponder.panHandlers)}
      style={[
        s.roundSlot, trascinando && s.roundSlotTrascinando,
        { borderColor: colore + '66', transform: pan.getTranslateTransform(), zIndex: trascinando ? 10 : 1, elevation: trascinando ? 10 : 0 },
      ]}
    >
      {/* Box in vetro liquido tinto per squadra (fix utente esplicito:
          "non si distinguono bene i giocatori... in liquid glass") — stessa
          tecnica di components/ui.tsx Card (BlurView + tinta), qui colorata
          invece che neutra. */}
      <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colore + '26' }]} />
      <Avatar name={`${giocatore.nome} ${giocatore.cognome}`} size={32} squircle />
      <Text style={s.roundSlotNome} numberOfLines={1}>{giocatore.nome}</Text>
    </Animated.View>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, marginTop: Spacing.sm },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    scheda: {},
    schedaHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    schedaTitolo: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '800' },
    schedaFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    badge: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill },
    badgeTesto: { fontWeight: '800', fontSize: Font.tiny },

    // Squadre in miniatura (riga impegno) — avatar squircle + nome, stesso
    // linguaggio delle coppie A/B di "Invita giocatori" ma condensato.
    squadreMini: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
    squadraMiniCol: { flex: 1 },
    squadraMiniLabel: { fontSize: Font.tiny, marginBottom: 6 },
    squadraMiniAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    miniGiocatore: { alignItems: 'center', width: 44 },
    miniNome: { fontSize: 9, marginTop: 2, textAlign: 'center', color: colors.slate },

    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, maxHeight: '85%', borderRadius: Radius.modal, padding: Spacing.xl, overflow: 'hidden', borderWidth: 1, borderColor: glass.strongBorder },
    modaleTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', textAlign: 'center' },
    modaleSottotitolo: { textAlign: 'center', marginBottom: Spacing.lg },
    sottoTitoloModale: { color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: Spacing.sm },

    // Risultato — popup come gli altri modali dell'app (non più a schermo
    // intero), con ogni elemento centrato (fix utente esplicito, ribadito:
    // "tutti gli elementi devono essere formattati centralmente").
    coppieHead: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    coppiaHeadCol: { flex: 1, alignItems: 'center' },
    coppiaHeadLabel: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.tiny, letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' },
    setCard: { marginBottom: Spacing.sm, alignItems: 'center' },
    setRiga: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
    setInput: {
      width: 44, height: 38, borderRadius: Radius.control, borderWidth: 1, borderColor: glass.regularBorder,
      backgroundColor: glass.regularBg, textAlign: 'center', color: colors.navyDeep, fontSize: Font.body, fontWeight: '700',
    },
    setErrore: { color: colors.red, fontSize: Font.tiny, marginTop: 4, textAlign: 'center' },
    aggiungiSetBtn: { alignSelf: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: colors.navyCard, marginBottom: Spacing.sm },
    aggiungiSetTesto: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },

    // Cambio di coppie (round Americano) — porting 1:1 del gestionale.
    roundSwitchBtn: { marginTop: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, alignItems: 'center', backgroundColor: colors.navyCard },
    roundSwitchTesto: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
    roundHeadRow: { alignItems: 'center', marginBottom: 4 },
    roundTitolo: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.small, textAlign: 'center' },
    roundBackTesto: { color: colors.slate, fontWeight: '700', fontSize: Font.tiny, textDecorationLine: 'underline', marginTop: 2, textAlign: 'center' },
    roundCard: { backgroundColor: colors.navyCard, borderRadius: Radius.card, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.navyLine + '30' },
    roundCardHead: { alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    roundNr: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.small, textAlign: 'center' },
    roundElimina: { position: 'absolute', right: 0, top: 0 },
    // Griglia 2+2 trascinabile — una coppa per lato, sempre 2 giocatori a
    // sinistra e 2 a destra (fix utente esplicito).
    roundGrid: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
    roundLato: { flex: 1, alignItems: 'center', gap: Spacing.sm },
    roundLatoHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    roundLatoTesto: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.tiny, letterSpacing: 0.5 },
    roundSlot: {
      width: '100%', alignItems: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md,
      backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.navyLine + '30', overflow: 'hidden',
    },
    roundSlotTrascinando: { boxShadow: '0 6px 16px rgba(20,30,48,0.25)' } as any,
    roundSlotNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.tiny, maxWidth: '100%' },
    roundRisultatoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: Spacing.sm },
    roundSetPill: {
      minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: Radius.sm, backgroundColor: colors.bg,
      borderWidth: 1, borderColor: colors.navyLine + '40', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2,
    },
    roundSetTesto: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small },
    roundSetTb: { color: colors.slate, fontSize: 8 },
    roundVincitore: { color: colors.slate, fontWeight: '700', fontSize: Font.tiny },
    roundModificaTesto: { color: colors.gold, fontWeight: '700', fontSize: Font.tiny },
    roundLiberoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: 4 },
    roundSalvaBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: colors.gold },
    roundSalvaTesto: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.tiny },
    roundAnnullaTesto: { color: colors.slate, fontWeight: '700', fontSize: Font.tiny },

    // Noleggio + pagamento.
    noleggioRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    noleggioNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
    noleggioPrezzo: { color: colors.slate, fontWeight: '700', fontSize: Font.tiny },
    noleggioBtn: { width: 28, height: 28, borderRadius: Radius.control, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
    metodoRiga: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
      borderRadius: Radius.control, borderWidth: 1, borderColor: colors.navyLine + '40', backgroundColor: colors.navyCard,
    },
    metodoRigaAttiva: { borderColor: colors.gold, backgroundColor: colors.gold + '14' },
    metodoTitolo: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
    btnGhostFull: { paddingVertical: Spacing.md, borderRadius: Radius.control, alignItems: 'center', backgroundColor: colors.navyCard },
    btnGhostFullTesto: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
  });
}
