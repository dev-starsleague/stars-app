import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getRanking, inviaRichiestaAmicizia } from '../../lib/api';
import { Card, H2, Muted, Avatar, Button, Divider, IconButton, Pill } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Font, AppColors } from '../../constants/theme';
import type { Giocatore } from '../../types/models';

export default function GiocatoreProfilo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, demoMode } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [g, setG] = useState<Giocatore | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    getRanking().then((rows) => {
      const found = rows.find((r) => r.giocatore_id === id);
      if (found?.giocatore) setG(found.giocatore as Giocatore);
      if (found) setRank(found.ranking);
    });
  }, [id]);

  const nome = g ? `${g.nome} ${g.cognome}` : 'Giocatore';

  const aggiungi = async () => {
    if (!me || !id) return;
    await inviaRichiestaAmicizia(me.id, id);
    Alert.alert('Richiesta inviata', `Richiesta inviata a ${g?.nome ?? 'giocatore'}.${demoMode ? '\n\n(demo)' : ''}`);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>Profilo</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Avatar name={nome} size={90} gold />
          <Text style={s.nome}>{nome}</Text>
          {g?.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
        </View>

        <View style={s.stats}>
          <Card style={s.stat}><Text style={s.statValue}>{rank ? rank.toFixed(2) : '—'}</Text><Muted>Ranking</Muted></Card>
          <Card style={s.stat}><Text style={s.statValue}>{g?.posizione ? cap(g.posizione) : '—'}</Text><Muted>Posizione</Muted></Card>
        </View>

        <Card style={{ marginTop: Spacing.lg }}>
          <H2 style={{ marginBottom: Spacing.md }}>Dettagli</H2>
          <Row label="Mano dominante" value={cap(g?.mano_dominante)} />
          <Divider />
          <Row label="Sport preferiti" value={(g?.sport_preferiti ?? []).join(', ') || 'Padel'} />
          <Divider />
          <Row label="Genere" value={g?.genere === 'F' ? 'Femminile' : g?.genere === 'M' ? 'Maschile' : '—'} />
        </Card>

        {id !== me?.id && (
          <Button title="Aggiungi agli amici" onPress={aggiungi} style={{ marginTop: Spacing.xl }} />
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.row}><Muted>{label}</Muted><Text style={s.rowValue}>{value}</Text></View>;
}
function cap(v?: string | null) { return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—'; }

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    header: { alignItems: 'center', gap: 6, marginTop: Spacing.md },
    nome: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '800', marginTop: Spacing.sm },
    stats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { color: colors.gold, fontSize: Font.h2, fontWeight: '900' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowValue: { color: colors.navyDeep, fontWeight: '600', fontSize: Font.body },
  });
}
