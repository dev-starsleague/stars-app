import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getRanking, getMiePrenotazioni, getEventi } from '../../lib/api';
import { Card, H2, Muted, Avatar, RankBadge, Pill } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { Prenotazione, EventoCustom } from '../../types/models';

export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const [top, setTop] = useState<any[]>([]);
  const [pren, setPren] = useState<Prenotazione[]>([]);
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [r, p, e] = await Promise.all([getRanking(), me ? getMiePrenotazioni(me.id) : Promise.resolve([]), getEventi()]);
    setTop(r.slice(0, 3)); setPren(p); setEventi(e.slice(0, 2));
  }, [me]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const prossima = pren[0];
  const nome = me?.nome ?? 'Giocatore';
  const mioRank = me?.profilo?.ranking;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>

        <View style={s.header}>
          <View>
            <Muted>Ciao,</Muted>
            <Text style={s.hello}>{nome} 👋</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profilo')}>
            <Avatar name={`${me?.nome ?? 'T'} ${me?.cognome ?? 'G'}`} size={48} gold />
          </Pressable>
        </View>

        {/* Card ranking personale */}
        <Card style={s.rankCard}>
          <View style={{ flex: 1 }}>
            <Muted>Il tuo ranking Padel</Muted>
            <Text style={s.rankValue}>{mioRank ? mioRank.toFixed(2) : '—'}</Text>
            <Pill label="In crescita" color={Colors.green} />
          </View>
          <View style={s.coinBox}>
            <Ionicons name="ellipse" size={14} color={Colors.gold} />
            <Text style={s.coinValue}>120 SC</Text>
            <Muted>saldo coin</Muted>
          </View>
        </Card>

        {/* Prossima prenotazione */}
        <H2 style={s.sectionTitle}>Prossima prenotazione</H2>
        {prossima ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <View style={s.dateBox}>
              <Text style={s.dateDay}>{giorno(prossima.data)}</Text>
              <Text style={s.dateNum}>{numero(prossima.data)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.prenTitle}>{prossima.campo?.nome ?? 'Campo'}</Text>
              <Muted>{prossima.inizio?.slice(0, 5)} – {prossima.fine?.slice(0, 5)} · {prossima.campo?.tipo}</Muted>
            </View>
            <Text style={s.prezzo}>€{prossima.prezzo}</Text>
          </Card>
        ) : (
          <Card>
            <Muted>Nessuna prenotazione in programma.</Muted>
            <Pressable onPress={() => router.push('/(tabs)/prenota')} style={s.ctaLink}>
              <Text style={s.ctaLinkText}>Prenota un campo</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.gold} />
            </Pressable>
          </Card>
        )}

        {/* Azioni rapide */}
        <View style={s.actions}>
          <Action icon="calendar" label="Prenota" onPress={() => router.push('/(tabs)/prenota')} />
          <Action icon="trophy" label="Eventi" onPress={() => router.push('/(tabs)/eventi')} />
          <Action icon="podium" label="Classifica" onPress={() => router.push('/(tabs)/classifiche')} />
          <Action icon="people" label="Amici" onPress={() => router.push('/amici')} />
        </View>

        {/* Top ranking */}
        <View style={s.sectionRow}>
          <H2>Top ranking</H2>
          <Pressable onPress={() => router.push('/(tabs)/classifiche')}><Text style={s.vediTutti}>Vedi tutti</Text></Pressable>
        </View>
        <Card style={{ gap: Spacing.md }}>
          {top.map((r, i) => (
            <View key={r.id} style={s.rankRow}>
              <Text style={s.pos}>{i + 1}</Text>
              <Avatar name={`${r.giocatore?.nome ?? ''} ${r.giocatore?.cognome ?? ''}`} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={s.playerName}>{r.giocatore?.nome} {r.giocatore?.cognome}</Text>
                <Muted>{r.giocatore?.profilo?.nickname ?? 'Padel'}</Muted>
              </View>
              <RankBadge value={r.ranking} size={40} />
            </View>
          ))}
        </Card>

        {/* Eventi in evidenza */}
        {eventi.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <H2>Eventi aperti</H2>
              <Pressable onPress={() => router.push('/(tabs)/eventi')}><Text style={s.vediTutti}>Vedi tutti</Text></Pressable>
            </View>
            {eventi.map((e) => (
              <Pressable key={e.id} onPress={() => router.push('/(tabs)/eventi')}>
                <Card style={{ marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                  <View style={s.evIcon}><Ionicons name="trophy" size={22} color={Colors.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.prenTitle}>{e.nome}</Text>
                    <Muted>{e.iscritti_count}/{e.max_partecipanti ?? '∞'} iscritti · {divisione(e.divisione)}</Muted>
                  </View>
                  <Pill label={e.stato === 'in_corso' ? 'In corso' : 'Aperto'} color={e.stato === 'in_corso' ? Colors.amber : Colors.green} />
                </Card>
              </Pressable>
            ))}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.action}>
      <View style={s.actionIcon}><Ionicons name={icon} size={22} color={Colors.gold} /></View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
function giorno(d: string | null) { return d ? GIORNI[new Date(d).getDay()] : ''; }
function numero(d: string | null) { return d ? new Date(d).getDate().toString() : ''; }
function divisione(d: string) { return d === 'misto' ? 'Misto' : d === 'maschile' ? 'Maschile' : 'Femminile'; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  hello: { color: Colors.white, fontSize: Font.h1, fontWeight: '800' },
  rankCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navy },
  rankValue: { color: Colors.gold, fontSize: 40, fontWeight: '900', marginVertical: 4 },
  coinBox: { alignItems: 'flex-end', gap: 2 },
  coinValue: { color: Colors.white, fontSize: Font.h3, fontWeight: '800' },
  sectionTitle: { marginTop: Spacing.xl, marginBottom: Spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.md },
  vediTutti: { color: Colors.gold, fontWeight: '600', fontSize: Font.small },
  dateBox: { width: 54, height: 54, borderRadius: Radius.md, backgroundColor: Colors.navyDeep, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: Colors.slate, fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase' },
  dateNum: { color: Colors.gold, fontSize: 22, fontWeight: '900' },
  prenTitle: { color: Colors.white, fontSize: Font.body, fontWeight: '700' },
  prezzo: { color: Colors.gold, fontSize: Font.h3, fontWeight: '800' },
  ctaLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  ctaLinkText: { color: Colors.gold, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl },
  action: { alignItems: 'center', gap: 8, flex: 1 },
  actionIcon: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Colors.navyCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.navyLine + '55' },
  actionLabel: { color: Colors.slateLight, fontSize: Font.small, fontWeight: '600' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pos: { color: Colors.slate, fontSize: Font.h3, fontWeight: '800', width: 20 },
  playerName: { color: Colors.white, fontSize: Font.body, fontWeight: '600' },
  evIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
});
