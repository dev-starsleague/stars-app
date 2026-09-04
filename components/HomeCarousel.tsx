import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Image, Modal, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent, AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSport } from '../lib/sport';
import { apiUrl } from '../lib/apiClient';
import {
  getCentri, getClassifica, posizioneRankingGlobale, posizioneRankingCentro, posizioneRankingZona,
  getVariazioneRankingGlobale, getAndamentoRecente, getInsightsSociali, getProssimaPartita,
  getEventiInEvidenza, getProdottiSponsorizzati, getAbbonamentiSponsorizzati,
  registraImpressioneSponsor, registraClickSponsor,
} from '../lib/api';
import {
  caricaConfigWidget, salvaConfigWidget, DEFAULT_WIDGET_SINISTRA, DEFAULT_WIDGET_DESTRA,
} from '../lib/homeWidgets';
import type { ConfigWidgetHome, TipoWidgetHome } from '../lib/homeWidgets';
import { generaFraseAndamento } from '../lib/andamentoFrasi';
import { Muted, Avatar } from './ui';
import { Radius, Spacing, Font, AppColors, AppGlass, CORNER_SMOOTHING } from '../constants/theme';
import type {
  Centro, EventoCustom, ShopProdotto, AbbonamentoTemplate,
  VariazioneRanking, AndamentoRecente, InsightsSociali, ProssimaPartita,
} from '../types/models';

// Quanto resta ferma ogni slide prima di avanzare da sola (fix utente
// esplicito: "circa 4.5 secondi per slide").
const AUTOPLAY_MS = 4500;
// Vuoti "neutri" (mai null) per gli hook sotto: evitano di dover distinguere
// "sto ancora caricando" da "ho caricato e non ci sono abbastanza dati" nelle
// slide — in entrambi i casi si mostra lo stesso messaggio contestuale
// elegante, mai "0 partite"/"0%" (fix utente esplicito).
const ANDAMENTO_VUOTO: AndamentoRecente = { finestra: 10, disputate: 0, vinte: 0, perse: 0, winRatePercento: null, streak: null, formaRecente: [], setVinti: 0, setPersi: 0, trend: null };
const INSIGHTS_VUOTI: InsightsSociali = { compagnoPreferito: null, nemesi: null, avversarioPreferito: null };

// `prefers-reduced-motion` (fix utente esplicito): niente autoplay né salti
// automatici quando l'utente ha chiesto al sistema di ridurre le
// animazioni — AccessibilityInfo è la stessa API sia su iOS/Android sia sul
// web di Expo (mappa la media query nativa).
function useMovimentoRidotto(): boolean {
  const [ridotto, setRidotto] = useState(false);
  useEffect(() => {
    let attivo = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (attivo) setRidotto(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setRidotto(!!v));
    return () => { attivo = false; sub?.remove?.(); };
  }, []);
  return ridotto;
}

const ALTEZZA = 175;
// Larghezza scheda: stessa di tutte le altre box "wide" dell'app (fix
// utente esplicito, "390px come tutte le altre box wide o side to side") —
// 390 è la larghezza usata di riferimento, ma resta comunque clampata alla
// larghezza reale disponibile (schermo - padding di pagina) così non rompe
// su un device più stretto: il numero fisso non deve rompere la reattività.

type IconaWidget = React.ComponentProps<typeof Ionicons>['name'];
interface EsitoWidget { etichetta: string; posizione: number | null; totale: number | null; extra?: string; icona: IconaWidget }

// Risolve UN widget configurabile in un valore mostrabile — stessa logica
// per entrambi gli slot, cambia solo la fonte dati (fix utente esplicito:
// il giocatore sceglie "classifica star del mese di un centro" o "ranking
// di un centro/zona"). Nessun centro configurato → il primo disponibile
// (funziona da solo finché esiste un solo centro reale, come altrove).
// Anche quando non ci sono dati (es. nessun punteggio questo mese), il
// risultato riporta SEMPRE etichetta/icona del widget scelto — mai `null`
// per un tipo valido — altrimenti la scheda mostra "tocca per scegliere"
// come se non fosse mai stata configurata, facendo credere che il
// salvataggio non abbia avuto effetto (fix utente esplicito: "configurazione
// widget 'star del mese' non funziona" — il bug reale era qui, non nel
// salvataggio). `null` resta riservato ai casi davvero irrisolvibili
// (nessun centro caricato, o genere del giocatore ignoto).
async function risolviWidget(
  config: ConfigWidgetHome, giocatoreId: string, genere: 'M' | 'F' | null, sport: string, centri: Centro[]
): Promise<EsitoWidget | null> {
  if (config.tipo === 'classifica_centro') {
    const centro = (config.centroId && centri.find((c) => c.id === config.centroId)) || centri[0];
    if (!centro) return null;
    const etichetta = `Star del mese · ${centro.nome}`;
    if (!genere) return { etichetta, posizione: null, totale: null, icona: 'star' };
    const righe = await getClassifica(genere, sport, centro.id);
    const posizione = righe.findIndex((r) => r.giocatore_id === giocatoreId);
    if (posizione < 0) return { etichetta, posizione: null, totale: null, icona: 'star' };
    return { etichetta, posizione: posizione + 1, totale: righe.length, extra: `${righe[posizione].punti} pt`, icona: 'star' };
  }
  if (config.tipo === 'ranking_centro') {
    const centro = (config.centroId && centri.find((c) => c.id === config.centroId)) || centri[0];
    if (!centro) return null;
    const etichetta = `Ranking · ${centro.nome}`;
    const esito = await posizioneRankingCentro(giocatoreId, sport, centro.id);
    if (!esito) return { etichetta, posizione: null, totale: null, icona: 'podium' };
    return { etichetta, posizione: esito.posizione, totale: esito.totale, extra: esito.valore.toFixed(2), icona: 'podium' };
  }
  if (config.tipo === 'ranking_zona' && config.zonaTipo && config.zonaValore) {
    const etichetta = `Ranking · ${config.zonaValore}`;
    const esito = await posizioneRankingZona(giocatoreId, sport, config.zonaTipo, config.zonaValore);
    if (!esito) return { etichetta, posizione: null, totale: null, icona: 'map' };
    return { etichetta, posizione: esito.posizione, totale: esito.totale, extra: esito.valore.toFixed(2), icona: 'map' };
  }
  return null;
}

// Un centro può sponsorizzare fino a 5 prodotti (o abbonamenti): devono
// comparire TUTTI INSIEME in un'unica scheda ADV, non una scheda ripetuta
// per ciascuno (fix utente esplicito) — raggruppati per centro_id, così un
// centro con più sponsorizzazioni resta comunque UNA scheda sola.
function raggruppaPerCentro<T extends { centro_id: string }>(righe: T[]): { centroId: string; righe: T[] }[] {
  const gruppi = new Map<string, T[]>();
  for (const r of righe) {
    if (!gruppi.has(r.centro_id)) gruppi.set(r.centro_id, []);
    gruppi.get(r.centro_id)!.push(r);
  }
  return Array.from(gruppi.entries()).map(([centroId, righe]) => ({ centroId, righe }));
}

