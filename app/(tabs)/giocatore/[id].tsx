import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../../lib/auth';
import {
  getGiocatore, getGiocatori, getPartiteGiocatore, getRankingAttuale, inviaRichiestaAmicizia,
  getAndamentoRecente, creaSfida, centriPreferiti, getCentri, haVinto,
} from '../../../lib/api';
import { avvisa } from '../../../lib/avviso';
import { AppHeader } from '../../../components/AppHeader';
import { Card, Muted, Avatar, Button, IconButton, Chip } from '../../../components/ui';
import { useTheme } from '../../../lib/theme';
import { useSport } from '../../../lib/sport';
import { SPORT_DISPONIBILI } from '../../../lib/stars';
import { Spacing, Font, Radius, AppColors } from '../../../constants/theme';
import type { Giocatore, Centro, Posizione, ManoDominante, Prenotazione } from '../../../types/models';

// Etichetta data breve, stesso formato di app/(tabs)/impegni.tsx
// (etichettaData) — duplicata qui deliberatamente, stessa convenzione già
// in uso nel file per posizioneLabel/manoLabel.
const GIORNI_BREVI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function etichettaData(dataISO: string): string {
  const d = new Date(`${dataISO}T12:00:00`);
  return `${GIORNI_BREVI[d.getDay()]} ${d.getDate()} ${MESI_BREVI[d.getMonth()]}`;
}

// Squadra A di una prenotazione (fix utente esplicito: stesso criterio di
// haVinto/lib/api.ts, duplicato qui in forma "quali due id sono nella
// stessa squadra" invece di "un id ha vinto") — usato per il filtro
// Compagno/Avversario dello storico partite in comune.
function squadraA(p: Prenotazione): string[] {
  if (p.squadre) return p.squadre.a;
  const meta = Math.ceil(p.giocatori_extra.length / 2);
  return p.giocatori_extra.slice(0, meta);
}
function stessaSquadra(p: Prenotazione, id1: string, id2: string): boolean {
  const a = squadraA(p);
  return a.includes(id1) === a.includes(id2);
}

// Stesse etichette di app/(tabs)/profilo.tsx (fix utente esplicito: "come
// nella visualizzazione del profilo personale da app") — duplicate qui
// deliberatamente, sono due schermate diverse (profilo proprio vs profilo
// di un altro giocatore), non vale la pena condividerle per due funzioni
// pure di una riga.
function posizioneLabel(p?: Posizione | null): string {
  if (!p) return '—';
  return p === 'sinistra' ? 'Lato SX' : p === 'destra' ? 'Lato DX' : 'Entrambe';
}
function manoLabel(m?: ManoDominante | null): string {
  if (!m) return '—';
  return m === 'mancino' ? 'Mancino' : m === 'destro' ? 'Destrorso' : 'Ambidestro';
}

