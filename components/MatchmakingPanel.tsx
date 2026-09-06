// Contenuto del pop-up del tasto centrale stella (vedi app/(tabs)/_layout.tsx,
// dentro popupBoxInner) — matchmaking automatico: analizza ranking/
// preferenze/orari del giocatore, cerca partite già reali nel sistema (in
// attesa o confermate ma incomplete, GET /matchmaking/cerca) e le mostra
// ordinate per compatibilità. Il giocatore può unirsi a una di queste, o
// entrare in lista d'attesa presso un centro (scelto tra i preferiti se ce
// n'è più di uno). Tutti i dati sono reali — nessun dato inventato qui.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useSport } from '../lib/sport';
import { avvisa } from '../lib/avviso';
import { cercaMatchmaking, entraInMatch, entraInAttesa, centriPreferiti, getCentri } from '../lib/api';
import { Avatar, Chip, Input } from './ui';
import { Spacing, Radius, Font, type AppColors } from '../constants/theme';
import type { OpportunitaMatchmaking, Centro, GiocatoreMinimo, PreferenzaAttesa } from '../types/models';

// Stessa identica card SlotGiocatore/SlotVuoto di Prenota → Invita
// giocatori (fix utente esplicito: "vorrei che si vedessero meglio i
// giocatori, devono vedersi come quando prenoti un campo") — avatar
// squircle, nome, ranking + badge DX/SX, riquadro tratteggiato per i posti
// ancora liberi. Ricostruita qui in piccolo (non importata da prenota.tsx:
// lì lavora su un intero Giocatore già caricato, qui su un GiocatoreMinimo
// via API) ma con lo stesso linguaggio visivo.
function SlotMini({ giocatore, colors }: { giocatore: GiocatoreMinimo; colors: AppColors }) {
  const mostraBadge = giocatore.ranking != null || (giocatore.posizione && giocatore.posizione !== 'entrambe');
  return (
    <View style={[styles.slotMini, { backgroundColor: colors.bg, borderColor: colors.navyLine + '30' }]}>
      <Avatar name={`${giocatore.nome} ${giocatore.cognome}`} size={38} uri={giocatore.avatar_url} genere={giocatore.genere} squircle />
      <Text style={[styles.slotMiniNome, { color: colors.navyDeep }]} numberOfLines={1}>{giocatore.nome}</Text>
      {mostraBadge && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {giocatore.ranking != null && <Text style={[styles.slotMiniRanking, { color: colors.slate }]}>{giocatore.ranking.toFixed(2)}</Text>}
          {giocatore.posizione && giocatore.posizione !== 'entrambe' && (
            <Text style={[styles.slotMiniPosizione, { color: colors.gold, backgroundColor: colors.gold + '18' }]}>
              {giocatore.posizione === 'destra' ? 'DX' : 'SX'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function SlotMiniVuoto({ colors }: { colors: AppColors }) {
  return (
    <View style={[styles.slotMini, styles.slotMiniVuoto, { borderColor: colors.navyLine + '30' }]}>
      <Ionicons name="person-add-outline" size={18} color={colors.slate} />
    </View>
  );
}

// Le 8 fasi di analisi (fix utente esplicito, elenco testuale) — puramente
// presentazionale: la vera ricerca (cercaMatchmaking) parte in parallelo,
// non aspetta che l'animazione arrivi in fondo.
const FASI_ANALISI = [
  'Analizzo il tuo ranking',
  'Analizzo le tue preferenze di gioco',
  'Analizzo i tuoi orari di gioco',
  'Cerco giocatori compatibili',
  'Controllo la disponibilità dei campi',
  'Verifico le partite in attesa',
  'Verifico le partite incomplete',
  'Ordino i risultati per compatibilità',
];

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

// Stessa forma breve di GIORNI_APP nel backend (app/services/matchmaking.py)
// e di GIORNI in app/(tabs)/modifica-profilo.tsx — usata per la preferenza
// di giorno scelta entrando in lista d'attesa (fix utente esplicito: "devo
// poter decidere una preferenza di giorno ed ora").
const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function etichettaData(data: string | null, inizio: string | null, fine: string | null): string {
  if (!data) return 'In attesa di abbinamento';
  const d = new Date(`${data}T00:00:00`);
  const giorno = GIORNI[d.getDay()];
  const gg = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const orario = inizio && fine ? ` · ${inizio.slice(0, 5)}–${fine.slice(0, 5)}` : '';
  return `${giorno} ${gg}/${mm}${orario}`;
}

export function MatchmakingPanel({ visibile, onChiudi }: { visibile: boolean; onChiudi: () => void }) {
  const { colors, glass, scheme } = useTheme();
  const { me } = useAuth();
  const { sportAttivo } = useSport();
  const [fase, setFase] = useState<'analisi' | 'risultati' | 'preferenza' | 'centro'>('analisi');
  const [opportunita, setOpportunita] = useState<OpportunitaMatchmaking[]>([]);
  const [centriScelta, setCentriScelta] = useState<Centro[]>([]);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);
  // Preferenza di giorno/ora per la lista d'attesa (fix utente esplicito:
  // "devo poter decidere una preferenza di giorno ed ora") — tutta
  // facoltativa, puramente informativa per lo staff del gestionale.
  const [prefGiorno, setPrefGiorno] = useState<string | null>(null);
  const [prefInizio, setPrefInizio] = useState('');
  const [prefFine, setPrefFine] = useState('');
  const stepAnim = useRef(FASI_ANALISI.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visibile || !me) return;
    setFase('analisi');
    setOpportunita([]);
    setPrefGiorno(null);
    setPrefInizio('');
    setPrefFine('');
    stepAnim.forEach((v) => v.setValue(0));

    const animazione = new Promise<void>((resolve) => {
      Animated.stagger(
        160,
        stepAnim.map((v) => Animated.timing(v, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }))
      ).start(() => resolve());
    });
    const ricerca = cercaMatchmaking(me.id, sportAttivo).then(setOpportunita);

    Promise.all([animazione, ricerca]).then(() => setFase('risultati'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibile]);

  if (!me) return null;

  const partecipa = async (opp: OpportunitaMatchmaking) => {
    setAzioneInCorso(opp.prenotazione_id);
    const res = await entraInMatch(opp, me.id);
    setAzioneInCorso(null);
    if (res.ok) {
      onChiudi();
      avvisa('Fatto!', 'Ti sei unito alla partita.');
    } else {
      avvisa('Non è stato possibile unirsi', res.error);
    }
  };

  const entraAttesaSuCentro = async (centroId: string) => {
    setAzioneInCorso('attesa');
    const preferenza: PreferenzaAttesa | null =
      prefGiorno || prefInizio.trim() || prefFine.trim()
        ? { giorno: prefGiorno, inizio: prefInizio.trim() || null, fine: prefFine.trim() || null }
        : null;
    const res = await entraInAttesa({ giocatoreId: me.id, centroId, sport: sportAttivo, preferenza });
    setAzioneInCorso(null);
    if (res.ok) {
      onChiudi();
      avvisa('Sei in lista d’attesa', 'Ti avviseremo quando troviamo un abbinamento.');
    } else {
      avvisa('Non è stato possibile entrare in lista d’attesa', res.error);
    }
  };

  // Step 1: chiede la preferenza di giorno/ora (fix utente esplicito) prima
  // di procedere alla scelta del centro (se ce n'è più di uno preferito) o
  // di inviare direttamente la richiesta.
  const apriPreferenza = () => setFase('preferenza');

  const confermaPreferenza = async () => {
    const preferiti = centriPreferiti(me);
    if (preferiti.size >= 2) {
      const tutti = await getCentri();
      setCentriScelta(tutti.filter((c) => preferiti.has(c.id)));
      setFase('centro');
      return;
    }
    if (preferiti.size === 1) {
      await entraAttesaSuCentro([...preferiti][0]);
      return;
    }
    // nessun centro preferito impostato: fallback al primo centro reale
    // disponibile (in pratica, oggi, l'unico centro del sistema).
    const tutti = await getCentri();
    if (tutti[0]) await entraAttesaSuCentro(tutti[0].id);
  };

  return (
    <View style={styles.radice}>
      <Text style={[styles.titolo, { color: colors.labelPrimary }]}>Matchmaking</Text>
      <Text style={[styles.sottotitolo, { color: colors.labelSecondary }]}>{sportAttivo}</Text>

      {fase === 'analisi' && (
        <View style={styles.listaFasi}>
          {FASI_ANALISI.map((testo, i) => (
            <Animated.View
              key={testo}
              style={[
                styles.rigaFase,
                { opacity: stepAnim[i], transform: [{ translateX: stepAnim[i].interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
              ]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
              <Text style={[styles.testoFase, { color: colors.labelPrimary }]}>{testo}</Text>
            </Animated.View>
          ))}
        </View>
      )}

      {fase === 'risultati' && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenuto} showsVerticalScrollIndicator={false}>
            {opportunita.length === 0 ? (
              <Text style={[styles.vuoto, { color: colors.labelSecondary }]}>
                Nessuna partita compatibile trovata al momento. Entra in lista d’attesa: ti avviseremo appena troviamo un abbinamento.
              </Text>
            ) : (
              opportunita.map((opp) => (
                <View key={opp.prenotazione_id} style={[styles.card, { backgroundColor: glass.regularBg, borderColor: glass.regularBorder }]}>
                  <View style={styles.cardTesta}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardCentro, { color: colors.labelPrimary }]} numberOfLines={1}>
                        {opp.centro_nome}{opp.campo_nome ? ` · ${opp.campo_nome}` : ''}
                      </Text>
                      <Text style={[styles.cardData, { color: colors.labelSecondary }]}>{etichettaData(opp.data, opp.inizio, opp.fine)}</Text>
                    </View>
                    <View style={[styles.chipPunteggio, { backgroundColor: colors.gold }]}>
                      <Text style={styles.chipPunteggioTesto}>{opp.punteggio_compatibilita}%</Text>
                    </View>
                  </View>
                  {/* Giocatori come nella schermata di prenotazione (fix
                      utente esplicito): uno slot per ogni posto del
                      formato, pieno (avatar squircle + nome + ranking/DX-SX)
                      o vuoto (tratteggiato) per i posti ancora liberi. */}
                  <View style={styles.slotGrid}>
                    {opp.giocatori_presenti.map((g) => <SlotMini key={g.id} giocatore={g} colors={colors} />)}
                    {Array.from({ length: Math.max(0, opp.posti_totali - opp.posti_occupati) }).map((_, i) => (
                      <SlotMiniVuoto key={`vuoto-${i}`} colors={colors} />
                    ))}
                  </View>
                  <Pressable
                    disabled={azioneInCorso === opp.prenotazione_id}
                    onPress={() => partecipa(opp)}
                    style={[styles.bottonePartecipa, { backgroundColor: colors.gold }]}>
                    <Text style={styles.bottonePartecipaTesto}>Partecipa</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
          <Pressable onPress={apriPreferenza} style={[styles.bottoneAttesa, { borderColor: colors.gold }]}>
            <Ionicons name="time-outline" size={16} color={colors.gold} />
            <Text style={[styles.bottoneAttesaTesto, { color: colors.gold }]}>Entra in lista d’attesa</Text>
          </Pressable>
        </>
      )}

      {fase === 'preferenza' && (
        <View style={styles.listaFasi}>
          <Text style={[styles.testoFase, { color: colors.labelSecondary, marginBottom: Spacing.sm }]}>
            Vuoi indicare un giorno o un orario preferito? Facoltativo — lo staff del centro ne terrà conto.
          </Text>
          <View style={styles.chipsGiorno}>
            <Chip label="Qualsiasi giorno" active={prefGiorno === null} onPress={() => setPrefGiorno(null)} />
            {GIORNI_BREVI.map((g) => (
              <Chip key={g} label={g} active={prefGiorno === g} onPress={() => setPrefGiorno(g)} />
            ))}
          </View>
          <View style={styles.rigaOrari}>
            <Input style={{ flex: 1 }} value={prefInizio} onChangeText={setPrefInizio} placeholder="Dalle (18:00)" />
            <Text style={{ color: colors.labelSecondary }}>–</Text>
            <Input style={{ flex: 1 }} value={prefFine} onChangeText={setPrefFine} placeholder="Alle (20:00)" />
          </View>
          <Pressable
            disabled={!!azioneInCorso}
            onPress={confermaPreferenza}
            style={[styles.bottonePartecipa, { backgroundColor: colors.gold, width: '100%', marginTop: Spacing.md }]}>
            <Text style={styles.bottonePartecipaTesto}>Continua</Text>
          </Pressable>
        </View>
      )}

      {fase === 'centro' && (
        <View style={styles.listaFasi}>
          <Text style={[styles.testoFase, { color: colors.labelSecondary, marginBottom: Spacing.sm }]}>
            Hai più centri preferiti: in quale vuoi entrare in lista d’attesa?
          </Text>
          {centriScelta.map((c) => (
            <Pressable
              key={c.id}
              disabled={!!azioneInCorso}
              onPress={() => entraAttesaSuCentro(c.id)}
              style={[styles.rigaCentro, { borderColor: glass.regularBorder }]}>
              <Text style={{ color: colors.labelPrimary, fontWeight: '600' }}>{c.nome}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.labelSecondary} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  radice: { flex: 1, width: '100%', alignItems: 'center' },
  titolo: { fontSize: Font.h3, fontWeight: '800', textAlign: 'center' },
  sottotitolo: { fontSize: Font.small, textAlign: 'center', marginBottom: Spacing.md },
  listaFasi: { width: '100%', gap: Spacing.sm, marginTop: Spacing.sm },
  rigaFase: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  testoFase: { fontSize: Font.small, flex: 1 },
  scroll: { flex: 1, width: '100%' },
  scrollContenuto: { gap: Spacing.sm, paddingBottom: Spacing.md },
  vuoto: { fontSize: Font.small, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 20 },
  card: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTesta: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardCentro: { fontSize: Font.small, fontWeight: '700' },
  cardData: { fontSize: Font.tiny, marginTop: 2 },
  chipPunteggio: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
  chipPunteggioTesto: { fontSize: Font.tiny, fontWeight: '800', color: '#16253A' },
  // Griglia slot giocatori — stesso linguaggio di Prenota → Invita
  // giocatori (fix utente esplicito).
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  slotMini: {
    width: 74, borderRadius: Radius.md, padding: Spacing.xs, alignItems: 'center',
    gap: 3, borderWidth: 1,
  },
  slotMiniVuoto: { borderStyle: 'dashed', minHeight: 68, justifyContent: 'center' },
  slotMiniNome: { fontWeight: '800', fontSize: Font.tiny, maxWidth: '100%' },
  slotMiniRanking: { fontSize: 10, fontWeight: '700' },
  slotMiniPosizione: { fontSize: 9, fontWeight: '800', paddingHorizontal: 4, paddingVertical: 1, borderRadius: Radius.pill, overflow: 'hidden' },
  bottonePartecipa: { paddingVertical: Spacing.sm, borderRadius: Radius.pill, alignItems: 'center', marginTop: Spacing.xs },
  bottonePartecipaTesto: { fontSize: Font.small, fontWeight: '800', color: '#16253A' },
  bottoneAttesa: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    borderWidth: 1.5, borderRadius: Radius.pill, paddingVertical: Spacing.sm, width: '100%', marginTop: Spacing.sm,
  },
  bottoneAttesaTesto: { fontSize: Font.small, fontWeight: '700' },
  chipsGiorno: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  rigaOrari: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  rigaCentro: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
});