export function HomeCarousel() {
  const router = useRouter();
  const { me } = useAuth();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const { width: larghezzaFinestra } = useWindowDimensions();
  const movimentoRidotto = useMovimentoRidotto();
  // La pagina intorno a questo componente ha sempre Spacing.lg di padding su
  // entrambi i lati (stesso schema di CalendarWidget/ctaCard) — la scheda
  // riempie esattamente quello spazio, MAI più larga di 390 (fix utente).
  const larghezzaScheda = Math.min(390, larghezzaFinestra - Spacing.lg * 2);
  const s = useMemo(() => makeStyles(colors, glass, larghezzaScheda), [colors, glass, larghezzaScheda]);

  const [centri, setCentri] = useState<Centro[]>([]);
  const [config, setConfig] = useState<[ConfigWidgetHome, ConfigWidgetHome]>([DEFAULT_WIDGET_SINISTRA, DEFAULT_WIDGET_DESTRA]);
  const [globale, setGlobale] = useState<EsitoWidget | null>(null);
  const [variazione, setVariazione] = useState<VariazioneRanking | null>(null);
  const [andamento, setAndamento] = useState<AndamentoRecente>(ANDAMENTO_VUOTO);
  const [prossimaPartita, setProssimaPartita] = useState<ProssimaPartita | null>(null);
  const [insights, setInsights] = useState<InsightsSociali>(INSIGHTS_VUOTI);
  const [esiti, setEsiti] = useState<[EsitoWidget | null, EsitoWidget | null]>([null, null]);
  const [eventiADV, setEventiADV] = useState<EventoCustom[]>([]);
  const [prodottiADV, setProdottiADV] = useState<ShopProdotto[]>([]);
  const [abbonamentiADV, setAbbonamentiADV] = useState<AbbonamentoTemplate[]>([]);
  const [slotConfigurando, setSlotConfigurando] = useState<0 | 1 | null>(null);
  const [pagina, setPagina] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { getCentri().then(setCentri); caricaConfigWidget().then(setConfig); }, []);

  useEffect(() => {
    getEventiInEvidenza().then(setEventiADV);
    getProdottiSponsorizzati().then((righe) => setProdottiADV(righe.filter((p) => !p.sport || p.sport === sportAttivo)));
    getAbbonamentiSponsorizzati().then((righe) => setAbbonamentiADV(righe.filter((a) => !a.sport || a.sport === sportAttivo)));
  }, [sportAttivo]);

  useEffect(() => {
    if (!me) return;
    posizioneRankingGlobale(me.id, sportAttivo).then((esito) => {
      setGlobale(esito ? { etichetta: 'Ranking nazionale', posizione: esito.posizione, totale: esito.totale, extra: esito.valore.toFixed(2), icona: 'trophy' } : null);
    });
    // Slide 1 (fix utente esplicito: "aggiungi solo la variazione ranking
    // negli ultimi 30 giorni") — richiesta separata: la posizione attuale
    // resta affidabile anche se questa (più pesante, ricostruita su tutta
    // la popolazione) impiega qualche istante in più o fallisce.
    getVariazioneRankingGlobale(me.id, sportAttivo, 30).then(setVariazione);
    // Slide 2 e 3 (fix utente esplicito: "vita sportiva recente" + "insight
    // personali e divertenti") — derivate dalle partite reali, mai finte.
    getAndamentoRecente(me.id, sportAttivo, 10).then(setAndamento);
    getInsightsSociali(me.id, sportAttivo).then(setInsights);
    // Frase contestuale della slide 2 (fix utente esplicito: "se ha una
    // serie positiva ed ha una partita a breve deve dire qualcosa a
    // riguardo") — combinata con andamento/streak in generaFraseAndamento.
    getProssimaPartita(me.id, sportAttivo).then(setProssimaPartita);
  }, [me?.id, sportAttivo]);

  useEffect(() => {
    if (!me || centri.length === 0) return;
    Promise.all(config.map((c) => risolviWidget(c, me.id, me.genere, sportAttivo, centri))).then((r) => setEsiti([r[0], r[1]]));
  }, [me?.id, me?.genere, sportAttivo, centri, config]);

  const gruppiProdotti = useMemo(() => raggruppaPerCentro(prodottiADV), [prodottiADV]);
  const gruppiAbbonamenti = useMemo(() => raggruppaPerCentro(abbonamentiADV), [abbonamentiADV]);
  const nomeCentro = (centroId: string) => centri.find((c) => c.id === centroId)?.nome ?? 'Centro';

  const salvaSlot = (indice: 0 | 1, nuovo: ConfigWidgetHome) => {
    setConfig((cur) => {
      const next: [ConfigWidgetHome, ConfigWidgetHome] = indice === 0 ? [nuovo, cur[1]] : [cur[0], nuovo];
      salvaConfigWidget(next);
      return next;
    });
    setSlotConfigurando(null);
  };

  const apriEvento = () => router.push('/(tabs)/eventi');
  const apriShop = () => router.push('/(tabs)/stars-coin');
  const apriGiocatore = (giocatoreId: string) => router.push({ pathname: '/(tabs)/giocatore/[id]', params: { id: giocatoreId } });
  // Tap su UN prodotto/abbonamento specifico dentro la scheda ADV multipla
  // deve portare dritto a quello, non solo all'apertura del centro (fix
  // utente esplicito) — vedi il deep-link letto da app/(tabs)/stars-coin.tsx.
  // Il click va registrato PRIMA di navigare (fire-and-forget, non
  // bloccante: la navigazione non deve mai aspettare la rete).
  const apriProdotto = (centroId: string, prodottoId: string) => {
    registraClickSponsor(centroId, 'prodotto', prodottoId, me?.id);
    router.push({ pathname: '/(tabs)/stars-coin', params: { centroId, prodottoId } });
  };
  const apriAbbonamento = (centroId: string, abbonamentoId: string) => {
    registraClickSponsor(centroId, 'abbonamento', abbonamentoId, me?.id);
    router.push({ pathname: '/(tabs)/stars-coin', params: { centroId, abbonamentoId } });
  };

  // ============================================================
  // Motore del carosello: autoplay + swipe manuale + loop infinito senza
  // salti visivi + pausa al tocco + rispetto di prefers-reduced-motion (fix
  // utente esplicito, vedi tutta questa sezione). Le 3 slide personali
  // (ranking, andamento recente, insight social) sono SEMPRE presenti e
  // sempre per prime; dopo vengono le ADV del centro. Le pagine "reali" i
  // vanno da 0 a n-1: per il loop, la ScrollView renderizza [ultima,
  // ...reali, prima] (n+2 pagine) e la posizione iniziale è l'indice
  // esteso 1 (= reale 0). Quando l'utente/l'autoplay arriva su un clone
  // (estremo 0 o n+1), non appena lo scroll si ferma si salta SENZA
  // animazione alla pagina reale identica — il clone è pixel-identico
  // all'originale, quindi il salto non si vede (tecnica standard per i
  // caroselli infiniti, l'unico modo per non avere un salto quando si
  // torna dall'ultima alla prima senza mai "vedere" i bordi dell'array).
  // ============================================================
  const slide: { key: string; node: React.ReactNode }[] = [
    { key: 'ranking', node: (
      <RankingSlide globale={globale} variazione={variazione} sportAttivo={sportAttivo} esiti={esiti}
        onConfiguraSlot={setSlotConfigurando} colors={colors} s={s} />
    ) },
    { key: 'andamento', node: <AndamentoSlide andamento={andamento} prossimaPartita={prossimaPartita} colors={colors} s={s} /> },
    { key: 'social', node: <SocialSlide insights={insights} colors={colors} s={s} onApriGiocatore={apriGiocatore} /> },
    ...eventiADV.map((e) => ({
      key: `ev-${e.id}`,
      node: (
        <Pressable onPress={apriEvento} style={s.advCard}>
          {e.immagine_url && <Image source={{ uri: e.immagine_url.startsWith('http') ? e.immagine_url : apiUrl(e.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
          <View style={[StyleSheet.absoluteFillObject, s.advOverlay]} />
          <View style={s.advBadge}><Text style={s.advBadgeText}>EVENTO</Text></View>
          <Text style={s.advTitle} numberOfLines={2}>{e.nome}</Text>
          {e.descrizione && <Text style={s.advSubChiaro} numberOfLines={1}>{e.descrizione}</Text>}
        </Pressable>
      ),
    })),
    // Un centro con più prodotti sponsorizzati compare in UNA sola scheda
    // con tutti insieme, non una ripetuta per prodotto (fix utente
    // esplicito) — stesso trattamento per gli abbonamenti.
    ...gruppiProdotti.map((g) => ({
      key: `pr-${g.centroId}`,
      node: (
        <MultiADVCard badge="SHOP" centroNome={nomeCentro(g.centroId)}
          righe={g.righe} onPressCard={apriShop} onPressItem={(id) => apriProdotto(g.centroId, id)} s={s} colors={colors} />
      ),
    })),
    ...gruppiAbbonamenti.map((g) => ({
      key: `ab-${g.centroId}`,
      node: (
        <MultiADVCard badge="ABBONAMENTI" centroNome={nomeCentro(g.centroId)}
          righe={g.righe} onPressCard={apriShop} onPressItem={(id) => apriAbbonamento(g.centroId, id)} s={s} colors={colors} />
      ),
    })),
  ];
  const n = slide.length;
  const estese = [slide[n - 1], ...slide, slide[0]];

  // pagineADV: stesso ordine delle ADV sopra, indicizzato 0-based SOLO tra
  // le ADV (le 3 slide personali stanno prima, offset fisso = 3) — usata
  // solo per registrare un'impressione quando quella pagina diventa quella
  // attiva del carosello (fix utente esplicito: l'impression è la metà
  // mancante per calcolare un CTR vero, non solo il numero di click).
  const pagineADV = useMemo(() => {
    const pagine: ({ tipoTarget: 'prodotto' | 'abbonamento'; centroId: string; ids: string[] } | null)[] = [];
    for (let i = 0; i < eventiADV.length; i++) pagine.push(null);
    for (const g of gruppiProdotti) pagine.push({ tipoTarget: 'prodotto', centroId: g.centroId, ids: g.righe.slice(0, 5).map((r) => r.id) });
    for (const g of gruppiAbbonamenti) pagine.push({ tipoTarget: 'abbonamento', centroId: g.centroId, ids: g.righe.slice(0, 5).map((r) => r.id) });
    return pagine;
  }, [eventiADV, gruppiProdotti, gruppiAbbonamenti]);

  const pagineGiaLoggate = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (pagina < 3 || pagineGiaLoggate.current.has(pagina)) return;
    const info = pagineADV[pagina - 3];
    if (!info) return;
    pagineGiaLoggate.current.add(pagina);
    for (const id of info.ids) registraImpressioneSponsor(info.centroId, info.tipoTarget, id, me?.id);
  }, [pagina, pagineADV, me?.id]);

  // Indice ESTESO corrente (include i due cloni) — unica fonte di verità
  // per la matematica dello scroll; `pagina` (sotto) è solo la proiezione
  // logica 0..n-1 usata per i pallini/il resto della UI.
  const extIndexRef = useRef(1);
  const isScrollingRef = useRef(false);
  const toccandoRef = useRef(false);
  const autoplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // onMomentumScrollEnd non è affidabile ovunque per scroll AVVIATI DA
  // CODICE (verificato: su web, dopo uno scrollTo({animated:true})
  // programmatico non scatta mai, quindi l'autoplay si fermerebbe dopo un
  // solo giro) — l'assestamento dello scroll (manuale O automatico) si
  // rileva perciò da soli: un debounce sugli eventi onScroll, che invece
  // arrivano sempre su ogni piattaforma. onMomentumScrollEnd resta collegato
  // comunque, come scorciatoia in più dove arriva davvero (nativo): non fa
  // danno chiamare la correzione due volte, è idempotente.
  const assestamentoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const impostaIndiceEsteso = useCallback((idx: number) => {
    extIndexRef.current = idx;
    setPagina(((idx - 1) + n) % n);
  }, [n]);

  const fermaAutoplay = useCallback(() => {
    if (autoplayTimer.current) { clearTimeout(autoplayTimer.current); autoplayTimer.current = null; }
  }, []);

  // Programma il PROSSIMO avanzamento automatico — l'unico punto che fa
  // scorrere da sola la card. Auto-si-riprogramma da sé (vedi sotto), non
  // dipende da nessun evento di "fine scroll" del sistema.
  const programmaProssimoTick = useCallback(() => {
    fermaAutoplay();
    if (movimentoRidotto || toccandoRef.current || n <= 1) return;
    autoplayTimer.current = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: (extIndexRef.current + 1) * larghezzaScheda, animated: true });
    }, AUTOPLAY_MS);
  }, [movimentoRidotto, n, larghezzaScheda, fermaAutoplay]);

  // Riposiziona (SENZA animazione) sull'indice reale quando si atterra su
  // uno dei due cloni agli estremi — l'unico punto in cui "si vede" il
  // giro dell'array, ma essendo un clone pixel-identico non si vede nulla.
  const correggiCloni = useCallback((idxEsteso: number) => {
    if (idxEsteso === 0) {
      scrollRef.current?.scrollTo({ x: n * larghezzaScheda, animated: false });
      impostaIndiceEsteso(n);
    } else if (idxEsteso === n + 1) {
      scrollRef.current?.scrollTo({ x: 1 * larghezzaScheda, animated: false });
      impostaIndiceEsteso(1);
    }
  }, [n, larghezzaScheda, impostaIndiceEsteso]);

  // Chiamata quando lo scroll (manuale o automatico) si è davvero fermato:
  // corregge l'eventuale clone e rimette in moto l'autoplay — "dopo circa
  // 4.5 secondi riprende l'autoplay" (fix utente), misurati da QUI, non da
  // quando è partito lo swipe.
  const gestisciAssestamento = useCallback((idx: number) => {
    correggiCloni(idx);
    isScrollingRef.current = false;
    if (!toccandoRef.current) programmaProssimoTick();
  }, [correggiCloni, programmaProssimoTick]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / larghezzaScheda);
    impostaIndiceEsteso(idx);
    // Debounce "sei fermo?": ogni nuovo evento di scroll rimanda il
    // controllo di 120ms — quando smettono di arrivare (drag rilasciato E
    // l'eventuale inerzia/snap è terminata, oppure lo scrollTo animato
    // dell'autoplay è concluso), scatta la sistemazione finale.
    if (assestamentoTimer.current) clearTimeout(assestamentoTimer.current);
    assestamentoTimer.current = setTimeout(() => gestisciAssestamento(idx), 120);
  }, [larghezzaScheda, impostaIndiceEsteso, gestisciAssestamento]);

  const onScrollBeginDrag = useCallback(() => {
    isScrollingRef.current = true;
    toccandoRef.current = true;
    fermaAutoplay(); // "quando l'utente fa swipe manualmente, resetta il timer" (fix utente)
  }, [fermaAutoplay]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Scorciatoia quando l'evento arriva davvero (nativo): niente da
    // aspettare, l'assestamento è già qui. Idempotente rispetto al
    // debounce di onScroll qui sopra (può capitare che scattino entrambi).
    const idx = Math.round(e.nativeEvent.contentOffset.x / larghezzaScheda);
    if (assestamentoTimer.current) { clearTimeout(assestamentoTimer.current); assestamentoTimer.current = null; }
    impostaIndiceEsteso(idx);
    gestisciAssestamento(idx);
  }, [larghezzaScheda, impostaIndiceEsteso, gestisciAssestamento]);

  const onTouchStart = useCallback(() => {
    toccandoRef.current = true;
    fermaAutoplay(); // "se l'utente sta toccando la card, sospendi temporaneamente l'autoplay"
  }, [fermaAutoplay]);
  const onTouchEnd = useCallback(() => {
    toccandoRef.current = false;
    // Solo un tap (tap su un giocatore/bottone dentro la scheda), niente
    // drag in arrivo: nessun evento di scroll seguirà, tocca a noi
    // rimettere in moto l'autoplay. Se invece è in corso un vero swipe,
    // isScrollingRef è già true e sarà il debounce di onScroll a farlo.
    if (!isScrollingRef.current) programmaProssimoTick();
  }, [programmaProssimoTick]);

  // Riposiziona sulla pagina reale corrente (senza animazione, nessun
  // salto visivo) ogni volta che la larghezza scheda cambia — es. rotazione
  // schermo/resize sul web — e avvia l'autoplay al mount.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: extIndexRef.current * larghezzaScheda, animated: false });
  }, [larghezzaScheda]);
  useEffect(() => {
    programmaProssimoTick();
    return () => {
      fermaAutoplay();
      if (assestamentoTimer.current) clearTimeout(assestamentoTimer.current);
    };
  }, [programmaProssimoTick, fermaAutoplay]);

  const tornaAlRanking = () => scrollRef.current?.scrollTo({ x: 1 * larghezzaScheda, animated: true });

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <View style={{ height: ALTEZZA }}>
        <ScrollView
          ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
          pagingEnabled decelerationRate="fast"
          contentOffset={{ x: larghezzaScheda, y: 0 }}
          onScroll={onScroll} scrollEventThrottle={32}
          onScrollBeginDrag={onScrollBeginDrag} onMomentumScrollEnd={onMomentumScrollEnd}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        >
          {estese.map((item, i) => (
            <View key={`${item.key}-${i}`} style={{ width: larghezzaScheda }}>{item.node}</View>
          ))}
        </ScrollView>

        {/* Bottoncino "torna al ranking": sovrapposto in alto a destra,
            visibile solo quando NON si è già sulla prima scheda (fix
            utente esplicito). */}
        {pagina > 0 && (
          <Pressable style={s.tornaBtn} onPress={tornaAlRanking} hitSlop={8}>
            <BlurView intensity={30} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Ionicons name="trophy" size={15} color={colors.gold} />
          </Pressable>
        )}
      </View>

      {/* Pallini: indicano quante schede ci sono e su quale sei (fix utente) */}
      {n > 1 && (
        <View style={s.dotsRow}>
          {Array.from({ length: n }).map((_, i) => (
            <View key={i} style={[s.dot, i === pagina && { backgroundColor: colors.gold, width: 16 }]} />
          ))}
        </View>
      )}

      {slotConfigurando !== null && (
        <ConfiguraWidgetModal
          attuale={config[slotConfigurando]}
          centri={centri}
          onChiudi={() => setSlotConfigurando(null)}
          onSalva={(nuovo) => salvaSlot(slotConfigurando, nuovo)}
        />
      )}
    </View>
  );
}

