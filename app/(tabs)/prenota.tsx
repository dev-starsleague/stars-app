import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import {
  getCampi, getCentri, getPrenotazioniGiorno, getPrenotazioniGiornoGiocatore, creaPrenotazione,
  centriPreferiti, toggleCentroPreferito, getGiocatori, getRanking, getAmici,
} from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { orariSlots } from '../../lib/orari';
import { calcPrezzoCampo } from '../../lib/prezziCampi';
import { SPORT_SINGOLI } from '../../lib/stars';
import { AppHeader } from '../../components/AppHeader';
import { Card, Chip, H1, H2, IconBadge, Muted, Button, Avatar, Input } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useSport } from '../../lib/sport';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { Campo, Centro, Giocatore, Prenotazione } from '../../types/models';

// Squadra A/B con 2 slot per lato negli sport a doppio (a1/a2/b1/b2, stessa
// convenzione del gestionale), 1 slot per lato in quelli singolari
// (SPORT_SINGOLI) — "Tu" occupa sempre a1, fisso.
type SlotId = 'a1' | 'a2' | 'b1' | 'b2';
const SLOTS_DOPPIO: SlotId[] = ['a1', 'a2', 'b1', 'b2'];
const SLOTS_SINGOLO: SlotId[] = ['a1', 'b1'];

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Barra di conferma in fondo: stessa superficie scura intenzionale della
// navbar/sidebar (§ "one dark surface"), non segue il toggle chiaro/scuro.
const GLASS_BLUR_STRONG = 34;

