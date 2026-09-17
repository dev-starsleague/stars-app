// Classifiche — 2 sezioni (fix utente esplicito, RanDuo rimosso):
// 1. Ranking (maschile, "RanKing") / RanQueen (femminile) — il PSL Ranking
//    Engine, filtrabile per zona geografica, centro e categoria.
// 2. Star del mese — la classifica mensile per punti di UN centro (come lo
//    screenshot fornito dall'utente: podio a 3 con medaglie + lista).
// Entrambe seguono lo sport globale scelto nell'header (fix utente
// esplicito, "deve essere fatto per ogni sport").
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useSport } from '../../lib/sport';
import { categoriaRanking, CATEGORIE_RANKING } from '../../lib/stars';
import {
  getCentri, getClassificaRanking, getClassifica, centriPreferiti,
} from '../../lib/api';
import type { FiltroClassificaRanking } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Card, IconButton, Input, Muted, Segmented, immagineProfiloDefault } from '../../components/ui';
import { Radius, Spacing, Font, AppColors, AppGlass, CORNER_SMOOTHING } from '../../constants/theme';
import type { Centro, Genere, RankingGiocatore, Giocatore, ClassificaMensile } from '../../types/models';

// Categorie mostrate nel filtro Ranking (fix utente esplicito): "Non
// valutato" tolta (non è una fascia di livello, è "dati insufficienti" —
// filtrare per quello non ha senso) e ordine invertito rispetto a
// CATEGORIE_RANKING, dal più basso al più alto (Spark → 8⭐).
const CATEGORIE_FILTRO_RANKING = [...CATEGORIE_RANKING].filter((c) => c !== 'Non valutato').reverse();

type Sezione = 'ranking' | 'stelle';

export default function Classifiche() {
  const { colors } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [sezione, setSezione] = useState<Sezione>('ranking');
  const [centri, setCentri] = useState<Centro[]>([]);

  useEffect(() => { getCentri().then(setCentri); }, []);

  const opzioniSezione = [
    { value: 'ranking' as const, label: 'Ranking', icon: 'trophy-outline' as const },
    { value: 'stelle' as const, label: '⭐ Star del mese' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.segmentoWrap}>
        <Segmented value={sezione} onChange={(v) => setSezione(v as Sezione)} options={opzioniSezione} />
      </View>
      {sezione === 'ranking' && <SezioneRanking sportAttivo={sportAttivo} centri={centri} colors={colors} s={s} />}
      {sezione === 'stelle' && <SezioneStelle sportAttivo={sportAttivo} centri={centri} colors={colors} s={s} />}
    </SafeAreaView>
  );
}