// ---------- Slide 1: ranking globale + variazione 30gg + 2 widget ----------
function RankingSlide({ globale, variazione, sportAttivo, esiti, onConfiguraSlot, colors, s }: {
  globale: EsitoWidget | null; variazione: VariazioneRanking | null; sportAttivo: string;
  esiti: [EsitoWidget | null, EsitoWidget | null]; onConfiguraSlot: (i: 0 | 1) => void;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  // Variazione posizione ultimi 30gg (fix utente esplicito: "#147 → #129,
  // +18 posizioni") — positiva = risalita in classifica (posizione più
  // bassa = meglio), quindi il segno da mostrare è invertito rispetto alla
  // differenza numerica grezza tra le due posizioni.
  const delta = variazione?.posizionePrecedente != null ? variazione.posizionePrecedente - variazione.posizioneAttuale : null;
  return (
    <View style={s.card1}>
      <View style={s.globaleBox}>
        <Ionicons name="trophy" size={18} color={colors.gold} style={{ marginBottom: 2 }} />
        <Text style={s.globaleNum}>{globale?.posizione ? `#${globale.posizione}` : '—'}</Text>
        <Muted style={{ fontSize: Font.small, textAlign: 'center' }}>
          {globale?.totale ? `su ${globale.totale}${delta === null ? ' giocatori' : ''}` : 'non ancora in classifica'}
          {delta !== null && delta !== undefined && (
            <Text style={{ color: delta > 0 ? colors.green : delta < 0 ? colors.red : colors.slate, fontWeight: '800' }}>
              {globale?.totale ? ' · ' : ''}{delta > 0 ? '▲+' : delta < 0 ? '▼' : '='}{delta !== 0 ? Math.abs(delta) : ''}
            </Text>
          )}
        </Muted>
        <Text style={s.globaleLabel}>Ranking nazionale · {sportAttivo}</Text>
      </View>
      <View style={s.divider} />
      <View style={s.miniColonna}>
        <MiniWidget esito={esiti[0]} colors={colors} onPress={() => onConfiguraSlot(0)} />
        <View style={{ height: 1, backgroundColor: colors.navyLine + '22' }} />
        <MiniWidget esito={esiti[1]} colors={colors} onPress={() => onConfiguraSlot(1)} />
      </View>
    </View>
  );
}

// ---------- Slide 2: "vita sportiva recente" (fix utente esplicito) ----------
function AndamentoSlide({ andamento, prossimaPartita, colors, s }: {
  andamento: AndamentoRecente; prossimaPartita: ProssimaPartita | null; colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  if (andamento.disputate === 0) {
    return (
      <View style={s.card1}>
        <SlideVuota
          icona="tennisball-outline" titolo="Ancora nessuna partita"
          messaggio="Gioca la tua prima partita per vedere qui il tuo andamento recente"
          colors={colors} s={s}
        />
      </View>
    );
  }
  // Icona/testo/colore dell'andamento (fix utente esplicito: confronto tra
  // le 5 partite più vecchie e le 5 più recenti delle ultime 10) — null
  // quando ci sono troppo poche partite per un confronto sensato.
  const trendInfo = andamento.trend === 'crescita' ? { icona: 'trending-up' as const, testo: 'Crescita', colore: colors.green }
    : andamento.trend === 'calo' ? { icona: 'trending-down' as const, testo: 'Calo', colore: colors.red }
    : andamento.trend === 'stabile' ? { icona: 'remove' as const, testo: 'Stabile', colore: colors.slate }
    : null;
  // Frase "ironica e competizionale" che combina streak/trend e prossima
  // partita reale (fix utente esplicito) — ricalcolata a ogni render, ma il
  // CONTENUTO dipende solo dai dati: cambia il template scelto a parità di
  // caso, non il caso stesso.
  const frase = useMemo(() => generaFraseAndamento(andamento, prossimaPartita), [andamento, prossimaPartita]);
  return (
    <View style={[s.card1, { flexDirection: 'column' }]}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={[s.globaleBox, { gap: 5 }]}>
          <Ionicons name="pulse" size={18} color={colors.gold} />
          <View style={{ alignItems: 'center', gap: 1 }}>
            <Text style={s.globaleNum}>{andamento.winRatePercento}%</Text>
            <Muted style={{ fontSize: Font.small, textAlign: 'center' }}>win rate</Muted>
          </View>
          <Text style={s.globaleLabel}>Ultime {andamento.disputate} partite</Text>
          {andamento.streak && (
            <View style={s.streakChip}>
              <Ionicons name="flame" size={12} color={andamento.streak.tipo === 'vittorie' ? colors.gold : colors.slate} />
              <Text style={[s.streakChipTesto, andamento.streak.tipo !== 'vittorie' && { color: colors.slate }]} numberOfLines={1}>
                {andamento.streak.conteggio} {andamento.streak.tipo}
              </Text>
            </View>
          )}
        </View>
        <View style={s.divider} />
        <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
          <View style={s.andamentoRiga}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={s.andamentoTesto}>{andamento.vinte} vinte</Text>
            <View style={s.andamentoRigaDividerV} />
            <Ionicons name="close-circle" size={18} color={colors.red} />
            <Text style={s.andamentoTesto}>{andamento.perse} perse</Text>
          </View>
          <View style={[s.andamentoRiga, { gap: 5 }]}>
            {/* Dal più vecchio (a sinistra) al più recente (a destra, "adesso") —
                stessa convenzione dei "form guide" sportivi (fix utente esplicito). */}
            {[...andamento.formaRecente].reverse().map((v, i) => (
              <View key={i} style={[s.formaPallino, { backgroundColor: v ? colors.green : colors.red }]} />
            ))}
          </View>
          <View>
            <View style={s.andamentoDividerOriz} />
            <View style={[s.andamentoStatsRow, { marginTop: 7 }]}>
              <View style={[s.andamentoStatTile, { flex: 0.8 }]}>
                <Text style={s.andamentoStatLabel}>Set vinti</Text>
                <Text style={[s.andamentoStatValore, { color: colors.green }]}>{andamento.setVinti}</Text>
              </View>
              <View style={[s.andamentoStatTile, { flex: 0.8 }]}>
                <Text style={s.andamentoStatLabel}>Set persi</Text>
                <Text style={[s.andamentoStatValore, { color: colors.red }]}>{andamento.setPersi}</Text>
              </View>
              <View style={[s.andamentoStatTile, { flex: 1.3 }]}>
                <Text style={s.andamentoStatLabel}>Forma</Text>
                {trendInfo ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name={trendInfo.icona} size={12} color={trendInfo.colore} />
                    <Text style={[s.andamentoStatValore, { color: trendInfo.colore, fontSize: 11.5 }]} numberOfLines={1}>{trendInfo.testo}</Text>
                  </View>
                ) : (
                  <Text style={[s.andamentoStatValore, { color: colors.slate }]}>—</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>
      {/* Banner "ironico e competizionale" (fix utente esplicito) — sempre
          in fondo alla card, stesso tono dei saluti adattivi della Home
          (lib/saluto.ts), ma qui reagisce a streak/trend + prossima partita. */}
      <View style={s.andamentoBanner}>
        <Ionicons name={frase.icona} size={13} color={colors.gold} />
        <Text style={s.andamentoBannerTesto} numberOfLines={2}>{frase.testo}</Text>
      </View>
    </View>
  );
}

// ---------- Slide 3: insight "social" — compagno/nemesi/avversario
// preferito (fix utente esplicito: "insight personali e divertenti, non
// statistiche amministrative") ----------
function SocialSlide({ insights, colors, s, onApriGiocatore }: {
  insights: InsightsSociali; colors: AppColors; s: ReturnType<typeof makeStyles>; onApriGiocatore: (id: string) => void;
}) {
  const tutteVuote = !insights.compagnoPreferito && !insights.nemesi && !insights.avversarioPreferito;
  if (tutteVuote) {
    return (
      <View style={s.card1}>
        <SlideVuota
          icona="people-outline" titolo="Ancora presto per dirlo"
          messaggio="Gioca qualche partita in più per scoprire compagni e avversari preferiti"
          colors={colors} s={s}
        />
      </View>
    );
  }
  // 3 colonne (fix utente esplicito, mockup condiviso: avatar con anello
  // colorato, doppia riga statistica, chip "insight" contestuale sotto) —
  // adattate all'altezza fissa della card: niente titolo/sottotitolo in
  // testa (non c'entrerebbe), il resto segue lo stesso linguaggio.
  return (
    <View style={[s.card1, { paddingHorizontal: Spacing.sm }]}>
      <SocialColonna
        titolo="Compagno" icona="people" ringColor={colors.gold} dato={insights.compagnoPreferito}
        riga1={(d) => `${d.partiteInsieme} partite insieme`}
        riga2={(d) => `${Math.round((d.vittorie / d.partiteInsieme) * 100)}% vittorie`}
        insight={insightCompagno} pillTint={colors.gold}
        messaggioVuoto="Gioca in doppio per trovare il tuo compagno ideale"
        colors={colors} s={s} onApriGiocatore={onApriGiocatore}
      />
      <View style={s.socialColonnaDivider} />
      <SocialColonna
        titolo="Nemesi" icona="skull" ringColor={colors.red} dato={insights.nemesi}
        riga1={(d) => `${d.vittorie} vittorie`}
        riga2={(d) => `${d.sconfitte} sconfitte`}
        insight={insightNemesi} pillTint={colors.red}
        messaggioVuoto="Continua a giocare per scoprirla"
        colors={colors} s={s} onApriGiocatore={onApriGiocatore}
      />
      <View style={s.socialColonnaDivider} />
      <SocialColonna
        titolo="Preferito" icona="trophy" ringColor={colors.gold} dato={insights.avversarioPreferito}
        riga1={(d) => `${d.vittorie} vittorie`}
        riga2={(d) => `${d.sconfitte} sconfitte`}
        insight={insightPreferito} pillTint={colors.gold}
        messaggioVuoto="Continua a giocare per scoprirlo"
        colors={colors} s={s} onApriGiocatore={onApriGiocatore}
        // Solo l'intestazione di QUESTA colonna arriva sotto al bottoncino
        // "torna al ranking" (sempre in alto a destra sopra ogni slide
        // successiva alla prima) — si sposta solo lei, non tutta la
        // colonna: avatar/nome/statistiche restano alla larghezza piena,
        // niente troncamento dei nomi per far spazio (fix utente esplicito).
        headerRightInset={26}
      />
    </View>
  );
}

type Insight = NonNullable<InsightsSociali['compagnoPreferito']>;
// Micro-copy contestuale sotto ogni colonna (fix utente esplicito, mockup
// condiviso: "Ottima intesa!", "Sfida aperta!", "Dominio totale!") — deriva
// SEMPRE dai numeri reali già calcolati, mai un testo a caso.
function insightCompagno(d: Insight): { icona: React.ComponentProps<typeof Ionicons>['name']; testo: string } {
  const wr = d.vittorie / d.partiteInsieme;
  if (wr >= 0.7) return { icona: 'thumbs-up', testo: 'Ottima intesa' };
  if (wr >= 0.5) return { icona: 'thumbs-up-outline', testo: 'Buona coppia' };
  return { icona: 'build-outline', testo: 'Da rodare' };
}
function insightNemesi(d: Insight): { icona: React.ComponentProps<typeof Ionicons>['name']; testo: string } {
  if (d.vittorie > d.sconfitte) return { icona: 'flag-outline', testo: 'Sfida aperta' };
  if (d.vittorie === d.sconfitte) return { icona: 'git-compare-outline', testo: 'Equilibrio' };
  return { icona: 'warning-outline', testo: 'Ancora ostico' };
}
function insightPreferito(d: Insight): { icona: React.ComponentProps<typeof Ionicons>['name']; testo: string } {
  if (d.sconfitte === 0) return { icona: 'ribbon', testo: 'Dominio totale' };
  return { icona: 'trending-up', testo: 'Ti riesce bene' };
}

function SocialColonna({ titolo, icona, ringColor, dato, riga1, riga2, insight, pillTint, messaggioVuoto, colors, s, onApriGiocatore, headerRightInset }: {
  titolo: string; icona: React.ComponentProps<typeof Ionicons>['name']; ringColor: string; dato: Insight | null;
  riga1: (d: Insight) => string; riga2: (d: Insight) => string; insight: (d: Insight) => { icona: React.ComponentProps<typeof Ionicons>['name']; testo: string };
  pillTint: string; messaggioVuoto: string;
  colors: AppColors; s: ReturnType<typeof makeStyles>; onApriGiocatore: (id: string) => void;
  headerRightInset?: number;
}) {
  if (!dato) {
    return (
      <View style={s.socialColonna}>
        <View style={[s.socialColonnaHead, headerRightInset ? { marginRight: headerRightInset } : null]}>
          <Ionicons name={icona} size={13} color={colors.slate} />
          <Text style={s.socialColonnaLabel} numberOfLines={1}>{titolo}</Text>
        </View>
        <View style={s.socialColonnaIconaVuota}>
          <Ionicons name={`${icona}-outline` as any} size={18} color={colors.slate} />
        </View>
        <Text style={s.socialVuotoTesto} numberOfLines={3}>{messaggioVuoto}</Text>
      </View>
    );
  }
  const ins = insight(dato);
  return (
    <Pressable onPress={() => onApriGiocatore(dato.giocatoreId)} style={s.socialColonna}>
      <View style={[s.socialColonnaHead, headerRightInset ? { marginRight: headerRightInset } : null]}>
        <Ionicons name={icona} size={13} color={ringColor} />
        <Text style={s.socialColonnaLabel} numberOfLines={1}>{titolo}</Text>
      </View>
      <Avatar name={dato.nome} uri={dato.avatarUrl} size={42} gold ringColor={ringColor} />
      <Text style={s.socialColonnaNome} numberOfLines={1}>{dato.nome}</Text>
      <Text style={s.socialColonnaStat} numberOfLines={1}>{riga1(dato)}</Text>
      <Text style={[s.socialColonnaStat, { color: colors.gold, fontWeight: '800' }]} numberOfLines={1}>{riga2(dato)}</Text>
      <View style={[s.socialInsightPill, { backgroundColor: pillTint + '18' }]}>
        <Ionicons name={ins.icona} size={11} color={pillTint} />
        <Text style={[s.socialInsightTesto, { color: pillTint }]} numberOfLines={1}>{ins.testo}</Text>
      </View>
    </Pressable>
  );
}

// Messaggio contestuale a tutta scheda (mai "0 partite"/"0%"/"nessun
// avversario" — fix utente esplicito) — stessa dimensione/posizione della
// card1, solo centrata invece che divisa in colonne.
function SlideVuota({ icona, titolo, messaggio, colors, s }: {
  icona: React.ComponentProps<typeof Ionicons>['name']; titolo: string; messaggio: string;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.slideVuotaWrap}>
      <Ionicons name={icona} size={26} color={colors.slate} />
      <Text style={s.slideVuotaTitolo}>{titolo}</Text>
      <Muted style={s.slideVuotaMessaggio}>{messaggio}</Muted>
    </View>
  );
}

function MiniWidget({ esito, colors, onPress }: { esito: EsitoWidget | null; colors: AppColors; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={miniStyles.wrap}>
      <Ionicons name={esito?.icona ?? 'add-circle-outline'} size={22} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={[miniStyles.label, { color: colors.slate }]} numberOfLines={1}>{esito?.etichetta ?? 'Configura widget'}</Text>
        {esito?.posizione ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[miniStyles.valore, { color: colors.navyDeep }]}>#{esito.posizione}</Text>
            <Muted style={{ fontSize: Font.small }}>{esito.extra}</Muted>
          </View>
        ) : (
          <Muted style={{ fontSize: Font.small }}>{esito ? 'nessun dato' : 'tocca per scegliere'}</Muted>
        )}
      </View>
      <Ionicons name="settings-outline" size={14} color={colors.slate} />
    </Pressable>
  );
}

