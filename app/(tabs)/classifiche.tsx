import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getClassifica } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Card, Muted, Segmented } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { ClassificaMensile, Genere } from '../../types/models';

// "Star del mese": la classifica mensile per punti del gestionale
// (backend.classifica-mensile, vedi lib/api.ts getClassifica) — non va
// confusa con il RanKing/RanQueen (PSL Ranking Engine, un'altra cosa: quello
// misura il livello di gioco, questo premia chi ha giocato/vinto di più nel
// mese corrente).
export default function StarDelMese() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [genere, setGenere] = useState<Genere>('M');
  const [lista, setLista] = useState<ClassificaMensile[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { setLista(await getClassifica(genere)); }, [genere]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const primo = lista[0];
  const resto = lista.slice(1);
  const nomeMese = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>

        {/* Card filtri vetro liquido */}
        <Card style={s.filterCard}>
          <Text style={s.filterLabel}>{cap(nomeMese)}</Text>
          <Segmented
            value={genere}
            onChange={(v) => setGenere(v as Genere)}
            options={[{ value: 'M', label: '🏆 Maschile' }, { value: 'F', label: '👑 Femminile' }]}
          />
        </Card>

        {/* Primo classificato in evidenza */}
        {primo && (
          <View style={s.heroWrap}>
            <Text style={s.medalTop}>🥇</Text>
            <View style={s.heroAvatar}>
              <Text style={s.heroAvatarText}>{(primo.giocatore?.nome?.[0] ?? '?').toUpperCase()}</Text>
            </View>
            <Text style={s.heroName}>{primo.giocatore?.nome} {primo.giocatore?.cognome}</Text>
            <Text style={s.heroScore}>{primo.punti} pt</Text>
            <Text style={s.heroFascia}>{primo.partite} partite · {primo.vittorie} vittorie</Text>
            <View style={s.pedestal}><Text style={s.pedestalNum}>1</Text></View>
          </View>
        )}

        {/* Resto classifica */}
        {resto.map((r, i) => (
          <Card key={r.id} style={s.row}>
            <Text style={s.rowPos}>{i + 2}</Text>
            <View style={s.rowAvatar}><Text style={s.rowAvatarText}>{(r.giocatore?.nome?.[0] ?? '?').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{r.giocatore?.nome} {r.giocatore?.cognome}</Text>
              <Muted>{r.partite} partite · {r.vittorie} vittorie</Muted>
            </View>
            <Text style={s.rowScore}>{r.punti} pt</Text>
          </Card>
        ))}
        {lista.length === 0 && <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun punteggio questo mese.</Muted>}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function cap(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    filterCard: { marginBottom: Spacing.xl },
    filterLabel: { color: colors.slate, fontSize: Font.small, fontWeight: '800', marginBottom: Spacing.sm },
    heroWrap: { alignItems: 'center', marginBottom: Spacing.xl },
    medalTop: { fontSize: 28 },
    heroAvatar: { width: 84, height: 84, borderRadius: 24, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    heroAvatarText: { color: colors.navyDeep, fontSize: 34, fontWeight: '900' },
    heroName: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginTop: Spacing.md },
    heroScore: { color: colors.gold, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.sm },
    heroFascia: { color: colors.slate, fontSize: Font.small, fontWeight: '700' },
    pedestal: { width: '65%', height: 120, backgroundColor: colors.gold + '18', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderWidth: 1, borderColor: colors.gold + '44', alignItems: 'center', justifyContent: 'flex-start', paddingTop: Spacing.md, marginTop: Spacing.md },
    pedestalNum: { color: colors.gold + '99', fontSize: 40, fontWeight: '900' },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    rowPos: { color: colors.slate, fontWeight: '900', fontSize: Font.body, width: 22, textAlign: 'center' },
    rowAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.navyLine, alignItems: 'center', justifyContent: 'center' },
    rowAvatarText: { color: colors.white, fontWeight: '800' },
    rowName: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body },
    rowScore: { color: colors.gold, fontWeight: '900', fontSize: Font.h3 },
  });
}
