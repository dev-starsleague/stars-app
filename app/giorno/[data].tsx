import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { getPartiteGiocatore, getEventiIscritti, getEventi, iscrivitiEvento } from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { Card, IconBadge, IconButton, Muted, Button } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Font, AppColors } from '../../constants/theme';
import type { Prenotazione, EventoCustom } from '../../types/models';

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function etichettaGiornoLunga(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

type TipoImpegno = 'partita' | 'lezione' | 'evento';
interface RigaImpegno { id: string; tipo: TipoImpegno; label: string; sottotitolo: string }

// Tap su un giorno del calendario Home: 3 cose devono succedere qui (fix
// utente esplicito) — vedere i propri impegni di quel giorno se ce ne sono,
// vedere gli eventi disponibili a cui non si è ancora iscritti, e poter
// comunque prenotare una partita. Stessa classificazione/colori dei
// pallini del calendario (vedi app/(tabs)/index.tsx CalendarWidget), qui
// applicata a un solo giorno invece che a un mese intero.
export default function GiornoDettaglio() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [partite, setPartite] = useState<Prenotazione[]>([]);
  const [eventiIscritti, setEventiIscritti] = useState<EventoCustom[]>([]);
  const [tuttiEventi, setTuttiEventi] = useState<EventoCustom[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [iscrivendo, setIscrivendo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [pt, ei, tutti] = await Promise.all([getPartiteGiocatore(me.id), getEventiIscritti(me.id), getEventi()]);
    setPartite(pt); setEventiIscritti(ei); setTuttiEventi(tutti);
    setCaricato(true);
  }, [me]);
  useEffect(() => { load(); }, [load]);

  // 1 — i tuoi impegni di questo giorno (partite/lezioni/eventi a cui sei
  // iscritto), solo se ce ne sono.
  const impegni = useMemo((): RigaImpegno[] => {
    const daPartite: RigaImpegno[] = partite
      .filter((p) => p.data === data)
      .map((p) => ({
        id: `p-${p.id}`, tipo: (p.tipo === 'lezione' ? 'lezione' : 'partita') as TipoImpegno,
        label: p.campo?.nome ?? (p.tipo === 'lezione' ? 'Lezione' : 'Partita'),
        sottotitolo: p.inizio ? p.inizio.slice(0, 5) : '',
      }));
    const daEventi: RigaImpegno[] = eventiIscritti
      .filter((e) => e.data_evento === data)
      .map((e) => ({ id: `e-${e.id}`, tipo: 'evento' as TipoImpegno, label: e.nome, sottotitolo: 'Sei iscritto' }));
    return [...daPartite, ...daEventi];
  }, [partite, eventiIscritti, data]);

  // 2 — eventi di questo giorno a cui NON sei ancora iscritto.
  const eventiDisponibili = useMemo(() => {
    const iscrittiIds = new Set(eventiIscritti.map((e) => e.id));
    return tuttiEventi.filter((e) => e.data_evento === data && !iscrittiIds.has(e.id));
  }, [tuttiEventi, eventiIscritti, data]);

  // Niente impegni e niente eventi disponibili: questa schermata non avrebbe
  // nulla da mostrare oltre al bottone "Prenota" — si salta dritti alla
  // prenotazione (fix utente esplicito), sostituendo la schermata (replace,
  // non push) così "indietro" da Prenota torna alla Home, non qui vuota.
  useEffect(() => {
    if (caricato && impegni.length === 0 && eventiDisponibili.length === 0 && data) {
      router.replace({ pathname: '/(tabs)/prenota', params: { data } });
    }
  }, [caricato, impegni.length, eventiDisponibili.length, data]);

  const coloreTipo = (t: TipoImpegno) => t === 'partita' ? colors.green : t === 'lezione' ? colors.amber : colors.viola;
  const etichettaTipo = (t: TipoImpegno) => t === 'partita' ? 'Partita' : t === 'lezione' ? 'Lezione' : 'Evento';

  const iscriviti = async (e: EventoCustom) => {
    if (!me) return;
    setIscrivendo(e.id);
    const res = await iscrivitiEvento(e.id, me.id);
    setIscrivendo(null);
    if (res.ok) { avvisa('Iscrizione registrata', `Sei iscritto a "${e.nome}".`); load(); }
    else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  // 3 — poter comunque prenotare una partita in questo giorno.
  const prenota = () => router.push({ pathname: '/(tabs)/prenota', params: { data } });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title} numberOfLines={1}>{data ? etichettaGiornoLunga(data) : ''}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!caricato ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            {impegni.length > 0 && (
              <>
                <Text style={s.sectionTitle}>I tuoi impegni</Text>
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.xl }}>
                  {impegni.map((r) => (
                    <Card key={r.id} style={s.impegnoRow}>
                      <View style={[s.dot, { backgroundColor: coloreTipo(r.tipo) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.impegnoLabel}>{r.label}</Text>
                        <Muted>{etichettaTipo(r.tipo)}{r.sottotitolo ? ` · ${r.sottotitolo}` : ''}</Muted>
                      </View>
                    </Card>
                  ))}
                </View>
              </>
            )}

            <Text style={s.sectionTitle}>Eventi disponibili</Text>
            {eventiDisponibili.length === 0 ? (
              <Muted style={{ marginBottom: Spacing.xl }}>Nessun evento disponibile in questo giorno.</Muted>
            ) : (
              <View style={{ gap: Spacing.sm, marginBottom: Spacing.xl }}>
                {eventiDisponibili.map((e) => (
                  <Card key={e.id}>
                    <View style={s.eventoRow}>
                      <IconBadge icon="trophy" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.impegnoLabel}>{e.nome}</Text>
                        <Muted>{e.iscritti_count ?? 0}/{e.max_partecipanti ?? '∞'} iscritti</Muted>
                      </View>
                    </View>
                    <Button
                      title={iscrivendo === e.id ? 'Iscrizione…' : 'Iscriviti'} variant="ghost"
                      loading={iscrivendo === e.id} onPress={() => iscriviti(e)} style={{ marginTop: Spacing.md }}
                    />
                  </Card>
                ))}
              </View>
            )}

            <Button title="Prenota una partita" onPress={prenota} />
            <View style={{ height: 20 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { flex: 1, textAlign: 'center', color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.md },
    impegnoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    dot: { width: 10, height: 10, borderRadius: 5 },
    impegnoLabel: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body },
    eventoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  });
}