export default function GiocatoreProfilo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, demoMode } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [g, setG] = useState<Giocatore | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [caricando, setCaricando] = useState(true);
  // Sport selezionato SOLO per questa schermata (fix utente esplicito:
  // "metti la possibilità di selezionare lo sport per vedere i dettagli del
  // giocatore per lo sport selezionato") — indipendente dallo sport globale
  // dell'header, che resta il TUO sport attivo altrove nell'app; parte
  // comunque allineato a quello la prima volta, così non si apre già su
  // uno sport "a caso".
  const [sportProfilo, setSportProfilo] = useState(sportAttivo);
  // A popup, stesso identico linguaggio del selettore sport principale
  // nell'header (fix utente esplicito) — non più chip in riga.
  const [sportModaleAperto, setSportModaleAperto] = useState(false);

  // Sfida: scelta del centro (se il mittente ne ha più di uno preferito),
  // stesso principio di MatchmakingPanel → "Entra in lista d'attesa".
  const [faseSfida, setFaseSfida] = useState<'idle' | 'centro'>('idle');
  const [centriScelta, setCentriScelta] = useState<Centro[]>([]);
  const [inviandoSfida, setInviandoSfida] = useState(false);

  // Storico partite in comune (fix utente esplicito: "lista collassabile di
  // tutte le partite effettuate con il giocatore... sia con che contro").
  const [partiteComuni, setPartiteComuni] = useState<Prenotazione[]>([]);
  const [giocatoriMap, setGiocatoriMap] = useState<Map<string, Giocatore>>(new Map());
  const [storicoAperto, setStoricoAperto] = useState(true);
  const [filtroStorico, setFiltroStorico] = useState<'tutte' | 'compagno' | 'avversario'>('tutte');

  // Anagrafica sempre (indipendente dal ranking: un giocatore mai valutato
  // non deve sparire dal proprio profilo pubblico — fix bug reale); ranking
  // e forma recente nello sport scelto QUI (sportProfilo), non nell'header.
  useEffect(() => {
    if (!id) return;
    setCaricando(true);
    Promise.all([
      getGiocatore(id),
      getRankingAttuale(id, sportProfilo),
      getAndamentoRecente(id, sportProfilo, Infinity),
    ]).then(([giocatore, rankingRow, andamento]) => {
      setG(giocatore);
      setRank(rankingRow ? rankingRow.ranking : null);
      setWinRate(andamento.winRatePercento);
      setCaricando(false);
    });
  }, [id, sportProfilo]);

  // Partite in comune con chi guarda il profilo (fix utente esplicito) —
  // SOLO quelle giocate insieme (in una squadra o nell'altra) da entrambi:
  // le partite del giocatore visto che è vuota basta filtrarle per la
  // presenza di me.id, niente bisogno di due fetch/intersezione. Filtrate
  // anche per sportProfilo, stesso sport scelto sopra — "risultato" richiede
  // p.risultato.vincitore, una partita ancora da giocare non ha né
  // risultato né pallino da mostrare.
  useEffect(() => {
    if (!id || !me) return;
    Promise.all([getPartiteGiocatore(id), getGiocatori()]).then(([partite, giocatori]) => {
      setGiocatoriMap(new Map(giocatori.map((gi) => [gi.id, gi])));
      const comuni = partite.filter((p) =>
        p.tipo !== 'lezione' && p.risultato?.vincitore && p.campo?.sport === sportProfilo && p.giocatori_extra.includes(me.id)
      );
      setPartiteComuni(comuni);
    });
  }, [id, me, sportProfilo]);

  const nome = g ? `${g.nome} ${g.cognome}` : 'Giocatore';

  const aggiungi = async () => {
    if (!me || !id) return;
    await inviaRichiestaAmicizia(me.id, id);
    avvisa('Richiesta inviata', `Richiesta inviata a ${g?.nome ?? 'giocatore'}.${demoMode ? '\n\n(demo)' : ''}`);
  };

  // Lancia la sfida sul centro scelto — se il mittente ha più centri
  // preferiti va prima scelto quale, altrimenti si invia subito (fix
  // utente esplicito: "deve esserci un tasto sfida").
  const inviaSfidaSuCentro = async (centroId: string) => {
    if (!me || !id) return;
    setInviandoSfida(true);
    const res = await creaSfida({ mittenteId: me.id, destinatarioId: id, centroId, sport: sportProfilo });
    setInviandoSfida(false);
    setFaseSfida('idle');
    if (res.ok) {
      avvisa('Sfida inviata!', `${g?.nome ?? 'Il giocatore'} riceverà la tua sfida a ${sportProfilo} e potrà accettarla dai suoi Impegni.`);
    } else {
      avvisa('Non è stato possibile inviare la sfida', res.error);
    }
  };
  const apriSfida = async () => {
    if (!me) return;
    const preferiti = centriPreferiti(me);
    if (preferiti.size >= 2) {
      const tutti = await getCentri();
      setCentriScelta(tutti.filter((c) => preferiti.has(c.id)));
      setFaseSfida('centro');
      return;
    }
    if (preferiti.size === 1) { await inviaSfidaSuCentro([...preferiti][0]); return; }
    const tutti = await getCentri();
    if (tutti[0]) await inviaSfidaSuCentro(tutti[0].id);
  };

  const eIlMioProfilo = id === me?.id;

  const partiteFiltrate = useMemo(() => {
    if (!me || !id) return [];
    return partiteComuni.filter((p) => {
      if (filtroStorico === 'tutte') return true;
      const compagni = stessaSquadra(p, me.id, id);
      return filtroStorico === 'compagno' ? compagni : !compagni;
    });
  }, [partiteComuni, filtroStorico, me, id]);

  // "Alberto & Tu vs Bea & Carlo" — stesso linguaggio di labelGiocatori in
  // impegni.tsx, con "Tu" al posto del proprio nome (fix utente esplicito:
  // "deve esserci... giocatori").
  const etichettaGiocatori = (p: Prenotazione): string => {
    const nome = (gid: string) => (gid === me?.id ? 'Tu' : giocatoriMap.get(gid) ? `${giocatoriMap.get(gid)!.nome}` : '—');
    const a = squadraA(p);
    const b = p.giocatori_extra.filter((gid) => !a.includes(gid));
    if (a.length === 0 || b.length === 0) return p.giocatori_extra.map(nome).join(', ');
    return `${a.map(nome).join(' & ')} vs ${b.map(nome).join(' & ')}`;
  };
  const etichettaRisultato = (p: Prenotazione): string => (p.risultato?.sets ?? []).map((set) => `${set.a}-${set.b}`).join(', ');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>Profilo</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Stessa card-intestazione del profilo personale (fix utente
            esplicito): avatar, nome+cognome, nickname, poi posizione/mano —
            solo senza il pulsante impostazioni/fotocamera, non modificabili
            da qui. */}
        <Card style={s.headCard}>
          <View style={s.headTop}>
            <Avatar name={nome} size={68} genere={g?.genere} squircle />
            <View style={{ flex: 1 }}>
              <Text style={s.headName}>{nome}</Text>
              <Text style={s.headNick}>{g?.profilo?.nickname ? `"${g.profilo.nickname}"` : 'Nessun nickname'}</Text>
            </View>
          </View>
          <View style={s.headStats}>
            <View style={s.hStat}>
              <Text style={s.hStatValue}>{posizioneLabel(g?.posizione)}</Text>
              <Muted>Posizione</Muted>
            </View>
            <View style={s.hStat}>
              <Text style={s.hStatValue}>{manoLabel(g?.mano_dominante)}</Text>
              <Muted>Mano</Muted>
            </View>
          </View>
        </Card>

        {/* Selettore sport SOLO per questa schermata (fix utente esplicito:
            "deve essere a popup come la selezione dello sport principale in
            alto nell'header"), indipendente da quello globale — stesso
            identico pattern pillola+tendina di components/AppHeader.tsx. */}
        <Pressable onPress={() => setSportModaleAperto(true)} style={s.sportPill}>
          <Ionicons name="tennisball-outline" size={15} color={colors.navyDeep} />
          <Text style={s.sportPillText}>{sportProfilo}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.slate} />
        </Pressable>

        {/* Ranking (centrale) + winrate a fianco (fix utente esplicito: "a
            fianco del ranking metti una box con il winrate"), per lo sport
            scelto sopra. */}
        <View style={s.stats}>
          <Card style={s.stat}>
            <Text style={s.statValue}>{caricando ? '—' : rank != null ? rank.toFixed(2) : '—'}</Text>
            <Muted>Ranking {sportProfilo}</Muted>
          </Card>
          <Card style={s.stat}>
            <Text style={s.statValue}>{caricando ? '—' : winRate != null ? `${winRate}%` : '—'}</Text>
            <Muted>Winrate</Muted>
          </Card>
        </View>

        {/* Storico partite in comune con chi guarda il profilo (fix utente
            esplicito) — collassabile, filtro Tutte/Compagno/Avversario,
            SOLO partite giocate insieme (in squadra o l'una contro l'altra). */}
        {!eIlMioProfilo && me && (
          <Card style={{ marginTop: Spacing.lg }}>
            <Pressable style={s.storicoHead} onPress={() => setStoricoAperto((v) => !v)}>
              <Text style={s.storicoTitolo}>Partite in comune{partiteComuni.length ? ` · ${partiteComuni.length}` : ''}</Text>
              <Ionicons name={storicoAperto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} />
            </Pressable>
            {storicoAperto && (
              <>
                <View style={s.storicoFiltri}>
                  <Chip label="Tutte" active={filtroStorico === 'tutte'} onPress={() => setFiltroStorico('tutte')} />
                  <Chip label="Compagno" active={filtroStorico === 'compagno'} onPress={() => setFiltroStorico('compagno')} />
                  <Chip label="Avversario" active={filtroStorico === 'avversario'} onPress={() => setFiltroStorico('avversario')} />
                </View>
                {partiteFiltrate.length === 0 ? (
                  <Muted style={{ textAlign: 'center', marginTop: Spacing.md }}>
                    {partiteComuni.length === 0 ? 'Nessuna partita in comune ancora.' : 'Nessuna partita per questo filtro.'}
                  </Muted>
                ) : (
                  <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
                    {partiteFiltrate.map((p) => {
                      const vinta = haVinto(p, me.id);
                      return (
                        <View key={p.id} style={s.storicoRiga}>
                          <View style={[s.storicoPallino, { backgroundColor: vinta ? colors.green : colors.red }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.storicoData}>{p.data ? etichettaData(p.data) : '—'}</Text>
                            <Text style={s.storicoGiocatori} numberOfLines={1}>{etichettaGiocatori(p)}</Text>
                          </View>
                          <Text style={s.storicoRisultato}>{etichettaRisultato(p)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </Card>
        )}

        {!eIlMioProfilo && (
          <>
            <Pressable style={s.sfidaBtn} onPress={apriSfida} disabled={inviandoSfida}>
              <Ionicons name="flash" size={18} color={colors.navyDeep} />
              <Text style={s.sfidaBtnText}>{inviandoSfida ? 'Invio…' : 'Sfida'}</Text>
            </Pressable>
            <Button title="Aggiungi agli amici" onPress={aggiungi} style={{ marginTop: Spacing.sm }} />
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Scelta del centro per la sfida, quando il mittente ne ha più di
          uno preferito — stesso pattern di MatchmakingPanel. */}
      <Modal visible={faseSfida === 'centro'} transparent animationType="fade" onRequestClose={() => setFaseSfida('idle')}>
        <Pressable style={s.modaleSfondo} onPress={() => setFaseSfida('idle')}>
          <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Text style={s.modaleTitolo}>In quale centro vuoi sfidarlo?</Text>
            {centriScelta.map((c) => (
              <Pressable key={c.id} disabled={inviandoSfida} onPress={() => inviaSfidaSuCentro(c.id)} style={s.rigaCentro}>
                <Text style={s.rigaCentroText}>{c.nome}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.labelSecondary} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tendina sport per QUESTA schermata — stesso identico pattern di
          components/AppHeader.tsx (fix utente esplicito). */}
      <Modal visible={sportModaleAperto} transparent animationType="fade" onRequestClose={() => setSportModaleAperto(false)}>
        <Pressable style={s.modaleSfondo} onPress={() => setSportModaleAperto(false)}>
          <View style={s.modaleBox}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Text style={s.modaleTitolo}>Sport</Text>
            {SPORT_DISPONIBILI.map((sp) => (
              <Pressable key={sp} style={s.modaleRiga} onPress={() => { setSportProfilo(sp); setSportModaleAperto(false); }}>
                <Ionicons name={sp === sportProfilo ? 'radio-button-on' : 'radio-button-off'} size={20} color={sp === sportProfilo ? colors.gold : colors.slate} />
                <Text style={s.modaleRigaText}>{sp}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },

    headCard: {},
    headTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    headName: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    headNick: { color: colors.slate, fontStyle: 'italic', marginTop: 2 },
    headStats: { flexDirection: 'row', marginTop: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.navyLine + '33', paddingTop: Spacing.md },
    hStat: { flex: 1, alignItems: 'center', gap: 2 },
    hStatValue: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },

    // Pillola sport, stesso stile della pillola nell'header (fix utente
    // esplicito) — qui però su sfondo pieno (non vetro), essendo dentro lo
    // scroll della pagina e non sopra l'AppHeader.
    sportPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: Spacing.lg,
      borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 8,
      backgroundColor: colors.navyCard, borderWidth: 1, borderColor: colors.navyLine + '55',
    },
    sportPillText: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small },

    stats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
    stat: { flex: 1, alignItems: 'center', gap: 4 },
    statValue: { color: colors.gold, fontSize: Font.h2, fontWeight: '900' },

    sfidaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
      backgroundColor: colors.gold, borderRadius: Radius.pill, paddingVertical: Spacing.md, marginTop: Spacing.xl,
    },
    sfidaBtnText: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },

    // Storico partite in comune (fix utente esplicito).
    storicoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    storicoTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },
    storicoFiltri: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    storicoRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    storicoPallino: { width: 10, height: 10, borderRadius: 5 },
    storicoData: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
    storicoGiocatori: { color: colors.slate, fontSize: Font.small },
    storicoRisultato: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },

    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, borderRadius: Radius.modal, overflow: 'hidden', padding: Spacing.lg, gap: Spacing.sm },
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body, marginBottom: Spacing.sm },
    modaleRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    modaleRigaText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    rigaCentro: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: colors.navyLine + '55', borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    },
    rigaCentroText: { color: colors.navyDeep, fontWeight: '600' },
  });
}
