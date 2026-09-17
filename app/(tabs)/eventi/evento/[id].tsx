// Dettaglio di un evento custom (Custom Event Builder) — prima non esisteva
// affatto (fix utente esplicito, Eventi "Iscriviti": "aprendo l'evento devo
// poter visualizzare il recap delle info, l'elenco partecipanti diviso per
// categorie con ranking visibile e se ci sono coppie già formate devo
// vedere le coppie con il ranking di coppia... il tasto ISCRIVITI come
// prima cosa"). A differenza di campionato/torneo, l'evento custom non ha
// ancora (motore "in fase di riscrittura", fuori scope qui) una vista
// turni/classifica/tabellone propria nell'app: questo dettaglio mostra
// sempre recap + iscrizione + partecipanti, in ogni tab da cui si apre.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import { useSport } from '../../../../lib/sport';
import { getEventoDettaglio, getGiocatori, iscrivitiEvento, type DettaglioEvento } from '../../../../lib/api';
import { avvisa } from '../../../../lib/avviso';
import { statoIscrizioni, ETICHETTA_STATO_ISCRIZIONI } from '../../../../lib/stars';
import { AppHeader } from '../../../../components/AppHeader';
import { Card, Muted, IconButton, Button } from '../../../../components/ui';
import { ListaPartecipantiPerCategoria, ModaleCoppia } from '../../../../components/campionatoTorneo';
import { useTheme } from '../../../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../../../constants/theme';
import type { Giocatore, EventoPartecipante } from '../../../../types/models';

export default function EventoDettaglio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { sportAttivo } = useSport();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [dettaglio, setDettaglio] = useState<DettaglioEvento | null>(null);
  const [giocatoriMap, setGiocatoriMap] = useState<Map<string, Giocatore>>(new Map());
  const [caricando, setCaricando] = useState(true);
  const [coppiaAperta, setCoppiaAperta] = useState(false);
  const [iscrivendo, setIscrivendo] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setCaricando(true);
    const [dett, giocatori] = await Promise.all([getEventoDettaglio(id), getGiocatori()]);
    setGiocatoriMap(new Map(giocatori.map((g) => [g.id, g])));
    setDettaglio(dett);
    setCaricando(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nomeGiocatore = useCallback((gid: string) => {
    const g = giocatoriMap.get(gid);
    return g ? `${g.nome} ${g.cognome}`.trim() : '—';
  }, [giocatoriMap]);
  const nomeCoppia = useCallback((p: EventoPartecipante) => `${nomeGiocatore(p.giocatore_1_id)} / ${nomeGiocatore(p.giocatore_2_id)}`, [nomeGiocatore]);

  const mioPartecipante = useMemo(
    () => dettaglio?.partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id) ?? null,
    [dettaglio, me]
  );

  const iscriviti = async (partnerId?: string) => {
    if (!me || !dettaglio || !partnerId) return;
    setIscrivendo(true);
    const res = await iscrivitiEvento(dettaglio.evento.id, me.id, partnerId, sportAttivo);
    setIscrivendo(false);
    setCoppiaAperta(false);
    if (res.ok) { avvisa('Iscrizione registrata', `Sei iscritto a "${dettaglio.evento.nome}" in coppia.`); load(); }
    else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  if (caricando || !dettaglio) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <View style={s.topbar}><IconButton icon="chevron-back" onPress={() => router.back()} /><Text style={s.title}>Evento</Text><View style={{ width: 38 }} /></View>
        <Muted style={{ textAlign: 'center', marginTop: Spacing.xxl }}>{caricando ? 'Caricamento…' : 'Evento non trovato.'}</Muted>
      </SafeAreaView>
    );
  }
  const { evento, partecipanti } = dettaglio;
  const stato = statoIscrizioni(evento.apertura_iscrizioni_at, evento.chiusura_iscrizioni_at, partecipanti.length, evento.max_partecipanti);
  const coloreStato = stato === 'aperte' ? colors.green : stato === 'in_arrivo' ? colors.amber : colors.red;
  const righePartecipanti = partecipanti.map((p) => ({ id: p.id, nome: nomeCoppia(p), ranking: p.ranking_coppia, mio: p.id === mioPartecipante?.id }));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title} numberOfLines={1}>{evento.nome}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Recap + ISCRIVITI come prima cosa (fix utente esplicito). */}
        <Card style={s.card}>
          <View style={s.recapTestata}>
            <Text style={s.sezioneTitolo}>{evento.nome}</Text>
            <View style={[s.pill, { backgroundColor: coloreStato + '22' }]}>
              <Text style={[s.pillText, { color: coloreStato }]}>{ETICHETTA_STATO_ISCRIZIONI[stato]}</Text>
            </View>
          </View>
          {evento.descrizione ? <Muted style={{ marginBottom: Spacing.sm }}>{evento.descrizione}</Muted> : null}
          <Muted style={{ marginBottom: 4 }}>
            {evento.divisione === 'misto' ? 'Misto' : evento.divisione === 'maschile' ? 'Maschile' : 'Femminile'} · {partecipanti.length}{evento.max_partecipanti ? `/${evento.max_partecipanti}` : ''} coppie
          </Muted>
          {evento.apertura_iscrizioni_at && (
            <Muted style={{ marginBottom: 4 }}>Iscrizioni: dal {formattaData(evento.apertura_iscrizioni_at)}{evento.chiusura_iscrizioni_at ? ` al ${formattaData(evento.chiusura_iscrizioni_at)}` : ''}</Muted>
          )}
          {evento.data_evento && <Muted style={{ marginBottom: Spacing.md }}>Inizio: {formattaData(evento.data_evento)}</Muted>}

          {stato === 'aperte' && (
            mioPartecipante ? (
              <View style={s.iscritto}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><Text style={s.iscrittoText}>Sei iscritto</Text></View>
            ) : (
              <Button title={iscrivendo ? 'Iscrizione…' : 'Iscriviti in coppia'} loading={iscrivendo} onPress={() => setCoppiaAperta(true)} />
            )
          )}
        </Card>

        {/* Partecipanti/coppie, divisi per categoria di ranking, dal più
            alto al più basso (fix utente esplicito). */}
        <Text style={s.sezioneTitolo}>Partecipanti ({partecipanti.length})</Text>
        <Card style={s.card}>
          <ListaPartecipantiPerCategoria righe={righePartecipanti} />
        </Card>

        <View style={{ height: 20 }} />
      </ScrollView>

      {coppiaAperta && me && (
        <ModaleCoppia
          titolo={evento.nome} sottotitolo="formato a coppie" meId={me.id} obbligaCoppia
          onChiudi={() => setCoppiaAperta(false)}
          onConferma={(partnerId) => iscriviti(partnerId)}
        />
      )}
    </SafeAreaView>
  );
}

function formattaData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    title: { flex: 1, textAlign: 'center', color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    scroll: { padding: Spacing.lg },
    card: { marginBottom: Spacing.lg },
    sezioneTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
    recapTestata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm },
    iscrittoText: { color: colors.green, fontWeight: '700' },
  });
}
