import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, PanResponder, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { getStars, getPartiteGiocatore, getEventiIscritti, getCentri } from '../../lib/api';
import { servePagamento } from '../../lib/impegni';
import { AppHeader } from '../../components/AppHeader';
import { HomeCarousel } from '../../components/HomeCarousel';
import { Card, Muted, Button } from '../../components/ui';
import { RiepilogoPrenotazioneModal } from '../../components/RiepilogoPrenotazioneModal';
import { avvisa } from '../../lib/avviso';
import { getGreeting, oggiISO } from '../../lib/saluto';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { StarsProfilo, Prenotazione, EventoCustom, Centro } from '../../types/models';

const GIORNI_SETT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI_LUNGHI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoGiorno(anno: number, mese: number, giorno: number) { return `${anno}-${pad(mese + 1)}-${pad(giorno)}`; }
function etichettaGiornoBreve(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI_LUNGHI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

// Collegamento al centro (fix utente esplicito, sezione 3 del ticket Home/
// Calendario): link ufficiale "Maps URLs" di Google — apre l'app Google
// Maps se installata (mobile), altrimenti il sito nel browser, sempre con
// la destinazione già impostata ("Portami qui" è un tap in più dentro
// Maps stesso, non serve replicarlo qui).
function linkGoogleMaps(indirizzo: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`;
}

type TipoImpegno = 'partita' | 'lezione' | 'evento';
// `prenotazione` presente solo per le righe partita/lezione (tap apre il
// riepilogo con tutti i dettagli) — stesso pattern di giorno/[data].tsx,
// che resta com'era per i link esterni (es. condivisione WhatsApp dal
// gestionale) mentre qui il tap su un giorno del calendario espande
// direttamente gli impegni sotto, senza cambiare pagina (fix utente
// esplicito).
//
// Campi espliciti invece di un'unica stringa "sottotitolo" (fix utente
// esplicito, sezione 2 del ticket Home/Calendario: "per ogni impegno...
// tipologia, giorno, orario, sport, nome del centro, eventuale campo... la
// scheda deve permettere di capire immediatamente dove devo andare, quando
// e per cosa") — il giorno non si ripete riga per riga: è già il titolo
// della sezione "Impegni del <giorno>" sopra la lista, comune a tutte.
interface RigaImpegno {
  id: string; tipo: TipoImpegno; titolo: string; orario: string;
  sport: string | null; centro: string | null; campo: string | null; extra: string | null;
  indirizzo: string | null; // per il pulsante Maps — null se il centro non l'ha compilato
  prenotazione?: Prenotazione;
}


export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [stars, setStars] = useState<StarsProfilo | null>(null);
  const [partite, setPartite] = useState<Prenotazione[]>([]);
  const [eventiIscritti, setEventiIscritti] = useState<EventoCustom[]>([]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const centroById = useMemo(() => new Map(centri.map((c) => [c.id, c])), [centri]);

  // Partite da qui ai prossimi 7 giorni (oggi escluso, come da spec) ed
  // evento a cui si è iscritti in data odierna — i due impegni reali che
  // guidano il saluto adattivo (vedi lib/saluto.ts).
  const partiteSettimana = useMemo(() => {
    const oggi = oggiISO();
    const fine = new Date(); fine.setDate(fine.getDate() + 7);
    const fineISO = `${fine.getFullYear()}-${pad(fine.getMonth() + 1)}-${pad(fine.getDate())}`;
    return partite.filter((p) => p.data && p.data > oggi && p.data <= fineISO).length;
  }, [partite]);
  const haEventoOggi = useMemo(() => {
    const oggi = oggiISO();
    return eventiIscritti.some((e) => e.data_evento === oggi);
  }, [eventiIscritti]);
  const saluto = useMemo(
    () => getGreeting(me?.nome ?? 'Giocatore', me?.profilo?.nickname ?? '', partiteSettimana, haEventoOggi),
    [me?.id, me?.nome, me?.profilo?.nickname, partiteSettimana, haEventoOggi]
  );

  const load = useCallback(async () => {
    const [st, pt, ev, ce] = await Promise.all([
      me ? getStars(me.id) : Promise.resolve(null),
      me ? getPartiteGiocatore(me.id) : Promise.resolve([]),
      me ? getEventiIscritti(me.id) : Promise.resolve([]),
      getCentri(),
    ]);
    setStars(st); setPartite(pt); setEventiIscritti(ev); setCentri(ce);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Tap su un giorno del calendario (fix utente esplicito): se quel giorno
  // non ha impegni, si va dritti a prenotare — se ne ha, si espande la
  // lista sotto il calendario invece di cambiare pagina (un secondo tap
  // sullo stesso giorno la richiude). /giorno/[data] resta com'era, non
  // più raggiunta da qui: serve ancora ai link esterni (es. condivisione
  // WhatsApp dal gestionale, che punta proprio a quella rotta).
  const [giornoSelezionato, setGiornoSelezionato] = useState<string | null>(null);
  const [riepilogoAperto, setRiepilogoAperto] = useState<Prenotazione | null>(null);

  const apriGiorno = (dataISO: string) => {
    const haImpegni = partite.some((p) => p.data === dataISO) || eventiIscritti.some((e) => e.data_evento === dataISO);
    if (!haImpegni) {
      router.push({ pathname: '/(tabs)/prenota', params: { data: dataISO } });
      return;
    }
    setGiornoSelezionato((cur) => (cur === dataISO ? null : dataISO));
  };

  const impegniGiornoSelezionato = useMemo((): RigaImpegno[] => {
    if (!giornoSelezionato) return [];
    const daPartite: RigaImpegno[] = partite
      .filter((p) => p.data === giornoSelezionato)
      .map((p) => {
        const centro = p.campo ? centroById.get(p.campo.centro_id) : undefined;
        const orario = p.inizio ? `${p.inizio.slice(0, 5)}${p.fine ? `–${p.fine.slice(0, 5)}` : ''}` : '—';
        return {
          id: `p-${p.id}`, tipo: (p.tipo === 'lezione' ? 'lezione' : 'partita') as TipoImpegno,
          titolo: p.campo?.nome ?? (p.tipo === 'lezione' ? 'Lezione' : 'Partita'),
          orario, sport: p.campo?.sport ?? p.sport ?? null,
          centro: centro?.nome ?? null, campo: p.campo?.nome ?? null,
          extra: servePagamento(p) ? 'Da pagare' : 'Pagato',
          indirizzo: centro?.indirizzo ?? null,
          prenotazione: p,
        };
      });
    const daEventi: RigaImpegno[] = eventiIscritti
      .filter((e) => e.data_evento === giornoSelezionato)
      .map((e) => {
        const centro = centroById.get(e.centro_id);
        return {
          id: `e-${e.id}`, tipo: 'evento' as TipoImpegno, titolo: e.nome, orario: '—',
          sport: null, centro: centro?.nome ?? null, campo: null, extra: 'Sei iscritto',
          indirizzo: centro?.indirizzo ?? null,
        };
      });
    return [...daPartite, ...daEventi];
  }, [partite, eventiIscritti, giornoSelezionato, centroById]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>

        <Text style={s.tip}>{saluto}</Text>

        {/* Carosello: ranking + widget personalizzabili, poi ADV di eventi
            e prodotti sponsorizzati dai centri (fix utente esplicito) */}
        <HomeCarousel />

        {/* Calendario mese: gli impegni del giorno selezionato si espandono
            DENTRO questa stessa card (fix utente esplicito: "collegati al
            calendario, non 2 box separate") invece di comparire in una
            card a parte sotto. */}
        <CalendarWidget
          partite={partite} eventi={eventiIscritti} onPick={apriGiorno} giornoSelezionato={giornoSelezionato}
          impegniGiorno={impegniGiornoSelezionato} onApriRiepilogo={setRiepilogoAperto}
          onPrenota={(data) => router.push({ pathname: '/(tabs)/prenota', params: { data } })}
        />

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Riepilogo prenotazione: componente condiviso con giorno/[data].tsx
          (fix utente esplicito, "sistema TUTTO" — un audit del codice ha
          trovato che le due copie separate erano già divergenti: questa
          aveva centro/indirizzo/Maps, l'altra no). */}
      <RiepilogoPrenotazioneModal
        prenotazione={riepilogoAperto}
        centro={riepilogoAperto?.campo ? centroById.get(riepilogoAperto.campo.centro_id) : null}
        onChiudi={() => setRiepilogoAperto(null)}
      />
    </SafeAreaView>
  );
}

function CalendarWidget({ partite, eventi, onPick, giornoSelezionato, impegniGiorno, onApriRiepilogo, onPrenota }: {
  partite: Prenotazione[]; eventi: EventoCustom[]; onPick: (dataISO: string) => void; giornoSelezionato: string | null;
  impegniGiorno: RigaImpegno[]; onApriRiepilogo: (p: Prenotazione) => void; onPrenota: (dataISO: string) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const coloreTipoImpegno = (t: TipoImpegno) => t === 'partita' ? colors.green : t === 'lezione' ? colors.amber : colors.viola;
  const etichettaTipoImpegno = (t: TipoImpegno) => t === 'partita' ? 'Partita' : t === 'lezione' ? 'Lezione' : 'Evento';
  // Indirizzo collassato di default (fix utente esplicito, sezione 3: "per
  // non appesantire la scheda") — un set di id riga espansi, non un solo
  // booleano: più righe possono avere Maps aperto insieme senza
  // richiudersi a vicenda.
  const [mapsEspansi, setMapsEspansi] = useState<Set<string>>(new Set());
  const toggleMaps = (id: string) => setMapsEspansi((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Linking.openURL può rifiutare (nessuna app Maps/browser raggiungibile
  // sul dispositivo) — senza .catch il tasto non faceva nulla in silenzio
  // (fix da un audit del codice, "sistema TUTTO").
  const apriMaps = async (indirizzo: string) => {
    try {
      await Linking.openURL(linkGoogleMaps(indirizzo));
    } catch {
      avvisa('Errore', 'Non riesco ad aprire Google Maps su questo dispositivo.');
    }
  };
  const oggiReale = new Date();
  const [meseAttivo, setMeseAttivo] = useState(() => new Date(oggiReale.getFullYear(), oggiReale.getMonth(), 1));

  const cambiaMese = (delta: number) => setMeseAttivo((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Swipe orizzontale sul calendario, in aggiunta alle frecce — nessuna
  // libreria di gesture in più: PanResponder di RN basta per un solo swipe.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_evt, g) => {
        if (g.dx <= -40) cambiaMese(1);
        else if (g.dx >= 40) cambiaMese(-1);
      },
    })
  ).current;

  const anno = meseAttivo.getFullYear(); const mese = meseAttivo.getMonth();
  const meseIso = `${anno}-${pad(mese + 1)}`;
  const primo = new Date(anno, mese, 1);
  const giorniMese = new Date(anno, mese + 1, 0).getDate();
  const offset = (primo.getDay() + 6) % 7; // lun=0
  const meseCorrenteReale = anno === oggiReale.getFullYear() && mese === oggiReale.getMonth();
  const oggi = meseCorrenteReale ? oggiReale.getDate() : -1;
  const celle: (number | null)[] = [];
  for (let i = 0; i < offset; i++) celle.push(null);
  for (let d = 1; d <= giorniMese; d++) celle.push(d);
  const nomeMese = MESI[mese];

  // Impegni del mese mostrato: tipo di pallino per giorno (un pallino per
  // TIPO presente, non uno per elemento — più leggibile in una cella 38px —
  // e la lista sotto ("mostra tutti i miei impegni") con il dettaglio.
  const impegniPerGiorno = useMemo(() => {
    const map = new Map<number, Set<TipoImpegno>>();
    const aggiungi = (giorno: number, tipo: TipoImpegno) => {
      if (!map.has(giorno)) map.set(giorno, new Set());
      map.get(giorno)!.add(tipo);
    };
    for (const p of partite) {
      if (!p.data?.startsWith(meseIso)) continue;
      aggiungi(Number(p.data.slice(8, 10)), p.tipo === 'lezione' ? 'lezione' : 'partita');
    }
    for (const e of eventi) {
      if (!e.data_evento?.startsWith(meseIso)) continue;
      aggiungi(Number(e.data_evento.slice(8, 10)), 'evento');
    }
    return map;
  }, [partite, eventi, meseIso]);

  // Non limitato al mese mostrato (a differenza dei pallini in griglia):
  // "I miei impegni" mostra anche i passati da saldare/con risultato
  // mancante, che potrebbero stare in un mese diverso da quello aperto qui
  // — il link deve comparire comunque, altrimenti resterebbero irraggiungibili.
  const haImpegni = partite.length > 0 || eventi.length > 0;

  const coloreTipo = (t: TipoImpegno) => t === 'partita' ? colors.green : t === 'lezione' ? colors.amber : colors.viola;
  return (
    <Card style={s.calCard}>
      <View style={s.calHead}>
        <Text style={s.calTitle}>{nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)} {anno}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={() => cambiaMese(-1)} hitSlop={8} style={s.calNavBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.slate} />
          </Pressable>
          <Pressable onPress={() => cambiaMese(1)} hitSlop={8} style={s.calNavBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.slate} />
          </Pressable>
        </View>
      </View>
      <View style={s.calWeek}>
        {GIORNI_SETT.map((g, i) => <Text key={i} style={s.calDow}>{g}</Text>)}
      </View>
      <View style={s.calGrid} {...panResponder.panHandlers}>
        {celle.map((d, i) => {
          const tipi = d ? impegniPerGiorno.get(d) : undefined;
          const selezionato = d != null && giornoSelezionato === isoGiorno(anno, mese, d);
          return (
            <Pressable key={i} style={s.calCell} onPress={d ? () => onPick(isoGiorno(anno, mese, d)) : undefined} disabled={!d}>
              {d ? (
                <View style={s.calCellInner}>
                  <View style={[s.calDay, d === oggi && s.calToday, selezionato && s.calSelected]}>
                    <Text style={[s.calDayText, d === oggi && s.calTodayText, selezionato && s.calSelectedText]}>{d}</Text>
                  </View>
                  <View style={s.calDotsRow}>
                    {tipi && (['partita', 'lezione', 'evento'] as TipoImpegno[]).filter((t) => tipi.has(t)).map((t) => (
                      <View key={t} style={[s.calDotImpegno, { backgroundColor: coloreTipo(t) }]} />
                    ))}
                  </View>
                </View>
              ) : <View style={s.calDay} />}
            </Pressable>
          );
        })}
      </View>

      {/* Espansione inline (fix utente esplicito: "collegati al calendario,
          non 2 box separate") — stessa card del calendario, subito sotto
          la griglia, un tap sul giorno la apre/chiude senza cambiare pagina. */}
      {giornoSelezionato && (
        <View style={s.impegniInline}>
          <Text style={s.sectionTitle}>Impegni del {etichettaGiornoBreve(giornoSelezionato)}</Text>
          <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
            {impegniGiorno.map((r) => {
              const mapsAperto = mapsEspansi.has(r.id);
              return (
                <View key={r.id} style={s.impegnoCard}>
                  {/* Pressable separato (non annidato) dal tasto Maps sotto:
                      su web due Pressable annidati non isolano davvero il
                      tap (stopPropagation inaffidabile), quindi restano
                      fratelli nello stesso impegnoCard invece che uno dentro
                      l'altro. */}
                  <Pressable onPress={r.prenotazione ? () => onApriRiepilogo(r.prenotazione!) : undefined} disabled={!r.prenotazione}>
                    <View style={s.impegnoTestata}>
                      <View style={[s.impegnoDot, { backgroundColor: coloreTipoImpegno(r.tipo) }]} />
                      <Text style={s.impegnoTipoText}>{etichettaTipoImpegno(r.tipo)}</Text>
                      <Text style={s.impegnoOrario}>{r.orario}</Text>
                      {r.prenotazione && <Ionicons name="chevron-forward" size={16} color={colors.slate} style={{ marginLeft: 'auto' }} />}
                    </View>
                    <Text style={s.impegnoLabel}>{r.titolo}</Text>
                    {(r.sport || r.centro || r.campo) && (
                      <View style={s.impegnoMetaRiga}>
                        <Ionicons name="location-outline" size={13} color={colors.slate} />
                        <Text style={s.impegnoMetaText} numberOfLines={1}>
                          {[r.sport, r.centro, r.campo].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    )}
                    {r.extra && (
                      <View style={s.impegnoExtraPill}>
                        <Text style={[s.impegnoExtraText, r.extra === 'Da pagare' && { color: colors.red }]}>{r.extra}</Text>
                      </View>
                    )}
                  </Pressable>

                  {/* Collegamento al centro / Google Maps (fix utente
                      esplicito, sezione 3): collassato di default. */}
                  {r.indirizzo && (
                    <View style={s.mapsBlocco}>
                      <Pressable onPress={() => toggleMaps(r.id)} style={s.mapsToggle} hitSlop={6}>
                        <Ionicons name="map-outline" size={13} color={colors.gold} />
                        <Text style={s.mapsToggleText}>Come arrivare</Text>
                        <Ionicons name={mapsAperto ? 'chevron-up' : 'chevron-down'} size={12} color={colors.slate} />
                      </Pressable>
                      {mapsAperto && (
                        <View style={s.mapsEspanso}>
                          <Text style={s.mapsIndirizzo}>{r.indirizzo}</Text>
                          <Pressable onPress={() => apriMaps(r.indirizzo!)} style={s.mapsPortamiQui}>
                            <Ionicons name="navigate" size={13} color={colors.navyDeep} />
                            <Text style={s.mapsPortamiQuiText}>Portami qui</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Button title="Prenota un campo" variant="ghost" onPress={() => onPrenota(giornoSelezionato)} style={{ marginTop: Spacing.md }} />
        </View>
      )}

      {haImpegni && (
        <Pressable onPress={() => router.push('/impegni')} style={s.impegniToggle}>
          <Text style={s.impegniToggleText}>Mostra tutti i miei impegni</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
        </Pressable>
      )}
    </Card>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    tip: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '900', marginBottom: Spacing.lg, lineHeight: 34 },
    calCard: { marginBottom: Spacing.md },
    calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    calTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    calNavBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    calWeek: { flexDirection: 'row' },
    calDow: { flex: 1, textAlign: 'center', color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 6 },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    calCellInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
    calDay: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    calToday: { backgroundColor: colors.navy },
    calDayText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    calTodayText: { color: colors.gold, fontWeight: '900' },
    calSelected: { borderWidth: 2, borderColor: colors.gold },
    calSelectedText: { color: colors.navyDeep, fontWeight: '900' },
    calDotsRow: { flexDirection: 'row', gap: 3, height: 5 },
    calDotImpegno: { width: 5, height: 5, borderRadius: 3 },
    impegniToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.navyLine + '22' },
    impegniToggleText: { color: colors.gold, fontWeight: '700', fontSize: Font.small },

    // Sezione "Impegni del <giorno>" inline (fix utente esplicito: niente
    // cambio pagina) + modale riepilogo prenotazione — stesso linguaggio
    // visivo di giorno/[data].tsx.
    impegniInline: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.navyLine + '22' },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    impegnoCard: {
      borderWidth: 1, borderColor: colors.navyLine + '22', borderRadius: Radius.control,
      padding: Spacing.md, gap: 4,
    },
    impegnoTestata: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    impegnoDot: { width: 8, height: 8, borderRadius: 4 },
    impegnoTipoText: { color: colors.slate, fontWeight: '700', fontSize: Font.small, textTransform: 'uppercase', letterSpacing: 0.3 },
    impegnoOrario: { color: colors.slate, fontWeight: '700', fontSize: Font.small },
    impegnoLabel: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },
    impegnoMetaRiga: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    impegnoMetaText: { flex: 1, color: colors.slate, fontSize: Font.small, fontWeight: '600' },
    impegnoExtraPill: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.navyCard },
    impegnoExtraText: { color: colors.slate, fontSize: Font.small - 1, fontWeight: '700' },
    mapsBlocco: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.navyLine + '18' },
    mapsToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
    mapsToggleText: { color: colors.gold, fontSize: Font.small - 1, fontWeight: '700' },
    mapsEspanso: { marginTop: 6, gap: 8 },
    mapsIndirizzo: { color: colors.slate, fontSize: Font.small, fontWeight: '600' },
    mapsPortamiQui: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
      backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    },
    mapsPortamiQuiText: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '800' },
  });
}
