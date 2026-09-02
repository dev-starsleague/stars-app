import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import {
  getCampi, getCentri, getPartiteGiocatore, getPrenotazioniGiorno, creaPrenotazione,
  centriPreferiti, toggleCentroPreferito, getGiocatori, getRanking, getAmici,
} from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { orariSlots } from '../../lib/orari';
import { calcPrezzoCampo } from '../../lib/prezziCampi';
import { Card, Chip, H1, H2, IconBadge, Muted, Button, Avatar, Input } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { Campo, Centro, Giocatore, Prenotazione } from '../../types/models';

const MAX_GIOCATORI = 4;

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
  const [sportSel, setSportSel] = useState<string | null>(null);
  const [mostraAltriSport, setMostraAltriSport] = useState(false);
  const [storicoSport, setStoricoSport] = useState<Prenotazione[]>([]);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [campoSel, setCampoSel] = useState<Campo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!centroSel) { setCampi([]); return; }
    getCampi(centroSel.id).then(setCampi);
    setSportSel(null); setMostraAltriSport(false);
  }, [centroSel]);

  // Storico partite: serve solo a stimare lo sport prenotato più spesso
  // quando il giocatore ne pratica più di uno (vedi sportDefault sotto).
  useEffect(() => { if (me) getPartiteGiocatore(me.id).then(setStoricoSport); }, [me]);

  // Sport attivi per il giocatore in QUESTO centro: solo quelli che pratica
  // E che il centro offre davvero — "altri sport" mostra il resto
  // dell'offerta del centro, non un elenco fisso. Un solo sport praticato
  // (qui) → quello è il default; più di uno → il più prenotato in assoluto
  // tra quelli praticati, sugli altri si sceglie a mano (fix utente esplicito).
  const sportGiocatore = (me?.sport_preferiti ?? []).filter((sp) => (centroSel?.sport_attivi ?? []).includes(sp));
  const sportAltri = (centroSel?.sport_attivi ?? []).filter((sp) => !sportGiocatore.includes(sp));

  useEffect(() => {
    if (sportSel !== null || !centroSel) return;
    if (sportGiocatore.length >= 1) {
      const conteggi = new Map<string, number>();
      for (const p of storicoSport) { const sp = p.campo?.sport; if (sp) conteggi.set(sp, (conteggi.get(sp) ?? 0) + 1); }
      const scelto = [...sportGiocatore].sort((a, b) => (conteggi.get(b) ?? 0) - (conteggi.get(a) ?? 0))[0];
      setSportSel(scelto);
    } else if (centroSel.sport_attivi.length > 0) {
      setSportSel(centroSel.sport_attivi[0]);
    }
  }, [centroSel, storicoSport, sportSel, sportGiocatore.join(',')]);

  const campiSport = useMemo(() => campi.filter((c) => c.sport === sportSel), [campi, sportSel]);

  const loadOccupati = useCallback(async () => {
    if (!dataISO || campi.length === 0) { setOccupati([]); return; }
    const rows = await getPrenotazioniGiorno(campi.map((c) => c.id), dataISO);
    setOccupati(rows);
  }, [campi, dataISO]);
  useEffect(() => { loadOccupati(); }, [loadOccupati]);
  useEffect(() => { setSlotSel(null); setCampoSel(null); }, [sportSel, dataISO]);

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
      return !occupati.some((p) => {
        if (p.campo_id !== c.id || !p.inizio || !p.fine) return false;
        const inizioEsistente = toMin(p.inizio.slice(0, 5));
        const fineEsistente = toMin(p.fine.slice(0, 5));
        return inizioSlot < fineEsistente && fineSlot > inizioEsistente;
      });
    }),
    [campiSport, occupati]);

  // ---- invita giocatori: stessa identica logica di ricerca/suggerimento
  // del gestionale (src/routes/+page.svelte, picker della "Nuova
  // prenotazione") — fix utente esplicito "deve funzionare ESATTAMENTE come
  // sul gestionale". Ricerca client-side su nome+cognome, nessun debounce
  // (stesso filtro in-memory); a query vuota mostra i "suggeriti per
  // equilibrio" (ranking più vicino alla media di chi è già invitato,
  // stesso genere se tutti quelli scelti condividono un genere, solo per
  // Padel) — quando invece non c'è ancora nessun invitato non c'è una
  // "media" da calcolare, e lì si parte dagli amici (il gestionale non ha
  // un concetto di amici, l'app sì: colma esattamente quel vuoto iniziale).
  const [invitati, setInvitati] = useState<Giocatore[]>([]);
  const [queryInvita, setQueryInvita] = useState('');
  const [tuttiGiocatori, setTuttiGiocatori] = useState<Giocatore[]>([]);
  const [rankingMap, setRankingMap] = useState<Map<string, number>>(new Map());
  const [amici, setAmici] = useState<Giocatore[]>([]);

  useEffect(() => {
    getGiocatori().then(setTuttiGiocatori);
    getRanking().then((righe) => setRankingMap(new Map(righe.map((r) => [r.giocatore_id, r.ranking]))));
  }, []);
  useEffect(() => {
    if (!me) return;
    getAmici(me.id).then((righe) => setAmici(righe.map((a) => a.amico).filter((g): g is Giocatore => Boolean(g))));
  }, [me]);
  useEffect(() => { setInvitati([]); setQueryInvita(''); }, [slotSel]);

  const risultatiCerca = useMemo(() => {
    const q = queryInvita.trim().toLowerCase();
    if (!q || !me) return [];
    const esclusi = new Set([me.id, ...invitati.map((g) => g.id)]);
    return tuttiGiocatori
      .filter((g) => !esclusi.has(g.id) && `${g.nome} ${g.cognome ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [queryInvita, tuttiGiocatori, invitati, me]);

  const suggeritiEquilibrio = useMemo(() => {
    if (queryInvita.trim() || sportSel !== 'Padel' || invitati.length === 0 || !me) return [];
    const scelti = [me, ...invitati];
    const media = scelti.reduce((s2, g) => s2 + (rankingMap.get(g.id) ?? 0), 0) / scelti.length;
    const esclusi = new Set(scelti.map((g) => g.id));
    const generi = new Set(scelti.map((g) => g.genere).filter(Boolean));
    const genereRichiesto = generi.size === 1 ? [...generi][0] : null;
    return tuttiGiocatori
      .filter((g) => !esclusi.has(g.id))
      .filter((g) => !genereRichiesto || g.genere === genereRichiesto)
      .map((g) => ({ g, diff: Math.abs((rankingMap.get(g.id) ?? 0) - media) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5)
      .map((x) => x.g);
  }, [queryInvita, sportSel, invitati, me, tuttiGiocatori, rankingMap]);

  const amiciDisponibili = useMemo(() => {
    const esclusi = new Set([me?.id, ...invitati.map((g) => g.id)]);
    return amici.filter((g) => !esclusi.has(g.id));
  }, [amici, invitati, me]);

  const mostraSuggeriti = !queryInvita.trim() && suggeritiEquilibrio.length > 0;

  const invita = (g: Giocatore) => {
    if (invitati.length + 1 >= MAX_GIOCATORI) {
      avvisa('Limite raggiunto', `Puoi invitare al massimo ${MAX_GIOCATORI - 1} giocatori oltre a te.`);
      return;
    }
    setInvitati((cur) => [...cur, g]);
    setQueryInvita('');
  };
  const rimuoviInvitato = (id: string) => setInvitati((cur) => cur.filter((g) => g.id !== id));

  const tapSlot = (slot: string) => {
    if (campiLiberi(slot).length === 0) {
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
    setSaving(true);
    const res = await creaPrenotazione({
      centro_id: centroSel.id, campo_id: campoSel.id, creata_da: me.id,
      data: dataISO, inizio: slotSel, fine, prezzo,
      invitati: invitati.map((g) => g.id),
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

  // ---- Fase 1: giorno ----
  if (fase === 'giorno') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
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
            </View>

            {centroSel.sport_attivi.length > 1 && (
              <>
                <View style={s.filtriRow}>
                  {(sportGiocatore.length > 0 ? sportGiocatore : centroSel.sport_attivi).map((sp) => (
                    <Chip key={sp} label={sp} active={sportSel === sp} onPress={() => setSportSel(sp)} />
                  ))}
                  {sportGiocatore.length > 0 && sportAltri.length > 0 && (
                    <Chip label="Altri sport" active={mostraAltriSport} onPress={() => setMostraAltriSport((v) => !v)} />
                  )}
                </View>
                {mostraAltriSport && sportAltri.length > 0 && (
                  <View style={[s.filtriRow, { marginBottom: Spacing.md }]}>
                    {sportAltri.map((sp) => (
                      <Chip key={sp} label={sp} active={sportSel === sp} onPress={() => { setSportSel(sp); setMostraAltriSport(false); }} />
                    ))}
                  </View>
                )}
              </>
            )}

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
                  return (
                    <Pressable key={slot} onPress={() => tapSlot(slot)} style={[s.slot, occ && s.slotOcc]}>
                      <Text style={[s.slotText, occ && s.slotTextOcc]}>{slot}</Text>
                      <Text style={[s.slotPrezzo, occ && s.slotTextOcc]}>{occ ? 'pieno' : `${nLiberi} liberi`}</Text>
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

            <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
              <Card style={s.invitatoRow}>
                <Avatar name={`${me?.nome ?? ''} ${me?.cognome ?? ''}`} size={36} gold />
                <Text style={s.invitatoNome}>Tu</Text>
              </Card>
              {invitati.map((g) => (
                <Card key={g.id} style={s.invitatoRow}>
                  <Avatar name={`${g.nome} ${g.cognome}`} size={36} />
                  <Text style={s.invitatoNome}>{g.nome} {g.cognome}</Text>
                  <Pressable onPress={() => rimuoviInvitato(g.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.slate} />
                  </Pressable>
                </Card>
              ))}
            </View>

            {invitati.length + 1 < MAX_GIOCATORI ? (
              <>
                <Input icon="search" placeholder="Cerca giocatore per nome…" value={queryInvita} onChangeText={setQueryInvita} style={{ marginBottom: Spacing.md }} />

                {queryInvita.trim() ? (
                  risultatiCerca.length === 0 ? (
                    <Muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>Nessun giocatore trovato.</Muted>
                  ) : (
                    <View style={{ gap: Spacing.sm }}>
                      {risultatiCerca.map((g) => (
                        <Pressable key={g.id} onPress={() => invita(g)}>
                          <Card style={s.invitoCard}>
                            <Avatar name={`${g.nome} ${g.cognome}`} size={40} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.campoNome}>{g.nome} {g.cognome}</Text>
                              {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                            </View>
                            {sportSel === 'Padel' && rankingMap.has(g.id) && <Text style={s.rankingBadge}>{rankingMap.get(g.id)!.toFixed(2)}</Text>}
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
                            <Avatar name={`${g.nome} ${g.cognome}`} size={40} />
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
                              <Avatar name={`${g.nome} ${g.cognome}`} size={40} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.campoNome}>{g.nome} {g.cognome}</Text>
                                {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                              </View>
                              {sportSel === 'Padel' && rankingMap.has(g.id) && <Text style={s.rankingBadge}>{rankingMap.get(g.id)!.toFixed(2)}</Text>}
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
              <Muted style={{ textAlign: 'center' }}>Hai raggiunto il numero massimo di giocatori per questa partita.</Muted>
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
    invitatoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    invitatoNome: { flex: 1, color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    invitoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
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
