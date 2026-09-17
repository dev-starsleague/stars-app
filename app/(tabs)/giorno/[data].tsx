import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import { useSport } from '../../../lib/sport';
import { getPartiteGiocatore, getEventiIscritti, getEventi, iscrivitiEvento } from '../../../lib/api';
import { servePagamento } from '../../../lib/impegni';
import { formattaEuro } from '../../../lib/stars';
import { avvisa } from '../../../lib/avviso';
import { AppHeader } from '../../../components/AppHeader';
import { Card, IconBadge, IconButton, Muted, Button } from '../../../components/ui';
import { ModaleCoppia } from '../../../components/campionatoTorneo';
import { useTheme } from '../../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../../constants/theme';
import type { Prenotazione, EventoCustom } from '../../../types/models';

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function etichettaGiornoLunga(dataISO: string) {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

type TipoImpegno = 'partita' | 'lezione' | 'evento';
// `prenotazione` presente solo per le righe partita/lezione (fix utente
// esplicito: "cliccandoci deve essere visibile il riepilogo della
// prenotazione") — è l'oggetto originale, serve al tap per aprire il
// riepilogo con tutti i dettagli, non solo l'etichetta mostrata nella riga.
interface RigaImpegno { id: string; tipo: TipoImpegno; label: string; sottotitolo: string; prenotazione?: Prenotazione }

function nomeGiocatore(id: string, p: Prenotazione): string {
  const g = p.giocatori?.find((x) => x.id === id);
  return g ? `${g.nome} ${g.cognome}`.trim() : 'Giocatore';
}
// Stessa logica di squadra A/B usata altrove (fix utente esplicito, vedi
// lib/api.ts gameVintiPersiPartita): esplicita se c'è, altrimenti split
// posizionale a metà di giocatori_extra.
function squadreRiepilogo(p: Prenotazione): { a: string[]; b: string[] } {
  if (p.squadre) return p.squadre;
  const meta = Math.ceil(p.giocatori_extra.length / 2);
  return { a: p.giocatori_extra.slice(0, meta), b: p.giocatori_extra.slice(meta) };
}

// Tap su un giorno del calendario Home: 3 cose devono succedere qui (fix
// utente esplicito) — vedere i propri impegni di quel giorno se ce ne sono,
// vedere gli eventi disponibili a cui non si è ancora iscritti, e poter
// comunque prenotare una partita. Stessa classificazione/colori dei
// pallini del calendario (vedi app/(tabs)/index.tsx CalendarWidget), qui
// applicata a un solo giorno invece che a un mese intero.
export default function GiornoDettaglio() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const { me } = useAuth();
  const { sportAttivo } = useSport();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [partite, setPartite] = useState<Prenotazione[]>([]);
  const [eventiIscritti, setEventiIscritti] = useState<EventoCustom[]>([]);
  const [tuttiEventi, setTuttiEventi] = useState<EventoCustom[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [iscrivendo, setIscrivendo] = useState<string | null>(null);
  const [riepilogoAperto, setRiepilogoAperto] = useState<Prenotazione | null>(null);
  // Un evento custom richiede sempre una coppia completa (fix bug reale:
  // prima si tentava l'iscrizione da soli, che il backend rifiuta sempre —
  // vedi lib/api.ts iscrivitiEvento) — stessa scelta del compagno usata
  // nei dettagli evento/campionato/torneo, riusata qui.
  const [coppiaPer, setCoppiaPer] = useState<EventoCustom | null>(null);

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
        prenotazione: p,
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

  const iscriviti = async (e: EventoCustom, partnerId: string) => {
    if (!me) return;
    setIscrivendo(e.id);
    const res = await iscrivitiEvento(e.id, me.id, partnerId, sportAttivo);
    setIscrivendo(null);
    setCoppiaPer(null);
    if (res.ok) { avvisa('Iscrizione registrata', `Sei iscritto a "${e.nome}" in coppia.`); load(); }
    else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };

  // 3 — poter comunque prenotare una partita in questo giorno.
  const prenota = () => router.push({ pathname: '/(tabs)/prenota', params: { data } });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
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
                    <Pressable key={r.id} onPress={r.prenotazione ? () => setRiepilogoAperto(r.prenotazione!) : undefined} disabled={!r.prenotazione}>
                      <Card style={s.impegnoRow}>
                        <View style={[s.dot, { backgroundColor: coloreTipo(r.tipo) }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.impegnoLabel}>{r.label}</Text>
                          <Muted>{etichettaTipo(r.tipo)}{r.sottotitolo ? ` · ${r.sottotitolo}` : ''}</Muted>
                        </View>
                        {r.prenotazione && <Ionicons name="chevron-forward" size={16} color={colors.slate} />}
                      </Card>
                    </Pressable>
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
                      loading={iscrivendo === e.id} onPress={() => setCoppiaPer(e)} style={{ marginTop: Spacing.md }}
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

      {/* Riepilogo prenotazione: aperto dal tap su una riga "I tuoi impegni"
          (fix utente esplicito) — vale per qualunque data, passata presente
          o futura, l'unica condizione è che quel giorno abbia davvero una
          prenotazione (le righe evento non ne hanno una, quindi non aprono
          nulla, vedi sopra `disabled={!r.prenotazione}`). */}
      <Modal visible={!!riepilogoAperto} transparent animationType="fade" onRequestClose={() => setRiepilogoAperto(null)}>
        <Pressable style={s.modaleSfondo} onPress={() => setRiepilogoAperto(null)}>
          <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
            {riepilogoAperto && <RiepilogoPrenotazione p={riepilogoAperto} colors={colors} s={s} />}
            <Button title="Chiudi" variant="ghost" onPress={() => setRiepilogoAperto(null)} style={{ marginTop: Spacing.md }} />
          </Pressable>
        </Pressable>
      </Modal>

      {coppiaPer && me && (
        <ModaleCoppia
          titolo={coppiaPer.nome} sottotitolo="formato a coppie" meId={me.id} obbligaCoppia
          onChiudi={() => setCoppiaPer(null)}
          onConferma={(partnerId) => partnerId && iscriviti(coppiaPer, partnerId)}
        />
      )}
    </SafeAreaView>
  );
}

// Dettaglio completo di UNA prenotazione (fix utente esplicito: "deve
// essere visibile il riepilogo della prenotazione") — campo/orario/prezzo/
// pagamento sempre; squadre e risultato solo quando la prenotazione li ha
// (un "da giocare" futuro non ha ancora un risultato, una lezione non ha
// squadre).
function RiepilogoPrenotazione({ p, colors, s }: { p: Prenotazione; colors: AppColors; s: ReturnType<typeof makeStyles> }) {
  const squadre = squadreRiepilogo(p);
  const haSquadre = p.tipo !== 'lezione' && (squadre.a.length > 0 || squadre.b.length > 0);
  return (
    <View>
      <Text style={s.modaleTitolo}>{p.campo?.nome ?? (p.tipo === 'lezione' ? 'Lezione' : 'Partita')}</Text>
      <View style={s.riepilogoRiga}>
        <Ionicons name="calendar-outline" size={16} color={colors.slate} />
        <Text style={s.riepilogoTesto}>{p.data} · {p.inizio?.slice(0, 5) ?? '—'}{p.fine ? `-${p.fine.slice(0, 5)}` : ''}</Text>
      </View>
      {p.campo?.sport && (
        <View style={s.riepilogoRiga}>
          <Ionicons name="pricetag-outline" size={16} color={colors.slate} />
          <Text style={s.riepilogoTesto}>{p.campo.sport}</Text>
        </View>
      )}
      <View style={s.riepilogoRiga}>
        <Ionicons name="wallet-outline" size={16} color={colors.slate} />
        <Text style={s.riepilogoTesto}>{formattaEuro(p.prezzo)} · {servePagamento(p) ? 'Da pagare' : 'Pagato'}</Text>
      </View>

      {haSquadre && (
        <View style={{ marginTop: Spacing.md }}>
          <Muted style={{ marginBottom: 4 }}>Squadra A</Muted>
          <Text style={s.riepilogoTesto}>{squadre.a.map((id) => nomeGiocatore(id, p)).join(', ') || '—'}</Text>
          <Muted style={{ marginTop: Spacing.sm, marginBottom: 4 }}>Squadra B</Muted>
          <Text style={s.riepilogoTesto}>{squadre.b.map((id) => nomeGiocatore(id, p)).join(', ') || '—'}</Text>
        </View>
      )}

      {p.risultato?.sets?.length ? (
        <View style={{ marginTop: Spacing.md }}>
          <Muted style={{ marginBottom: 4 }}>Risultato</Muted>
          <Text style={s.riepilogoTesto}>
            {p.risultato.sets.map((set) => `${set.a}-${set.b}${set.tb ? ' TB' : ''}`).join('  ')}
            {p.risultato.vincitore ? ` · Vince squadra ${p.risultato.vincitore}` : ' · Pareggio'}
          </Text>
        </View>
      ) : p.tipo !== 'lezione' && p.data && p.data < oggiISOLocale() ? (
        <Muted style={{ marginTop: Spacing.md }}>Risultato non ancora inserito.</Muted>
      ) : null}
    </View>
  );
}
function oggiISOLocale() { return new Date().toISOString().slice(0, 10); }

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
    // Riepilogo prenotazione (fix utente esplicito, calendario Home): stesso
    // linguaggio di modale/box già in uso altrove nell'app (blur + bordo
    // sottile, niente ombreggiature agli angoli).
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: {
      width: '100%', maxWidth: 360, borderRadius: Radius.card, padding: Spacing.lg,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.navyLine + '33',
    },
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    riepilogoRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
    riepilogoTesto: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
  });
}