// ============================================================
// Sezione 1 — Ranking / RanQueen
// ============================================================
function SezioneRanking({ sportAttivo, centri, colors, s }: {
  sportAttivo: string; centri: Centro[]; colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const router = useRouter();
  const { me } = useAuth();
  const [genere, setGenere] = useState<Genere>('M');
  const [filtro, setFiltro] = useState<FiltroClassificaRanking>({ tipo: 'globale' });
  const [categoria, setCategoria] = useState<string | null>(null);
  const [righe, setRighe] = useState<(RankingGiocatore & { giocatore?: Giocatore })[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const [ricercaAperta, setRicercaAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  const load = useCallback(async () => {
    setCaricamento(true);
    setRighe(await getClassificaRanking(sportAttivo, genere, filtro));
    setCaricamento(false);
  }, [sportAttivo, genere, filtro]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const righeFiltrate = useMemo(() => {
    let r = categoria ? righe.filter((x) => categoriaRanking(x.ranking) === categoria) : righe;
    const q = ricerca.trim().toLowerCase();
    if (q) r = r.filter((x) => nomeCompleto(x.giocatore).toLowerCase().includes(q));
    return r;
  }, [righe, categoria, ricerca]);

  const righeGeneriche: RigaGenerica[] = righeFiltrate.map((r) => ({
    key: r.giocatore_id,
    iniziali: iniziali(r.giocatore?.nome),
    genere: r.giocatore?.genere,
    titolo: nomeCompleto(r.giocatore),
    // Nickname al posto della categoria (fix utente esplicito: "tanto c'è
    // già il ranking di lato") — vuoto se il giocatore non ne ha uno,
    // niente "Nessun nickname" ripetuto su ogni riga di una lista lunga.
    sottotitolo: r.giocatore?.profilo?.nickname ? `"${r.giocatore.profilo.nickname}"` : '',
    valore: r.ranking.toFixed(2),
    onPress: () => router.push({ pathname: '/(tabs)/giocatore/[id]', params: { id: r.giocatore_id } }),
  }));

  const filtriAttivi = (filtro.tipo !== 'globale' ? 1 : 0) + (categoria ? 1 : 0);
  const etichettaAmbito = filtro.tipo === 'centro' ? centri.find((c) => c.id === filtro.centroId)?.nome
    : filtro.tipo === 'zona' ? filtro.zonaValore
    : 'Tutta Italia';

  // Vedere subito la propria posizione e i dintorni, invece della cima
  // della lista (fix utente esplicito) — `mioY` arriva da Classifica via
  // onLayout, non appena la riga del giocatore loggato viene disegnata;
  // lo scroll iniziale scatta una volta sola per caricamento (nuovo
  // filtro/sport/genere = nuova lista = ha senso rimostrare la mia
  // posizione da capo), non ad ogni render.
  const scrollRef = useRef<ScrollView>(null);
  const mioY = useRef<number | null>(null);
  const giaScrollato = useRef(false);
  const [inCima, setInCima] = useState(false);
  // Stato vero (non solo il ref mioY, che non fa ri-renderizzare) per
  // mostrare/nascondere il tastino appena la riga del giocatore viene
  // disegnata la prima volta.
  const [hoPosizione, setHoPosizione] = useState(false);
  useEffect(() => { giaScrollato.current = false; mioY.current = null; setInCima(false); setHoPosizione(false); }, [righeGeneriche.length, sportAttivo, genere, filtro, categoria]);
  const onMioLayout = useCallback((y: number) => {
    mioY.current = y;
    setHoPosizione(true);
    if (!giaScrollato.current) {
      giaScrollato.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: false });
    }
  }, []);
  const vaiInCima = () => { scrollRef.current?.scrollTo({ y: 0, animated: true }); setInCima(true); };
  const vaiAllaMiaPosizione = () => {
    if (mioY.current != null) scrollRef.current?.scrollTo({ y: Math.max(0, mioY.current - 90), animated: true });
    setInCima(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Card style={s.filterCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
            <IconButton icon="options-outline" size={36} color={filtriAttivi > 0 ? colors.gold : undefined} onPress={() => setMostraFiltri(true)} />
            <IconButton icon="search" size={36} color={ricercaAperta ? colors.gold : undefined} onPress={() => setRicercaAperta((v) => !v)} />
            <Segmented
              value={genere}
              onChange={(v) => setGenere(v as Genere)}
              options={[{ value: 'M', label: '🏆 RanKing' }, { value: 'F', label: '👑 RanQueen' }]}
              style={{ flex: 1 }}
            />
          </View>
          {/* Riepilogo filtri: ambito + categoria, non più lo sport (fix
              utente esplicito, "bisogna levare lo sport" — c'è già nell'header). */}
          <Muted style={{ marginBottom: ricercaAperta ? Spacing.sm : 0 }}>{etichettaAmbito}{categoria ? ` · ${categoria}` : ''}</Muted>
          {ricercaAperta && (
            <Input icon="search" placeholder="Cerca giocatore…" value={ricerca} onChangeText={setRicerca} style={{ height: 42 }} autoFocus />
          )}
        </Card>

        {caricamento ? (
          <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Carico…</Muted>
        ) : (
          <Classifica
            righe={righeGeneriche} coloreValore={colors.navyDeep} unitaValore=""
            vuoto={`Nessun giocatore ${genere === 'M' ? 'valutato' : 'valutata'} ${categoria ? `nella categoria ${categoria}` : ''} per ${sportAttivo} qui.`}
            mioKey={me?.id} onMioLayout={onMioLayout} colors={colors} s={s}
          />
        )}

        {mostraFiltri && (
          <ModaleFiltriRanking
            centri={centri} filtro={filtro} categoria={categoria}
            onChiudi={() => setMostraFiltri(false)}
            onApplica={(f, c) => { setFiltro(f); setCategoria(c); setMostraFiltri(false); }}
          />
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Tastino in alto a sx (fix utente esplicito): "torna in cima" se
          si sta guardando la propria posizione, "torna alla mia posizione"
          una volta usato quello — un solo tastino che cambia, non due
          insieme. Non compare se il giocatore non è in classifica (mioY
          mai valorizzato). */}
      {hoPosizione && !caricamento && (
        <Pressable style={s.scrollToggleBtn} onPress={inCima ? vaiAllaMiaPosizione : vaiInCima}>
          <BlurView intensity={30} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface + 'CC' }]} />
          <Ionicons name={inCima ? 'locate' : 'arrow-up'} size={16} color={colors.gold} />
        </Pressable>
      )}
    </View>
  );
}

function ModaleFiltriRanking({ centri, filtro, categoria, onChiudi, onApplica }: {
  centri: Centro[]; filtro: FiltroClassificaRanking; categoria: string | null;
  onChiudi: () => void; onApplica: (f: FiltroClassificaRanking, c: string | null) => void;
}) {
  const { colors, glass, scheme } = useTheme();
  const { me } = useAuth();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [ambito, setAmbito] = useState<'globale' | 'centro' | 'zona'>(filtro.tipo);
  const [centroId, setCentroId] = useState<string | undefined>(filtro.centroId);
  const [zonaTipo, setZonaTipo] = useState<'regione' | 'provincia'>(filtro.zonaTipo ?? 'regione');
  const [zonaValore, setZonaValore] = useState<string | undefined>(filtro.zonaValore);
  const [cat, setCat] = useState<string | null>(categoria);

  const preferiti = useMemo(() => centriPreferiti(me), [me]);
  const centriPreferitiList = useMemo(() => centri.filter((c) => preferiti.has(c.id)), [centri, preferiti]);

  // Regioni/province ATTIVE: solo quelle con almeno un centro (fix utente
  // esplicito), non un elenco statico dei valori possibili in Italia.
  const valoriZona = useMemo(
    () => Array.from(new Set(centri.map((c) => (zonaTipo === 'regione' ? c.regione : c.provincia)).filter((v): v is string => !!v))).sort(),
    [centri, zonaTipo]
  );

  const toggleAmbito = (a: 'centro' | 'zona') => setAmbito((cur) => (cur === a ? 'globale' : a));

  const conferma = () => {
    if (ambito === 'centro') {
      const centro = centri.find((c) => c.id === centroId) ?? centriPreferitiList[0];
      onApplica({ tipo: 'centro', centroId: centro?.id }, cat);
    } else if (ambito === 'zona') {
      if (!zonaValore) return;
      onApplica({ tipo: 'zona', zonaTipo, zonaValore }, cat);
    } else {
      onApplica({ tipo: 'globale' }, cat);
    }
  };
  const confermabile = ambito !== 'zona' || !!zonaValore;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.modaleTitolo}>Filtra classifica</Text>

            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <Pressable style={[s.pillScelta, ambito === 'centro' && s.pillSceltaAttiva]} onPress={() => toggleAmbito('centro')}>
                <Text style={[s.pillSceltaText, ambito === 'centro' && s.pillSceltaTextAttiva]}>⭐ Preferiti</Text>
              </Pressable>
              <Pressable style={[s.pillScelta, ambito === 'zona' && s.pillSceltaAttiva]} onPress={() => toggleAmbito('zona')}>
                <Text style={[s.pillSceltaText, ambito === 'zona' && s.pillSceltaTextAttiva]}>📍 Zona</Text>
              </Pressable>
            </View>

            {ambito === 'centro' && (
              <ScrollView style={{ maxHeight: 140, marginBottom: Spacing.sm }} showsVerticalScrollIndicator={false}>
                {centriPreferitiList.length === 0 && <Muted>Nessun centro preferito — aggiungine uno dal centro stesso.</Muted>}
                {centriPreferitiList.map((c) => {
                  const attivo = centroId ? centroId === c.id : c.id === centriPreferitiList[0]?.id;
                  return (
                    <Pressable key={c.id} style={s.opzioneRigaCompatta} onPress={() => setCentroId(c.id)}>
                      <Ionicons name={attivo ? 'radio-button-on' : 'radio-button-off'} size={18} color={attivo ? colors.gold : colors.slate} />
                      <Text style={s.opzioneLabel}>{c.nome}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {ambito === 'zona' && (
              <>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <Pressable style={[s.pillScelta, zonaTipo === 'regione' && s.pillSceltaAttiva]} onPress={() => { setZonaTipo('regione'); setZonaValore(undefined); }}>
                    <Text style={[s.pillSceltaText, zonaTipo === 'regione' && s.pillSceltaTextAttiva]}>Regione</Text>
                  </Pressable>
                  <Pressable style={[s.pillScelta, zonaTipo === 'provincia' && s.pillSceltaAttiva]} onPress={() => { setZonaTipo('provincia'); setZonaValore(undefined); }}>
                    <Text style={[s.pillSceltaText, zonaTipo === 'provincia' && s.pillSceltaTextAttiva]}>Provincia</Text>
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 130 }} showsVerticalScrollIndicator={false}>
                  {valoriZona.length === 0 && <Muted>Nessun dato disponibile.</Muted>}
                  {valoriZona.map((v) => (
                    <Pressable key={v} style={s.opzioneRigaCompatta} onPress={() => setZonaValore(v)}>
                      <Ionicons name={zonaValore === v ? 'radio-button-on' : 'radio-button-off'} size={18} color={zonaValore === v ? colors.gold : colors.slate} />
                      <Text style={s.opzioneLabel}>{v}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={[s.sottoTitolo, { marginTop: Spacing.md }]}>Categoria</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pressable style={[s.pillScelta, !cat && s.pillSceltaAttiva]} onPress={() => setCat(null)}>
                <Text style={[s.pillSceltaText, !cat && s.pillSceltaTextAttiva]}>Tutte</Text>
              </Pressable>
              {CATEGORIE_FILTRO_RANKING.map((c) => (
                <Pressable key={c} style={[s.pillScelta, cat === c && s.pillSceltaAttiva]} onPress={() => setCat(c)}>
                  <Text style={[s.pillSceltaText, cat === c && s.pillSceltaTextAttiva]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Pressable style={s.btnGhost} onPress={onChiudi}><Text style={s.btnGhostText}>Annulla</Text></Pressable>
            <Pressable style={[s.btnPieno, !confermabile && { opacity: 0.4 }]} onPress={conferma} disabled={!confermabile}>
              <Text style={s.btnPienoText}>Applica</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================
// Sezione 2 — Star del mese
// ============================================================
function SezioneStelle({ sportAttivo, centri, colors, s }: {
  sportAttivo: string; centri: Centro[]; colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const router = useRouter();
  const { me } = useAuth();
  const [genere, setGenere] = useState<Genere>('M');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [meseOffset, setMeseOffset] = useState(0);
  const [lista, setLista] = useState<ClassificaMensile[]>([]);
  const [rankingMap, setRankingMap] = useState<Map<string, number>>(new Map());
  const [caricamento, setCaricamento] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [soloPreferiti, setSoloPreferiti] = useState(false);
  const [ricercaAperta, setRicercaAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const meseScrollRef = useRef<ScrollView>(null);

  const preferiti = useMemo(() => centriPreferiti(me), [me]);
  const centriFiltrati = centri
    .filter((c) => !soloPreferiti || preferiti.has(c.id))
    .filter((c) => !ricerca.trim() || c.nome.toLowerCase().includes(ricerca.trim().toLowerCase()));

  // Default: il primo centro tra i preferiti del giocatore, altrimenti il
  // primo disponibile — stesso principio di StarsCoin (fix utente: "Star
  // del mese" è una classifica DI UN centro, non ha senso mescolarli).
  useEffect(() => {
    if (centroId || centri.length === 0) return;
    const preferito = me?.profilo?.centri_preferiti?.find((id) => centri.some((c) => c.id === id));
    setCentroId(preferito ?? centri[0].id);
  }, [centri, me, centroId]);

  const load = useCallback(async () => {
    if (!centroId) return;
    setCaricamento(true);
    const [dati, ranking] = await Promise.all([
      getClassifica(genere, sportAttivo, centroId, meseId(meseOffset)),
      getClassificaRanking(sportAttivo, genere, { tipo: 'globale' }),
    ]);
    setLista(dati);
    setRankingMap(new Map(ranking.map((r) => [r.giocatore_id, r.ranking])));
    setCaricamento(false);
  }, [genere, sportAttivo, centroId, meseOffset]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Mese attuale a destra, i mesi passati si vedono scorrendo verso
  // sinistra (fix utente esplicito) — MESI_OFFSET va da 0 (attuale) a 11
  // (più vecchio), qui va invertito per il rendering: il più vecchio
  // all'estrema sinistra, lo 0 all'estrema destra, come una timeline.
  // `larghezzaContenuto` arriva da onContentSizeChange (misura reale, non
  // una stima) e serve sia allo scroll iniziale sia a "torna al mese
  // attuale", ora uno scrollToEnd invece di uno scrollTo({x:0}).
  const meseOffsetInverso = useMemo(() => [...MESI_OFFSET].reverse(), []);
  const larghezzaContenutoMesi = useRef(0);
  const tornaAlMeseAttuale = () => {
    setMeseOffset(0);
    meseScrollRef.current?.scrollTo({ x: larghezzaContenutoMesi.current, animated: true });
  };

  const righeGeneriche: RigaGenerica[] = lista.map((r) => ({
    key: r.id,
    iniziali: iniziali(r.giocatore?.nome),
    genere: r.giocatore?.genere,
    titolo: nomeCompleto(r.giocatore),
    sottotitolo: `${categoriaRanking(rankingMap.get(r.giocatore_id) ?? null)} · ${r.partite} partit${r.partite === 1 ? 'a' : 'e'}`,
    valore: `${r.punti}`,
    onPress: () => router.push({ pathname: '/(tabs)/giocatore/[id]', params: { id: r.giocatore_id } }),
  }));

  // Stessa logica "vedi subito la tua posizione" + tastino toggle della
  // sezione Ranking (fix utente esplicito, stessa richiesta per Star del
  // mese) — vedi i commenti lì per i dettagli.
  const scrollRef = useRef<ScrollView>(null);
  const mioY = useRef<number | null>(null);
  const giaScrollato = useRef(false);
  const [inCima, setInCima] = useState(false);
  const [hoPosizione, setHoPosizione] = useState(false);
  useEffect(() => { giaScrollato.current = false; mioY.current = null; setInCima(false); setHoPosizione(false); }, [righeGeneriche.length, sportAttivo, genere, centroId, meseOffset]);
  const onMioLayout = useCallback((y: number) => {
    mioY.current = y;
    setHoPosizione(true);
    if (!giaScrollato.current) {
      giaScrollato.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: false });
    }
  }, []);
  const vaiInCima = () => { scrollRef.current?.scrollTo({ y: 0, animated: true }); setInCima(true); };
  const vaiAllaMiaPosizione = () => {
    if (mioY.current != null) scrollRef.current?.scrollTo({ y: Math.max(0, mioY.current - 90), animated: true });
    setInCima(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg }}>
          <ScrollView
            ref={meseScrollRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.lg, paddingLeft: Spacing.xxl }} style={{ flex: 1 }}
            onContentSizeChange={(w) => {
              larghezzaContenutoMesi.current = w;
              if (meseOffset === 0) meseScrollRef.current?.scrollTo({ x: w, animated: false });
            }}
          >
            {meseOffsetInverso.map((o) => (
              <Pressable key={o} onPress={() => setMeseOffset(o)}>
                <Text style={o === meseOffset ? s.meseGrande : s.meseMuted} numberOfLines={1}>{nomeMese(o)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {meseOffset !== 0 && (
            <IconButton icon="today-outline" size={34} color={colors.gold} onPress={tornaAlMeseAttuale} style={{ marginLeft: Spacing.sm }} />
          )}
        </View>

        <Card style={s.filterCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: ricercaAperta ? Spacing.sm : Spacing.md }}>
            <IconButton icon={soloPreferiti ? 'star' : 'star-outline'} size={36} color={soloPreferiti ? colors.gold : undefined} onPress={() => setSoloPreferiti((v) => !v)} />
            <IconButton icon="search" size={36} color={ricercaAperta ? colors.gold : undefined} onPress={() => setRicercaAperta((v) => !v)} />
            <Segmented
              value={genere}
              onChange={(v) => setGenere(v as Genere)}
              options={[{ value: 'M', label: '🏆 Maschile' }, { value: 'F', label: '👑 Femminile' }]}
              style={{ flex: 1 }}
            />
          </View>
          {ricercaAperta && (
            <Input
              icon="search" placeholder="Cerca centro…" value={ricerca} onChangeText={setRicerca}
              style={{ marginBottom: Spacing.md, height: 42 }} autoFocus
            />
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {centriFiltrati.length === 0 && <Muted>Nessun centro corrisponde ai filtri.</Muted>}
            {centriFiltrati.map((c) => (
              <Pressable key={c.id} style={[s.pillScelta, centroId === c.id && s.pillSceltaAttiva]} onPress={() => setCentroId(c.id)}>
                <Text style={[s.pillSceltaText, centroId === c.id && s.pillSceltaTextAttiva]} numberOfLines={1}>{c.nome}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Card>

        {caricamento ? (
          <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Carico…</Muted>
        ) : (
          <Classifica
            righe={righeGeneriche} coloreValore={colors.gold} unitaValore=" pt" vuoto={`Nessun punteggio a ${nomeMese(meseOffset)} per ${sportAttivo}.`}
            mioKey={me?.id} onMioLayout={onMioLayout} colors={colors} s={s}
          />
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {hoPosizione && !caricamento && (
        // top spostato più in basso del solito (fix layout): qui sopra c'è
        // anche la riga dei mesi, un tastino "a filo" la coprirebbe.
        <Pressable style={[s.scrollToggleBtn, { top: 76 }]} onPress={inCima ? vaiAllaMiaPosizione : vaiInCima}>
          <BlurView intensity={30} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface + 'CC' }]} />
          <Ionicons name={inCima ? 'locate' : 'arrow-up'} size={16} color={colors.gold} />
        </Pressable>
      )}
    </View>
  );
}

// ============================================================
// Componenti condivisi: podio (1°/2°/3°) + lista, usati dalle 2 sezioni
// con dati diversi ma stesso linguaggio grafico. `mioKey`/`onMioLayout`
// (fix utente esplicito: "all'apertura deve vedersi la propria posizione
// ed i dintorni") permettono al chiamante di sapere DOVE, in pixel, sta la
// riga del giocatore loggato appena viene disegnata, per poterci scrollare
// subito sopra — e di evidenziarla, non solo scrollarci.
// ============================================================
interface RigaGenerica {
  key: string; iniziali: string; genere?: Genere | null; titolo: string; sottotitolo: string; valore: string; onPress?: () => void;
}

function Classifica({ righe, coloreValore, unitaValore, vuoto, colors, s, mioKey, onMioLayout }: {
  righe: RigaGenerica[]; coloreValore: string; unitaValore: string; vuoto: string;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
  mioKey?: string; onMioLayout?: (y: number) => void;
}) {
  if (righe.length === 0) {
    return <Muted style={{ textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.lg }}>{vuoto}</Muted>;
  }
  const [primo, secondo, terzo, ...resto] = righe;
  return (
    <>
      {primo && (
        <View style={s.podioRow}>
          {secondo ? <PodioCol riga={secondo} posizione={2} colore={colors.slate} coloreValore={coloreValore} unitaValore={unitaValore} mio={secondo.key === mioKey} colors={colors} s={s} /> : <View style={{ flex: 1 }} />}
          <PodioCol riga={primo} posizione={1} colore={colors.gold} coloreValore={coloreValore} unitaValore={unitaValore} mio={primo.key === mioKey} colors={colors} s={s} />
          {terzo ? <PodioCol riga={terzo} posizione={3} colore={BRONZO} coloreValore={coloreValore} unitaValore={unitaValore} mio={terzo.key === mioKey} colors={colors} s={s} /> : <View style={{ flex: 1 }} />}
        </View>
      )}
      <View style={{ gap: 2 }}>
        {resto.map((r, i) => {
          const mio = r.key === mioKey;
          return (
            <Pressable
              key={r.key} onPress={r.onPress} disabled={!r.onPress} style={[s.listaRiga, mio && s.listaRigaMia]}
              onLayout={mio ? (e) => onMioLayout?.(e.nativeEvent.layout.y) : undefined}
            >
              <Text style={s.listaPos}>{i + 4}</Text>
              <SquircleAvatar testo={r.iniziali} genere={r.genere} size={40} bg={colors.navyCard} colore={colors.navyDeep} mostraSfondo={false} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.listaNome} numberOfLines={1}>{r.titolo}</Text>
                <Text style={s.listaSottotitolo} numberOfLines={1}>{r.sottotitolo}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.listaValore, { color: coloreValore }]}>{r.valore}</Text>
                {!!unitaValore && <Muted style={{ fontSize: Font.tiny }}>{unitaValore.trim().toUpperCase()}</Muted>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const BRONZO = '#C17F4A';
const MEDAGLIE: Record<1 | 2 | 3, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const BASI: Record<1 | 2 | 3, number> = { 1: 92, 2: 66, 3: 52 };

function PodioCol({ riga, posizione, colore, coloreValore, unitaValore, mio, colors, s }: {
  riga: RigaGenerica; posizione: 1 | 2 | 3; colore: string; coloreValore: string; unitaValore: string; mio?: boolean;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={riga.onPress} disabled={!riga.onPress} style={[s.podioCol, mio && s.podioColMio]}>
      <Text style={s.podioMedaglia}>{MEDAGLIE[posizione]}</Text>
      <SquircleAvatar testo={riga.iniziali} genere={riga.genere} size={posizione === 1 ? 68 : 56} bg={colore} colore={posizione === 1 ? colors.navyDeep : colors.white} />
      <Text style={s.podioNome} numberOfLines={1}>{riga.titolo}</Text>
      <Text style={[s.podioValore, { color: coloreValore }]} numberOfLines={1}>{riga.valore}{unitaValore}</Text>
      <Text style={s.podioSub} numberOfLines={1}>{riga.sottotitolo}</Text>
      <View style={[s.podioBase, { height: BASI[posizione], backgroundColor: colore + '20', borderColor: colore + '55' }]}>
        <Text style={[s.podioBaseNum, { color: colore }]}>{posizione}</Text>
      </View>
    </Pressable>
  );
}

// `mostraSfondo=false` (righe della lista, sotto il podio) lascia lo
// squircle trasparente quando c'è un'immagine di default per genere (fix
// utente esplicito: "rimuovi lo sfondo. e lascialo trasparente") — il
// podio invece mantiene il colore oro/argento/bronzo (indica la
// posizione, non è "lo sfondo dell'avatar": stessa scelta già fatta per
// il podio equivalente nel gestionale).
function SquircleAvatar({ testo, genere, size, bg, colore, mostraSfondo = true }: {
  testo: string; genere?: string | null; size: number; bg: string; colore: string; mostraSfondo?: boolean;
}) {
  const immagine = immagineProfiloDefault(genere);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <SquircleView
        style={StyleSheet.absoluteFillObject}
        squircleParams={{ cornerRadius: size * 0.32, cornerSmoothing: CORNER_SMOOTHING, fillColor: immagine && !mostraSfondo ? 'transparent' : bg }}
      />
      {immagine
        ? <Image source={immagine} style={{ width: '82%', height: '82%' }} resizeMode="contain" />
        : <Text style={{ color: colore, fontWeight: '900', fontSize: size * 0.36 }}>{testo}</Text>}
    </View>
  );
}

// ---------- helper di formattazione ----------
function iniziali(nome?: string | null): string { return (nome || '?')[0]?.toUpperCase() ?? '?'; }
function primoNome(nomeCompleto: string): string { return nomeCompleto.split(' ')[0]; }
function nomeCompleto(g?: Giocatore): string { return g ? `${g.nome} ${g.cognome}` : 'Giocatore'; }
function cap(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }

// Star del mese, fix utente esplicito: mese scorrevole con gli 11 mesi
// precedenti (offset 0 = mese attuale, crescente = più indietro nel tempo).
// setDate(1) prima di sottrarre i mesi evita il bug dei mesi con meno
// giorni (es. 31 marzo - 1 mese "salterebbe" ad aprile invece che a febbraio).
const MESI_OFFSET = Array.from({ length: 12 }, (_, i) => i);
function dataMese(offset: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d;
}
function meseId(offset: number): string {
  const d = dataMese(offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function nomeMese(offset: number): string { return cap(dataMese(offset).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })); }

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg, paddingTop: Spacing.md },
    segmentoWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    filterCard: { marginBottom: Spacing.xl },
    filterLabel: { color: colors.slate, fontSize: Font.small, fontWeight: '800', flex: 1 },
    meseGrande: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.h1 },
    meseMuted: { color: colors.slate, fontWeight: '700', fontSize: Font.h3, opacity: 0.6 },

    // Podio: 3 colonne (2°/1°/3° nell'ordine visivo classico).
    podioRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginBottom: Spacing.xl },
    podioCol: { flex: 1, alignItems: 'center' },
    // Evidenzia la colonna/riga del giocatore loggato (fix utente esplicito:
    // "all'apertura deve vedersi la propria posizione") — bordo oro sottile,
    // stesso linguaggio del resto (niente sfondo pieno, che sul podio
    // coprirebbe il colore oro/argento/bronzo che indica la posizione).
    podioColMio: { borderWidth: 1.5, borderColor: colors.gold, borderRadius: Radius.md, paddingTop: 4, marginTop: -4 },
    podioMedaglia: { fontSize: 24, marginBottom: 2 },
    podioNome: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small, marginTop: Spacing.sm, textAlign: 'center', maxWidth: '100%' },
    podioValore: { fontWeight: '900', fontSize: Font.h3, marginTop: 2 },
    podioSub: { fontSize: Font.tiny, textAlign: 'center', color: colors.slate },
    podioBase: { width: '100%', borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
    podioBaseNum: { fontSize: 32, fontWeight: '900', opacity: 0.55 },

    listaRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.navyLine + '18' },
    listaRigaMia: { backgroundColor: colors.gold + '14', borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, marginHorizontal: -Spacing.sm },
    listaPos: { color: colors.slate, fontWeight: '800', fontSize: Font.body, width: 20, textAlign: 'center' },
    listaNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body },
    listaSottotitolo: { color: colors.slate, fontSize: Font.small },
    listaValore: { fontWeight: '900', fontSize: Font.h3 },

    // Tastino "torna in cima"/"torna alla mia posizione" (fix utente
    // esplicito) — flottante in alto a sinistra dell'area classifica, stesso
    // linguaggio del "torna al ranking" della Home (blur + bordo sottile).
    scrollToggleBtn: {
      position: 'absolute', top: Spacing.sm, left: Spacing.sm, zIndex: 10,
      width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderWidth: 1, borderColor: colors.navyLine + '33',
    } as any,

    // Modale filtri (stesso linguaggio di ConfiguraWidgetModal in HomeCarousel).
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, maxHeight: '80%', borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } as any,
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    sottoTitolo: { color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 4 },
    opzioneRigaCompatta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    opzioneLabel: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '700' },
    pillScelta: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: colors.navyCard, borderWidth: 1, borderColor: colors.navyLine + '55' },
    pillSceltaAttiva: { backgroundColor: colors.gold, borderColor: colors.gold },
    pillSceltaText: { color: colors.slateLight, fontWeight: '700', fontSize: Font.small },
    pillSceltaTextAttiva: { color: colors.navyDeep },
    btnGhost: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.control, alignItems: 'center', backgroundColor: colors.navyCard },
    btnGhostText: { color: colors.slateLight, fontWeight: '700' },
    btnPieno: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.control, alignItems: 'center', backgroundColor: colors.gold },
    btnPienoText: { color: colors.navyDeep, fontWeight: '800' },
  });
}
