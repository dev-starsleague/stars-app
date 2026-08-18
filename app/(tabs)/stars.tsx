import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getCircuito, getClassificaNazionale, getStars } from '../../lib/api';
import { Muted } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { CircuitoNazionale, RigaClassificaNazionale, StarsProfilo } from '../../types/models';

export default function Stars() {
  const { me } = useAuth();
  const [circ, setCirc] = useState<CircuitoNazionale | null>(null);
  const [classifica, setClassifica] = useState<RigaClassificaNazionale[]>([]);
  const [stars, setStars] = useState<StarsProfilo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [c, cl, st] = await Promise.all([
      getCircuito(), getClassificaNazionale(), me ? getStars(me.id) : Promise.resolve(null),
    ]);
    setCirc(c); setClassifica(cl); setStars(st);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>

        <View style={s.brandRow}>
          <Ionicons name="star" size={16} color={Colors.gold} />
          <Text style={s.brandText}>Stars League</Text>
        </View>
        <Text style={s.title}>Stars Circuit</Text>
        <Muted style={{ marginBottom: Spacing.lg }}>Il circuito nazionale PSL — classifica unificata tra tutti i centri affiliati</Muted>

        {/* Card stagione */}
        {circ && (
          <View style={s.seasonCard}>
            <Text style={s.seasonLabel}>STAGIONE {circ.stagione}</Text>
            <View style={s.seasonHead}>
              <Text style={s.seasonName}>{circ.nome}</Text>
              <View style={s.trophy}><Ionicons name="trophy" size={22} color={Colors.gold} /></View>
            </View>
            <Muted style={{ marginTop: 4 }}>{circ.centri} centri · {circ.giocatori.toLocaleString('it-IT')} giocatori</Muted>
            <View style={s.progressRow}>
              <Muted>Progresso stagione</Muted>
              <Text style={s.progressPct}>{circ.progresso}%</Text>
            </View>
            <View style={s.progressBg}><View style={[s.progressFill, { width: `${circ.progresso}%` }]} /></View>
          </View>
        )}

        {/* Stat personali */}
        <View style={s.stats}>
          <StatCard icon="globe-outline" value={stars?.posizione_nazionale ? `#${stars.posizione_nazionale}` : '—'} label="Pos. naz." />
          <StatCard icon="star-outline" value={stars ? String(stars.punti_circuito) : '0'} label="Punti" />
          <StatCard icon="trending-up" value={stars ? (stars.trend > 0 ? `+${stars.trend}` : String(stars.trend)) : '0'} label="Trend" trend />
        </View>

        {/* Classifica nazionale */}
        <Text style={s.sectionTitle}>Classifica nazionale</Text>
        <View style={s.listCard}>
          {classifica.map((r, i) => (
            <View key={r.giocatore_id} style={[s.row, i < classifica.length - 1 && s.rowBorder]}>
              <View style={s.posWrap}>
                {r.posizione <= 3
                  ? <Text style={s.medal}>{['🥇', '🥈', '🥉'][r.posizione - 1]}</Text>
                  : <Text style={s.posNum}>{r.posizione}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nome}>{r.nome}</Text>
                <Text style={s.centro}>{r.centro}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.punti}>{r.punti.toLocaleString('it-IT')}</Text>
                <Text style={[s.trend, { color: r.trend > 0 ? Colors.green : r.trend < 0 ? Colors.red : Colors.slate }]}>
                  {r.trend > 0 ? `+${r.trend}` : r.trend < 0 ? r.trend : '—'}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label, trend }: { icon: any; value: string; label: string; trend?: boolean }) {
  return (
    <View style={s.statCard}>
      <Ionicons name={icon} size={20} color={trend ? Colors.green : Colors.gold} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  brandText: { color: Colors.slate, fontSize: Font.small, fontWeight: '700' },
  title: { color: Colors.white, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  seasonCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.gold + '55' },
  seasonLabel: { color: Colors.gold, fontSize: Font.small, fontWeight: '800', letterSpacing: 1 },
  seasonHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  seasonName: { color: Colors.navyDeep, fontSize: Font.h1, fontWeight: '900' },
  trophy: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.lg, marginBottom: 6 },
  progressPct: { color: Colors.navyDeep, fontWeight: '800' },
  progressBg: { height: 8, borderRadius: 4, backgroundColor: Colors.cloud, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: 4 },
  stats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4 },
  statValue: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '900' },
  statLabel: { color: Colors.slate, fontSize: Font.small },
  sectionTitle: { color: Colors.white, fontSize: Font.h2, fontWeight: '800', marginTop: Spacing.xl, marginBottom: Spacing.md },
  listCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.cloud },
  posWrap: { width: 28, alignItems: 'center' },
  medal: { fontSize: 20 },
  posNum: { color: Colors.slate, fontWeight: '800', fontSize: Font.body },
  nome: { color: Colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
  centro: { color: Colors.slate, fontSize: Font.small },
  punti: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '900' },
  trend: { fontSize: Font.small, fontWeight: '700' },
});
