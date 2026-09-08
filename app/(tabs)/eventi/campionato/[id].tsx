import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import { getCampionatoDettaglio, getClassificaGirone, getGiocatori, type DettaglioCampionato } from '../../../../lib/api';
import { AppHeader } from '../../../../components/AppHeader';
import { Card, Muted, IconButton, Segmented, Avatar } from '../../../../components/ui';
import { TabellaClassifica, Tabellone, RigaMatch, mappaNomiPartecipanti, etichettaTurno, type ColonnaTabellone } from '../../../../components/campionatoTorneo';
import { useTheme } from '../../../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../../../constants/theme';
import type { RigaClassifica, Giocatore, CampionatoGiornata } from '../../../../types/models';

export default function CampionatoDettaglio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [dettaglio, setDettaglio] = useState<DettaglioCampionato | null>(null);
  const [giocatoriMap, setGiocatoriMap] = useState<Map<string, Giocatore>>(new Map());
  const [classifiche, setClassifiche] = useState<Record<string, RigaClassifica[]>>({});
  const [gironeSel, setGironeSel] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setCaricando(true);
    const [dett, giocatori] = await Promise.all([getCampionatoDettaglio(id), getGiocatori()]);
    setGiocatoriMap(new Map(giocatori.map((g) => [g.id, g])));
    setDettaglio(dett);
    if (dett && dett.gironi.length > 0) {
      const voci = await Promise.all(dett.gironi.map(async (g) => [g.id, await getClassificaGirone(id, g.id)] as const));
      setClassifiche(Object.fromEntries(voci));
      setGironeSel((cur) => cur && dett.gironi.some((g) => g.id === cur) ? cur : dett.gironi[0].id);
    }
    setCaricando(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nomeDi = useMemo(() => {
    if (!dettaglio) return () => '—';
    const mappa = mappaNomiPartecipanti(dettaglio.partecipanti, giocatoriMap);
    return (partId: string | null) => (partId ? mappa.get(partId) ?? '—' : 'In attesa');
  }, [dettaglio, giocatoriMap]);

  const mioPartecipanteId = useMemo(
    () => dettaglio?.partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id)?.id ?? null,
    [dettaglio, me]
  );

  // Playoff: colonne del tabellone, un turno per colonna (giornate fase
  // "playoff"). Campione: il vincitore della finale (ultimo turno), solo
  // se già giocata — nessuna supposizione se il campionato non ha
  // ancora una finale conclusa.
  const giornatePlayoff = useMemo(() => sortByNumero<CampionatoGiornata>(dettaglio?.giornate.filter((g) => g.fase === 'playoff') ?? []), [dettaglio]);
  const colonnePlayoff: ColonnaTabellone[] = useMemo(() => {
    if (!dettaglio) return [];
    return giornatePlayoff.map((g) => ({
      titolo: etichettaTurno(g.numero, giornatePlayoff.length),
      match: dettaglio.match.filter((m) => m.giornata_id === g.id),
      nomeA: nomeDi, nomeB: nomeDi,
    }));
  }, [dettaglio, giornatePlayoff, nomeDi]);

  const campioneId = useMemo(() => {
    if (giornatePlayoff.length === 0 || !dettaglio) return null;
    const finale = giornatePlayoff[giornatePlayoff.length - 1];
    const matchFinale = dettaglio.match.find((m) => m.giornata_id === finale.id && !m.bye);
    return matchFinale && (matchFinale.stato === 'giocato' || matchFinale.stato === 'forfait') ? matchFinale.vincitore_id : null;
  }, [giornatePlayoff, dettaglio]);
  const campioneSoloGirone = useMemo(() => {
    if (campioneId || !dettaglio || dettaglio.campionato.stato !== 'concluso' || dettaglio.gironi.length !== 1) return null;
    return classifiche[dettaglio.gironi[0].id]?.[0]?.partecipante_id ?? null;
  }, [campioneId, dettaglio, classifiche]);
  const campione = campioneId ?? campioneSoloGirone;

  // Giornate della fase gironi, raggruppate per numero — ogni giornata
  // mostra le partite di TUTTI i gironi insieme (tag "Girone A" se ce n'è
  // più di uno, altrimenti il tag è superfluo).
  const giornateGironi = useMemo(() => sortByNumero<CampionatoGiornata>(dettaglio?.giornate.filter((g) => g.fase === 'gironi') ?? []), [dettaglio]);
  const nomeGirone = (gironeId: string | null) => dettaglio?.gironi.find((g) => g.id === gironeId)?.nome ?? '';

  if (caricando || !dettaglio) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <View style={s.topbar}><IconButton icon="chevron-back" onPress={() => router.back()} /><Text style={s.title}>Campionato</Text><View style={{ width: 38 }} /></View>
        <Muted style={{ textAlign: 'center', marginTop: Spacing.xxl }}>{caricando ? 'Caricamento…' : 'Campionato non trovato.'}</Muted>
      </SafeAreaView>
    );
  }
  const { campionato, gironi } = dettaglio;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title} numberOfLines={1}>{campionato.nome}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {campione && (
          <View style={s.campioneCard}>
            <Ionicons name="trophy" size={28} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.campioneLabel}>Campione</Text>
              <Text style={s.campioneNome}>{nomeDi(campione)}</Text>
            </View>
          </View>
        )}

        {/* 1. Classifica */}
        <Text style={s.sezioneTitolo}>Classifica</Text>
        <Card style={s.card}>
          {gironi.length > 1 && (
            <Segmented
              value={gironeSel ?? gironi[0].id}
              onChange={(v) => setGironeSel(v)}
              options={gironi.map((g) => ({ value: g.id, label: g.nome }))}
              style={{ marginBottom: Spacing.md }}
            />
          )}
          <TabellaClassifica righe={(gironeSel && classifiche[gironeSel]) ?? []} nomeDi={nomeDi} />
        </Card>

        {/* 2. Giornate */}
        <Text style={s.sezioneTitolo}>Giornate</Text>
        {giornateGironi.length === 0 ? (
          <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Calendario non ancora generato.</Muted></Card>
        ) : giornateGironi.map((g) => {
          const match = dettaglio.match.filter((m) => m.giornata_id === g.id);
          if (match.length === 0) return null;
          return (
            <Card key={g.id} style={s.card}>
              <Text style={s.giornataTitolo}>Giornata {g.numero}</Text>
              {match.map((m) => (
                <View key={m.id}>
                  {gironi.length > 1 && <Muted style={s.gironeTag}>{nomeGirone(m.girone_id)}</Muted>}
                  <RigaMatch match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} />
                </View>
              ))}
            </Card>
          );
        })}

        {/* 3. Playoff (se presente) — tabellone a eliminazione diretta */}
        {colonnePlayoff.length > 0 && (
          <>
            <Text style={s.sezioneTitolo}>Playoff</Text>
            <Card style={s.card}>
              <Tabellone colonne={colonnePlayoff} />
            </Card>
          </>
        )}

        {/* 3bis. Partecipanti */}
        <Text style={s.sezioneTitolo}>Partecipanti ({dettaglio.partecipanti.length})</Text>
        <Card style={s.card}>
          {dettaglio.partecipanti.length === 0 ? (
            <Muted style={{ textAlign: 'center' }}>Nessun iscritto ancora.</Muted>
          ) : dettaglio.partecipanti.map((p) => (
            <View key={p.id} style={s.partRiga}>
              <Avatar name={nomeDi(p.id)} size={32} />
              <Text style={[s.partNome, p.id === mioPartecipanteId && s.partNomeMio]} numberOfLines={1}>{nomeDi(p.id)}</Text>
              {gironi.length > 1 && p.girone_id && <Muted style={{ fontSize: Font.tiny }}>{nomeGirone(p.girone_id)}</Muted>}
              {p.id === mioPartecipanteId && <Ionicons name="person" size={16} color={colors.gold} />}
            </View>
          ))}
        </Card>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function sortByNumero<T extends { numero: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.numero - b.numero);
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    title: { flex: 1, textAlign: 'center', color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    scroll: { padding: Spacing.lg },
    card: { marginBottom: Spacing.lg },
    sezioneTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
    giornataTitolo: { color: colors.slate, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
    gironeTag: { fontSize: Font.tiny, marginTop: 6 },
    campioneCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg, padding: Spacing.lg,
      borderRadius: Radius.card, backgroundColor: '#16253A', borderWidth: 1, borderColor: 'rgba(255,175,0,0.35)',
    },
    campioneLabel: { color: 'rgba(255,255,255,0.6)', fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    campioneNome: { color: '#fff', fontSize: Font.h3, fontWeight: '800' },
    partRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    partNome: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    partNomeMio: { color: colors.gold, fontWeight: '800' },
  });
}
