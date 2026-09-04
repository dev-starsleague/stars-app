import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import {
  getPartiteGiocatore, getEventiIscritti, getGiocatori, getCentri, salvaRisultatoPartita, haVinto,
} from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { serveRisultato, servePagamento } from '../../lib/impegni';
import { AppHeader } from '../../components/AppHeader';
import { Card, IconBadge, IconButton, Muted, Button, Chip } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../../constants/theme';
import type { Prenotazione, EventoCustom, Giocatore, Centro } from '../../types/models';

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function oggiISO() { return new Date().toISOString().slice(0, 10); }
function etichettaData(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

// Squadra ("a"/"b") a cui appartiene un giocatore in una prenotazione —
// stessa convenzione di api.ts:haVinto (squadre esplicite, altrimenti
// ordine posizionale in giocatori_extra: prima metà = A).
function squadraDi(p: Prenotazione, giocatoreId: string): 'a' | 'b' {
  let squadraA: string[];
  if (p.squadre) squadraA = p.squadre.a;
  else { const meta = Math.ceil(p.giocatori_extra.length / 2); squadraA = p.giocatori_extra.slice(0, meta); }
  return squadraA.includes(giocatoreId) ? 'a' : 'b';
}


interface SetInput { a: string; b: string; tb: boolean }
const SET_VUOTO = (): SetInput => ({ a: '', b: '', tb: false });

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
  const nomeGiocatore = useCallback((id: string) => {
    const g = giocatoriMap.get(id);
    return g ? `${g.nome} ${g.cognome}` : null;
  }, [giocatoriMap]);

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

  // ---- modale "inserisci risultato" ----
  const [modaleRisultato, setModaleRisultato] = useState<Prenotazione | null>(null);
  const [sets, setSets] = useState<SetInput[]>([SET_VUOTO(), SET_VUOTO(), SET_VUOTO()]);
  const [vincitoreIo, setVincitoreIo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const apriRisultato = (p: Prenotazione) => {
    setSets([SET_VUOTO(), SET_VUOTO(), SET_VUOTO()]);
    setVincitoreIo(null);
    setModaleRisultato(p);
  };
  const modificaSet = (i: number, campo: 'a' | 'b', valore: string) => {
    setSets((cur) => cur.map((set, idx) => (idx === i ? { ...set, [campo]: valore.replace(/[^0-9]/g, '') } : set)));
  };
  const toggleTb = (i: number) => setSets((cur) => cur.map((set, idx) => (idx === i ? { ...set, tb: !set.tb } : set)));

  const salvaRisultato = async () => {
    if (!modaleRisultato || !me) return;
    if (vincitoreIo === null) { avvisa('Manca qualcosa', 'Indica chi ha vinto prima di salvare.'); return; }
    const setsValidi = sets
      .filter((set) => set.a.trim() !== '' && set.b.trim() !== '')
      .map((set) => ({ a: Number(set.a), b: Number(set.b), tb: set.tb }));
    if (setsValidi.length === 0) { avvisa('Manca qualcosa', 'Inserisci il punteggio di almeno un set.'); return; }
    const miaSquadra = squadraDi(modaleRisultato, me.id);
    const vincitore: 'A' | 'B' = vincitoreIo === (miaSquadra === 'a') ? 'A' : 'B';
    setSalvando(true);
    const res = await salvaRisultatoPartita(modaleRisultato.id, {
      sets: setsValidi, vincitore, sport: modaleRisultato.campo?.sport ?? 'Padel',
    });
    setSalvando(false);
    if (res.ok) {
      avvisa('Risultato salvato', 'Grazie! Il risultato è stato registrato.');
      setModaleRisultato(null);
      load();
    } else {
      avvisa('Errore', res.error ?? 'Impossibile salvare il risultato.');
    }
  };

  const mostraPagamento = (p: Prenotazione) => {
    avvisa('Da pagare', `${p.prezzo ? `€${p.prezzo} da saldare` : 'Pagamento da saldare'} direttamente al centro.`);
  };

  const infoSquadre = useCallback((p: Prenotazione): { mia: string[]; avv: string[] } => {
    let a: string[], b: string[];
    if (p.squadre) { a = p.squadre.a; b = p.squadre.b; }
    else { const meta = Math.ceil(p.giocatori_extra.length / 2); a = p.giocatori_extra.slice(0, meta); b = p.giocatori_extra.slice(meta); }
    const miaSquadra = me && a.includes(me.id) ? a : b;
    const avvSquadra = me && a.includes(me.id) ? b : a;
    return {
      mia: miaSquadra.filter((id) => id !== me?.id).map(nomeGiocatore).filter((n): n is string => Boolean(n)),
      avv: avvSquadra.map(nomeGiocatore).filter((n): n is string => Boolean(n)),
    };
  }, [me, nomeGiocatore]);

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
          <View style={s.schedaRiga}>
            <Ionicons name="people-outline" size={15} color={colors.slate} />
            <Muted style={{ flex: 1 }}>
              {mia.length > 0 ? `Con ${mia.join(', ')}` : ''}{mia.length > 0 && avv.length > 0 ? ' · ' : ''}
              {avv.length > 0 ? `Contro ${avv.join(', ')}` : ''}
            </Muted>
          </View>
        )}

        <View style={s.schedaFooter}>
          <Pressable
            onPress={() => (servePagamento(p) ? mostraPagamento(p) : undefined)}
            style={[s.badge, { backgroundColor: (servePagamento(p) ? colors.red : colors.green) + '18' }]}
          >
            <Text style={[s.badgeTesto, { color: servePagamento(p) ? colors.red : colors.green }]}>
              {servePagamento(p) ? `Da pagare · €${p.prezzo}` : 'Pagato'}
            </Text>
          </Pressable>

          {p.risultato ? (
            <View style={[s.badge, { backgroundColor: (vinta ? colors.green : colors.red) + '18' }]}>
              <Text style={[s.badgeTesto, { color: vinta ? colors.green : colors.red }]}>
                {vinta ? '🏆 Vittoria' : 'Sconfitta'} · {p.risultato.sets.map((set) => `${set.a}-${set.b}`).join(', ')}
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
                <Text style={s.sectionTitle}>Da fare</Text>
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.xl }}>
                  {daFare.map((p) => schedaPartita(p, 'daFare'))}
                </View>
              </>
            )}

            <Text style={s.sectionTitle}>In arrivo</Text>
            {inArrivo.length === 0 ? (
              <Muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>Nessun impegno in arrivo.</Muted>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {inArrivo.map((r) => (r.tipo === 'partita' ? schedaPartita(r.p, 'inArrivo') : schedaEvento(r.e)))}
              </View>
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
            <Text style={s.modaleTitolo}>Inserisci risultato</Text>
            <Muted style={{ marginBottom: Spacing.lg }}>{modaleRisultato?.campo?.nome} · {modaleRisultato?.data ? etichettaData(modaleRisultato.data) : ''}</Muted>

            {sets.map((set, i) => (
              <View key={i} style={s.setRiga}>
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
              </View>
            ))}

            <Muted style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>Hai vinto?</Muted>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl }}>
              <Pressable onPress={() => setVincitoreIo(true)} style={[s.sceltaBtn, vincitoreIo === true && s.sceltaBtnAttiva]}>
                <Text style={[s.sceltaTesto, vincitoreIo === true && s.sceltaTestoAttivo]}>Sì</Text>
              </Pressable>
              <Pressable onPress={() => setVincitoreIo(false)} style={[s.sceltaBtn, vincitoreIo === false && s.sceltaBtnAttiva]}>
                <Text style={[s.sceltaTesto, vincitoreIo === false && s.sceltaTestoAttivo]}>No</Text>
              </Pressable>
            </View>

            <Button title="Salva risultato" onPress={salvaRisultato} loading={salvando} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.md, marginTop: Spacing.md },
    scheda: {},
    schedaHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    schedaTitolo: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '800' },
    schedaRiga: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
    schedaFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    badge: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill },
    badgeTesto: { fontWeight: '800', fontSize: Font.tiny },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, borderRadius: Radius.modal, padding: Spacing.xl, overflow: 'hidden', borderWidth: 1, borderColor: glass.strongBorder },
    modaleTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    setRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    setInput: {
      width: 44, height: 38, borderRadius: Radius.control, borderWidth: 1, borderColor: glass.regularBorder,
      backgroundColor: glass.regularBg, textAlign: 'center', color: colors.navyDeep, fontSize: Font.body, fontWeight: '700',
    },
    sceltaBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.control, backgroundColor: colors.navyCard, alignItems: 'center' },
    sceltaBtnAttiva: { backgroundColor: colors.gold },
    sceltaTesto: { color: colors.slateLight, fontWeight: '700' },
    sceltaTestoAttivo: { color: colors.navyDeep, fontWeight: '800' },
  });
}
