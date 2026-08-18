import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getRanking } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Muted } from '../../components/ui';
import { fasciaDaScore, COLORE_FASCIA, FASCE_ORDINATE } from '../../lib/stars';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { Fascia } from '../../types/models';

const CENTRI = ['Versilia', 'Lucca', 'Massa', 'Pisa'];

export default function Classifiche() {
  const { me } = useAuth();
  const [tab, setTab] = useState<'ranking' | 'ranqueen'>('ranking');
  const [fascia, setFascia] = useState<Fascia | 'tutte'>('tutte');
  const [centro, setCentro] = useState<string | null>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await getRanking();
    setLista(r);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // genere in base a tab (RanKing = M, RanQueen = F)
  const genere = tab === 'ranking' ? 'M' : 'F';
  let filtrata = lista.filter((r) => (r.giocatore?.genere ?? 'M') === genere);
  if (fascia !== 'tutte') filtrata = filtrata.filter((r) => fasciaDaScore(r.ranking) === fascia);

  // Il "me" in prova compare in cima come primo (Spark, 0.00) se demo
  const io = me ? { id: 'me', ranking: me.profilo?.ranking ?? 0, giocatore: me, isMe: true } : null;

  const primo = filtrata[0];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>

        {/* Card filtri bianca */}
        <View style={s.filterCard}>
          <View style={s.toggle}>
            <Pressable style={[s.toggleBtn, tab === 'ranking' && s.toggleActive]} onPress={() => setTab('ranking')}>
              <Text style={[s.toggleText, tab === 'ranking' && s.toggleTextActive]}>🏆 RanKing</Text>
            </Pressable>
            <Pressable style={[s.toggleBtn, tab === 'ranqueen' && s.toggleActive]} onPress={() => setTab('ranqueen')}>
              <Text style={[s.toggleText, tab === 'ranqueen' && s.toggleTextActive]}>👑 RanQueen</Text>
            </Pressable>
          </View>

          <Text style={s.filterLabel}>Fascia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {FASCE_ORDINATE.map((f) => (
                <Pressable key={f} onPress={() => setFascia(fascia === f ? 'tutte' : f)}
                  style={[s.fasciaChip, fascia === f && s.fasciaChipActive]}>
                  <View style={[s.fasciaDot, { backgroundColor: COLORE_FASCIA[f] }]} />
                  <Text style={s.fasciaText}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={s.filterLabel}>Centri</Text>
          <View style={s.chipRow}>
            {CENTRI.map((c) => (
              <Pressable key={c} onPress={() => setCentro(centro === c ? null : c)}
                style={[s.centroChip, centro === c && s.centroChipActive]}>
                <Text style={[s.centroText, centro === c && s.centroTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Primo classificato in evidenza (o "me" in prova) */}
        <View style={s.heroWrap}>
          <Text style={s.medalTop}>🥇</Text>
          <View style={s.heroAvatar}>
            <Text style={s.heroAvatarText}>{(io?.giocatore?.nome?.[0] ?? primo?.giocatore?.nome?.[0] ?? 'P').toUpperCase()}</Text>
          </View>
          <Text style={s.heroName}>
            {io ? `${io.giocatore.nome} ${io.giocatore.cognome}` : primo ? `${primo.giocatore?.nome} ${primo.giocatore?.cognome}` : '—'}
          </Text>
          <Text style={s.heroScore}>{(io?.ranking ?? primo?.ranking ?? 0).toFixed(2)}</Text>
          <Text style={s.heroFascia}>{fasciaDaScore(io?.ranking ?? primo?.ranking ?? 0, (io?.ranking ?? 0) > 0)}</Text>
          <View style={s.pedestal}><Text style={s.pedestalNum}>1</Text></View>
        </View>

        {/* Resto classifica */}
        {filtrata.slice(io ? 0 : 1).map((r, i) => (
          <View key={r.id} style={s.row}>
            <Text style={s.rowPos}>{i + 2}</Text>
            <View style={s.rowAvatar}><Text style={s.rowAvatarText}>{(r.giocatore?.nome?.[0] ?? '?').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{r.giocatore?.nome} {r.giocatore?.cognome}</Text>
              <View style={s.rowFasciaWrap}>
                <View style={[s.fasciaDot, { backgroundColor: COLORE_FASCIA[fasciaDaScore(r.ranking)] }]} />
                <Muted>{fasciaDaScore(r.ranking)}</Muted>
              </View>
            </View>
            <Text style={s.rowScore}>{r.ranking.toFixed(2)}</Text>
          </View>
        ))}
        {filtrata.length === 0 && <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun giocatore in questa fascia.</Muted>}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  filterCard: { backgroundColor: '#F7F8FA', borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.xl },
  toggle: { flexDirection: 'row', backgroundColor: '#E8EBEF', borderRadius: Radius.pill, padding: 4, marginBottom: Spacing.md },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.gold },
  toggleText: { color: Colors.slate, fontWeight: '800', fontSize: Font.body },
  toggleTextActive: { color: Colors.navyDeep },
  filterLabel: { color: Colors.slate, fontSize: Font.small, fontWeight: '800', marginTop: Spacing.sm, marginBottom: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: 4 },
  fasciaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8EBEF', paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.pill },
  fasciaChipActive: { backgroundColor: Colors.navyDeep },
  fasciaDot: { width: 8, height: 8, borderRadius: 4 },
  fasciaText: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.small },
  centroChip: { backgroundColor: '#E8EBEF', paddingHorizontal: Spacing.lg, paddingVertical: 8, borderRadius: Radius.pill },
  centroChipActive: { backgroundColor: Colors.navyDeep },
  centroText: { color: Colors.slate, fontWeight: '700', fontSize: Font.small },
  centroTextActive: { color: Colors.white },
  heroWrap: { alignItems: 'center', marginBottom: Spacing.xl },
  medalTop: { fontSize: 28 },
  heroAvatar: { width: 84, height: 84, borderRadius: 24, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  heroAvatarText: { color: Colors.navyDeep, fontSize: 34, fontWeight: '900' },
  heroName: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginTop: Spacing.md },
  heroScore: { color: Colors.gold, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.sm },
  heroFascia: { color: Colors.slate, fontSize: Font.small, fontWeight: '700' },
  pedestal: { width: '65%', height: 120, backgroundColor: Colors.gold + '18', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gold + '44', alignItems: 'center', justifyContent: 'flex-start', paddingTop: Spacing.md, marginTop: Spacing.md },
  pedestalNum: { color: Colors.gold + '99', fontSize: 40, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.navyLine + '44' },
  rowPos: { color: Colors.slate, fontWeight: '900', fontSize: Font.body, width: 22, textAlign: 'center' },
  rowAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.navyLine, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: Colors.white, fontWeight: '800' },
  rowName: { color: Colors.white, fontWeight: '700', fontSize: Font.body },
  rowFasciaWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  rowScore: { color: Colors.gold, fontWeight: '900', fontSize: Font.h3 },
});
