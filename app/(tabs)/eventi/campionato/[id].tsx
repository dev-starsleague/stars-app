import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import { aggiornaDisponibilitaIscrizione, getCampionatoDettaglio, getClassificaGirone, getGiocatori, iscrivitiCampionato, pagaQuotaIscrizione, type DettaglioCampionato } from '../../../../lib/api';
import { avvisa } from '../../../../lib/avviso';
import { AppHeader } from '../../../../components/AppHeader';
import { AvvisoDisponibilita } from '../../../../components/AvvisoDisponibilita';
import { DisponibilitaIscrizione } from '../../../../components/DisponibilitaIscrizione';
import { RiepilogoCampionato } from '../../../../components/RiepilogoCampionato';
import { WelcomeKitCard } from '../../../../components/WelcomeKitCard';
import { contaGiorniUtili, giorniMinimi } from '../../../../lib/disponibilita';
import { Card, Muted, IconButton, Segmented, Button } from '../../../../components/ui';
import {
  TabellaClassifica, Tabellone, RigaMatch, mappaNomiPartecipanti, etichettaTurno,
  ListaPartecipantiPerCategoria, ModaleCoppia, ModaleVotoPartita, type ColonnaTabellone, type MatchComune,
} from '../../../../components/campionatoTorneo';
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
  const [coppiaAperta, setCoppiaAperta] = useState(false);
  const [iscrivendo, setIscrivendo] = useState(false);
  const [votoMatch, setVotoMatch] = useState<MatchComune | null>(null);

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

  const mioPartecipante = useMemo(
    () => dettaglio?.partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id) ?? null,
    [dettaglio, me]
  );
  const mioPartecipanteId = mioPartecipante?.id ?? null;

  // Quota di iscrizione (fix utente esplicito, "il buco dei pagamenti") —
  // stesso principio del dettaglio torneo.
  const [pagandoQuota, setPagandoQuota] = useState(false);
  const mioPagamento = me && mioPartecipante ? mioPartecipante.pagamenti?.[me.id] : null;
  const pagaQuota = async () => {
    if (!me || !dettaglio || !mioPartecipante || !mioPagamento) return;
    setPagandoQuota(true);
    const res = await pagaQuotaIscrizione({
      tipo: 'campionato', partecipante: mioPartecipante, centroId: dettaglio.campionato.centro_id,
      giocatoreId: me.id, importo: mioPagamento.importo,
    });
    setPagandoQuota(false);
    if (res.ok) { avvisa('Pagamento registrato', 'Quota di iscrizione saldata.'); load(); }
    else avvisa('Errore', res.error ?? 'Pagamento non riuscito.');
  };

  // ISCRIVITI (fix utente esplicito, Eventi "Iscriviti": "il tasto
  // ISCRIVITI come prima cosa") — solo mentre le iscrizioni sono aperte;
  // a coppie passa dalla stessa scelta compagno degli altri due dettagli.
  const iscriviti = async (partnerId?: string) => {
    if (!me || !dettaglio) return;
    setIscrivendo(true);
    const res = await iscrivitiCampionato(dettaglio.campionato.id, me.id, dettaglio.campionato.sport, partnerId ?? null);
    setIscrivendo(false);
    setCoppiaAperta(false);
    if (res.ok) { avvisa('Iscrizione registrata', `Sei iscritto a "${dettaglio.campionato.nome}".`); load(); }
    else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };
  const avviaIscrizione = () => { if (dettaglio?.campionato.tipo_iscrizione === 'coppia') setCoppiaAperta(true); else iscriviti(); };

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

  // Fallen Stars: tabellone di consolazione della metà inferiore
  // (giornate fase "fallen"), stesso disegno dei playoff.
  const giornateFallen = useMemo(() => sortByNumero<CampionatoGiornata>(dettaglio?.giornate.filter((g) => g.fase === 'fallen') ?? []), [dettaglio]);
  const colonneFallen: ColonnaTabellone[] = useMemo(() => {
    if (!dettaglio) return [];
    return giornateFallen.map((g) => ({
      titolo: etichettaTurno(g.numero, giornateFallen.length),
      match: dettaglio.match.filter((m) => m.giornata_id === g.id),
      nomeA: nomeDi, nomeB: nomeDi,
    }));
  }, [dettaglio, giornateFallen, nomeDi]);
  const vincitoreFallenId = useMemo(() => {
    if (giornateFallen.length === 0 || !dettaglio) return null;
    const finale = giornateFallen[giornateFallen.length - 1];
    const m = dettaglio.match.find((x) => x.giornata_id === finale.id && !x.bye);
    return m && (m.stato === 'giocato' || m.stato === 'forfait') ? m.vincitore_id : null;
  }, [giornateFallen, dettaglio]);
  const risingMeta = !!(dettaglio?.campionato.format_config as any)?.playoff?.meta;

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
  // Iscrizioni ancora aperte: si mostra recap + ISCRIVITI (fix utente
  // esplicito, "Iscriviti") — non ha ancora senso mostrare classifica/
  // tabellone/giornate, niente è ancora cominciato. Chiuse o in corso: la
  // vista "In corso" (classifica+tabellone, poi giornate).
  const iscrizioniAperte = campionato.stato === 'iscrizioni_aperte';
  const calendarioPubblicato = ['in_corso', 'concluso'].includes(campionato.stato);
  const righePartecipanti = dettaglio.partecipanti.map((p) => ({ id: p.id, nome: nomeDi(p.id), ranking: p.ranking, mio: p.id === mioPartecipanteId }));

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
        {vincitoreFallenId && (
          <View style={[s.campioneCard, s.fallenCard]}>
            <Ionicons name="medal" size={24} color={colors.goldSoft} />
            <View style={{ flex: 1 }}>
              <Text style={s.campioneLabel}>Vincitore Playoff Fallen Stars</Text>
              <Text style={s.campioneNome}>{nomeDi(vincitoreFallenId)}</Text>
            </View>
          </View>
        )}

        {/* disponibilità ancora da inserire, finché il campionato non è
            iniziato (promemoria giornaliero, fix utente esplicito) */}
        {mioPartecipante && campionato.sport !== 'Calcio' && !['in_corso', 'concluso'].includes(campionato.stato) && (
          <DisponibilitaIscrizione
            attuale={mioPartecipante.disponibilita} minimo={giorniMinimi(campionato.format_config)} inizio={campionato.inizio_evento_at}
            mia={me?.disponibilita_oraria}
            compagno={mioPartecipante.giocatore_2_id ? giocatoriMap.get(mioPartecipante.giocatore_1_id === me?.id ? mioPartecipante.giocatore_2_id : mioPartecipante.giocatore_1_id)?.disponibilita_oraria ?? null : undefined}
            onInvia={async (d) => { const r = await aggiornaDisponibilitaIscrizione('campionato', mioPartecipante.id, d); if (r.ok) load(); return r; }}
          />
        )}

        {iscrizioniAperte && (
          <Card style={s.card}>
            <Text style={s.sezioneTitolo}>{campionato.nome}</Text>
            <Muted style={{ marginBottom: Spacing.md }}>
              {campionato.sport} · {campionato.divisione === 'misto' ? 'Misto' : campionato.divisione === 'maschile' ? 'Maschile' : 'Femminile'}
              {campionato.quota_iscrizione_a_giocatore ? ` · ${campionato.quota_iscrizione_a_giocatore}€` : ''}
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
              <View>
                {/* disponibilità del profilo: il campionato chiede N giorni a
                    settimana (scelti dal centro); con 1 o 2 giorni avviso
                    rosso/giallo (fix utente esplicito) */}
                <Muted style={{ marginBottom: Spacing.xs }}>
                  Disponibilità richiesta: almeno {giorniMinimi(campionato.format_config)} giorni a settimana con almeno un orario di inizio partita. Tu ne hai {contaGiorniUtili(me?.disponibilita_oraria)}.
                </Muted>
                <AvvisoDisponibilita giorni={contaGiorniUtili(me?.disponibilita_oraria)} />
                <Button
                  title={iscrivendo ? 'Iscrizione…' : campionato.tipo_iscrizione === 'coppia' ? 'Iscriviti in coppia' : 'Iscriviti'}
                  loading={iscrivendo} onPress={avviaIscrizione} style={{ marginTop: Spacing.md }}
                />
                <Button title="Modifica disponibilità" variant="ghost" onPress={() => router.push('/modifica-profilo')} style={{ marginTop: Spacing.sm }} />
              </View>
            )}
          </Card>
        )}

        <Text style={s.sezioneTitolo}>Come funziona</Text>
        <Card style={s.card}>
          <RiepilogoCampionato formatConfig={campionato.format_config} premio={campionato.premio} inizio={campionato.inizio_evento_at} />
        </Card>

        <WelcomeKitCard tipo="campionato" id={campionato.id} giocatoreId={me?.id} iscritto={!!mioPartecipante} />

        {/* 1. Classifica + Tabellone (fix utente esplicito, Eventi "In
            corso": "prima cosa la classifica dove prevista e il tabellone
            dove previsto") */}
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

        {colonnePlayoff.length > 0 && (
          <>
            <Text style={s.sezioneTitolo}>{risingMeta ? 'Playoff Rising Stars' : 'Playoff'}</Text>
            <Card style={s.card}>
              <Tabellone colonne={colonnePlayoff} onMatchPress={setVotoMatch} />
            </Card>
          </>
        )}
        {colonneFallen.length > 0 && (
          <>
            <Text style={s.sezioneTitolo}>Playoff Fallen Stars</Text>
            <Card style={s.card}>
              <Tabellone colonne={colonneFallen} onMatchPress={setVotoMatch} />
            </Card>
          </>
        )}

        {/* 2. Giornate */}
        <Text style={s.sezioneTitolo}>Giornate</Text>
        {/* il centro verifica il calendario prima di pubblicarlo: i
            giocatori lo vedono solo a campionato avviato (fix utente
            esplicito) */}
        {!calendarioPubblicato || giornateGironi.length === 0 ? (
          <Card style={s.card}><Muted style={{ textAlign: 'center' }}>Il calendario verrà generato automaticamente in base alle disponibilità dei giocatori. Lo vedrai qui quando il centro lo pubblica.</Muted></Card>
        ) : giornateGironi.map((g) => {
          const match = dettaglio.match.filter((m) => m.giornata_id === g.id);
          if (match.length === 0) return null;
          return (
            <Card key={g.id} style={s.card}>
              <Text style={s.giornataTitolo}>Giornata {g.numero}</Text>
              {match.map((m) => (
                <View key={m.id}>
                  {gironi.length > 1 && <Muted style={s.gironeTag}>{nomeGirone(m.girone_id)}</Muted>}
                  <RigaMatch match={m} nomeA={nomeDi(m.partecipante_a_id)} nomeB={nomeDi(m.partecipante_b_id)} onPress={m.bye ? undefined : () => setVotoMatch(m)} />
                </View>
              ))}
            </Card>
          );
        })}

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
          titolo={campionato.nome} sottotitolo="formato a coppie" meId={me.id}
          onChiudi={() => setCoppiaAperta(false)}
          onConferma={(partnerId) => iscriviti(partnerId)}
        />
      )}
      {votoMatch && (
        <ModaleVotoPartita
          match={votoMatch} tipoMatch="campionato" meId={me?.id}
          nomeA={nomeDi(votoMatch.partecipante_a_id)} nomeB={nomeDi(votoMatch.partecipante_b_id)}
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
    gironeTag: { fontSize: Font.tiny, marginTop: 6 },
    campioneCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg, padding: Spacing.lg,
      borderRadius: Radius.card, backgroundColor: '#16253A', borderWidth: 1, borderColor: 'rgba(255,175,0,0.35)',
    },
    campioneLabel: { color: 'rgba(255,255,255,0.6)', fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    campioneNome: { color: '#fff', fontSize: Font.h3, fontWeight: '800' },
    fallenCard: { borderColor: 'rgba(255,201,77,0.25)' },
    iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm },
    iscrittoText: { color: colors.green, fontWeight: '700' },
  });
}
