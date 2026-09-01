import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { getStars, getTessera, getMiePrenotazioni } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Card, Muted } from '../../components/ui';
import { coloreFascia } from '../../lib/stars';
import { Radius, Spacing, Font, CORNER_SMOOTHING, AppColors } from '../../constants/theme';
import type { StarsProfilo, Tessera, Prenotazione } from '../../types/models';

const GIORNI_SETT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [stars, setStars] = useState<StarsProfilo | null>(null);
  const [tessera, setTessera] = useState<Tessera | null>(null);
  const [pren, setPren] = useState<Prenotazione[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [st, te, pr] = await Promise.all([
      me ? getStars(me.id) : Promise.resolve(null),
      getTessera(),
      me ? getMiePrenotazioni(me.id) : Promise.resolve([]),
    ]);
    setStars(st); setTessera(te); setPren(pr);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>

        <Text style={s.tip}>Prova, il campo si scalda nel pomeriggio ☀️</Text>

        {/* Tessera Digitale */}
        <Pressable onPress={() => router.push('/(tabs)/profilo')}>
          <Card>
            <Text style={s.tesseraLabel}>TESSERA</Text>
            <Text style={s.tesseraTitle}>Tessera Digitale</Text>
            <Muted style={{ color: colors.slateLight }}>
              {tessera?.stato === 'da_rinnovare' ? 'Rinnova la tessera con firma OTP' : 'Gestisci la tua tessera'}
            </Muted>
            <View style={s.dots}>
              {[0, 1, 2, 3].map((i) => <View key={i} style={[s.dot, i === 3 && s.dotActive]} />)}
            </View>
          </Card>
        </Pressable>

        {/* Due card: Friendly / Competitivo */}
        <View style={s.pairRow}>
          <Card style={s.miniCard}>
            <View style={s.miniHead}>
              <Text style={s.miniLabelWhite}>FRIENDLY</Text>
              <Ionicons name="trending-up" size={16} color={colors.slate} />
            </View>
            <Text style={s.miniSub}>NAZIONALE</Text>
            <Text style={s.miniBig}>#{stars?.posizione_nazionale ?? 1}</Text>
            <View style={s.miniDivider} />
            <Text style={[s.miniFascia, { color: coloreFascia(stars?.fascia ?? 'Spark', colors) }]}>{stars?.fascia ?? 'Spark'}</Text>
            <Muted>-1.00 cat. sup.</Muted>
          </Card>

          <Card style={s.miniCard}>
            <View style={s.miniHead}>
              <Text style={s.miniLabelGold}>COMPETITIVO</Text>
              <Ionicons name="trending-up" size={16} color={colors.gold} />
            </View>
            <Text style={s.miniSub}>STAGIONE</Text>
            <Text style={s.miniBigGold}>2026/2027</Text>
            <View style={s.miniDivider} />
            <Muted>In arrivo</Muted>
            <Muted>Nuovo ranking PSL</Muted>
          </Card>
        </View>

        {/* Calendario mese */}
        <CalendarWidget prenotazioni={pren} onPick={() => router.push('/(tabs)/prenota')} />

        {/* I miei eventi */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>I miei eventi</Text>
          <Pressable onPress={() => router.push('/(tabs)/eventi')}>
            <Text style={s.vedi}>vedi →</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/prenota')}>
          <Card style={s.ctaCard}>
            <View style={s.ctaIcon}>
              <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: colors.gold }} />
              <Ionicons name="add" size={22} color={colors.navyDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>Prenota un campo</Text>
              <Muted>Trova uno slot libero nei centri PSL</Muted>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.slate} />
          </Card>
        </Pressable>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarWidget({ prenotazioni, onPick }: { prenotazioni: Prenotazione[]; onPick: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const now = new Date();
  const anno = now.getFullYear(); const mese = now.getMonth();
  const primo = new Date(anno, mese, 1);
  const giorniMese = new Date(anno, mese + 1, 0).getDate();
  const offset = (primo.getDay() + 6) % 7; // lun=0
  const oggi = now.getDate();
  const conPren = new Set(prenotazioni.map((p) => p.data ? new Date(p.data).getDate() : -1));
  const celle: (number | null)[] = [];
  for (let i = 0; i < offset; i++) celle.push(null);
  for (let d = 1; d <= giorniMese; d++) celle.push(d);
  const nomeMese = now.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <Card style={s.calCard}>
      <View style={s.calHead}>
        <Text style={s.calTitle}>{nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Ionicons name="chevron-back" size={18} color={colors.slate} />
          <Ionicons name="chevron-forward" size={18} color={colors.slate} />
        </View>
      </View>
      <View style={s.calWeek}>
        {GIORNI_SETT.map((g, i) => <Text key={i} style={s.calDow}>{g}</Text>)}
      </View>
      <View style={s.calGrid}>
        {celle.map((d, i) => (
          <Pressable key={i} style={s.calCell} onPress={d ? onPick : undefined} disabled={!d}>
            {d ? (
              <View style={[s.calDay, d === oggi && s.calToday]}>
                <Text style={[s.calDayText, d === oggi && s.calTodayText]}>{d}</Text>
                {conPren.has(d) && <View style={s.calDotPren} />}
              </View>
            ) : <View style={s.calDay} />}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    tip: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '900', marginBottom: Spacing.lg, lineHeight: 34 },
    tesseraLabel: { color: colors.gold, fontSize: Font.small, fontWeight: '800', letterSpacing: 1 },
    tesseraTitle: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '900', marginVertical: 6 },
    dots: { flexDirection: 'row', gap: 6, marginTop: Spacing.lg, alignSelf: 'flex-end' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.slate + '66' },
    dotActive: { width: 22, backgroundColor: colors.gold },
    pairRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
    miniCard: { flex: 1 },
    miniHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    miniLabelWhite: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '800', letterSpacing: 0.5 },
    miniLabelGold: { color: colors.gold, fontSize: Font.small, fontWeight: '800', letterSpacing: 0.5 },
    miniSub: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', marginTop: Spacing.md, letterSpacing: 0.5 },
    miniBig: { color: colors.navyDeep, fontSize: 30, fontWeight: '900', marginTop: 2 },
    miniBigGold: { color: colors.gold, fontSize: 24, fontWeight: '900', marginTop: 2 },
    miniDivider: { height: 1, backgroundColor: colors.navyLine + '55', marginVertical: Spacing.sm },
    miniFascia: { fontSize: Font.body, fontWeight: '800' },
    calCard: { marginTop: Spacing.md },
    calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    calTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    calWeek: { flexDirection: 'row' },
    calDow: { flex: 1, textAlign: 'center', color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 6 },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    calDay: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    calToday: { backgroundColor: colors.navy },
    calDayText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    calTodayText: { color: colors.gold, fontWeight: '900' },
    calDotPren: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold, marginTop: 2 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.md },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    vedi: { color: colors.gold, fontWeight: '700', fontSize: Font.small },
    ctaCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    ctaIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    ctaTitle: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
  });
}
