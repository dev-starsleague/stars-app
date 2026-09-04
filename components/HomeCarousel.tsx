import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Modal, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSport } from '../lib/sport';
import { apiUrl } from '../lib/apiClient';
import {
  getCentri, getClassifica, posizioneRankingGlobale, posizioneRankingCentro, posizioneRankingZona,
  getEventiInEvidenza, getProdottiSponsorizzati, getAbbonamentiSponsorizzati,
  registraImpressioneSponsor, registraClickSponsor,
} from '../lib/api';
import {
  caricaConfigWidget, salvaConfigWidget, DEFAULT_WIDGET_SINISTRA, DEFAULT_WIDGET_DESTRA,
} from '../lib/homeWidgets';
import type { ConfigWidgetHome, TipoWidgetHome } from '../lib/homeWidgets';
import { Muted } from './ui';
import { Radius, Spacing, Font, AppColors, AppGlass, CORNER_SMOOTHING } from '../constants/theme';
import type { Centro, EventoCustom, ShopProdotto, AbbonamentoTemplate } from '../types/models';

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
  // La pagina intorno a questo componente ha sempre Spacing.lg di padding su
  // entrambi i lati (stesso schema di CalendarWidget/ctaCard) — la scheda
  // riempie esattamente quello spazio, MAI più larga di 390 (fix utente).
  const larghezzaScheda = Math.min(390, larghezzaFinestra - Spacing.lg * 2);
  const s = useMemo(() => makeStyles(colors, glass, larghezzaScheda), [colors, glass, larghezzaScheda]);

  const [centri, setCentri] = useState<Centro[]>([]);
  const [config, setConfig] = useState<[ConfigWidgetHome, ConfigWidgetHome]>([DEFAULT_WIDGET_SINISTRA, DEFAULT_WIDGET_DESTRA]);
  const [globale, setGlobale] = useState<EsitoWidget | null>(null);
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
  }, [me?.id, sportAttivo]);

  useEffect(() => {
    if (!me || centri.length === 0) return;
    Promise.all(config.map((c) => risolviWidget(c, me.id, me.genere, sportAttivo, centri))).then((r) => setEsiti([r[0], r[1]]));
  }, [me?.id, me?.genere, sportAttivo, centri, config]);

  const gruppiProdotti = useMemo(() => raggruppaPerCentro(prodottiADV), [prodottiADV]);
  const gruppiAbbonamenti = useMemo(() => raggruppaPerCentro(abbonamentiADV), [abbonamentiADV]);
  const nomeCentro = (centroId: string) => centri.find((c) => c.id === centroId)?.nome ?? 'Centro';

  // Mappa pagina→elementi mostrati, stesso ordine del render sotto (card1,
  // poi eventi — non tracciati, hanno un sistema di promozione a parte —
  // poi i gruppi prodotti/abbonamenti) — serve solo per registrare
  // un'impressione quando quella pagina diventa quella attiva del
  // carosello (fix utente esplicito: "quante persone hanno cliccato...
  // statistiche precise che si usano con le ads" — l'impression è la metà
  // mancante per calcolare un CTR vero, non solo il numero di click).
  const pagineADV = useMemo(() => {
    const pagine: ({ tipoTarget: 'prodotto' | 'abbonamento'; centroId: string; ids: string[] } | null)[] = [];
    for (let i = 0; i < eventiADV.length; i++) pagine.push(null);
    for (const g of gruppiProdotti) pagine.push({ tipoTarget: 'prodotto', centroId: g.centroId, ids: g.righe.slice(0, 5).map((r) => r.id) });
    for (const g of gruppiAbbonamenti) pagine.push({ tipoTarget: 'abbonamento', centroId: g.centroId, ids: g.righe.slice(0, 5).map((r) => r.id) });
    return pagine;
  }, [eventiADV, gruppiProdotti, gruppiAbbonamenti]);

  // Un'impressione per elemento, una sola volta per apertura dell'app (non
  // ogni volta che si torna a scorrere sulla stessa scheda).
  const pagineGiaLoggate = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (pagina === 0 || pagineGiaLoggate.current.has(pagina)) return;
    const info = pagineADV[pagina - 1];
    if (!info) return;
    pagineGiaLoggate.current.add(pagina);
    for (const id of info.ids) registraImpressioneSponsor(info.centroId, info.tipoTarget, id, me?.id);
  }, [pagina, pagineADV, me?.id]);

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

  const totaleSchede = 1 + eventiADV.length + gruppiProdotti.length + gruppiAbbonamenti.length;
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPagina(Math.round(e.nativeEvent.contentOffset.x / larghezzaScheda));
  }, [larghezzaScheda]);
  const tornaAlRanking = () => scrollRef.current?.scrollTo({ x: 0, animated: true });

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <View style={{ height: ALTEZZA }}>
        <ScrollView
          ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
          pagingEnabled decelerationRate="fast"
          onScroll={onScroll} scrollEventThrottle={32}
        >
          {/* Prima scheda: ranking globale + 2 widget personalizzabili */}
          <View style={s.card1}>
            <View style={s.globaleBox}>
              <Ionicons name="trophy" size={18} color={colors.gold} style={{ marginBottom: 2 }} />
              <Text style={s.globaleNum}>{globale?.posizione ? `#${globale.posizione}` : '—'}</Text>
              <Muted style={{ fontSize: Font.small, textAlign: 'center' }}>{globale?.totale ? `su ${globale.totale} giocatori` : 'non ancora in classifica'}</Muted>
              <Text style={s.globaleLabel}>Ranking nazionale · {sportAttivo}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.miniColonna}>
              <MiniWidget esito={esiti[0]} colors={colors} onPress={() => setSlotConfigurando(0)} />
              <View style={{ height: 1, backgroundColor: colors.navyLine + '22' }} />
              <MiniWidget esito={esiti[1]} colors={colors} onPress={() => setSlotConfigurando(1)} />
            </View>
          </View>

          {/* ADV: eventi in evidenza + prodotti sponsorizzati dai centri */}
          {eventiADV.map((e) => (
            <Pressable key={`ev-${e.id}`} onPress={apriEvento} style={s.advCard}>
              {e.immagine_url && <Image source={{ uri: e.immagine_url.startsWith('http') ? e.immagine_url : apiUrl(e.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
              <View style={[StyleSheet.absoluteFillObject, s.advOverlay]} />
              <View style={s.advBadge}><Text style={s.advBadgeText}>EVENTO</Text></View>
              <Text style={s.advTitle} numberOfLines={2}>{e.nome}</Text>
              {e.descrizione && <Text style={s.advSubChiaro} numberOfLines={1}>{e.descrizione}</Text>}
            </Pressable>
          ))}
          {/* Un centro con più prodotti sponsorizzati compare in UNA sola
              scheda con tutti insieme, non una ripetuta per prodotto (fix
              utente esplicito) — stesso trattamento per gli abbonamenti. */}
          {gruppiProdotti.map((g) => (
            <MultiADVCard
              key={`pr-${g.centroId}`} badge="SHOP" centroNome={nomeCentro(g.centroId)}
              righe={g.righe} onPressCard={apriShop} onPressItem={(id) => apriProdotto(g.centroId, id)} s={s} colors={colors}
            />
          ))}
          {gruppiAbbonamenti.map((g) => (
            <MultiADVCard
              key={`ab-${g.centroId}`} badge="ABBONAMENTI" centroNome={nomeCentro(g.centroId)}
              righe={g.righe} onPressCard={apriShop} onPressItem={(id) => apriAbbonamento(g.centroId, id)} s={s} colors={colors}
            />
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
      {totaleSchede > 1 && (
        <View style={s.dotsRow}>
          {Array.from({ length: totaleSchede }).map((_, i) => (
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
