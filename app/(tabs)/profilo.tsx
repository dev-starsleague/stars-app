import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getMiePrenotazioni, getAmici, annullaPrenotazione } from '../../lib/api';
import { Card, H2, Muted, Avatar, Button, Divider, Pill } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { Prenotazione, Amicizia } from '../../types/models';

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

export default function Profilo() {
  const { me, signOut, demoMode } = useAuth();
  const router = useRouter();
  const [pren, setPren] = useState<Prenotazione[]>([]);
  const [amici, setAmici] = useState<Amicizia[]>([]);

  const load = useCallback(async () => {
    if (!me) return;
    const [p, a] = await Promise.all([getMiePrenotazioni(me.id), getAmici(me.id)]);
    setPren(p); setAmici(a.filter((x) => x.stato === 'accettata'));
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const annulla = (p: Prenotazione) => {
    Alert.alert('Annullare?', `${p.campo?.nome} · ${p.inizio?.slice(0, 5)}`, [
      { text: 'No', style: 'cancel' },
      { text: 'Annulla prenotazione', style: 'destructive', onPress: async () => { await annullaPrenotazione(p.id); load(); } },
    ]);
  };

  const nomeCompleto = `${me?.nome ?? ''} ${me?.cognome ?? ''}`.trim();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header profilo */}
        <View style={s.header}>
          <Avatar name={nomeCompleto || 'Giocatore'} size={84} gold />
          <Text style={s.nome}>{nomeCompleto || 'Giocatore'}</Text>
          {me?.profilo?.nickname ? <Muted>"{me.profilo.nickname}"</Muted> : null}
          {demoMode && <Pill label="Modalità demo" color={Colors.amber} />}
        </View>

        {/* Stats */}
        <View style={s.stats}>
          <Stat label="Ranking" value={me?.profilo?.ranking ? me.profilo.ranking.toFixed(2) : '—'} />
          <Stat label="Amici" value={String(amici.length)} />
          <Stat label="Coin" value="120" />
        </View>

        {/* Dettagli gioco */}
        <Card style={{ marginTop: Spacing.lg }}>
          <H2 style={{ marginBottom: Spacing.md }}>Il mio gioco</H2>
          <Info label="Posizione" value={cap(me?.posizione)} />
          <Divider />
          <Info label="Mano dominante" value={cap(me?.mano_dominante)} />
          <Divider />
          <Info label="Sport preferiti" value={(me?.sport_preferiti ?? []).join(', ') || 'Padel'} />
          <Divider />
          <Info label="Tessera" value={me?.numero_tessera ?? '—'} />
        </Card>

        {/* Azioni */}
        <View style={s.linkRow}>
          <LinkBtn icon="people" label="Amici" onPress={() => router.push('/amici')} />
          <LinkBtn icon="create" label="Modifica" onPress={() => router.push('/modifica-profilo')} />
        </View>

        {/* Le mie prenotazioni */}
        <H2 style={{ marginTop: Spacing.xl, marginBottom: Spacing.md }}>Le mie prenotazioni</H2>
        {pren.length === 0 ? (
          <Card><Muted>Nessuna prenotazione futura.</Muted></Card>
        ) : (
          pren.map((p) => (
            <Card key={p.id} style={s.prenCard}>
              <View style={s.dateBox}>
                <Text style={s.dateDay}>{p.data ? GIORNI[new Date(p.data).getDay()] : ''}</Text>
                <Text style={s.dateNum}>{p.data ? new Date(p.data).getDate() : ''}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.prenTitle}>{p.campo?.nome ?? 'Campo'}</Text>
                <Muted>{p.inizio?.slice(0, 5)}–{p.fine?.slice(0, 5)} · €{p.prezzo}</Muted>
              </View>
              <Pressable onPress={() => annulla(p)} style={s.trash}>
                <Ionicons name="trash-outline" size={20} color={Colors.red} />
              </Pressable>
            </Card>
          ))
        )}

        <Button title="Esci" variant="ghost" onPress={signOut} style={{ marginTop: Spacing.xl }} />
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.info}>
      <Muted>{label}</Muted>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}
function LinkBtn({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.linkBtn}>
      <Ionicons name={icon} size={20} color={Colors.gold} />
      <Text style={s.linkLabel}>{label}</Text>
    </Pressable>
  );
}
function cap(v?: string | null) { return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—'; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  header: { alignItems: 'center', gap: 6, marginTop: Spacing.md },
  nome: { color: Colors.white, fontSize: Font.h1, fontWeight: '800', marginTop: Spacing.sm },
  stats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  stat: { flex: 1, backgroundColor: Colors.navyCard, borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.navyLine + '55' },
  statValue: { color: Colors.gold, fontSize: Font.h1, fontWeight: '900' },
  info: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoValue: { color: Colors.white, fontWeight: '600', fontSize: Font.body },
  linkRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  linkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: Radius.md, paddingVertical: Spacing.lg, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  linkLabel: { color: Colors.white, fontWeight: '700' },
  prenCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  dateBox: { width: 50, height: 50, borderRadius: Radius.md, backgroundColor: Colors.navyDeep, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: Colors.slate, fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase' },
  dateNum: { color: Colors.gold, fontSize: 20, fontWeight: '900' },
  prenTitle: { color: Colors.white, fontSize: Font.body, fontWeight: '700' },
  trash: { padding: Spacing.sm },
});
