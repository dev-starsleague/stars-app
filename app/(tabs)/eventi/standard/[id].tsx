// Campionato creato dal gestionale, in fase di iscrizione (EventoStandard
// round_robin): alla chiusura il centro lo divide per categoria nei
// Campionati veri (app/(tabs)/eventi/campionato/[id].tsx). Ci si iscrive in
// coppia o da soli (fix utente esplicito: "dai la possibilità di iscrivere
// i giocatori singolarmente, sia da gestionale che da app"); a chi è da
// solo il centro propone un compagno e qui si conferma o si rifiuta (fix
// utente esplicito: "i giocatori che avranno l'app riceveranno una notifica
// in merito con richiesta di creazione coppia").
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../../lib/auth';
import {
  getEventoStandardDettaglio, getGiocatori, iscrivitiEventoStandard, rispondiPropostaCoppia, ritiratiDaEventoStandard,
  aggiornaDisponibilitaIscrizione,
  type EventoStandard, type EventoStandardPartecipante,
} from '../../../../lib/api';
import { avvisa } from '../../../../lib/avviso';
import { statoIscrizioni, ETICHETTA_STATO_ISCRIZIONI } from '../../../../lib/stars';
import { contaGiorniUtili, giorniMinimi, intersezione } from '../../../../lib/disponibilita';
import { AppHeader } from '../../../../components/AppHeader';
import { AvvisoDisponibilita } from '../../../../components/AvvisoDisponibilita';
import { RiepilogoCampionato } from '../../../../components/RiepilogoCampionato';
import { WelcomeKitCard } from '../../../../components/WelcomeKitCard';
import { DisponibilitaIscrizione } from '../../../../components/DisponibilitaIscrizione';
import { Card, Muted, IconButton, Button } from '../../../../components/ui';
import { ListaPartecipantiPerCategoria, ModaleCoppia } from '../../../../components/campionatoTorneo';
import { useTheme } from '../../../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../../../constants/theme';
import type { Giocatore } from '../../../../types/models';