function durataCampo(campo: Campo | null): number {
  return campo?.tariffe?.[0]?.durata_base_min ?? 90;
}
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function addMin(t: string, min: number) {
  const tot = toMin(t) + min; return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
function isoOggi(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }
// Un orario è "passato" solo se il giorno mostrato è oggi e l'inizio dello
// slot è già trascorso — negli altri giorni non ha senso confrontarlo con
// l'ora attuale.
function slotPassato(dataISO: string | null, slot: string): boolean {
  if (!dataISO || dataISO !== isoOggi(0)) return false;
  const ora = new Date();
  return toMin(slot) < ora.getHours() * 60 + ora.getMinutes();
}
function etichettaGiorno(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

type Fase = 'giorno' | 'centro' | 'prenota';

// Flusso: giorno → centro → orario (aggregato su tutti i campi del centro,
// grigio+richiesta "altri centri?" se nessun campo è libero) → campo →
// conferma — stesso ordine sia partendo dal CTA "Prenota un campo" sia dal
// tap su un giorno del calendario Home (che passa `data` e salta la fase
// "giorno", già decisa). La prenotazione va sul vero endpoint /prenotazioni
// del backend condiviso: compare nel planner del gestionale, non serve
// altro per il collegamento (nessuna vista separata da tenere sincronizzata).
export default function Prenota() {
  const params = useLocalSearchParams<{ data?: string }>();
  const { me, demoMode } = useAuth();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [dataISO, setDataISO] = useState<string | null>(params.data ?? null);
  const [fase, setFase] = useState<Fase>(params.data ? 'centro' : 'giorno');

  // ---- centro: stesso pattern di selezione di app/stars-coin.tsx ----
  const [centri, setCentri] = useState<Centro[]>([]);
  const [preferiti, setPreferiti] = useState<Set<string>>(new Set());
  const [soloPreferiti, setSoloPreferiti] = useState(false);
  const [regione, setRegione] = useState<string | null>(null);
  const [provincia, setProvincia] = useState<string | null>(null);
  const [centroSel, setCentroSel] = useState<Centro | null>(null);

  useEffect(() => {
    getCentri().then(setCentri);
    if (me) setPreferiti(centriPreferiti(me));
  }, [me]);

  // Un solo centro reale oggi: niente scelta finta tra un'opzione sola,
  // si passa dritti alla fase successiva — l'architettura resta pronta per
  // quando i centri reali saranno più di uno (torna a essere un passo vero).
  useEffect(() => {
    if (fase === 'centro' && centri.length === 1 && !centroSel) sceglicentro(centri[0]);
  }, [fase, centri]);

  const regioni = useMemo(
    () => Array.from(new Set(centri.map((c) => c.regione).filter((r): r is string => !!r))).sort(),
    [centri]
  );
  const province = useMemo(
    () => Array.from(new Set(
      centri.filter((c) => !regione || c.regione === regione).map((c) => c.provincia).filter((p): p is string => !!p)
    )).sort(),
    [centri, regione]
  );
  const centriFiltrati = centri
    .filter((c) => !soloPreferiti || preferiti.has(c.id))
    .filter((c) => !regione || c.regione === regione)
    .filter((c) => !provincia || c.provincia === provincia);

  const onToggleRegione = (r: string) => { setRegione((cur) => (cur === r ? null : r)); setProvincia(null); };
  const onTogglePreferito = async (c: Centro) => {
    setPreferiti((cur) => { const next = new Set(cur); next.has(c.id) ? next.delete(c.id) : next.add(c.id); return next; });
    if (me) await toggleCentroPreferito(me, c.id);
  };
  const sceglicentro = (c: Centro) => { setCentroSel(c); setFase('prenota'); };

  // ---- prenota: sport → orario aggregato → campo → conferma ----
  const [campi, setCampi] = useState<Campo[]>([]);
  const [occupati, setOccupati] = useState<Prenotazione[]>([]);
  const [impegniGiocatore, setImpegniGiocatore] = useState<Prenotazione[]>([]);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [campoSel, setCampoSel] = useState<Campo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!centroSel) { setCampi([]); return; }
    getCampi(centroSel.id).then(setCampi);
  }, [centroSel]);

  // Sport globale scelto nell'header: qui si prenotano solo campi di quello
  // sport, non serve più una scelta locale (fix utente esplicito — "il
  // giocatore prenoterà i campi dello sport selezionato").
  const campiSport = useMemo(() => campi.filter((c) => c.sport === sportAttivo), [campi, sportAttivo]);

  const loadOccupati = useCallback(async () => {
    if (!dataISO || campi.length === 0) { setOccupati([]); return; }
    const rows = await getPrenotazioniGiorno(campi.map((c) => c.id), dataISO);
    setOccupati(rows);
  }, [campi, dataISO]);
  useEffect(() => { loadOccupati(); }, [loadOccupati]);

  // Impegni del giocatore quel giorno su QUALSIASI campo/sport/centro: un
  // conflitto qui blocca il tentativo di prenotare prima ancora di arrivare
  // alla conferma, non solo sullo stesso campo (fix utente esplicito — "se
  // ho una prenotazione per uno sport non devo poter fare una prenotazione
  // che si accavalli alla prima per qualsiasi sport"). Il backend rifiuta
  // comunque la sovrapposizione a prescindere (_valida_conflitto_giocatori):
  // questo è solo per non far scoprire il conflitto solo al "Conferma".
  useEffect(() => {
    if (!dataISO || !me) { setImpegniGiocatore([]); return; }
    getPrenotazioniGiornoGiocatore(me.id, dataISO).then(setImpegniGiocatore);
  }, [dataISO, me]);

  const giocatoreImpegnato = useCallback((slot: string, durata: number) => {
    const inizioSlot = toMin(slot);
    const fineSlot = inizioSlot + durata;
    return impegniGiocatore.some((p) => {
      if (!p.inizio || !p.fine) return false;
      const inizioEsistente = toMin(p.inizio.slice(0, 5));
      const fineEsistente = toMin(p.fine.slice(0, 5));
      return inizioSlot < fineEsistente && fineSlot > inizioEsistente;
    });
  }, [impegniGiocatore]);

  useEffect(() => { setSlotSel(null); setCampoSel(null); }, [sportAttivo, dataISO]);

  const slots = useMemo(() => (centroSel && dataISO ? orariSlots(centroSel, dataISO) : []), [centroSel, dataISO]);
  // I passati non si mostrano proprio (fix utente esplicito) — non ricalcolato
  // con useMemo apposta, così resta "vivo" mentre l'utente guarda la
  // schermata invece di congelarsi all'orario in cui è stato aperto il centro.
  const slotsVisibili = slots.filter((slot) => !slotPassato(dataISO, slot));

  // Un campo è libero in questo slot solo se NESSUNA prenotazione esistente
  // si sovrappone all'intera durata che occuperebbe (slot → slot+durata),
  // non solo se non ce n'è una che inizia esattamente allo stesso minuto —
  // fix utente esplicito: una prenotazione 07:30–09:00 deve bloccare anche
  // 08:00 e 08:30, non solo 07:30.
  const campiLiberi = useCallback((slot: string) =>
    campiSport.filter((c) => {
      const inizioSlot = toMin(slot);
      const fineSlot = inizioSlot + durataCampo(c);
      if (giocatoreImpegnato(slot, durataCampo(c))) return false;
      return !occupati.some((p) => {
        if (p.campo_id !== c.id || !p.inizio || !p.fine) return false;
        const inizioEsistente = toMin(p.inizio.slice(0, 5));
        const fineEsistente = toMin(p.fine.slice(0, 5));
        return inizioSlot < fineEsistente && fineSlot > inizioEsistente;
      });
    }),
    [campiSport, occupati, giocatoreImpegnato]);

  // ---- invita giocatori: squadre A/B come nel gestionale (src/routes/
  // +page.svelte, COPPIA A/COPPIA B della "Nuova prenotazione") — fix
  // utente esplicito "vorrei fosse più simile al gestionale". "Tu" fisso
  // in a1; gli altri slot si riempiono toccandoli, con la stessa identica
  // logica di ricerca/suggerimento di prima (ricerca client-side su
  // nome+cognome, "suggeriti per equilibrio" — ranking più vicino alla
  // media di chi è già scelto, stesso genere se condiviso, solo Padel — e
  // amici quando non c'è ancora nessuno scelto oltre a "Tu").
  const doppio = !SPORT_SINGOLI.includes(sportAttivo);
  const slotsRichiesti = doppio ? SLOTS_DOPPIO : SLOTS_SINGOLO;
  const [formazione, setFormazione] = useState<Record<SlotId, Giocatore | null>>({ a1: null, a2: null, b1: null, b2: null });
  const [slotAttivo, setSlotAttivo] = useState<SlotId | null>(null);
  const [queryInvita, setQueryInvita] = useState('');
  const [tuttiGiocatori, setTuttiGiocatori] = useState<Giocatore[]>([]);
  const [rankingMap, setRankingMap] = useState<Map<string, number>>(new Map());
  const [amici, setAmici] = useState<Giocatore[]>([]);

  useEffect(() => {
    getGiocatori().then(setTuttiGiocatori);
    getRanking(sportAttivo).then((righe) => setRankingMap(new Map(righe.map((r) => [r.giocatore_id, r.ranking]))));
  }, [sportAttivo]);
  useEffect(() => {
    if (!me) return;
    getAmici(me.id).then((righe) => setAmici(righe.map((a) => a.amico).filter((g): g is Giocatore => Boolean(g))));
  }, [me]);
  useEffect(() => { setFormazione({ a1: me, a2: null, b1: null, b2: null }); setSlotAttivo(null); setQueryInvita(''); }, [slotSel, me]);

  const giocatoriScelti = useMemo(
    () => slotsRichiesti.map((id) => formazione[id]).filter((g): g is Giocatore => !!g),
    [formazione, slotsRichiesti]
  );

  const risultatiCerca = useMemo(() => {
    const q = queryInvita.trim().toLowerCase();
    if (!q) return [];
    const esclusi = new Set(giocatoriScelti.map((g) => g.id));
    return tuttiGiocatori
      .filter((g) => !esclusi.has(g.id) && `${g.nome} ${g.cognome ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [queryInvita, tuttiGiocatori, giocatoriScelti]);

  const suggeritiEquilibrio = useMemo(() => {
    if (queryInvita.trim() || sportAttivo !== 'Padel' || giocatoriScelti.length === 0) return [];
    const media = giocatoriScelti.reduce((s2, g) => s2 + (rankingMap.get(g.id) ?? 0), 0) / giocatoriScelti.length;
    const esclusi = new Set(giocatoriScelti.map((g) => g.id));
    const generi = new Set(giocatoriScelti.map((g) => g.genere).filter(Boolean));
    const genereRichiesto = generi.size === 1 ? [...generi][0] : null;
    return tuttiGiocatori
      .filter((g) => !esclusi.has(g.id))
      .filter((g) => !genereRichiesto || g.genere === genereRichiesto)
      .map((g) => ({ g, diff: Math.abs((rankingMap.get(g.id) ?? 0) - media) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5)
      .map((x) => x.g);
  }, [queryInvita, sportAttivo, giocatoriScelti, tuttiGiocatori, rankingMap]);

  const amiciDisponibili = useMemo(() => {
    const esclusi = new Set(giocatoriScelti.map((g) => g.id));
    return amici.filter((g) => !esclusi.has(g.id));
  }, [amici, giocatoriScelti]);

  const mostraSuggeriti = !queryInvita.trim() && suggeritiEquilibrio.length > 0;

  const invita = (g: Giocatore) => {
    if (!slotAttivo) return;
    setFormazione((cur) => ({ ...cur, [slotAttivo]: g }));
    setSlotAttivo(null);
    setQueryInvita('');
  };
  const rimuoviSlot = (id: SlotId) => setFormazione((cur) => ({ ...cur, [id]: null }));

  const ranking = useCallback((g: Giocatore) => rankingMap.get(g.id), [rankingMap]);
  const mediaSquadra = useCallback((lato: 'a' | 'b') => {
    const ids: SlotId[] = lato === 'a' ? ['a1', 'a2'] : ['b1', 'b2'];
    const giocatori = ids.map((id) => formazione[id]).filter((g): g is Giocatore => !!g);
    if (giocatori.length === 0 || sportAttivo !== 'Padel') return null;
    const valori = giocatori.map((g) => rankingMap.get(g.id) ?? 0);
    return valori.reduce((s2, v) => s2 + v, 0) / valori.length;
  }, [formazione, rankingMap, sportAttivo]);

  // "⚖️ Ottimizza abbinamento" (fix utente esplicito, come nel gestionale):
  // tra i 3 modi di dividere i 4 giocatori scelti in 2 coppie, sceglie
  // quello con la differenza minima tra le medie ranking delle due
  // squadre, poi ordina ogni coppia mettendo il DX prima del SX (stessa
  // euristica di ordinaPerPosizione in +page.svelte).
  const ottimizzaAbbinamento = () => {
    const [p0, p1, p2, p3] = slotsRichiesti.map((id) => formazione[id]) as Giocatore[];
    if (!p0 || !p1 || !p2 || !p3) return;
    const rk = (g: Giocatore) => rankingMap.get(g.id) ?? 0;
    const opzioni: [[Giocatore, Giocatore], [Giocatore, Giocatore]][] = [
      [[p0, p1], [p2, p3]],
      [[p0, p2], [p1, p3]],
      [[p0, p3], [p1, p2]],
    ];
    let scelta = opzioni[0];
    let deltaMin = Infinity;
    for (const opz of opzioni) {
      const mediaA = (rk(opz[0][0]) + rk(opz[0][1])) / 2;
      const mediaB = (rk(opz[1][0]) + rk(opz[1][1])) / 2;
      const delta = Math.abs(mediaA - mediaB);
      if (delta < deltaMin) { deltaMin = delta; scelta = opz; }
    }
    const ordina = (coppia: [Giocatore, Giocatore]): [Giocatore, Giocatore] =>
      (coppia[0].posizione === 'sinistra' && coppia[1].posizione !== 'sinistra') ? [coppia[1], coppia[0]] : coppia;
    const [a, b] = [ordina(scelta[0]), ordina(scelta[1])];
    setFormazione({ a1: a[0], a2: a[1], b1: b[0], b2: b[1] });
  };

  const tapSlot = (slot: string) => {
    if (campiLiberi(slot).length === 0) {
      const durata = durataCampo(campiSport[0] ?? null);
      if (giocatoreImpegnato(slot, durata)) {
        avvisa('Hai già un impegno', 'In questo orario hai già un\'altra prenotazione (anche per uno sport diverso): non puoi giocare due partite in contemporanea.');
        return;
      }
      avvisa('Nessuna disponibilità', 'Non ci sono campi liberi in questo orario in questo centro. Vuoi vedere le disponibilità in altri centri?', [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Cambia centro', onPress: () => { setCentroSel(null); setFase('centro'); } },
      ]);
      return;
    }
    setSlotSel((cur) => (cur === slot ? null : slot));
    setCampoSel(null);
  };

  const conferma = async () => {
    if (!centroSel || !campoSel || !slotSel || !dataISO || !me) return;
    const durata = durataCampo(campoSel);
    const fine = addMin(slotSel, durata);
    const prezzo = calcPrezzoCampo(campoSel, slotSel, fine);
    const squadraA = slotsRichiesti.filter((id) => id[0] === 'a').map((id) => formazione[id]).filter((g): g is Giocatore => !!g);
    const squadraB = slotsRichiesti.filter((id) => id[0] === 'b').map((id) => formazione[id]).filter((g): g is Giocatore => !!g);
    const invitati = giocatoriScelti.filter((g) => g.id !== me.id);
    setSaving(true);
    const res = await creaPrenotazione({
      centro_id: centroSel.id, campo_id: campoSel.id, creata_da: me.id,
      data: dataISO, inizio: slotSel, fine, prezzo,
      invitati: invitati.map((g) => g.id),
      squadre: { a: squadraA.map((g) => g.id), b: squadraB.map((g) => g.id) },
    });
    setSaving(false);
    if (res.ok) {
      const conChi = invitati.length > 0 ? `\ncon ${invitati.map((g) => g.nome).join(', ')}` : '';
      avvisa('Prenotazione confermata', `${centroSel.nome} · ${campoSel.nome}\n${etichettaGiorno(dataISO)} · ${slotSel}–${fine}${conChi}${demoMode ? '\n\n(demo: non salvata sul server)' : ''}`);
      setSlotSel(null); setCampoSel(null); loadOccupati();
    } else {
      avvisa('Errore', res.error ?? 'Impossibile prenotare.');
    }
  };

  // Quota stimata a testa nello schermo "Invita giocatori": il prezzo si
  // aggiorna live man mano che si riempiono gli slot, prima ancora che la
  // prenotazione esista (calcolo lato client, nessuna chiamata server).
  const prezzoStimato = campoSel && slotSel ? calcPrezzoCampo(campoSel, slotSel, addMin(slotSel, durataCampo(campoSel))) : 0;

  // ---- Fase 1: giorno ----
  if (fase === 'giorno') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <H1>Prenota un campo</H1>
          <Muted style={{ marginBottom: Spacing.lg }}>Scegli il giorno in cui vuoi giocare.</Muted>
          <View style={s.giorniGrid}>
            {Array.from({ length: 21 }).map((_, i) => {
              const iso = isoOggi(i);
              const d = new Date(`${iso}T12:00:00`);
              return (
                <Pressable key={iso} onPress={() => { setDataISO(iso); setFase('centro'); }} style={s.dayPill}>
                  <Text style={s.dayPillTop}>{GIORNI[d.getDay()]}</Text>
                  <Text style={s.dayPillNum}>{d.getDate()}</Text>
                  <Muted style={{ fontSize: 10 }}>{MESI[d.getMonth()]}</Muted>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Fase 2: centro ----
  if (fase === 'centro') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <H1>Prenota un campo</H1>
          <Pressable onPress={() => setFase('giorno')}>
            <Muted style={{ marginBottom: Spacing.lg, textDecorationLine: 'underline' }}>{dataISO ? etichettaGiorno(dataISO) : ''} · cambia giorno</Muted>
          </Pressable>

          <View style={s.filtriRow}>
            <Chip label="⭐ Preferiti" active={soloPreferiti} onPress={() => setSoloPreferiti((v) => !v)} />
          </View>

          {regioni.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{ gap: Spacing.sm }}>
              {regioni.map((r) => (
                <Chip key={r} label={r} active={regione === r} onPress={() => onToggleRegione(r)} />
              ))}
            </ScrollView>
          )}
          {regione && province.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{ gap: Spacing.sm }}>
              {province.map((p) => (
                <Chip key={p} label={p} active={provincia === p} onPress={() => setProvincia((cur) => (cur === p ? null : p))} />
              ))}
            </ScrollView>
          )}

          {centri.length === 0 && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
          {centri.length > 0 && centriFiltrati.length === 0 && (
            <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun centro corrisponde ai filtri.</Muted>
          )}
          {centriFiltrati.map((c) => (
            <Pressable key={c.id} onPress={() => sceglicentro(c)}>
              <Card style={s.row}>
                <IconBadge icon="business" />
                <View style={{ flex: 1 }}>
                  <Text style={s.campoNome}>{c.nome}</Text>
                  {(c.citta || c.provincia) ? <Muted>{[c.citta, c.provincia].filter(Boolean).join(' · ')}</Muted> : null}
                </View>
                <Pressable hitSlop={8} onPress={() => onTogglePreferito(c)}>
                  <Ionicons name={preferiti.has(c.id) ? 'star' : 'star-outline'} size={20} color={preferiti.has(c.id) ? colors.gold : colors.slate} />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color={colors.slate} />
              </Card>
            </Pressable>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Fase 3: orario → campo → conferma ----
  // Selezionare uno slot SOSTITUISCE la vista (niente scroll per trovare la
  // scelta campo, fix utente esplicito): l'elenco orari sparisce e al suo
  // posto compare solo "Scegli il campo", con una freccia per tornare indietro.
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!slotSel ? (
          <>
            <H1>Prenota un campo</H1>

            <View style={s.pillRow}>
              <Pressable style={s.pill} onPress={() => setFase('giorno')}>
                <Ionicons name="calendar-outline" size={14} color={colors.navyDeep} />
                <Text style={s.pillText} numberOfLines={1}>{dataISO ? etichettaGiorno(dataISO) : ''}</Text>
              </Pressable>
              <Pressable style={s.pill} onPress={() => setFase('centro')}>
                <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
                <Ionicons name="business" size={14} color={colors.navyDeep} />
                <Text style={s.pillText} numberOfLines={1}>{centroSel?.nome}</Text>
                <Ionicons name="chevron-down" size={12} color={colors.slate} />
              </Pressable>
              <View style={s.pill}>
                <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
                <Ionicons name="tennisball-outline" size={14} color={colors.navyDeep} />
                <Text style={s.pillText} numberOfLines={1}>{sportAttivo}</Text>
              </View>
            </View>

            <H2 style={{ marginBottom: Spacing.md }}>Orari disponibili</H2>
            {campi.length === 0 ? (
              <Muted>Nessun campo prenotabile in questo centro.</Muted>
            ) : campiSport.length === 0 ? (
              <Muted>Nessun campo per questo sport in questo centro.</Muted>
            ) : slots.length === 0 ? (
              <Muted>Il centro è chiuso in questo giorno.</Muted>
            ) : slotsVisibili.length === 0 ? (
              <Muted>Non ci sono più orari disponibili per oggi.</Muted>
            ) : (
              <View style={s.slotGrid}>
                {slotsVisibili.map((slot) => {
                  const nLiberi = campiLiberi(slot).length;
                  const occ = nLiberi === 0;
                  const mioImpegno = occ && giocatoreImpegnato(slot, durataCampo(campiSport[0] ?? null));
                  return (
                    <Pressable key={slot} onPress={() => tapSlot(slot)} style={[s.slot, occ && s.slotOcc]}>
                      <Text style={[s.slotText, occ && s.slotTextOcc]}>{slot}</Text>
                      <Text style={[s.slotPrezzo, occ && s.slotTextOcc]}>{mioImpegno ? 'già impegnato' : occ ? 'pieno' : `${nLiberi} liberi`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ) : !campoSel ? (
          <>
            <View style={s.backRow}>
              <Pressable onPress={() => { setSlotSel(null); setCampoSel(null); }} style={s.backBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={colors.navyDeep} />
              </Pressable>
              <View>
                <H2>Scegli il campo</H2>
                <Muted>{dataISO ? etichettaGiorno(dataISO) : ''} · {slotSel}</Muted>
              </View>
            </View>
            <View style={{ gap: Spacing.sm }}>
              {campiLiberi(slotSel).map((c) => {
                const prezzo = calcPrezzoCampo(c, slotSel, addMin(slotSel, durataCampo(c)));
                return (
                  <Pressable key={c.id} onPress={() => setCampoSel(c)}>
                    <Card style={s.campoCard}>
                      <View style={s.campoIcon}><Ionicons name="tennisball" size={20} color={colors.gold} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.campoNome}>{c.nome}</Text>
                        <Muted>{c.sport} · {c.tipo} · {durataCampo(c)} min</Muted>
                      </View>
                      <Text style={s.campoPrezzo}>€{prezzo}</Text>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={s.backRow}>
              <Pressable onPress={() => setCampoSel(null)} style={s.backBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={colors.navyDeep} />
              </Pressable>
              <View>
                <H2>Invita giocatori</H2>
                <Muted>{campoSel.nome} · {slotSel}–{addMin(slotSel, durataCampo(campoSel))}</Muted>
              </View>
            </View>

            {me && (
              <View style={{ marginBottom: Spacing.lg }}>
                {doppio && sportAttivo === 'Padel' && (
                  <Pressable
                    onPress={ottimizzaAbbinamento} disabled={!slotsRichiesti.every((id) => formazione[id])}
                    style={[s.ottimizzaBtn, !slotsRichiesti.every((id) => formazione[id]) && { opacity: 0.4 }]}
                  >
                    <Text style={s.ottimizzaTesto}>⚖️ Ottimizza abbinamento</Text>
                  </Pressable>
                )}

                <View style={s.squadreRow}>
                  <SquadraCard titolo="SQUADRA A" media={mediaSquadra('a')} colors={colors} s={s}>
                    <SlotGiocatore
                      giocatore={me} fisso ranking={sportAttivo === 'Padel' ? ranking(me) : undefined}
                      quota={prezzoStimato / giocatoriScelti.length} colors={colors} s={s}
                    />
                    {doppio && (formazione.a2
                      ? <SlotGiocatore
                          giocatore={formazione.a2} ranking={sportAttivo === 'Padel' ? ranking(formazione.a2) : undefined}
                          quota={prezzoStimato / giocatoriScelti.length} onRemove={() => rimuoviSlot('a2')} colors={colors} s={s}
                        />
                      : <SlotVuoto attivo={slotAttivo === 'a2'} onPress={() => setSlotAttivo('a2')} colors={colors} s={s} />)}
                  </SquadraCard>
                  <SquadraCard titolo="SQUADRA B" media={mediaSquadra('b')} evidenziata colors={colors} s={s}>
                    {formazione.b1
                      ? <SlotGiocatore
                          giocatore={formazione.b1} ranking={sportAttivo === 'Padel' ? ranking(formazione.b1) : undefined}
                          quota={prezzoStimato / giocatoriScelti.length} onRemove={() => rimuoviSlot('b1')} colors={colors} s={s}
                        />
                      : <SlotVuoto attivo={slotAttivo === 'b1'} onPress={() => setSlotAttivo('b1')} colors={colors} s={s} />}
                    {doppio && (formazione.b2
                      ? <SlotGiocatore
                          giocatore={formazione.b2} ranking={sportAttivo === 'Padel' ? ranking(formazione.b2) : undefined}
                          quota={prezzoStimato / giocatoriScelti.length} onRemove={() => rimuoviSlot('b2')} colors={colors} s={s}
                        />
                      : <SlotVuoto attivo={slotAttivo === 'b2'} onPress={() => setSlotAttivo('b2')} colors={colors} s={s} />)}
                  </SquadraCard>
                </View>
                <Muted style={{ marginTop: Spacing.sm, fontSize: Font.tiny }}>
                  Quota stimata a testa — il prezzo si divide tra chi partecipa, si paga al centro o dai "miei impegni" a prenotazione fatta.
                </Muted>
              </View>
            )}

            {slotAttivo ? (
              <>
                <Input icon="search" placeholder="Cerca giocatore per nome…" value={queryInvita} onChangeText={setQueryInvita} style={{ marginBottom: Spacing.md }} autoFocus />

                {queryInvita.trim() ? (
                  risultatiCerca.length === 0 ? (
                    <Muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>Nessun giocatore trovato.</Muted>
                  ) : (
                    <View style={{ gap: Spacing.sm }}>
                      {risultatiCerca.map((g) => (
                        <Pressable key={g.id} onPress={() => invita(g)}>
                          <Card style={s.invitoCard}>
                            <Avatar name={`${g.nome} ${g.cognome}`} size={40} genere={g.genere} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.campoNome}>{g.nome} {g.cognome}</Text>
                              {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                            </View>
                            {sportAttivo === 'Padel' && rankingMap.has(g.id) && <Text style={s.rankingBadge}>{rankingMap.get(g.id)!.toFixed(2)}</Text>}
                            <Ionicons name="add-circle" size={24} color={colors.gold} />
                          </Card>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : mostraSuggeriti ? (
                  <>
                    <Muted style={{ marginBottom: Spacing.sm }}>⚖️ Suggeriti per equilibrio (ranking simile alla media in campo)</Muted>
                    <View style={{ gap: Spacing.sm }}>
                      {suggeritiEquilibrio.map((g) => (
                        <Pressable key={g.id} onPress={() => invita(g)}>
                          <Card style={s.invitoCard}>
                            <Avatar name={`${g.nome} ${g.cognome}`} size={40} genere={g.genere} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.campoNome}>{g.nome} {g.cognome}</Text>
                              {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                            </View>
                            <Text style={s.rankingBadge}>{(rankingMap.get(g.id) ?? 0).toFixed(2)}</Text>
                            <Ionicons name="add-circle" size={24} color={colors.gold} />
                          </Card>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Muted style={{ marginBottom: Spacing.sm }}>I tuoi amici</Muted>
                    {amiciDisponibili.length === 0 ? (
                      <Muted style={{ textAlign: 'center', marginTop: Spacing.md }}>Nessun amico da invitare. Cerca un giocatore per nome.</Muted>
                    ) : (
                      <View style={{ gap: Spacing.sm }}>
                        {amiciDisponibili.map((g) => (
                          <Pressable key={g.id} onPress={() => invita(g)}>
                            <Card style={s.invitoCard}>
                              <Avatar name={`${g.nome} ${g.cognome}`} size={40} genere={g.genere} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.campoNome}>{g.nome} {g.cognome}</Text>
                                {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                              </View>
                              {sportAttivo === 'Padel' && rankingMap.has(g.id) && <Text style={s.rankingBadge}>{rankingMap.get(g.id)!.toFixed(2)}</Text>}
                              <Ionicons name="add-circle" size={24} color={colors.gold} />
                            </Card>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            ) : (
              <Muted style={{ textAlign: 'center' }}>Tocca uno slot vuoto per aggiungere un giocatore.</Muted>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {slotSel && campoSel && (
        <View style={s.bar}>
          <BlurView intensity={GLASS_BLUR_STRONG} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, s.barTint]} />
          <View style={{ flex: 1 }}>
            <Text style={s.barSottotitolo} numberOfLines={1}>{centroSel?.nome}</Text>
            <Text style={s.barTitle} numberOfLines={1}>{campoSel.nome} · {slotSel}–{addMin(slotSel, durataCampo(campoSel))}</Text>
            <Muted style={{ color: '#93A6C0' }}>{dataISO ? etichettaGiorno(dataISO) : ''} · €{calcPrezzoCampo(campoSel, slotSel, addMin(slotSel, durataCampo(campoSel)))}</Muted>
          </View>
          <Button title="Conferma" onPress={conferma} loading={saving} style={{ paddingHorizontal: Spacing.xl }} />
        </View>
      )}
    </SafeAreaView>
  );
}

// ============================================================
// Coppie A/B — stesso linguaggio visivo del gestionale (src/routes/
// +page.svelte: card COPPIA A/COPPIA B, avatar squircle blu-notte, pallino
// prezzo, badge DX/SX) — fix utente esplicito "vorrei fosse più simile al
// gestionale".
// ============================================================
function SquadraCard({ titolo, media, evidenziata, children, colors, s }: {
  titolo: string; media: number | null; evidenziata?: boolean; children: React.ReactNode;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[s.squadraCard, evidenziata && s.squadraCardEvidenziata]}>
      <View style={s.squadraHead}>
        <Text style={[s.squadraTitolo, evidenziata && { color: colors.gold }]}>{titolo}</Text>
        {media != null && (
          <Text style={s.squadraMedia}>Media: <Text style={s.squadraMediaValore}>{media.toFixed(2)}</Text></Text>
        )}
      </View>
      <View style={{ gap: Spacing.sm }}>{children}</View>
    </View>
  );
}

function SlotGiocatore({ giocatore, fisso, ranking, quota, onRemove, colors, s }: {
  giocatore: Giocatore; fisso?: boolean; ranking?: number; quota?: number | null;
  onRemove?: () => void; colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const posizione = giocatore.posizione;
  return (
    <View style={s.slotCard}>
      {!fisso && onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} style={s.slotRimuovi}>
          <Ionicons name="close" size={13} color={colors.slate} />
        </Pressable>
      )}
      <Avatar name={`${giocatore.nome} ${giocatore.cognome}`} size={44} squircle genere={giocatore.genere} />
      <Text style={s.slotNome} numberOfLines={1}>{fisso ? 'Tu' : giocatore.nome}</Text>
      {(ranking != null || (posizione && posizione !== 'entrambe')) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {ranking != null && <Text style={s.slotRanking}>{ranking.toFixed(2)}</Text>}
          {posizione && posizione !== 'entrambe' && (
            <Text style={s.slotPosizione}>{posizione === 'destra' ? 'DX' : 'SX'}</Text>
          )}
        </View>
      )}
      {quota != null && <Text style={s.slotQuota}>€{quota.toFixed(2)}</Text>}
    </View>
  );
}

function SlotVuoto({ attivo, onPress, colors, s }: {
  attivo?: boolean; onPress: () => void; colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[s.slotCard, s.slotVuoto, attivo && s.slotVuotoAttivo]}>
      <Ionicons name="add" size={20} color={attivo ? colors.gold : colors.slate} />
      <Muted style={{ fontSize: Font.tiny }}>Aggiungi</Muted>
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    filtriRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
    chipScroll: { marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    giorniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    dayPill: { width: '22%', aspectRatio: 0.85, borderRadius: Radius.md, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.navyLine + '55', gap: 2 },
    dayPillTop: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase' },
    dayPillNum: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, flexWrap: 'wrap' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: colors.navyLine + '33', overflow: 'hidden', backgroundColor: colors.navyCard },
    pillText: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small, maxWidth: 160 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
    backBtn: { width: 36, height: 36, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navyCard },
    campoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
    campoCardActive: { borderColor: colors.gold, backgroundColor: colors.navy },
    campoIcon: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
    campoNome: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    campoPrezzo: { color: colors.gold, fontWeight: '900', fontSize: Font.body },
    invitoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    ottimizzaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: colors.navyCard,
      borderWidth: 1, borderColor: colors.navyLine + '55', marginBottom: Spacing.md,
    },
    ottimizzaTesto: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small },
    squadreRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    squadraCard: {
      flex: 1, backgroundColor: colors.navyCard, borderRadius: Radius.card, padding: Spacing.md,
      borderWidth: 1, borderColor: colors.navyLine + '40',
    },
    squadraCardEvidenziata: { backgroundColor: colors.gold + '0F', borderColor: colors.gold + '55' },
    squadraHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.sm },
    squadraTitolo: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.tiny, letterSpacing: 0.5 },
    squadraMedia: { color: colors.slate, fontSize: Font.tiny },
    squadraMediaValore: { color: colors.navyDeep, fontWeight: '800' },
    slotCard: {
      backgroundColor: colors.bg, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center',
      gap: 3, borderWidth: 1, borderColor: colors.navyLine + '30',
    },
    slotRimuovi: { position: 'absolute', top: 4, right: 4, zIndex: 1 },
    slotNome: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small, maxWidth: '100%' },
    slotRanking: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700' },
    slotPosizione: {
      color: colors.gold, fontSize: 9, fontWeight: '800', backgroundColor: colors.gold + '18',
      paddingHorizontal: 5, paddingVertical: 1, borderRadius: Radius.pill, overflow: 'hidden',
    },
    slotQuota: {
      color: colors.red, fontWeight: '800', fontSize: Font.tiny, backgroundColor: colors.red + '18',
      paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill, marginTop: 2, overflow: 'hidden',
    },
    slotVuoto: { borderStyle: 'dashed', minHeight: 88, justifyContent: 'center' },
    slotVuotoAttivo: { borderColor: colors.gold, borderStyle: 'solid', backgroundColor: colors.gold + '0F' },
    rankingBadge: { color: colors.gold, fontWeight: '800', fontSize: Font.small, backgroundColor: colors.gold + '18', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    slot: { width: '31%', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: colors.navyCard, alignItems: 'center', borderWidth: 1, borderColor: colors.navyLine + '55' },
    slotOcc: { backgroundColor: colors.navyLine + '18', borderColor: 'transparent' },
    slotSel: { backgroundColor: colors.gold, borderColor: colors.gold },
    slotText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    slotPrezzo: { color: colors.slate, fontSize: Font.tiny, marginTop: 2 },
    slotTextOcc: { color: colors.slate },
    slotTextSel: { color: colors.navyDeep },
    bar: {
      position: 'absolute', left: Spacing.lg, right: Spacing.lg, bottom: Spacing.md,
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg,
      borderRadius: Radius.floating, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
      boxShadow: '0 14px 32px rgba(20,30,48,0.25), 0 4px 12px rgba(20,30,48,0.15)',
    } as any,
    barTint: { backgroundColor: 'rgba(30, 49, 74, 0.82)' },
    barSottotitolo: { color: colors.gold, fontWeight: '800', fontSize: Font.tiny, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
    barTitle: { color: colors.white, fontWeight: '700', fontSize: Font.body },
  });
}
