import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getEventi, iscrivitiEvento, USE_MOCK } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Muted } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { EventoCustom } from '../../types/models';

type TabE = 'arrivo' | 'miei' | 'passati';
type Cat = 'tutti' | 'lezioni' | 'friendly' | 'competitivi' | 'clinic';

export default function Eventi() {
  const { me, demoMode } = useAuth();
  const [tabE, setTabE] = useState<TabE>('arrivo');
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

  const inArrivo = eventi.filter((e) => e.stato === 'ready');
  const passati = eventi.filter((e) => e.stato === 'in_corso' || e.stato === 'completed');
  const base = tabE === 'arrivo' ? inArrivo : tabE === 'miei' ? eventi.filter((e) => iscritti[e.id]) : passati;
  const filtrati = base.filter((e) => q ? e.nome.toLowerCase().includes(q.toLowerCase()) : true);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>

        {/* Card filtri bianca */}
        <View style={s.filterCard}>
          <View style={s.subtabs}>
            <Pressable style={[s.subtab, tabE === 'arrivo' && s.subtabActive]} onPress={() => setTabE('arrivo')}>
              <Text style={[s.subtabText, tabE === 'arrivo' && s.subtabTextActive]}>In arrivo ({inArrivo.length})</Text>
            </Pressable>
            <Pressable style={[s.subtab, tabE === 'miei' && s.subtabActive]} onPress={() => setTabE('miei')}>
              <Text style={[s.subtabText, tabE === 'miei' && s.subtabTextActive]}>I miei ({Object.values(iscritti).filter(Boolean).length})</Text>
            </Pressable>
            <Pressable style={[s.subtab, tabE === 'passati' && s.subtabActive]} onPress={() => setTabE('passati')}>
              <Text style={[s.subtabText, tabE === 'passati' && s.subtabTextActive]}>Passati ({passati.length})</Text>
            </Pressable>
          </View>

          <View style={s.search}>
            <Ionicons name="search" size={18} color={Colors.slate} />
            <TextInput placeholder="Cerca evento o centro…" placeholderTextColor={Colors.slate}
              style={s.searchInput} value={q} onChangeText={setQ} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.cats}>
              {(['tutti', 'lezioni', 'friendly', 'competitivi', 'clinic'] as Cat[]).map((c) => (
                <Pressable key={c} onPress={() => setCat(c)} style={[s.cat, cat === c && s.catActive]}>
                  <Text style={[s.catText, cat === c && s.catTextActive]}>{cap(c)}</Text>
                </Pressable>
              ))}
              <Pressable style={s.cat}>
                <Ionicons name="star-outline" size={13} color={Colors.slate} />
                <Text style={s.catText}> Preferiti</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>

        {USE_MOCK || demoMode ? (
          <View style={s.demoBadge}><Text style={s.demoText}>Dati demo</Text></View>
        ) : null}

        {filtrati.length === 0 ? (
          <Text style={s.empty}>Nessun evento disponibile</Text>
        ) : filtrati.map((e) => {
          const isIscritto = iscritti[e.id];
          const chiuso = e.stato !== 'ready';
          return (
            <View key={e.id} style={s.card}>
              <View style={s.cardHead}>
                <View style={s.cardIcon}><Ionicons name="trophy" size={20} color={Colors.gold} /></View>
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
                <Pressable style={s.iscrivitiBtn} onPress={() => iscriviti(e)}>
                  <Text style={s.iscrivitiText}>Iscriviti alla partita</Text>
                </Pressable>
              ))}
            </View>
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
  filterCard: { backgroundColor: '#F7F8FA', borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  subtabs: { flexDirection: 'row', gap: 4, marginBottom: Spacing.md },
  subtab: { flex: 1, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center' },
  subtabActive: { backgroundColor: Colors.gold },
  subtabText: { color: Colors.slate, fontWeight: '700', fontSize: Font.small },
  subtabTextActive: { color: Colors.navyDeep },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  searchInput: { flex: 1, color: Colors.navyDeep, height: 46, fontSize: Font.body },
  cats: { flexDirection: 'row', gap: Spacing.sm },
  cat: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8EBEF', paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.pill },
  catActive: { backgroundColor: Colors.navyDeep },
  catText: { color: Colors.slate, fontWeight: '700', fontSize: Font.small },
  catTextActive: { color: Colors.white },
  demoBadge: { borderWidth: 1, borderColor: Colors.gold + '66', borderStyle: 'dashed', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  demoText: { color: Colors.gold, fontWeight: '700', fontSize: Font.small },
  empty: { color: Colors.slate, textAlign: 'center', marginTop: Spacing.xxl, fontSize: Font.body },
  card: { backgroundColor: Colors.navyCard, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.navyLine + '44' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  cardName: { color: Colors.white, fontSize: Font.h3, fontWeight: '800' },
  cardDesc: { color: Colors.slateLight, fontSize: Font.small, marginTop: Spacing.md, lineHeight: 20 },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
  pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.md, paddingVertical: Spacing.sm },
  iscrittoText: { color: Colors.green, fontWeight: '700' },
  iscrivitiBtn: { backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  iscrivitiText: { color: Colors.navyDeep, fontWeight: '800' },
});
