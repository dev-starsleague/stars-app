import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import {
  getEventi, iscrivitiEvento, getEventiIscritti,
  getCampionati, iscrivitiCampionato, getCampionatiIscritti, getPosizioneCampionato,
  getTornei, iscrivitiTorneo, getTorneiIscritti, getPosizioneTorneo,
  cercaGiocatori, getCentri, centriPreferiti,
} from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { AppHeader } from '../../components/AppHeader';
import { Button, Card, Chip, IconBadge, Input, Muted, Segmented, Avatar } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { EventoCustom, Campionato, Torneo, Giocatore, Centro } from '../../types/models';

type TabE = 'attivi' | 'miei' | 'passati';
type TipoVoce = 'evento' | 'campionato' | 'torneo';
type ModoCentro = 'tutti' | 'preferiti' | 'zona';
type TipoFiltro = 'tutti' | 'campionato' | 'torneo';
type FiltroZona = { tipo: 'regione' | 'provincia'; valore: string };

// Vista unificata: eventi custom, campionati e tornei sono 3 motori
// diversi lato backend (stessa cosa nel gestionale, vedi stars-system/
// src/routes/eventi/+page.svelte) ma per il giocatore sono semplicemente
// "cose a cui iscriversi" — un'unica lista, tipo distinto da un'etichetta.
interface Voce {
  tipo: TipoVoce;
  id: string;
  centroId: string;
  nome: string;
  descrizione?: string | null;
  sport?: string;
  tipoIscrizione?: 'singolo' | 'coppia';
  divisione: 'maschile' | 'femminile' | 'misto';
  aperto: boolean; // iscrizioni aperte ora
  soldOut: boolean; // chiuso per limite iscritti raggiunto, non ancora iniziato
  concluso: boolean;
  iscrittiCount: number;
  maxPartecipanti?: number | null;
  quota?: number;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const ETICHETTA_TIPO: Record<TipoVoce, string> = { evento: 'Evento', campionato: 'Campionato', torneo: 'Torneo' };
const ICONA_TIPO: Record<TipoVoce, IoniconName> = { evento: 'trophy', campionato: 'ribbon', torneo: 'medal' };

export default function Eventi() {
  const { me, demoMode } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // "In corso" di default (fix utente esplicito): il giocatore apre la
  // scheda e vede subito le proprie iscrizioni, non l'elenco da sfogliare.
  const [tabE, setTabE] = useState<TabE>('miei');
  const [q, setQ] = useState('');
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [campionati, setCampionati] = useState<Campionato[]>([]);
  const [tornei, setTornei] = useState<Torneo[]>([]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [iscritti, setIscritti] = useState<Record<string, boolean>>({}); // chiave `${tipo}:${id}`
  const [posizioni, setPosizioni] = useState<Record<string, number>>({}); // chiave `${tipo}:${id}`, solo per i miei eventi in corso
  const [refreshing, setRefreshing] = useState(false);
  const [coppiaPer, setCoppiaPer] = useState<Voce | null>(null); // voce per cui sta scegliendo il compagno
  // Filtri: per centro (tutti / solo preferiti / una zona geografica) e per
  // tipo (tutti / campionato / torneo) — sostituiscono le vecchie
  // categorie non funzionanti (fix utente esplicito).
  const [modoCentro, setModoCentro] = useState<ModoCentro>('tutti');
  const [zonaApplicata, setZonaApplicata] = useState<FiltroZona | null>(null);
  const [mostraZona, setMostraZona] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('tutti');

  const load = useCallback(async () => {
    const [ev, camp, torn, cen] = await Promise.all([getEventi(), getCampionati(), getTornei(), getCentri()]);
    setEventi(ev); setCampionati(camp); setTornei(torn); setCentri(cen);
    if (me) {
      const [evIscr, campIscr, tornIscr] = await Promise.all([
        getEventiIscritti(me.id), getCampionatiIscritti(me.id), getTorneiIscritti(me.id),
      ]);
      const mappa: Record<string, boolean> = {};
      for (const e of evIscr) mappa[`evento:${e.id}`] = true;
      for (const c of campIscr) mappa[`campionato:${c.id}`] = true;
      for (const t of tornIscr) mappa[`torneo:${t.id}`] = true;
      setIscritti(mappa);

      // Posizione in classifica, solo per i MIEI campionati/tornei "in
      // corso" (iscrizioni chiuse ma non ancora conclusi) — al posto
      // della generica etichetta "In corso" nella card (fix utente
      // esplicito: "tanto si sa già che sono quelli in corso").
      const campInCorso = campIscr.filter((c) => c.stato !== 'iscrizioni_aperte' && c.stato !== 'concluso');
      const tornInCorso = tornIscr.filter((t) => t.stato !== 'iscrizioni_aperte' && t.stato !== 'concluso');
      const [posCamp, posTorn] = await Promise.all([
        Promise.all(campInCorso.map(async (c) => [`campionato:${c.id}`, await getPosizioneCampionato(c.id, me.id)] as const)),
        Promise.all(tornInCorso.map(async (t) => [`torneo:${t.id}`, await getPosizioneTorneo(t.id, me.id)] as const)),
      ]);
      const mappaPos: Record<string, number> = {};
      for (const [chiave, pos] of [...posCamp, ...posTorn]) if (pos != null) mappaPos[chiave] = pos;
      setPosizioni(mappaPos);
    }
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // "Sold out" = chiuso perché il limite iscritti è stato raggiunto
  // (fix utente esplicito: "al raggiungimento della soglia giocatori le
  // iscrizioni si chiudono e l'evento diventa 'sold out'") — solo
  // campionati/tornei hanno oggi questo automatismo lato backend (vedi
  // app/routers/torneo.py:_valida_partecipante), il Custom Event Builder
  // (evento) ha uno stato "ready" senza una fase "chiuso" distinta, non
  // se ne occupa questo automatismo. Non ancora concluso: sold out ha
  // senso solo finché l'evento non è iniziato.
  const soldOutDi = (chiuso: boolean, concluso: boolean, iscrittiCount: number, max?: number | null) =>
    !!max && iscrittiCount >= max && chiuso && !concluso;

  const voci: Voce[] = useMemo(() => [
    ...eventi.map((e): Voce => ({
      tipo: 'evento', id: e.id, centroId: e.centro_id, nome: e.nome, descrizione: e.descrizione, divisione: e.divisione,
      aperto: e.stato === 'ready', soldOut: false, concluso: e.stato === 'completed', iscrittiCount: e.iscritti_count ?? 0, maxPartecipanti: e.max_partecipanti,
    })),
    ...campionati.map((c): Voce => ({
      tipo: 'campionato', id: c.id, centroId: c.centro_id, nome: c.nome, sport: c.sport, tipoIscrizione: c.tipo_iscrizione, divisione: c.divisione,
      aperto: c.stato === 'iscrizioni_aperte', soldOut: false, concluso: c.stato === 'concluso', iscrittiCount: c.iscritti_count ?? 0,
      quota: c.quota_iscrizione_a_giocatore,
    })),
    ...tornei.map((t): Voce => {
      const maxPartecipanti = t.format_config?.max_iscritti ?? null;
      const iscrittiCount = t.iscritti_count ?? 0;
      const chiuso = t.stato === 'iscrizioni_chiuse';
      const concluso = t.stato === 'concluso';
      return {
        tipo: 'torneo', id: t.id, centroId: t.centro_id, nome: t.nome, sport: t.sport, tipoIscrizione: t.tipo_iscrizione, divisione: t.divisione ?? 'misto',
        aperto: t.stato === 'iscrizioni_aperte', soldOut: soldOutDi(chiuso, concluso, iscrittiCount, maxPartecipanti),
        concluso, iscrittiCount, maxPartecipanti, quota: t.quota_iscrizione_a_giocatore,
      };
    }),
  ], [eventi, campionati, tornei]);

  const preferiti = useMemo(() => centriPreferiti(me), [me]);
  const centroDiVoce = useCallback((v: Voce) => centri.find((c) => c.id === v.centroId), [centri]);

  const passaFiltroCentro = useCallback((v: Voce) => {
    if (modoCentro === 'preferiti') return preferiti.has(v.centroId);
    if (modoCentro === 'zona' && zonaApplicata) {
      const c = centroDiVoce(v);
      if (!c) return false;
      return zonaApplicata.tipo === 'regione' ? c.regione === zonaApplicata.valore : c.provincia === zonaApplicata.valore;
    }
    return true;
  }, [modoCentro, zonaApplicata, preferiti, centroDiVoce]);
  const passaFiltroTipo = (v: Voce) => tipoFiltro === 'tutti' ? true : v.tipo === tipoFiltro;

  const iscriviti = async (v: Voce, partnerId?: string | null) => {
    if (!me) return;
    if (v.tipo === 'evento') {
      const res = await iscrivitiEvento(v.id, me.id);
      if (res.ok) { segnaIscritto(v); avvisa('Iscrizione registrata', `Sei iscritto a "${v.nome}".`); }
      else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
      return;
    }
    const fn = v.tipo === 'campionato' ? iscrivitiCampionato : iscrivitiTorneo;
    const res = await fn(v.id, me.id, v.sport ?? 'Padel', partnerId ?? null);
    if (res.ok) {
      segnaIscritto(v);
      setCoppiaPer(null);
      avvisa('Iscrizione registrata', partnerId ? `Sei iscritto a "${v.nome}" in coppia.` : `Sei iscritto a "${v.nome}".`);
    } else avvisa('Errore', res.error ?? 'Iscrizione non riuscita.');
  };
  const segnaIscritto = (v: Voce) => setIscritti((p) => ({ ...p, [`${v.tipo}:${v.id}`]: true }));

  const avviaIscrizione = (v: Voce) => {
    if (v.tipoIscrizione === 'coppia') setCoppiaPer(v);
    else iscriviti(v);
  };

  const eIscritto = (v: Voce) => !!iscritti[`${v.tipo}:${v.id}`];
  // "Iscriviti" = SOLO ciò che ha le iscrizioni ancora aperte ORA (fix
  // utente esplicito: "devo vedere SOLO gli eventi con le iscrizioni
  // aperte") — non più "tutto il non concluso" (che mostrava anche
  // eventi già in corso, a iscrizioni chiuse, dove toccare "Iscriviti"
  // non avrebbe comunque funzionato). "In corso" (ex "I miei") SOLO le
  // proprie iscrizioni NON ancora concluse — appena un evento si
  // conclude sparisce da qui e passa in "Conclusi" (ex "Passati", fix
  // utente esplicito: "gli eventi conclusi si spostano in Passati... e
  // spariscono da I miei"), mai in entrambi contemporaneamente.
  // "Iscriviti" mostra anche gli eventi sold out (fix utente esplicito:
  // "lascia gli eventi visibili in 'iscriviti' anche se sold out ma
  // sotto una sottocategoria 'sold out' fino che non inizia l'evento") —
  // ordinati con gli aperti prima, i sold out in coda (vedi il rendering
  // sotto per la sottocategoria vera e propria).
  const iscrivibili = voci.filter((v) => v.aperto || v.soldOut);
  const miei = voci.filter((v) => eIscritto(v) && !v.concluso);
  const passati = voci.filter((v) => v.concluso && eIscritto(v));
  const base = tabE === 'attivi' ? iscrivibili : tabE === 'miei' ? miei : passati;
  const filtrati = base
    .filter((v) => q ? v.nome.toLowerCase().includes(q.toLowerCase()) : true)
    .filter(passaFiltroCentro)
    .filter(passaFiltroTipo)
    .sort((a, b) => (a.soldOut === b.soldOut ? 0 : a.soldOut ? 1 : -1));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>

        {/* Stars League — annuncio, stessa "superficie scura intenzionale"
            del gestionale (stars-system/src/routes/eventi/+page.svelte):
            non ancora sviluppata, solo un annuncio premium coerente col
            resto dell'app. */}
        <View style={s.slWrap}>
          <LinearGradient colors={['rgba(29,49,74,0.97)', 'rgba(16,26,44,0.98)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.slCard}>
            <View style={s.slHead}>
              <View style={s.slIco}><Text style={{ fontSize: 22 }}>⭐</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.slTitolo}>Stars League</Text>
                <View style={s.slBadge}><Text style={s.slBadgeText}>Coming soon</Text></View>
              </View>
            </View>
            <Text style={s.slTesto}>Stiamo sviluppando l'esperienza definitiva.</Text>
          </LinearGradient>
        </View>

        {/* Card filtri vetro liquido */}
        <Card style={s.filterCard}>
          <Segmented
            value={tabE}
            onChange={(v) => setTabE(v as TabE)}
            options={[
              { value: 'attivi', label: `Iscriviti (${iscrivibili.length})` },
              { value: 'miei', label: `In corso (${miei.length})` },
              { value: 'passati', label: `Conclusi (${passati.length})` },
            ]}
            style={{ marginBottom: Spacing.md }}
          />

          <Input icon="search" placeholder="Cerca evento, campionato o torneo…" value={q} onChangeText={setQ} style={{ marginBottom: Spacing.md }} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
            <View style={s.cats}>
              <Chip
                label="⭐ Preferiti"
                active={modoCentro === 'preferiti'}
                onPress={() => setModoCentro((m) => (m === 'preferiti' ? 'tutti' : 'preferiti'))}
              />
              <Chip
                label={modoCentro === 'zona' && zonaApplicata ? `📍 ${zonaApplicata.valore}` : '📍 Zona'}
                active={modoCentro === 'zona'}
                onPress={() => setMostraZona(true)}
              />
            </View>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.cats}>
              <Chip label="Tutti" active={tipoFiltro === 'tutti'} onPress={() => setTipoFiltro('tutti')} />
              <Chip label="Campionato" active={tipoFiltro === 'campionato'} onPress={() => setTipoFiltro('campionato')} />
              <Chip label="Torneo" active={tipoFiltro === 'torneo'} onPress={() => setTipoFiltro('torneo')} />
            </View>
          </ScrollView>
        </Card>

        {demoMode ? (
          <Card style={s.demoBadge}><Text style={s.demoText}>Dati demo</Text></Card>
        ) : null}

        {filtrati.length === 0 ? (
          <Text style={s.empty}>Nessun evento disponibile</Text>
        ) : filtrati.map((v, i) => {
          const isIscritto = iscritti[`${v.tipo}:${v.id}`];
          const chiuso = !v.aperto;
          const apribile = v.tipo === 'campionato' || v.tipo === 'torneo';
          const posizione = posizioni[`${v.tipo}:${v.id}`];
          // "In corso" è ridondante per un evento a cui si è già iscritti
          // (si sta guardando il tab "In corso", si sa già che lo è) — la
          // posizione in classifica è l'informazione utile (fix utente
          // esplicito). Resta "In corso" quando non è calcolabile (non
          // iscritto, o tabellone a eliminazione diretta senza classifica).
          // "Sold out" ha priorità: un evento pieno non è "in corso" per
          // chi lo sta ancora guardando dal tab Iscriviti (fix utente
          // esplicito).
          const etichettaStato = v.soldOut ? 'Sold out' : v.concluso ? 'Concluso' : !chiuso ? 'Aperto' : posizione ? `${posizione}° posto` : 'In corso';
          // Sottocategoria "Sold out" nel tab Iscriviti (fix utente
          // esplicito): un'intestazione appena prima del primo elemento
          // sold out, dato che filtrati è già ordinato aperti-poi-sold-out.
          const primoSoldOut = tabE === 'attivi' && v.soldOut && (i === 0 || !filtrati[i - 1].soldOut);
          return (
            <React.Fragment key={`${v.tipo}:${v.id}`}>
              {primoSoldOut && <Text style={s.sottocategoria}>Sold out</Text>}
              <Card style={s.card}>
                <Pressable onPress={() => apribile && router.push(`/eventi/${v.tipo}/${v.id}`)} disabled={!apribile}>
                  <View style={s.cardHead}>
                    <IconBadge icon={ICONA_TIPO[v.tipo]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{v.nome}</Text>
                      <Muted>
                        {ETICHETTA_TIPO[v.tipo]} · {v.sport ? `${v.sport} · ` : ''}{divisione(v.divisione)} · {v.iscrittiCount}{v.maxPartecipanti ? `/${v.maxPartecipanti}` : ''}
                        {v.quota ? ` · ${v.quota}€` : ''}
                      </Muted>
                    </View>
                    <View style={[s.pill, { backgroundColor: (v.soldOut ? colors.red : chiuso ? colors.amber : colors.green) + '22' }]}>
                      <Text style={[s.pillText, { color: v.soldOut ? colors.red : chiuso ? colors.amber : colors.green }]}>{etichettaStato}</Text>
                    </View>
                    {apribile && <Ionicons name="chevron-forward" size={16} color={colors.slate} style={{ marginLeft: 4 }} />}
                  </View>
                  {v.descrizione ? <Text style={s.cardDesc}>{v.descrizione}</Text> : null}
                </Pressable>
                {!chiuso && (isIscritto ? (
                  <View style={s.iscritto}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><Text style={s.iscrittoText}>Sei iscritto</Text></View>
                ) : (
                  <Button title={v.tipoIscrizione === 'coppia' ? 'Iscriviti in coppia' : 'Iscriviti'} onPress={() => avviaIscrizione(v)} style={{ marginTop: Spacing.md }} />
                ))}
              </Card>
            </React.Fragment>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {coppiaPer && (
        <ModaleCoppia
          voce={coppiaPer}
          meId={me?.id ?? ''}
          onChiudi={() => setCoppiaPer(null)}
          onConferma={(partnerId) => iscriviti(coppiaPer, partnerId)}
          colors={colors} glass={glass} scheme={scheme}
        />
      )}

      {mostraZona && (
        <ModaleZona
          centri={centri}
          applicata={zonaApplicata}
          onChiudi={() => setMostraZona(false)}
          onApplica={(f) => { setZonaApplicata(f); setModoCentro(f ? 'zona' : 'tutti'); setMostraZona(false); }}
          colors={colors} glass={glass} scheme={scheme}
        />
      )}
    </SafeAreaView>
  );
}

// Zona geografica — stessa logica del filtro "Zona" della classifica
// Ranking (app/(tabs)/classifiche.tsx, ModaleFiltriRanking): regioni/
// province SOLO quelle di centri realmente esistenti nel circuito, mai un
// elenco statico. Qui però in due passi veri (fix utente esplicito: "prima
// regione e poi provincia, filtrata in base alla regione selezionata") —
// la provincia si sceglie SEMPRE dentro la regione già scelta, non in
// alternativa indipendente come nel filtro Ranking.
function ModaleZona({ centri, applicata, onChiudi, onApplica, colors, glass, scheme }: {
  centri: Centro[]; applicata: FiltroZona | null; onChiudi: () => void; onApplica: (f: FiltroZona | null) => void;
  colors: AppColors; glass: ReturnType<typeof useTheme>['glass']; scheme: ReturnType<typeof useTheme>['scheme'];
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [regione, setRegione] = useState<string | undefined>(applicata?.tipo === 'regione' ? applicata.valore : undefined);
  const [provincia, setProvincia] = useState<string | undefined>(applicata?.tipo === 'provincia' ? applicata.valore : undefined);

  const regioni = useMemo(
    () => Array.from(new Set(centri.map((c) => c.regione).filter((v): v is string => !!v))).sort(),
    [centri]
  );
  const province = useMemo(
    () => Array.from(new Set(centri.filter((c) => c.regione === regione).map((c) => c.provincia).filter((v): v is string => !!v))).sort(),
    [centri, regione]
  );

  const sceglieRegione = (r: string) => { setRegione(r); setProvincia(undefined); };

  const conferma = () => {
    if (provincia) onApplica({ tipo: 'provincia', valore: provincia });
    else if (regione) onApplica({ tipo: 'regione', valore: regione });
    else onApplica(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.modaleTitolo}>Filtra per zona</Text>
            <Muted style={{ marginBottom: Spacing.md }}>Scegli prima la regione, poi — se vuoi — restringi a una provincia.</Muted>

            <Text style={s.sottoTitolo}>Regione</Text>
            <ScrollView style={{ maxHeight: 140, marginBottom: Spacing.md }} showsVerticalScrollIndicator={false}>
              {regioni.length === 0 && <Muted>Nessun dato disponibile.</Muted>}
              {regioni.map((r) => (
                <Pressable key={r} style={s.opzioneRigaCompatta} onPress={() => sceglieRegione(r)}>
                  <Ionicons name={regione === r ? 'radio-button-on' : 'radio-button-off'} size={18} color={regione === r ? colors.gold : colors.slate} />
                  <Text style={s.opzioneLabel}>{r}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {regione && (
              <>
                <Text style={s.sottoTitolo}>Provincia — {regione}</Text>
                <ScrollView style={{ maxHeight: 140, marginBottom: Spacing.md }} showsVerticalScrollIndicator={false}>
                  <Pressable style={s.opzioneRigaCompatta} onPress={() => setProvincia(undefined)}>
                    <Ionicons name={!provincia ? 'radio-button-on' : 'radio-button-off'} size={18} color={!provincia ? colors.gold : colors.slate} />
                    <Text style={s.opzioneLabel}>Tutta la regione</Text>
                  </Pressable>
                  {province.length === 0 && <Muted>Nessuna provincia disponibile per questa regione.</Muted>}
                  {province.map((p) => (
                    <Pressable key={p} style={s.opzioneRigaCompatta} onPress={() => setProvincia(p)}>
                      <Ionicons name={provincia === p ? 'radio-button-on' : 'radio-button-off'} size={18} color={provincia === p ? colors.gold : colors.slate} />
                      <Text style={s.opzioneLabel}>{p}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
            <Button title="Annulla" variant="ghost" onPress={onChiudi} style={{ flex: 1 }} />
            <Button title="Applica" onPress={conferma} disabled={!regione} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Scelta del compagno per un'iscrizione in coppia — stesso pattern di
// ricerca già usato in "Invita giocatori" (prenota.tsx) e "Cerca
// giocatori" (amici.tsx). "Iscriviti da solo" resta un'opzione esplicita:
// CampionatoPartecipante/TorneoPartecipante hanno giocatore_2_id
// nullable, il gestionale mostra normalmente una coppia incompleta in
// attesa (fix utente esplicito: "permetti ai giocatori di iscriversi in
// autonomia" — non deve essere bloccato dal non avere già un compagno).
function ModaleCoppia({ voce, meId, onChiudi, onConferma, colors, glass, scheme }: {
  voce: Voce; meId: string; onChiudi: () => void; onConferma: (partnerId?: string) => void;
  colors: AppColors; glass: ReturnType<typeof useTheme>['glass']; scheme: ReturnType<typeof useTheme>['scheme'];
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<Giocatore[]>([]);
  const [cercando, setCercando] = useState(false);

  const cerca = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) { setRisultati([]); return; }
    setCercando(true);
    const r = await cercaGiocatori(text);
    setRisultati(r.filter((g) => g.id !== meId));
    setCercando(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.modaleTitolo}>Con chi giochi?</Text>
            <Muted style={{ marginBottom: Spacing.md }}>{voce.nome} — formato a coppie</Muted>

            <Input icon="search" placeholder="Cerca il tuo compagno per nome…" value={q} onChangeText={cerca} autoFocus style={{ marginBottom: Spacing.md }} />

            {q.trim().length >= 2 && (
              cercando ? null : risultati.length === 0 ? (
                <Muted style={{ textAlign: 'center', marginBottom: Spacing.md }}>Nessun giocatore trovato.</Muted>
              ) : (
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
                  {risultati.map((g) => (
                    <Pressable key={g.id} onPress={() => onConferma(g.id)}>
                      <Card style={s.invitoCard}>
                        <Avatar name={`${g.nome} ${g.cognome}`} size={40} genere={g.genere} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardName}>{g.nome} {g.cognome}</Text>
                          {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                        </View>
                        <Ionicons name="add-circle" size={24} color={colors.gold} />
                      </Card>
                    </Pressable>
                  ))}
                </View>
              )
            )}

            <Button title="Iscriviti da solo (aggiungo il compagno dopo)" variant="ghost" onPress={() => onConferma(undefined)} style={{ marginBottom: Spacing.sm }} />
            <Button title="Annulla" variant="ghost" onPress={onChiudi} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function divisione(d: string) { return d === 'misto' ? 'Misto' : d === 'maschile' ? 'Maschile' : 'Femminile'; }

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    slWrap: { marginBottom: Spacing.lg, borderRadius: Radius.card, boxShadow: '0 8px 26px rgba(0,0,0,0.28)' } as any,
    slCard: { borderRadius: Radius.card, padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(255,175,0,0.35)' },
    slHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    slIco: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,175,0,0.15)', alignItems: 'center', justifyContent: 'center' },
    slTitolo: { color: '#fff', fontSize: Font.h3, fontWeight: '800' },
    slBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,175,0,0.18)', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
    slBadgeText: { color: colors.gold, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    slTesto: { color: 'rgba(255,255,255,0.75)', fontSize: Font.small, marginTop: Spacing.md, lineHeight: 20 },
    filterCard: { marginBottom: Spacing.lg },
    cats: { flexDirection: 'row', gap: Spacing.sm },
    demoBadge: { marginBottom: Spacing.lg },
    demoText: { color: colors.gold, fontWeight: '700', fontSize: Font.small },
    empty: { color: colors.slate, textAlign: 'center', marginTop: Spacing.xxl, fontSize: Font.body },
    sottocategoria: { color: colors.slate, fontSize: Font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.md, marginBottom: Spacing.xs, marginLeft: Spacing.xs },
    card: { marginBottom: Spacing.md },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    cardName: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    cardDesc: { color: colors.slateLight, fontSize: Font.small, marginTop: Spacing.md, lineHeight: 20 },
    pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    iscritto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.md, paddingVertical: Spacing.sm },
    iscrittoText: { color: colors.green, fontWeight: '700' },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, maxHeight: '80%', borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } as any,
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: 4 },
    invitoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    sottoTitolo: { color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 4 },
    opzioneRigaCompatta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    opzioneLabel: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '700' },
  });
}