const miniStyles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.2, marginBottom: 3 },
  valore: { fontSize: Font.h2, fontWeight: '900' },
});

// Una scheda ADV con fino a 5 elementi sponsorizzati dallo STESSO centro,
// affiancati in una riga di riquadri — non c'è più un'unica immagine hero
// (nessuna "la" immagine quando sono 5 prodotti diversi), quindi qui lo
// sfondo resta piatto e ogni elemento porta la propria miniatura.
function MultiADVCard<T extends { id: string; nome: string; prezzo_coin: number; immagine_url?: string | null }>({
  badge, centroNome, righe, onPressCard, onPressItem, s, colors,
}: {
  badge: string; centroNome: string; righe: T[]; onPressCard: () => void; onPressItem: (id: string) => void;
  s: ReturnType<typeof makeStyles>; colors: AppColors;
}) {
  return (
    <Pressable onPress={onPressCard} style={[s.advCard, s.multiCard]}>
      <View style={[s.advBadge, { backgroundColor: colors.gold }]}><Text style={[s.advBadgeText, { color: colors.navyDeep }]}>{badge}</Text></View>
      <Text style={s.advTitle} numberOfLines={1}>{centroNome}</Text>
      <View style={s.tileRow}>
        {righe.slice(0, 5).map((r) => (
          // Pressable annidato: il tap su UNA tile porta dritto a quel
          // prodotto/abbonamento (fix utente esplicito), il tap sullo
          // sfondo della scheda resta il generico "apri lo shop del centro".
          <Pressable key={r.id} onPress={() => onPressItem(r.id)} style={s.tile}>
            <View style={s.tileImg}>
              {r.immagine_url
                ? <Image source={{ uri: r.immagine_url.startsWith('http') ? r.immagine_url : apiUrl(r.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                : <Ionicons name="pricetag-outline" size={16} color={colors.gold} />}
            </View>
            <Text style={s.tileNome} numberOfLines={2}>{r.nome}</Text>
            <Text style={s.tilePrezzo}>{Math.round(r.prezzo_coin)} SC</Text>
          </Pressable>
        ))}
      </View>
    </Pressable>
  );
}

// ---------- Modale di configurazione di uno slot ----------
const OPZIONI_TIPO: { tipo: TipoWidgetHome; label: string; descr: string }[] = [
  { tipo: 'classifica_centro', label: 'Star del mese', descr: 'Classifica mensile per punti di un centro' },
  { tipo: 'ranking_centro', label: 'Ranking di un centro', descr: 'La tua posizione tra i giocatori di un centro' },
  { tipo: 'ranking_zona', label: 'Ranking di una zona', descr: 'La tua posizione tra i giocatori di una regione o provincia' },
];

function ConfiguraWidgetModal({ attuale, centri, onChiudi, onSalva }: {
  attuale: ConfigWidgetHome; centri: Centro[]; onChiudi: () => void; onSalva: (c: ConfigWidgetHome) => void;
}) {
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors, glass, 390), [colors, glass]);
  const [tipo, setTipo] = useState<TipoWidgetHome>(attuale.tipo);
  const [centroId, setCentroId] = useState<string | undefined>(attuale.centroId);
  const [zonaTipo, setZonaTipo] = useState<'regione' | 'provincia'>(attuale.zonaTipo ?? 'provincia');
  const [zonaValore, setZonaValore] = useState<string | undefined>(attuale.zonaValore);

  const valoriZona = useMemo(
    () => Array.from(new Set(centri.map((c) => (zonaTipo === 'regione' ? c.regione : c.provincia)).filter((v): v is string => !!v))).sort(),
    [centri, zonaTipo]
  );

  const confermabile = tipo === 'ranking_zona' ? Boolean(zonaValore) : true;
  const conferma = () => {
    if (tipo === 'ranking_zona') {
      if (!zonaValore) return;
      onSalva({ tipo, zonaTipo, zonaValore });
    } else {
      const centro = centri.find((c) => c.id === centroId);
      onSalva({ tipo, centroId: centro?.id, centroNome: centro?.nome });
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <Text style={s.modaleTitolo}>Cosa vuoi vedere?</Text>

          {OPZIONI_TIPO.map((o) => (
            <Pressable key={o.tipo} style={s.opzioneRiga} onPress={() => setTipo(o.tipo)}>
              <Ionicons name={tipo === o.tipo ? 'radio-button-on' : 'radio-button-off'} size={20} color={tipo === o.tipo ? colors.gold : colors.slate} />
              <View style={{ flex: 1 }}>
                <Text style={s.opzioneLabel}>{o.label}</Text>
                <Muted style={{ fontSize: Font.tiny }}>{o.descr}</Muted>
              </View>
            </Pressable>
          ))}

          {tipo !== 'ranking_zona' ? (
            <>
              <Text style={s.sottoTitolo}>Centro</Text>
              <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                {centri.map((c) => {
                  const attivo = centroId ? centroId === c.id : c.id === centri[0]?.id;
                  return (
                    <Pressable key={c.id} style={s.opzioneRigaCompatta} onPress={() => setCentroId(c.id)}>
                      <Ionicons name={attivo ? 'radio-button-on' : 'radio-button-off'} size={18} color={attivo ? colors.gold : colors.slate} />
                      <Text style={s.opzioneLabel}>{c.nome}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm }}>
                <Pressable style={[s.pillScelta, zonaTipo === 'provincia' && s.pillSceltaAttiva]} onPress={() => { setZonaTipo('provincia'); setZonaValore(undefined); }}>
                  <Text style={[s.pillSceltaText, zonaTipo === 'provincia' && s.pillSceltaTextAttiva]}>Provincia</Text>
                </Pressable>
                <Pressable style={[s.pillScelta, zonaTipo === 'regione' && s.pillSceltaAttiva]} onPress={() => { setZonaTipo('regione'); setZonaValore(undefined); }}>
                  <Text style={[s.pillSceltaText, zonaTipo === 'regione' && s.pillSceltaTextAttiva]}>Regione</Text>
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
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

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Pressable style={s.btnGhost} onPress={onChiudi}><Text style={s.btnGhostText}>Annulla</Text></Pressable>
            <Pressable style={[s.btnPieno, !confermabile && { opacity: 0.4 }]} onPress={conferma} disabled={!confermabile}>
              <Text style={s.btnPienoText}>Salva</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass, larghezzaScheda: number) {
  return StyleSheet.create({
    // Niente più Card/boxShadow qui (fix utente esplicito: "rimuovi quelle
    // ombreggiature sugli angoli che si sono sminchiate") — dentro una
    // ScrollView orizzontale con pagingEnabled un box-shadow su ogni scheda
    // si taglia in modo sporco ai bordi di scroll; un bordo sottile piatto
    // basta a dare definizione senza quell'artefatto, stessa tecnica già
    // in uso per le schede ADV qui sotto (mai avuto il problema).
    card1: {
      width: larghezzaScheda, height: ALTEZZA, flexDirection: 'row', padding: Spacing.lg,
      backgroundColor: colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: colors.navyLine + '33',
    },
    globaleBox: { width: 110, alignItems: 'center', justifyContent: 'center', gap: 2 },
    globaleNum: { fontSize: 40, fontWeight: '900', color: colors.gold, lineHeight: 46 },
    globaleLabel: { fontSize: 11, fontWeight: '700', color: colors.navyDeep, textAlign: 'center', marginTop: 6 },
    divider: { width: 1, backgroundColor: colors.navyLine + '33', marginHorizontal: Spacing.md },
    miniColonna: { flex: 1, justifyContent: 'space-around' },
    // Slide 2 "andamento recente": righe bilancio/streak, stesso ritmo
    // verticale di MiniWidget qui sopra (icona + testo su una riga).
    andamentoRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
    andamentoTesto: { fontSize: Font.small, fontWeight: '700', color: colors.navyDeep },
    andamentoRigaDividerV: { width: 1, height: 14, backgroundColor: colors.navyLine + '33' },
    formaPallino: { width: 10, height: 10, borderRadius: 5 },
    // Chip "N vittorie/sconfitte consecutive" sotto l'etichetta a sinistra —
    // stesso linguaggio di Pill (components/ui.tsx), tinta oro tenue.
    streakChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill,
      backgroundColor: colors.gold + '18', maxWidth: 104,
    },
    streakChipTesto: { fontSize: 9.5, fontWeight: '800', color: colors.navyDeep, flexShrink: 1 },
    // Riga di 3 mini-stat (Set vinti/Set persi/Forma) sotto una sottile riga
    // divisoria orizzontale — fix utente esplicito, ispirata al mockup
    // condiviso ma condensata per stare nell'altezza fissa della card.
    andamentoDividerOriz: { height: 1, backgroundColor: colors.navyLine + '22', marginHorizontal: Spacing.sm },
    andamentoStatsRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm },
    andamentoStatTile: { flex: 1, gap: 1 },
    andamentoStatLabel: { fontSize: 9, fontWeight: '800', color: colors.slate, textTransform: 'uppercase', letterSpacing: 0.2 },
    andamentoStatValore: { fontSize: 15, fontWeight: '800', color: colors.navyDeep },
    // Banner frase "ironica e competizionale" in fondo alla slide 2 (fix
    // utente esplicito) — tinta oro tenue, stesso linguaggio dello
    // streakChip qui sopra, ma a piena larghezza.
    andamentoBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
      paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.sm,
      backgroundColor: colors.gold + '14',
    },
    andamentoBannerTesto: { flex: 1, fontSize: 10.5, fontWeight: '700', color: colors.navyDeep, lineHeight: 13.5 },
    // Slide 3 "social": 3 righe orizzontali piene (non più 3 colonne strette
    // — fix utente esplicito "info strutturate meglio, non tagliate, più
    // leggibili") — ogni riga si divide lo spazio verticale in parti
    // uguali (flex:1), un nome ha tutta la larghezza della card per sé.
    // Slide 3 "avversari": 3 colonne con avatar (anello colorato), doppia
    // riga statistica e chip "insight" contestuale sotto (fix utente
    // esplicito, mockup condiviso) — dimensioni scelte per riempire bene
    // l'altezza fissa della card senza mai uscirne.
    socialColonnaDivider: { width: 1, backgroundColor: colors.navyLine + '33', marginHorizontal: 4 },
    socialColonna: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2 },
    socialColonnaHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    socialColonnaLabel: { fontSize: 10, fontWeight: '800', color: colors.slate, textTransform: 'uppercase', letterSpacing: 0.2 },
    socialColonnaIconaVuota: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center' },
    socialColonnaNome: { fontSize: 12.5, fontWeight: '800', color: colors.navyDeep, maxWidth: '100%' },
    socialColonnaStat: { fontSize: 10, fontWeight: '600', color: colors.slate },
    socialInsightPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.pill, marginTop: 1, maxWidth: '100%' },
    socialInsightTesto: { fontSize: 9, fontWeight: '800' },
    socialVuotoTesto: { fontSize: 9.5, fontWeight: '600', color: colors.slate, textAlign: 'center', lineHeight: 12.5, marginTop: 2 },
    // Messaggio contestuale a tutta scheda (slide 2/3 senza abbastanza dati).
    slideVuotaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: Spacing.xl },
    slideVuotaTitolo: { fontSize: Font.small, fontWeight: '800', color: colors.navyDeep, marginTop: 2 },
    slideVuotaMessaggio: { fontSize: Font.tiny, textAlign: 'center', lineHeight: 15 },
    // Sfondo scuro FISSO (non colors.navyCard, che è quasi bianco in tema
    // chiaro — fix bug reale: il titolo bianco della scheda multi-prodotto
    // sarebbe finito illeggibile) — stessa "unica superficie scura
    // intenzionale" della navbar, indipendente dal tema, perché qui il
    // testo bianco/oro deve restare leggibile sia con sia senza immagine
    // di sfondo.
    advCard: {
      width: larghezzaScheda, height: ALTEZZA, borderRadius: Radius.card, overflow: 'hidden',
      backgroundColor: 'rgba(30, 49, 74, 0.92)', padding: Spacing.lg, justifyContent: 'flex-end',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    },
    advOverlay: { backgroundColor: 'rgba(15,23,38,0.38)' },
    advBadge: { position: 'absolute', top: Spacing.md, left: Spacing.md, backgroundColor: colors.navy, paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    advBadgeText: { color: colors.white, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
    advTitle: { color: colors.white, fontSize: Font.h3, fontWeight: '800' },
    advSub: { color: colors.goldSoft, fontSize: Font.small, fontWeight: '700', marginTop: 4 },
    advSubChiaro: { color: 'rgba(255,255,255,0.75)', fontSize: Font.small, fontWeight: '600', marginTop: 4 },
    multiCard: { justifyContent: 'flex-start', paddingTop: Spacing.xl + Spacing.md },
    tileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, marginTop: Spacing.md },
    tile: { flex: 1, alignItems: 'center' },
    tileImg: {
      width: 38, height: 38, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4,
    },
    tileNome: { color: colors.white, fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
    tilePrezzo: { color: colors.goldSoft, fontSize: 9, fontWeight: '800', marginTop: 2 },
    tornaBtn: {
      position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 34, height: 34, borderRadius: 17,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      borderWidth: 1, borderColor: glass.regularBorder,
      boxShadow: '0 4px 12px rgba(20,30,48,0.18)',
    } as any,
    dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.navyLine + '77' },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: glass.regularBorder },
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    sottoTitolo: { color: colors.slate, fontSize: Font.small, fontWeight: '700', marginTop: Spacing.sm, marginBottom: 4 },
    opzioneRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
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
