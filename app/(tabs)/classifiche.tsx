import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../lib/auth';
import { getClassifica, getRanking } from '../../lib/api';
import { Card, H1, Muted, Avatar, RankBadge, Chip } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { ClassificaMensile } from '../../types/models';

type Vista = 'mensile' | 'ranking';

export default function Classifiche() {
  const { me } = useAuth();
  const [vista, setVista] = useState<Vista>('mensile');
  const [genere, setGenere] = useState<'M' | 'F'>('M');
  const [classifica, setClassifica] = useState<ClassificaMensile[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([getClassifica(genere), getRanking()]);
    setClassifica(c); setRanking(r);
  }, [genere]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const mese = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const lista = vista === 'mensile'
    ? classifica.map((c) => ({ id: c.id, nome: `${c.giocatore?.nome ?? ''} ${c.giocatore?.cognome ?? ''}`, nick: c.giocatore?.profilo?.nickname, valore: c.punti, extra: `${c.vittorie}V · ${c.partite}P`, isValueRank: false, gid: c.giocatore_id }))
    : ranking.map((r) => ({ id: r.id, nome: `${r.giocatore?.nome ?? ''} ${r.giocatore?.cognome ?? ''}`, nick: r.giocatore?.profilo?.nickname, valore: r.ranking, extra: r.stato === 'attivo' ? 'Confermato' : 'In verifica', isValueRank: true, gid: r.giocatore_id }));

  const podio = lista.slice(0, 3);
  const resto = lista.slice(3);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
        <H1>Classifiche</H1>
        <View style={s.toggle}>
          <Chip label="Classifica mensile" active={vista === 'mensile'} onPress={() => setVista('mensile')} />
          <Chip label="Ranking" active={vista === 'ranking'} onPress={() => setVista('ranking')} />
        </View>

        {vista === 'mensile' ? (
          <View style={s.subRow}>
            <Muted style={{ textTransform: 'capitalize' }}>{mese}</Muted>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Chip label="Maschile" active={genere === 'M'} onPress={() => setGenere('M')} />
              <Chip label="Femminile" active={genere === 'F'} onPress={() => setGenere('F')} />
            </View>
          </View>
        ) : (
          <Muted style={{ marginBottom: Spacing.md }}>Ranking Padel · tutti i giocatori</Muted>
        )}

        {/* Podio */}
        {podio.length === 3 && (
          <View style={s.podio}>
            <Podio pos={2} item={podio[1]} />
            <Podio pos={1} item={podio[0]} big />
            <Podio pos={3} item={podio[2]} />
          </View>
        )}

        {/* Resto */}
        <Card style={{ gap: Spacing.sm }}>
          {resto.map((item, i) => {
            const mine = item.gid === me?.id;
            return (
              <View key={item.id} style={[s.row, mine && s.rowMine]}>
                <Text style={s.pos}>{i + 4}</Text>
                <Avatar name={item.nome} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={s.nome}>{item.nome}{mine ? ' (tu)' : ''}</Text>
                  <Muted>{item.nick ?? item.extra}</Muted>
                </View>
                {item.isValueRank
                  ? <RankBadge value={item.valore} size={40} />
                  : <Text style={s.punti}>{item.valore}<Text style={s.puntiLabel}> pt</Text></Text>}
              </View>
            );
          })}
          {resto.length === 0 && <Muted style={{ textAlign: 'center', padding: Spacing.lg }}>Nessun dato disponibile.</Muted>}
        </Card>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Podio({ pos, item, big }: { pos: number; item: any; big?: boolean }) {
  const medalColor = pos === 1 ? Colors.gold : pos === 2 ? '#C0C7D0' : '#CD7F32';
  return (
    <View style={[s.podioItem, big && { marginBottom: 0 }]}>
      <View style={[s.podioAvatar, big && s.podioAvatarBig, { borderColor: medalColor }]}>
        <Avatar name={item?.nome ?? '?'} size={big ? 64 : 52} />
        <View style={[s.medal, { backgroundColor: medalColor }]}><Text style={s.medalText}>{pos}</Text></View>
      </View>
      <Text style={s.podioNome} numberOfLines={1}>{(item?.nome ?? '').split(' ')[0]}</Text>
      <Text style={[s.podioVal, { color: medalColor }]}>
        {item?.isValueRank ? item.valore.toFixed(2) : `${item?.valore} pt`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  toggle: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.lg },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  podio: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: Spacing.md, marginBottom: Spacing.xl, paddingHorizontal: Spacing.sm },
  podioItem: { alignItems: 'center', flex: 1, marginBottom: 12 },
  podioAvatar: { borderWidth: 3, borderRadius: 40, padding: 3, position: 'relative' },
  podioAvatarBig: { padding: 4 },
  medal: { position: 'absolute', bottom: -6, alignSelf: 'center', left: 0, right: 0, marginHorizontal: 'auto', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bg },
  medalText: { color: Colors.navyDeep, fontWeight: '900', fontSize: Font.tiny },
  podioNome: { color: Colors.white, fontWeight: '700', fontSize: Font.small, marginTop: 12 },
  podioVal: { fontWeight: '800', fontSize: Font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
  rowMine: { backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '44' },
  pos: { color: Colors.slate, fontSize: Font.body, fontWeight: '800', width: 24, textAlign: 'center' },
  nome: { color: Colors.white, fontSize: Font.body, fontWeight: '600' },
  punti: { color: Colors.gold, fontSize: Font.h3, fontWeight: '800' },
  puntiLabel: { color: Colors.slate, fontSize: Font.small, fontWeight: '600' },
});
