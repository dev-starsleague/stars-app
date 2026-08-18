import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getEventi, iscrivitiEvento } from '../../lib/api';
import { Card, H1, Muted, Button, Pill, Chip } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { EventoCustom } from '../../types/models';

type Filtro = 'tutti' | 'aperti' | 'in_corso';

export default function Eventi() {
  const { me, demoMode } = useAuth();
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [refreshing, setRefreshing] = useState(false);
  const [iscritti, setIscritti] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => { setEventi(await getEventi()); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const iscriviti = async (e: EventoCustom) => {
    if (!me) return;
    const res = await iscrivitiEvento(e.id, me.id);
    if (res.ok) {
      setIscritti((p) => ({ ...p, [e.id]: true }));
      Alert.alert('Iscrizione registrata', `Sei iscritto a "${e.nome}".${demoMode ? '\n\n(demo: non salvata sul server)' : ''}`);
    } else Alert.alert('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  const filtrati = eventi.filter((e) =>
    filtro === 'tutti' ? true : filtro === 'aperti' ? e.stato === 'ready' : e.stato === 'in_corso');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
        <H1>Eventi & Tornei</H1>
        <Muted style={{ marginBottom: Spacing.lg }}>Iscriviti ai tornei del centro.</Muted>

        <View style={s.filters}>
          <Chip label="Tutti" active={filtro === 'tutti'} onPress={() => setFiltro('tutti')} />
          <Chip label="Aperti" active={filtro === 'aperti'} onPress={() => setFiltro('aperti')} />
          <Chip label="In corso" active={filtro === 'in_corso'} onPress={() => setFiltro('in_corso')} />
        </View>

        {filtrati.map((e) => {
          const pieno = e.max_partecipanti != null && (e.iscritti_count ?? 0) >= e.max_partecipanti;
          const isIscritto = iscritti[e.id];
          const chiuso = e.stato === 'in_corso';
          return (
            <Card key={e.id} style={{ marginBottom: Spacing.md }}>
              <View style={s.evHead}>
                <View style={s.evIcon}><Ionicons name="trophy" size={22} color={Colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.evNome}>{e.nome}</Text>
                  <Muted>{divisione(e.divisione)} · coppie</Muted>
                </View>
                <Pill label={chiuso ? 'In corso' : pieno ? 'Completo' : 'Aperto'}
                  color={chiuso ? Colors.amber : pieno ? Colors.red : Colors.green} />
              </View>

              {e.descrizione ? <Text style={s.evDesc}>{e.descrizione}</Text> : null}

              <View style={s.evMeta}>
                <Meta icon="calendar-outline" text={dataFmt(e.data_evento)} />
                <Meta icon="people-outline" text={`${e.iscritti_count ?? 0}/${e.max_partecipanti ?? '∞'}`} />
                <Meta icon="time-outline" text={chiusuraFmt(e.chiusura_iscrizioni_at)} />
              </View>

              {/* barra iscritti */}
              {e.max_partecipanti != null && (
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${Math.min(100, ((e.iscritti_count ?? 0) / e.max_partecipanti) * 100)}%` }]} />
                </View>
              )}

              {chiuso ? (
                <Button title="Vedi tabellone" variant="ghost" onPress={() => Alert.alert('Tabellone', 'Il tabellone live sarà disponibile a breve.')} style={{ marginTop: Spacing.md }} />
              ) : isIscritto ? (
                <View style={s.iscrittoRow}><Ionicons name="checkmark-circle" size={20} color={Colors.green} /><Text style={s.iscrittoText}>Sei iscritto</Text></View>
              ) : (
                <Button title={pieno ? 'Lista d\'attesa' : 'Iscriviti'} onPress={() => iscriviti(e)} style={{ marginTop: Spacing.md }} />
              )}
            </Card>
          );
        })}
        {filtrati.length === 0 && <Muted style={{ textAlign: 'center', marginTop: Spacing.xxl }}>Nessun evento in questa categoria.</Muted>}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={14} color={Colors.slate} />
      <Text style={s.metaText}>{text}</Text>
    </View>
  );
}
function divisione(d: string) { return d === 'misto' ? 'Misto' : d === 'maschile' ? 'Maschile' : 'Femminile'; }
function dataFmt(d?: string | null) { if (!d) return 'Da definire'; const x = new Date(d); return x.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }); }
function chiusuraFmt(d?: string | null) { if (!d) return 'Iscr. aperte'; const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); return diff > 0 ? `Chiude tra ${diff}g` : 'Chiuse'; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  filters: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  evHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  evIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  evNome: { color: Colors.white, fontSize: Font.h3, fontWeight: '800' },
  evDesc: { color: Colors.slateLight, fontSize: Font.small, marginBottom: Spacing.md, lineHeight: 20 },
  evMeta: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.slateLight, fontSize: Font.small },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: Colors.navyDeep, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: 3 },
  iscrittoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.md, paddingVertical: Spacing.md },
  iscrittoText: { color: Colors.green, fontWeight: '700' },
});