export default function CampionatoInIscrizione() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [evento, setEvento] = useState<EventoStandard | null>(null);
  const [partecipanti, setPartecipanti] = useState<EventoStandardPartecipante[]>([]);
  const [giocatoriMap, setGiocatoriMap] = useState<Map<string, Giocatore>>(new Map());
  const [caricando, setCaricando] = useState(true);
  const [coppiaAperta, setCoppiaAperta] = useState(false);
  const [operazione, setOperazione] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setCaricando(true);
    const [dett, giocatori] = await Promise.all([getEventoStandardDettaglio(id), getGiocatori()]);
    setGiocatoriMap(new Map(giocatori.map((g) => [g.id, g])));
    setEvento(dett?.evento ?? null);
    setPartecipanti(dett?.partecipanti ?? []);
    setCaricando(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nome = useCallback((gid?: string | null) => {
    const g = gid ? giocatoriMap.get(gid) : undefined;
    return g ? `${g.nome} ${g.cognome}`.trim() : '—';
  }, [giocatoriMap]);

  const mio = useMemo(
    () => partecipanti.find((p) => p.giocatore_1_id === me?.id || p.giocatore_2_id === me?.id) ?? null,
    [partecipanti, me]
  );

  if (caricando || !evento) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AppHeader />
        <View style={s.topbar}><IconButton icon="chevron-back" onPress={() => router.back()} /><Text style={s.title}>Campionato</Text><View style={{ width: 38 }} /></View>
        <Muted style={{ textAlign: 'center', marginTop: Spacing.xxl }}>{caricando ? 'Caricamento…' : 'Campionato non trovato.'}</Muted>
      </SafeAreaView>
    );
  }

  const coppia = evento.tipo_iscrizione === 'coppia';
  const minimo = giorniMinimi(evento.format_config);
  const mieiGiorni = contaGiorniUtili(me?.disponibilita_oraria);
  const iscritti = partecipanti.filter((p) => p.stato === 'iscritto');
  const singoli = partecipanti.filter((p) => p.stato === 'incompleta');
  const stato = evento.stato === 'iscrizioni_aperte'
    ? statoIscrizioni(evento.apertura_iscrizioni_at, evento.chiusura_iscrizioni_at, iscritti.length, null)
    : 'chiuso';
  const coloreStato = stato === 'aperte' ? colors.green : stato === 'in_arrivo' ? colors.amber : colors.red;
  const proposta = mio?.proposta_coppia ?? null;
  const miaRisposta = proposta && me ? proposta.risposte[me.id] : null;

  const iscriviti = async (partnerId: string | null) => {
    if (!me) return;
    const partner = partnerId ? giocatoriMap.get(partnerId) : null;
    const disponibilita = intersezione(me.disponibilita_oraria, partner?.disponibilita_oraria);
    // non blocca: va completata entro l'inizio (promemoria ogni giorno)
    const mancaDisp = contaGiorniUtili(disponibilita) < minimo;
    setOperazione(true);
    const res = await iscrivitiEventoStandard(evento, me.id, partnerId, disponibilita);
    setOperazione(false);
    setCoppiaAperta(false);
    if (res.ok) {
      avvisa('Iscrizione registrata', (partnerId
        ? `Sei iscritto a "${evento.nome}" con ${nome(partnerId)}.`
        : `Sei iscritto a "${evento.nome}" da solo: il centro ti proporrà un compagno e riceverai una notifica per confermarlo.`)
        + (mancaDisp ? `\n\nRicordati di completare la disponibilità (${minimo} giorni a settimana) prima dell'inizio.` : ''));
      load();
    } else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  const rispondi = async (accetta: boolean) => {
    if (!me || !mio) return;
    setOperazione(true);
    const res = await rispondiPropostaCoppia(mio.id, me.id, accetta);
    setOperazione(false);
    if (!res.ok) { avvisa('Errore', res.error ?? 'Operazione non riuscita.'); return; }
    if (!accetta) avvisa('Proposta rifiutata', 'Il centro ti cercherà un altro compagno.');
    else if (res.esito === 'coppia_creata') avvisa('Coppia formata', `Giochi con ${nome(proposta?.compagno_id)}.`);
    else avvisa('Confermato', `Aspettiamo la conferma di ${nome(proposta?.compagno_id)}.`);
    load();
  };

  const ritirati = async () => {
    if (!mio) return;
    setOperazione(true);
    const res = await ritiratiDaEventoStandard(mio.id);
    setOperazione(false);
    if (res.ok) load(); else avvisa('Errore', res.error ?? 'Operazione non riuscita.');
  };

  const righe = [
    ...iscritti.map((p) => ({
      id: p.id, nome: p.giocatore_2_id ? `${nome(p.giocatore_1_id)} / ${nome(p.giocatore_2_id)}` : nome(p.giocatore_1_id),
      ranking: p.ranking, mio: p.id === mio?.id,
    })),
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title} numberOfLines={1}>{evento.nome}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* proposta di coppia da confermare: per prima, è un'azione */}
        {proposta && miaRisposta === 'attesa' && (
          <Card style={[s.card, s.cardProposta]}>
            <View style={s.rigaIcona}>
              <Ionicons name="people" size={20} color={colors.gold} />
              <Text style={s.sezioneTitolo}>Ti abbiamo trovato un compagno</Text>
            </View>
            <Muted style={{ marginBottom: Spacing.md }}>
              Il centro ti propone di giocare in coppia con {nome(proposta.compagno_id)}. Confermi?
            </Muted>
            <Button title="Accetta" loading={operazione} onPress={() => rispondi(true)} />
            <Button title="Rifiuta" variant="ghost" disabled={operazione} onPress={() => rispondi(false)} style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {mio && (
          <DisponibilitaIscrizione
            attuale={mio.disponibilita} minimo={minimo} inizio={evento.inizio_at} mia={me?.disponibilita_oraria}
            compagno={mio.giocatore_2_id ? giocatoriMap.get(mio.giocatore_1_id === me?.id ? mio.giocatore_2_id : mio.giocatore_1_id)?.disponibilita_oraria ?? null : undefined}
            nomeCompagno={mio.giocatore_2_id ? nome(mio.giocatore_1_id === me?.id ? mio.giocatore_2_id : mio.giocatore_1_id) : undefined}
            onInvia={async (d) => { const r = await aggiornaDisponibilitaIscrizione('standard', mio.id, d); if (r.ok) load(); return r; }}
          />
        )}

        <Card style={s.card}>
          <View style={s.recapTestata}>
            <Text style={s.sezioneTitolo}>{evento.nome}</Text>
            <View style={[s.pill, { backgroundColor: coloreStato + '22' }]}>
              <Text style={[s.pillText, { color: coloreStato }]}>{ETICHETTA_STATO_ISCRIZIONI[stato]}</Text>
            </View>
          </View>
          <Muted style={{ marginBottom: 4 }}>
            {evento.sport} · Campionato {coppia ? 'a coppie' : 'singolo'} · {evento.categorie_ammesse?.length ? evento.categorie_ammesse.join(', ') : 'tutte le categorie'}
          </Muted>
          {evento.chiusura_iscrizioni_at && <Muted style={{ marginBottom: 4 }}>Iscrizioni fino al {formattaData(evento.chiusura_iscrizioni_at)}</Muted>}
          {evento.inizio_at && <Muted style={{ marginBottom: 4 }}>Inizio: {formattaData(evento.inizio_at)}</Muted>}
          <Muted style={{ marginBottom: Spacing.md }}>
            {evento.quota_iscrizione_a_giocatore ? `${evento.quota_iscrizione_a_giocatore}€ a giocatore` : 'Iscrizione gratuita'}{evento.quota_include_campo ? ' · campo incluso' : ' · campo a parte'}
          </Muted>

          {mio ? (
            mio.stato === 'iscritto' ? (
              <View style={s.iscritto}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                <Text style={s.iscrittoText}>{mio.giocatore_2_id ? `Sei iscritto con ${nome(mio.giocatore_1_id === me?.id ? mio.giocatore_2_id : mio.giocatore_1_id)}` : 'Sei iscritto'}</Text>
              </View>
            ) : (
              <View>
                <View style={s.iscritto}>
                  <Ionicons name={proposta ? 'hourglass' : 'person'} size={18} color={colors.amber} />
                  <Text style={[s.iscrittoText, { color: colors.navyDeep }]}>
                    {proposta
                      ? miaRisposta === 'confermata' ? `Hai confermato: aspettiamo ${nome(proposta.compagno_id)}` : 'Proposta di coppia da confermare'
                      : 'Iscritto da solo: il centro ti sta cercando un compagno'}
                  </Text>
                </View>
                {evento.stato === 'iscrizioni_aperte' && !proposta && (
                  <Button title="Ritira l'iscrizione" variant="ghost" disabled={operazione} onPress={ritirati} style={{ marginTop: Spacing.sm }} />
                )}
              </View>
            )
          ) : stato === 'aperte' && (
            <View>
              <Muted style={{ marginBottom: Spacing.xs }}>
                Disponibilità richiesta: almeno {minimo} giorni a settimana con almeno un orario di inizio partita. Tu ne hai {mieiGiorni}.
              </Muted>
              <AvvisoDisponibilita giorni={mieiGiorni} />
              {coppia ? (
                <>
                  <Button title="Iscriviti in coppia" loading={operazione} onPress={() => setCoppiaAperta(true)} style={{ marginTop: Spacing.md }} />
                  <Button title="Iscriviti da solo" variant="ghost" disabled={operazione} onPress={() => iscriviti(null)} style={{ marginTop: Spacing.sm }} />
                  <Muted style={{ marginTop: Spacing.xs, textAlign: 'center' }}>Da solo: il centro ti propone un compagno e tu confermi qui.</Muted>
                </>
              ) : (
                <Button title="Iscriviti" loading={operazione} onPress={() => iscriviti(null)} style={{ marginTop: Spacing.md }} />
              )}
              <Button title="Modifica disponibilità" variant="ghost" onPress={() => router.push('/modifica-profilo')} style={{ marginTop: Spacing.sm }} />
            </View>
          )}
        </Card>

        {evento.format_type === 'round_robin' && (
          <>
            <Text style={s.sezioneTitolo}>Come funziona</Text>
            <Card style={s.card}>
              <RiepilogoCampionato formatConfig={evento.format_config} premio={evento.premio} inizio={evento.inizio_at} />
            </Card>
          </>
        )}

        {evento.format_type === 'round_robin' && (
          <WelcomeKitCard tipo="standard" id={evento.id} giocatoreId={me?.id} iscritto={!!mio} />
        )}

        <Text style={s.sezioneTitolo}>{coppia ? 'Coppie' : 'Iscritti'} ({iscritti.length})</Text>
        <Card style={s.card}>
          <ListaPartecipantiPerCategoria righe={righe} />
        </Card>
        {coppia && singoli.length > 0 && (
          <>
            <Text style={s.sezioneTitolo}>Senza compagno ({singoli.length})</Text>
            <Card style={s.card}>
              {singoli.map((p) => (
                <Text key={p.id} style={[s.singolo, p.id === mio?.id && { fontWeight: '800' }]}>
                  {nome(p.giocatore_1_id)}{p.proposta_coppia ? ' · coppia in formazione' : ''}
                </Text>
              ))}
            </Card>
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {coppiaAperta && me && (
        <ModaleCoppia
          titolo={evento.nome} sottotitolo="campionato a coppie" meId={me.id} obbligaCoppia
          onChiudi={() => setCoppiaAperta(false)}
          onConferma={(partnerId) => partnerId && iscriviti(partnerId)}
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
    cardProposta: { borderWidth: 2, borderColor: colors.gold },
    rigaIcona: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sezioneTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
    recapTestata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm },
    iscrittoText: { color: colors.green, fontWeight: '700', flexShrink: 1 },
    singolo: { color: colors.navyDeep, fontSize: Font.body, paddingVertical: 4 },
  });
}
