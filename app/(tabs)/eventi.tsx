import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getEventi, iscrivitiEvento } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Button, Card, Chip, IconBadge, Input, Muted, Segmented } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { EventoCustom } from '../../types/models';

type TabE = 'attivi' | 'miei' | 'passati';
type Cat = 'tutti' | 'lezioni' | 'friendly' | 'competitivi' | 'clinic';

export default function Eventi() {
  const { me, demoMode } = useAuth();
  const [tabE, setTabE] = useState<TabE>('attivi');
  const [cat, setCat] = useState<Cat>('tutti');
  const [q, setQ] = useState('');
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [iscritti, setIscritti] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { setEventi(await getEventi()); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const iscriviti = async (e: EventoCustom) => {
    if (!me) return;
    const res = await iscrivitiEvento(e.id, me.id);
    if (res.ok) { setIscritti((p) => ({ ...p, [e.id]: true })); Alert.alert('Iscrizione registrata', `Sei iscritto a "${e.nome}".`); }
    else Alert.alert('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  // "Attivi" = aperti alle iscrizioni o già in corso — cioè non ancora
  // conclusi. draft/cancelled non compaiono da nessuna parte: draft è
  // configurazione dello staff mai pubblicata, cancelled non serve al giocatore.
  const attivi = eventi.filter((e) => e.stato === 'ready' || e.stato === 'in_corso');
  const passati = eventi.filter((e) => e.stato === 'completed');
  const base = tabE === 'attivi' ? attivi : tabE === 'miei' ? eventi.filter((e) => iscritti[e.id]) : passati;
  const filtrati = base.filter((e) => q ? e.nome.toLowerCase().includes(q.toLowerCase()) : true);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>

        {/* Card filtri vetro liquido */}
        <Card style={s.filterCard}>
          <Segmented
            value={tabE}
            onChange={(v) => setTabE(v as TabE)}
            options={[
              { value: 'attivi', label: `Attivi (${attivi.length})` },
              { value: 'miei', label: `I miei (${Object.values(iscritti).filter(Boolean).length})` },
              { value: 'passati', label: `Passati (${passati.length})` },
            ]}
            style={{ marginBottom: Spacing.md }}
          />

          <Input icon="search" placeholder="Cerca evento o centro…" value={q} onChangeText={setQ} style={{ marginBottom: Spacing.md }} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.cats}>
              {(['tutti', 'lezioni', 'friendly', 'competitivi', 'clinic'] as Cat[]).map((c) => (
                <Chip key={c} label={cap(c)} active={cat === c} onPress={() => setCat(c)} />
              ))}
              <Chip label="⭐ Preferiti" />
            </View>
          </ScrollView>
        </Card>

        {demoMode ? (
          <Card style={s.demoBadge}><Text style={s.demoText}>Dati demo</Text></Card>
        ) : null}

        {filtrati.length === 0 ? (
          <Text style={s.empty}>Nessun evento disponibile</Text>
        ) : filtrati.map((e) => {
          const isIscritto = iscritti[e.id];
          const chiuso = e.stato !== 'ready';
          return (
            <Card key={e.id} style={s.card}>
              <View style={s.cardHead}>
                <IconBadge icon="trophy" />
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>{e.nome}</Text>
                  <Muted>{divisione(e.divisione)} · {e.iscritti_count ?? 0}/{e.max_partecipanti ?? '∞'}</Muted>
                </View>
                <View style={[s.pill, { backgroundColor: (chiuso ? Colors.amber : Colors.green) + '22' }]}>
                  <Text style={[s.pillText, { color: chiuso ? Colors.amber : Colors.green }]}>{chiuso ? 'In corso' : 'Aperto'}</Text>
                </View>
              </View>
              {e.descrizione ? <Text style={s.cardDesc}>{e.descrizione}</Text> : null}
              {!chiuso && (isIscritto ? (
                <View style={s.iscritto}><Ionicons name="checkmark-circle" size={18} color={Colors.green} /><Text style={s.iscrittoText}>Sei iscritto</Text></View>
              ) : (
                <Button title="Iscriviti alla partita" onPress={() => iscriviti(e)} style={{ marginTop: Spacing.md }} />
              ))}
            </Card>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function cap(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }
function divisione(d: string) { return d === 'misto' ? 'Misto' : d === 'maschile' ? 'Maschile' : 'Femminile'; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  filterCard: { marginBottom: Spacing.lg },
  cats: { flexDirection: 'row', gap: Spacing.sm },
  demoBadge: { marginBottom: Spacing.lg },
  demoText: { color: Colors.gold, fontWeight: '700', fontSize: Font.small },
  empty: { color: Colors.slate, textAlign: 'center', marginTop: Spacing.xxl, fontSize: Font.body },
  card: { marginBottom: Spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardName: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
  cardDesc: { color: Colors.slateLight, fontSize: Font.small, marginTop: Spacing.md, lineHeight: 20 },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
  pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.md, paddingVertical: Spacing.sm },
  iscrittoText: { color: Colors.green, fontWeight: '700' },
});
