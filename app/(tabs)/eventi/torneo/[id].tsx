import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import { getTorneoDettaglio, getClassificaTorneo, getGiocatori, type DettaglioTorneo } from '../../../../lib/api';
import { AppHeader } from '../../../../components/AppHeader';
import { Card, Muted, IconButton, Avatar } from '../../../../components/ui';
import { TabellaClassifica, Tabellone, RigaMatch, mappaNomiPartecipanti, etichettaTurno, calcolaClassificaBracket, type ColonnaTabellone } from '../../../../components/campionatoTorneo';
import { useTheme } from '../../../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../../../constants/theme';
import type { RigaClassifica, Giocatore, TorneoRound } from '../../../../types/models';

export default function TorneoDettaglio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [dettaglio, setDettaglio] = useState<DettaglioTorneo | null>(null);
  const [giocatoriMap, setGiocatoriMap] = useState<Map<string, Giocatore>>(new Map());
  const [classificaRR, setClassificaRR] = useState<RigaClassifica[]>([]);
  const [caricando, setCaricando] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setCaricando(true);
    const [dett, giocatori] = await Promise.all([getTorneoDettaglio(id), getGiocatori()]);
    setGiocatoriMap(new Map(giocatori.map((g) => [g.id, g])));
    setDettaglio(dett);
    // americano ha una classifica reale come round_robin (punti
    // individuali, calcolata lato backend — vedi services/torneo.py:am_standings).
    if (dett && dett.torneo.format_type !== 'single_elimination') setClassificaRR(await getClassificaTorneo(id));
    setCaricando(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nomeDi = useMemo(() => {
    if (!dettaglio) return () => '—';
    const mappa = mappaNomiPartecipanti(dettaglio.partecipanti, giocatoriMap);
    return (partId: string | null) => (partId ? mappa.get(partId) ?? '—' : 'In attesa');
  }, [dettaglio, giocatoriMap]);
  const nomeSquadraAmericano = (ids?: string[] | null) => (ids && ids.length ? ids.map((id) => nomeDi(id)).join(' + ') : '—');

  const mioPartecipanteId = useMemo(
    () => dettaglio?.partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id)?.id ?? null,
    [dettaglio, me]
  );

  const eEliminazione = dettaglio?.torneo.format_type === 'single_elimination';
  const eAmericano = dettaglio?.torneo.format_type === 'americano';
  const eSwiss = dettaglio?.torneo.format_type === 'swiss';

  // Tabellone: colonne = round fase "bracket" — sia single_elimination
  // (l'intero torneo) sia la fase finale opzionale dello svizzero dopo i
  // turni a punteggio (stesso fase="bracket", riusato lato backend —
  // vedi services/torneo.py:_costruisci_tabellone). La presenza di round
  // "bracket" (non il format_type) decide se mostrare il Tabellone.
  const roundBracket = useMemo(() => sortByNumero<TorneoRound>(dettaglio?.round.filter((r) => r.fase === 'bracket') ?? []), [dettaglio]);
  const haTabellone = roundBracket.length > 0;
  const colonneTabellone: ColonnaTabellone[] = useMemo(() => {
    if (!dettaglio) return [];
    return roundBracket.map((r) => ({
      titolo: etichettaTurno(r.numero, roundBracket.length),
      match: dettaglio.match.filter((m) => m.round_id === r.id),
      nomeA: nomeDi, nomeB: nomeDi,
    }));
  }, [dettaglio, roundBracket, nomeDi]);

  // Giornate (round_robin): round fase "round_robin".
  const roundGironi = useMemo(() => sortByNumero<TorneoRound>(dettaglio?.round.filter((r) => r.fase === 'round_robin') ?? []), [dettaglio]);
  // Turni (swiss): round fase "swiss_round" — stessa forma di round_robin
  // (partecipante_a_id/b_id + set_risultati reali, RigaMatch generico
  // gestisce già il bye internamente), fase diversa perché il calendario
  // si genera un turno alla volta invece che tutto in anticipo (vedi
  // services/torneo.py:sw_generate_schedule/sw_genera_turno_successivo).
  const roundSwiss = useMemo(() => sortByNumero<TorneoRound>(dettaglio?.round.filter((r) => r.fase === 'swiss_round') ?? []), [dettaglio]);
  // Turni (americano): round fase "rotation" — ogni turno, chi non è in
  // nessun match di quel round ha riposato quel turno (nessuna riga
  // "bye" dedicata, a differenza degli altri formati: l'assenza dal
  // round stesso è il riposo).
  const roundRotazione = useMemo(() => sortByNumero<TorneoRound>(dettaglio?.round.filter((r) => r.fase === 'rotation') ?? []), [dettaglio]);
  const riposanoNelRound = (roundId: string) => {
    if (!dettaglio) return [];
    const inCampo = new Set<string>();
    for (const m of dettaglio.match.filter((m) => m.round_id === roundId)) {
      for (const pid of m.team_a_ids ?? []) inCampo.add(pid);
      for (const pid of m.team_b_ids ?? []) inCampo.add(pid);
    }
    return dettaglio.partecipanti.filter((p) => !inCampo.has(p.id));
  };

  // Classifica: reale per round_robin (dal backend), "a punti" derivata
  // dal tabellone per l'eliminazione diretta — nessuna classifica reale
  // esiste per quel formato, ma vittorie-nel-bracket è comunque un
  // ordinamento sensato (fix utente esplicito: "metti una sorta di
  // classifica a punti" al posto della box info rimossa).
  const classifica = useMemo(
    () => (dettaglio ? (eEliminazione ? calcolaClassificaBracket(dettaglio.partecipanti, dettaglio.match) : classificaRR) : []),
    [dettaglio, eEliminazione, classificaRR]
  );

  const campione = useMemo(() => {
    if (!dettaglio) return null;
    // Un tabellone (single_elimination, o la fase finale opzionale dello
    // svizzero) decide il campione col match finale, non con la
    // classifica — stessa logica per entrambi, la presenza di round
    // "bracket" è ciò che conta, non il format_type (vedi haTabellone).
    if (haTabellone) {
      const finale = roundBracket[roundBracket.length - 1];
      const matchFinale = dettaglio.match.find((m) => m.round_id === finale.id && !m.bye);
      return matchFinale && (matchFinale.stato === 'giocato' || matchFinale.stato === 'forfait') ? matchFinale.vincitore_id : null;
    }
    return dettaglio.torneo.stato === 'concluso' ? classifica[0]?.partecipante_id ?? null : null;
  }, [dettaglio, haTabellone, roundBracket, classifica]);

  if (caricando || !dettaglio) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <View style={s.topbar}><IconButton icon="chevron-back" onPress={() => router.back()} /><Text style={s.title}>Torneo</Text><View style={{ width: 38 }} /></View>
        <Muted style={{ textAlign: 'center', marginTop: Spacing.xxl }}>{caricando ? 'Caricamento…' : 'Torneo non trovato.'}</Muted>
      </SafeAreaView>
    );
  }
  const { torneo } = dettaglio;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title} numberOfLines={1}>{torneo.nome}</Text>
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

        <Text style={s.sezioneTitolo}>Classifica</Text>
        <Card style={s.card}>
          <TabellaClassifica righe={classifica} nomeDi={nomeDi} />
        </Card>

        {!eEliminazione && !eAmericano && !eSwiss && (
          <>
            <Text style={s.sezioneTitolo}>Giornate</Text>
            {roundGironi.length === 0 ? (
              <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Calendario non ancora generato.</Muted></Card>
            ) : roundGironi.map((r) => {
              const match = dettaglio.match.filter((m) => m.round_id === r.id);
              if (match.length === 0) return null;
              return (
                <Card key={r.id} style={s.card}>
                  <Text style={s.giornataTitolo}>Giornata {r.numero}</Text>
                  {match.map((m) => (
                    <RigaMatch key={m.id} match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} />
                  ))}
                </Card>
              );
            })}
          </>
        )}

        {eSwiss && (
          <>
            <Text style={s.sezioneTitolo}>Turni</Text>
            {roundSwiss.length === 0 ? (
              <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Calendario non ancora generato.</Muted></Card>
            ) : roundSwiss.map((r) => {
              const match = dettaglio.match.filter((m) => m.round_id === r.id);
              if (match.length === 0) return null;
              return (
                <Card key={r.id} style={s.card}>
                  <Text style={s.giornataTitolo}>Turno {r.numero}</Text>
                  {match.map((m) => (
                    <RigaMatch key={m.id} match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} />
                  ))}
                </Card>
              );
            })}
          </>
        )}

        {haTabellone && (
          <>
            <Text style={s.sezioneTitolo}>Tabellone{eSwiss ? ' finale' : ''}</Text>
            <Card style={s.card}>
              <Tabellone colonne={colonneTabellone} />
            </Card>
          </>
        )}

        {eAmericano && (
          <>
            <Text style={s.sezioneTitolo}>Turni</Text>
            {roundRotazione.length === 0 ? (
              <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Calendario non ancora generato.</Muted></Card>
            ) : roundRotazione.map((r) => {
              const match = dettaglio.match.filter((m) => m.round_id === r.id);
              const riposano = riposanoNelRound(r.id);
              if (match.length === 0) return null;
              return (
                <Card key={r.id} style={s.card}>
                  <Text style={s.giornataTitolo}>Turno {r.numero}</Text>
                  {match.map((m) => {
                    const giocato = m.stato === 'giocato';
                    const vinceA = giocato && (m.punti_a ?? 0) > (m.punti_b ?? 0);
                    const vinceB = giocato && (m.punti_b ?? 0) > (m.punti_a ?? 0);
                    return (
                      <View key={m.id} style={s.matchAmRiga}>
                        <Text style={[s.matchAmSquadra, vinceA && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_a_ids)}</Text>
                        <Text style={s.matchAmVs}>{giocato ? `${m.punti_a}-${m.punti_b}` : 'vs'}</Text>
                        <Text style={[s.matchAmSquadra, s.matchAmSquadraB, vinceB && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_b_ids)}</Text>
                      </View>
                    );
                  })}
                  {riposano.length > 0 && (
                    <Muted style={{ marginTop: Spacing.sm }}>Riposa: {riposano.map((p) => nomeDi(p.id)).join(', ')}</Muted>
                  )}
                </Card>
              );
            })}
          </>
        )}

        <Text style={s.sezioneTitolo}>Partecipanti ({dettaglio.partecipanti.length})</Text>
        <Card style={s.card}>
          {dettaglio.partecipanti.length === 0 ? (
            <Muted style={{ textAlign: 'center' }}>Nessun iscritto ancora.</Muted>
          ) : dettaglio.partecipanti.map((p) => (
            <View key={p.id} style={s.partRiga}>
              <Avatar name={nomeDi(p.id)} size={32} />
              <Text style={[s.partNome, p.id === mioPartecipanteId && s.partNomeMio]} numberOfLines={1}>{nomeDi(p.id)}</Text>
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
    campioneCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg, padding: Spacing.lg,
      borderRadius: Radius.card, backgroundColor: '#16253A', borderWidth: 1, borderColor: 'rgba(255,175,0,0.35)',
    },
    campioneLabel: { color: 'rgba(255,255,255,0.6)', fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    campioneNome: { color: '#fff', fontSize: Font.h3, fontWeight: '800' },
    partRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    partNome: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    partNomeMio: { color: colors.gold, fontWeight: '800' },
    matchAmRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    matchAmSquadra: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    matchAmSquadraB: { textAlign: 'right' },
    matchAmVincitore: { fontWeight: '800', color: colors.gold },
    matchAmVs: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  });
}
