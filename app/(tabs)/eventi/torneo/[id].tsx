import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import { getTorneoDettaglio, getClassificaTorneo, getGiocatori, iscrivitiTorneo, pagaQuotaIscrizione, type DettaglioTorneo } from '../../../../lib/api';
import { avvisa } from '../../../../lib/avviso';
import { AppHeader } from '../../../../components/AppHeader';
import { Card, Muted, IconButton, Button } from '../../../../components/ui';
import {
  TabellaClassifica, Tabellone, RigaMatch, mappaNomiPartecipanti, etichettaTurno, calcolaClassificaBracket,
  ListaPartecipantiPerCategoria, ModaleCoppia, ModaleVotoPartita, type ColonnaTabellone, type MatchComune,
} from '../../../../components/campionatoTorneo';
import { useTheme } from '../../../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../../../constants/theme';
import type { RigaClassifica, Giocatore, TorneoRound, TorneoMatch } from '../../../../types/models';

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
  const [coppiaAperta, setCoppiaAperta] = useState(false);
  const [iscrivendo, setIscrivendo] = useState(false);
  // TorneoMatch, non il MatchComune più stretto del componente condiviso
  // (Tabellone/RigaMatch): qui serve team_a_ids/team_b_ids per il voto sui
  // match dell'americano/stars_of_the_court, che non hanno partecipante_a_id/
  // b_id (coppie effimere, vedi nomeSquadraAmericano sotto).
  const [votoMatch, setVotoMatch] = useState<TorneoMatch | null>(null);

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

  const mioPartecipante = useMemo(
    () => dettaglio?.partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id) ?? null,
    [dettaglio, me]
  );
  const mioPartecipanteId = mioPartecipante?.id ?? null;

  // Quota di iscrizione (fix utente esplicito, "il buco dei pagamenti":
  // prima era solo un numero mostrato, senza alcun modo di saldarla) —
  // pagabile con Stars Coin, stesso principio delle quote di prenotazione.
  const [pagandoQuota, setPagandoQuota] = useState(false);
  const mioPagamento = me && mioPartecipante ? mioPartecipante.pagamenti?.[me.id] : null;
  const pagaQuota = async () => {
    if (!me || !dettaglio || !mioPartecipante || !mioPagamento) return;
    setPagandoQuota(true);
    const res = await pagaQuotaIscrizione({
      tipo: 'torneo', partecipante: mioPartecipante, centroId: dettaglio.torneo.centro_id,
      giocatoreId: me.id, importo: mioPagamento.importo,
    });
    setPagandoQuota(false);
    if (res.ok) { avvisa('Pagamento registrato', 'Quota di iscrizione saldata.'); load(); }
    else avvisa('Errore', res.error ?? 'Pagamento non riuscito.');
  };

  // ISCRIVITI (fix utente esplicito, Eventi "Iscriviti": "il tasto
  // ISCRIVITI come prima cosa") — stessa scelta compagno degli altri
  // dettagli quando il formato è a coppie.
  const iscriviti = async (partnerId?: string) => {
    if (!me || !dettaglio) return;
    setIscrivendo(true);
    const res = await iscrivitiTorneo(dettaglio.torneo.id, me.id, dettaglio.torneo.sport, partnerId ?? null);
    setIscrivendo(false);
    setCoppiaAperta(false);
    if (res.ok) { avvisa('Iscrizione registrata', `Sei iscritto a "${dettaglio.torneo.nome}".`); load(); }
    else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };
  const avviaIscrizione = () => { if (dettaglio?.torneo.tipo_iscrizione === 'coppia') setCoppiaAperta(true); else iscriviti(); };

  const eEliminazione = dettaglio?.torneo.format_type === 'single_elimination';
  const eAmericano = dettaglio?.torneo.format_type === 'americano';
  const eSwiss = dettaglio?.torneo.format_type === 'swiss';
  const eStars = dettaglio?.torneo.format_type === 'stars_of_the_court';

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
  // Turni (Stars of the Court): round fase "stars_rotation" — un campo a
  // rotazione ("campo STARS", is_stars_court/stars_side sul match) è il
  // trono, gli altri sono normali; punteggio a game (games_a/b), non punti
  // (vedi services/torneo.py:sotc_generate_schedule/sotc_genera_turno_successivo).
  const roundStars = useMemo(() => sortByNumero<TorneoRound>(dettaglio?.round.filter((r) => r.fase === 'stars_rotation') ?? []), [dettaglio]);
  // Chi sono le STARS attuali e da quanti turni sono sul trono — stesso
  // calcolo del gestionale (src/routes/tornei/[id]/+page.svelte), i match
  // is_stars_court ordinati per numero turno decrescente.
  const matchStarsOrdinati = useMemo(() => {
    if (!dettaglio || !eStars) return [];
    const numeroDiRound = new Map(dettaglio.round.map((r) => [r.id, r.numero]));
    return dettaglio.match
      .filter((m) => m.is_stars_court)
      .map((m) => ({ m, numero: numeroDiRound.get(m.round_id) ?? 0 }))
      .sort((a, b) => b.numero - a.numero);
  }, [dettaglio, eStars]);
  const starsAttuali = useMemo(() => {
    const ultimo = matchStarsOrdinati[0]?.m;
    if (!ultimo) return null;
    return (ultimo.stars_side === 'a' ? ultimo.team_a_ids : ultimo.team_b_ids) ?? null;
  }, [matchStarsOrdinati]);
  const starsDaQuantiTurni = useMemo(() => {
    if (!starsAttuali) return 0;
    const chiave = [...starsAttuali].sort().join(',');
    let n = 0;
    for (const { m } of matchStarsOrdinati) {
      const ids = m.stars_side === 'a' ? m.team_a_ids : m.team_b_ids;
      if (!ids || [...ids].sort().join(',') !== chiave) break;
      n++;
    }
    return n;
  }, [matchStarsOrdinati, starsAttuali]);
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
  const iscrizioniAperte = torneo.stato === 'iscrizioni_aperte';
  const righePartecipanti = dettaglio.partecipanti.map((p) => ({ id: p.id, nome: nomeDi(p.id), ranking: p.ranking, mio: p.id === mioPartecipanteId }));

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

        {iscrizioniAperte && (
          <Card style={s.card}>
            <Text style={s.sezioneTitolo}>{torneo.nome}</Text>
            <Muted style={{ marginBottom: Spacing.md }}>
              {torneo.sport} · {torneo.divisione === 'misto' ? 'Misto' : torneo.divisione === 'maschile' ? 'Maschile' : 'Femminile'}
              {torneo.quota_iscrizione_a_giocatore ? ` · ${torneo.quota_iscrizione_a_giocatore}€` : ''}
            </Muted>
            {mioPartecipanteId ? (
              <View>
                <View style={s.iscritto}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><Text style={s.iscrittoText}>Sei iscritto</Text></View>
                {mioPagamento && !mioPagamento.pagato && (
                  <Button
                    title={pagandoQuota ? 'Pagamento…' : `Paga quota (${mioPagamento.importo}€) con Stars Coin`}
                    loading={pagandoQuota} onPress={pagaQuota} style={{ marginTop: Spacing.sm }}
                  />
                )}
              </View>
            ) : (
              <Button
                title={iscrivendo ? 'Iscrizione…' : torneo.tipo_iscrizione === 'coppia' ? 'Iscriviti in coppia' : 'Iscriviti'}
                loading={iscrivendo} onPress={avviaIscrizione}
              />
            )}
          </Card>
        )}

        {/* 1. Classifica + Tabellone (fix utente esplicito, Eventi "In
            corso": "prima cosa la classifica... e il tabellone dove
            previsto") — il Tabellone si è spostato qui da dopo i
            turni/giornate specifici del formato. */}
        <Text style={s.sezioneTitolo}>Classifica</Text>
        <Card style={s.card}>
          <TabellaClassifica righe={classifica} nomeDi={nomeDi} />
        </Card>

        {haTabellone && (
          <>
            <Text style={s.sezioneTitolo}>Tabellone{eSwiss ? ' finale' : ''}</Text>
            <Card style={s.card}>
              <Tabellone colonne={colonneTabellone} onMatchPress={(m) => setVotoMatch(m as TorneoMatch)} />
            </Card>
          </>
        )}

        {/* 2. Turni/giornate secondo il formato */}
        {!eEliminazione && !eAmericano && !eSwiss && !eStars && (
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
                    <RigaMatch key={m.id} match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} onPress={m.bye ? undefined : () => setVotoMatch(m)} />
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
                    <RigaMatch key={m.id} match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} onPress={m.bye ? undefined : () => setVotoMatch(m)} />
                  ))}
                </Card>
              );
            })}
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
                      <Pressable key={m.id} style={s.matchAmRiga} onPress={() => setVotoMatch(m)}>
                        <Text style={[s.matchAmSquadra, vinceA && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_a_ids)}</Text>
                        <Text style={s.matchAmVs}>{giocato ? `${m.punti_a}-${m.punti_b}` : 'vs'}</Text>
                        <Text style={[s.matchAmSquadra, s.matchAmSquadraB, vinceB && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_b_ids)}</Text>
                      </Pressable>
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

        {eStars && (
          <>
            <Text style={s.sezioneTitolo}>Turni</Text>
            {starsAttuali && (
              <Card style={[s.card, s.starsBanner]}>
                <Ionicons name="trophy" size={18} color={colors.gold} />
                <Text style={s.starsBannerTesto}>
                  STARS attuali: <Text style={{ fontWeight: '800' }}>{starsAttuali.map((pid) => nomeDi(pid)).join(' / ')}</Text> — sul trono da {starsDaQuantiTurni} {starsDaQuantiTurni === 1 ? 'turno' : 'turni'}
                </Text>
              </Card>
            )}
            {roundStars.length === 0 ? (
              <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Calendario non ancora generato.</Muted></Card>
            ) : roundStars.map((r) => {
              const match = dettaglio.match.filter((m) => m.round_id === r.id);
              if (match.length === 0) return null;
              return (
                <Card key={r.id} style={s.card}>
                  <Text style={s.giornataTitolo}>Turno {r.numero}</Text>
                  {match.map((m) => {
                    const giocato = m.stato === 'giocato';
                    const vinceA = giocato && (m.games_a ?? 0) > (m.games_b ?? 0);
                    const vinceB = giocato && (m.games_b ?? 0) > (m.games_a ?? 0);
                    return (
                      <Pressable key={m.id} onPress={() => setVotoMatch(m)}>
                        {m.is_stars_court && <Text style={s.starsCampoLabel}>👑 Campo STARS</Text>}
                        <View style={s.matchAmRiga}>
                          <Text style={[s.matchAmSquadra, vinceA && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_a_ids)}</Text>
                          <Text style={s.matchAmVs}>{giocato ? `${m.games_a}-${m.games_b}` : 'vs'}</Text>
                          <Text style={[s.matchAmSquadra, s.matchAmSquadraB, vinceB && s.matchAmVincitore]} numberOfLines={2}>{nomeSquadraAmericano(m.team_b_ids)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              );
            })}
          </>
        )}

        {/* 3. Partecipanti, divisi per categoria di ranking (fix utente
            esplicito, "Iscriviti": "elenco partecipanti diviso per
            categorie con ranking visibile") */}
        <Text style={s.sezioneTitolo}>Partecipanti ({dettaglio.partecipanti.length})</Text>
        <Card style={s.card}>
          <ListaPartecipantiPerCategoria righe={righePartecipanti} />
        </Card>

        <View style={{ height: 20 }} />
      </ScrollView>

      {coppiaAperta && me && (
        <ModaleCoppia
          titolo={torneo.nome} sottotitolo="formato a coppie" meId={me.id}
          onChiudi={() => setCoppiaAperta(false)}
          onConferma={(partnerId) => iscriviti(partnerId)}
        />
      )}
      {votoMatch && (
        <ModaleVotoPartita
          match={votoMatch} tipoMatch="torneo" meId={me?.id}
          nomeA={votoMatch.team_a_ids ? nomeSquadraAmericano(votoMatch.team_a_ids) : nomeDi(votoMatch.partecipante_a_id)}
          nomeB={votoMatch.team_b_ids ? nomeSquadraAmericano(votoMatch.team_b_ids) : nomeDi(votoMatch.partecipante_b_id)}
          onChiudi={() => setVotoMatch(null)}
        />
      )}
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
    iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm },
    iscrittoText: { color: colors.green, fontWeight: '700' },
    matchAmRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    matchAmSquadra: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    matchAmSquadraB: { textAlign: 'right' },
    matchAmVincitore: { fontWeight: '800', color: colors.gold },
    matchAmVs: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', minWidth: 40, textAlign: 'center' },
    starsBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,175,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,175,0,0.35)' },
    starsBannerTesto: { flex: 1, color: colors.navyDeep, fontSize: Font.small },
    starsCampoLabel: { color: colors.gold, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  });
}
