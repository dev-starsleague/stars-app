import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { getStars, getPartiteGiocatore, getEventiIscritti } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { HomeCarousel } from '../../components/HomeCarousel';
import { Card, Muted } from '../../components/ui';
import { getGreeting, oggiISO } from '../../lib/saluto';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { StarsProfilo, Prenotazione, EventoCustom } from '../../types/models';

const GIORNI_SETT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoGiorno(anno: number, mese: number, giorno: number) { return `${anno}-${pad(mese + 1)}-${pad(giorno)}`; }

export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [stars, setStars] = useState<StarsProfilo | null>(null);
  const [partite, setPartite] = useState<Prenotazione[]>([]);
  const [eventiIscritti, setEventiIscritti] = useState<EventoCustom[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Partite da qui ai prossimi 7 giorni (oggi escluso, come da spec) ed
  // evento a cui si è iscritti in data odierna — i due impegni reali che
  // guidano il saluto adattivo (vedi lib/saluto.ts).
  const partiteSettimana = useMemo(() => {
    const oggi = oggiISO();
    const fine = new Date(); fine.setDate(fine.getDate() + 7);
    const fineISO = `${fine.getFullYear()}-${pad(fine.getMonth() + 1)}-${pad(fine.getDate())}`;
    return partite.filter((p) => p.data && p.data > oggi && p.data <= fineISO).length;
  }, [partite]);
  const haEventoOggi = useMemo(() => {
    const oggi = oggiISO();
    return eventiIscritti.some((e) => e.data_evento === oggi);
  }, [eventiIscritti]);
  const saluto = useMemo(
    () => getGreeting(me?.nome ?? 'Giocatore', me?.profilo?.nickname ?? '', partiteSettimana, haEventoOggi),
    [me?.id, me?.nome, me?.profilo?.nickname, partiteSettimana, haEventoOggi]
  );

  const load = useCallback(async () => {
    const [st, pt, ev] = await Promise.all([
      me ? getStars(me.id) : Promise.resolve(null),
      me ? getPartiteGiocatore(me.id) : Promise.resolve([]),
      me ? getEventiIscritti(me.id) : Promise.resolve([]),
    ]);
    setStars(st); setPartite(pt); setEventiIscritti(ev);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Tap su un giorno del calendario: apre il dettaglio del giorno (impegni,
  // eventi disponibili, prenota), non più dritto su Prenota — fix utente
  // esplicito, vedi app/giorno/[data].tsx.
  const apriGiorno = (dataISO: string) => router.push(`/giorno/${dataISO}`);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>

        <Text style={s.tip}>{saluto}</Text>

        {/* Carosello: ranking + widget personalizzabili, poi ADV di eventi
            e prodotti sponsorizzati dai centri (fix utente esplicito) */}
        <HomeCarousel />

        {/* Calendario mese */}
        <CalendarWidget partite={partite} eventi={eventiIscritti} onPick={apriGiorno} />

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

type TipoImpegno = 'partita' | 'lezione' | 'evento';

function CalendarWidget({ partite, eventi, onPick }: { partite: Prenotazione[]; eventi: EventoCustom[]; onPick: (dataISO: string) => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const oggiReale = new Date();
  const [meseAttivo, setMeseAttivo] = useState(() => new Date(oggiReale.getFullYear(), oggiReale.getMonth(), 1));

  const cambiaMese = (delta: number) => setMeseAttivo((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Swipe orizzontale sul calendario, in aggiunta alle frecce — nessuna
  // libreria di gesture in più: PanResponder di RN basta per un solo swipe.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_evt, g) => {
        if (g.dx <= -40) cambiaMese(1);
        else if (g.dx >= 40) cambiaMese(-1);
      },
    })
  ).current;

  const anno = meseAttivo.getFullYear(); const mese = meseAttivo.getMonth();
  const meseIso = `${anno}-${pad(mese + 1)}`;
  const primo = new Date(anno, mese, 1);
  const giorniMese = new Date(anno, mese + 1, 0).getDate();
  const offset = (primo.getDay() + 6) % 7; // lun=0
  const meseCorrenteReale = anno === oggiReale.getFullYear() && mese === oggiReale.getMonth();
  const oggi = meseCorrenteReale ? oggiReale.getDate() : -1;
  const celle: (number | null)[] = [];
  for (let i = 0; i < offset; i++) celle.push(null);
  for (let d = 1; d <= giorniMese; d++) celle.push(d);
  const nomeMese = MESI[mese];

  // Impegni del mese mostrato: tipo di pallino per giorno (un pallino per
  // TIPO presente, non uno per elemento — più leggibile in una cella 38px —
  // e la lista sotto ("mostra tutti i miei impegni") con il dettaglio.
  const impegniPerGiorno = useMemo(() => {
    const map = new Map<number, Set<TipoImpegno>>();
    const aggiungi = (giorno: number, tipo: TipoImpegno) => {
      if (!map.has(giorno)) map.set(giorno, new Set());
      map.get(giorno)!.add(tipo);
    };
    for (const p of partite) {
      if (!p.data?.startsWith(meseIso)) continue;
      aggiungi(Number(p.data.slice(8, 10)), p.tipo === 'lezione' ? 'lezione' : 'partita');
    }
    for (const e of eventi) {
      if (!e.data_evento?.startsWith(meseIso)) continue;
      aggiungi(Number(e.data_evento.slice(8, 10)), 'evento');
    }
    return map;
  }, [partite, eventi, meseIso]);

  // Non limitato al mese mostrato (a differenza dei pallini in griglia):
  // "I miei impegni" mostra anche i passati da saldare/con risultato
  // mancante, che potrebbero stare in un mese diverso da quello aperto qui
  // — il link deve comparire comunque, altrimenti resterebbero irraggiungibili.
  const haImpegni = partite.length > 0 || eventi.length > 0;

  const coloreTipo = (t: TipoImpegno) => t === 'partita' ? colors.green : t === 'lezione' ? colors.amber : colors.viola;
  return (
    <Card style={s.calCard}>
      <View style={s.calHead}>
        <Text style={s.calTitle}>{nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)} {anno}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={() => cambiaMese(-1)} hitSlop={8} style={s.calNavBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.slate} />
          </Pressable>
          <Pressable onPress={() => cambiaMese(1)} hitSlop={8} style={s.calNavBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.slate} />
          </Pressable>
        </View>
      </View>
      <View style={s.calWeek}>
        {GIORNI_SETT.map((g, i) => <Text key={i} style={s.calDow}>{g}</Text>)}
      </View>
      <View style={s.calGrid} {...panResponder.panHandlers}>
        {celle.map((d, i) => {
          const tipi = d ? impegniPerGiorno.get(d) : undefined;
          return (
            <Pressable key={i} style={s.calCell} onPress={d ? () => onPick(isoGiorno(anno, mese, d)) : undefined} disabled={!d}>
              {d ? (
                <View style={s.calCellInner}>
                  <View style={[s.calDay, d === oggi && s.calToday]}>
                    <Text style={[s.calDayText, d === oggi && s.calTodayText]}>{d}</Text>
                  </View>
                  <View style={s.calDotsRow}>
                    {tipi && (['partita', 'lezione', 'evento'] as TipoImpegno[]).filter((t) => tipi.has(t)).map((t) => (
                      <View key={t} style={[s.calDotImpegno, { backgroundColor: coloreTipo(t) }]} />
                    ))}
                  </View>
                </View>
              ) : <View style={s.calDay} />}
            </Pressable>
          );
        })}
      </View>

      {haImpegni && (
        <Pressable onPress={() => router.push('/impegni')} style={s.impegniToggle}>
          <Text style={s.impegniToggleText}>Mostra tutti i miei impegni</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
        </Pressable>
      )}
    </Card>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    tip: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '900', marginBottom: Spacing.lg, lineHeight: 34 },
    calCard: { marginBottom: Spacing.md },
    calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    calTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    calNavBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    calWeek: { flexDirection: 'row' },
    calDow: { flex: 1, textAlign: 'center', color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 6 },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    calCellInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
    calDay: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    calToday: { backgroundColor: colors.navy },
    calDayText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    calTodayText: { color: colors.gold, fontWeight: '900' },
    calDotsRow: { flexDirection: 'row', gap: 3, height: 5 },
    calDotImpegno: { width: 5, height: 5, borderRadius: 3 },
    impegniToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.navyLine + '22' },
    impegniToggleText: { color: colors.gold, fontWeight: '700', fontSize: Font.small },
  });
}
