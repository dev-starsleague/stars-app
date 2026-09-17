import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import {
  getEventi, getEventiIscritti,
  getCampionati, getCampionatiIscritti, getPosizioneCampionato,
  getTornei, getTorneiIscritti, getPosizioneTorneo,
  getCentri, centriPreferiti,
} from '../../lib/api';
import { apiUrl } from '../../lib/apiClient';
import { statoIscrizioni, ETICHETTA_STATO_ISCRIZIONI, type StatoIscrizioni } from '../../lib/stars';
import { AppHeader } from '../../components/AppHeader';
import { Card, Chip, IconBadge, Input, Muted, Segmented, Button } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { EventoCustom, Campionato, Torneo, Centro } from '../../types/models';

type TabE = 'attivi' | 'miei' | 'passati';
type TipoVoce = 'evento' | 'campionato' | 'torneo';
type ModoCentro = 'tutti' | 'preferiti' | 'zona';
type TipoFiltro = 'tutti' | 'campionato' | 'torneo';
type FiltroZona = { tipo: 'regione' | 'provincia'; valore: string };

// Vista unificata: eventi custom, campionati e tornei sono 3 motori
// diversi lato backend (stessa cosa nel gestionale, vedi stars-system/
// src/routes/eventi/+page.svelte) ma per il giocatore sono semplicemente
// "cose a cui iscriversi/da seguire" — un'unica lista, tipo distinto da
// un'etichetta. L'iscrizione vera e propria (fix utente esplicito: "il
// tasto ISCRIVITI come prima cosa") vive ora nel dettaglio di ciascuna
// voce (tutte apribili, evento incluso — prima non lo era), non più qui:
// questa schermata resta solo lista + navigazione.
interface Voce {
  tipo: TipoVoce;
  id: string;
  centroId: string;
  nome: string;
  sport?: string;
  divisione: 'maschile' | 'femminile' | 'misto';
  immagineUrl?: string | null;
  aperturaIscrizioni: string | null;
  chiusuraIscrizioni: string | null;
  dataInizio: string | null;
  formato: string;
  statoBackend: string; // stato grezzo lato backend, per l'etichetta di avanzamento in "In corso"
  bozza: boolean;
  concluso: boolean;
  iscrittiCount: number;
  maxPartecipanti?: number | null;
  quota?: number;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const ETICHETTA_TIPO: Record<TipoVoce, string> = { evento: 'Evento', campionato: 'Campionato', torneo: 'Torneo' };
const ICONA_TIPO: Record<TipoVoce, IoniconName> = { evento: 'trophy', campionato: 'ribbon', torneo: 'medal' };
const ETICHETTA_FORMATO_TORNEO: Record<string, string> = {
  round_robin: 'Girone all’italiana', single_elimination: 'Eliminazione diretta', americano: 'Americano', swiss: 'Svizzero',
};
function formatoDi(tipo: TipoVoce, formatType?: string, unitaCompetitiva?: string): string {
  if (tipo === 'campionato') return 'Gironi + playoff';
  if (tipo === 'torneo') return ETICHETTA_FORMATO_TORNEO[formatType ?? ''] ?? formatType ?? '—';
  return unitaCompetitiva === 'coppia_fissa' ? 'Coppia fissa' : unitaCompetitiva ?? '—';
}
function formattaDataBreve(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : null;
}
const COLORE_STATO: Record<StatoIscrizioni, (c: AppColors) => string> = {
  in_arrivo: (c) => c.amber, aperte: (c) => c.green, sold_out: (c) => c.red, chiuso: (c) => c.red,
};

export default function Eventi() {
  const { me, demoMode } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // "In corso" di default (fix utente esplicito): il giocatore apre la
  // scheda e vede subito cosa sta succedendo ora, non l'elenco da sfogliare.
  const [tabE, setTabE] = useState<TabE>('miei');
  const [q, setQ] = useState('');
  const [eventi, setEventi] = useState<EventoCustom[]>([]);
  const [campionati, setCampionati] = useState<Campionato[]>([]);
  const [tornei, setTornei] = useState<Torneo[]>([]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [iscritti, setIscritti] = useState<Record<string, boolean>>({}); // chiave `${tipo}:${id}`
  const [posizioni, setPosizioni] = useState<Record<string, number>>({}); // chiave `${tipo}:${id}`, solo per i miei eventi in corso
  const [refreshing, setRefreshing] = useState(false);
  const [locandinaAperta, setLocandinaAperta] = useState<string | null>(null); // fix utente esplicito: tap sulla locandina la ingrandisce a popup
  // Filtri: per centro (tutti / solo preferiti / una zona geografica) e per
  // tipo (tutti / campionato / torneo).
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
      // della generica etichetta di avanzamento nella card (fix utente
      // esplicito: "la propria posizione", solo se iscritto).
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

  const voci: Voce[] = useMemo(() => [
    ...eventi.map((e): Voce => ({
      tipo: 'evento', id: e.id, centroId: e.centro_id, nome: e.nome, divisione: e.divisione,
      immagineUrl: e.immagine_url, aperturaIscrizioni: e.apertura_iscrizioni_at, chiusuraIscrizioni: e.chiusura_iscrizioni_at,
      dataInizio: e.data_evento ?? null, formato: formatoDi('evento', undefined, e.unita_competitiva),
      statoBackend: e.stato, bozza: e.stato === 'draft' || e.stato === 'cancelled', concluso: e.stato === 'completed',
      iscrittiCount: e.iscritti_count ?? 0, maxPartecipanti: e.max_partecipanti,
    })),
    ...campionati.map((c): Voce => ({
      tipo: 'campionato', id: c.id, centroId: c.centro_id, nome: c.nome, sport: c.sport, divisione: c.divisione,
      aperturaIscrizioni: c.apertura_iscrizioni_at, chiusuraIscrizioni: c.chiusura_iscrizioni_at,
      dataInizio: c.inizio_evento_at, formato: formatoDi('campionato'),
      statoBackend: c.stato, bozza: c.stato === 'bozza', concluso: c.stato === 'concluso', iscrittiCount: c.iscritti_count ?? 0,
      quota: c.quota_iscrizione_a_giocatore,
    })),
    ...tornei.map((t): Voce => ({
      tipo: 'torneo', id: t.id, centroId: t.centro_id, nome: t.nome, sport: t.sport, divisione: t.divisione ?? 'misto',
      aperturaIscrizioni: t.apertura_iscrizioni_at, chiusuraIscrizioni: t.chiusura_iscrizioni_at,
      dataInizio: t.inizio_at, formato: formatoDi('torneo', t.format_type),
      statoBackend: t.stato, bozza: t.stato === 'bozza', concluso: t.stato === 'concluso',
      iscrittiCount: t.iscritti_count ?? 0, maxPartecipanti: t.format_config?.max_iscritti ?? null,
      quota: t.quota_iscrizione_a_giocatore,
    })),
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

  const eIscritto = (v: Voce) => !!iscritti[`${v.tipo}:${v.id}`];
  const statoDi = (v: Voce) => statoIscrizioni(v.aperturaIscrizioni, v.chiusuraIscrizioni, v.iscrittiCount, v.maxPartecipanti);

  // "Iscriviti" = ci si può ancora registrare ORA o a breve (fix utente
  // esplicito: niente più sezioni "iscrizioni chiuse"/"sold out" qui dentro
  // — quegli stati si vedono ora nel badge della card, e l'evento stesso si
  // sposta in "In corso" una volta che le iscrizioni non sono più aperte,
  // dove l'informazione utile è l'avanzamento, non un badge morto). "In
  // corso" = iscrizioni chiuse/sold out ma non ancora concluso — TUTTI questi
  // eventi, non solo i propri (stessa visualizzazione di "Iscriviti", fix
  // utente esplicito: "se non sei iscritto vedi solo lo stato di
  // avanzamento", frase che ha senso solo se compaiono anche eventi a cui
  // non si è iscritti). "Conclusi" resta come già era: solo i propri.
  const iscrivibili = voci.filter((v) => !v.bozza && !v.concluso && (statoDi(v) === 'aperte' || statoDi(v) === 'in_arrivo'));
  const inCorso = voci.filter((v) => !v.bozza && !v.concluso && (statoDi(v) === 'sold_out' || statoDi(v) === 'chiuso'));
  const passati = voci.filter((v) => v.concluso && eIscritto(v));
  const base = tabE === 'attivi' ? iscrivibili : tabE === 'miei' ? inCorso : passati;
  const filtrati = base
    .filter((v) => q ? v.nome.toLowerCase().includes(q.toLowerCase()) : true)
    .filter(passaFiltroCentro)
    .filter(passaFiltroTipo);

  const etichettaAvanzamento = (v: Voce) => {
    const pos = posizioni[`${v.tipo}:${v.id}`];
    if (pos) return `${pos}° posto`;
    return v.statoBackend === 'iscrizioni_chiuse' ? 'Iscrizioni chiuse' : v.statoBackend === 'in_corso' ? 'In corso' : ETICHETTA_STATO_ISCRIZIONI[statoDi(v)];
  };

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
              { value: 'miei', label: `In corso (${inCorso.length})` },
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
        ) : filtrati.map((v) => {
          const stato = statoDi(v);
          const colore = COLORE_STATO[stato](colors);
          return (
            <Card key={`${v.tipo}:${v.id}`} style={s.card}>
              <View style={s.cardRow}>
                {/* Locandina a sinistra (fix utente esplicito: "deve
                    ingrandirsi come pop-up al tocco") — solo l'evento
                    custom ha una vera immagine oggi; campionato/torneo
                    ricadono sull'icona di tipo, stesso posto/dimensione. */}
                <Pressable
                  onPress={() => v.immagineUrl && setLocandinaAperta(v.immagineUrl.startsWith('http') ? v.immagineUrl : apiUrl(v.immagineUrl))}
                  disabled={!v.immagineUrl} style={s.locandinaWrap}
                >
                  {v.immagineUrl ? (
                    <Image source={{ uri: v.immagineUrl.startsWith('http') ? v.immagineUrl : apiUrl(v.immagineUrl) }} style={s.locandina} resizeMode="cover" />
                  ) : (
                    <IconBadge icon={ICONA_TIPO[v.tipo]} />
                  )}
                </Pressable>

                <Pressable onPress={() => router.push(`/eventi/${v.tipo}/${v.id}`)} style={s.cardInfo}>
                  <Text style={s.cardName} numberOfLines={1}>{v.nome}</Text>
                  <Muted style={s.cardRiga}>
                    {ETICHETTA_TIPO[v.tipo]}{v.sport ? ` · ${v.sport}` : ''}
                    {v.aperturaIscrizioni ? ` · iscr. dal ${formattaDataBreve(v.aperturaIscrizioni)}` : ''}
                    {v.chiusuraIscrizioni ? ` al ${formattaDataBreve(v.chiusuraIscrizioni)}` : ''}
                  </Muted>
                  <Muted style={s.cardRiga}>
                    {v.dataInizio ? `Inizio ${formattaDataBreve(v.dataInizio)} · ` : ''}{v.formato}
                  </Muted>
                </Pressable>

                <Pressable onPress={() => router.push(`/eventi/${v.tipo}/${v.id}`)} style={s.cardDestra}>
                  {tabE === 'miei' ? (
                    <View style={[s.pill, { backgroundColor: (eIscritto(v) && posizioni[`${v.tipo}:${v.id}`] ? colors.gold : colors.slate) + '22' }]}>
                      <Text style={[s.pillText, { color: eIscritto(v) && posizioni[`${v.tipo}:${v.id}`] ? colors.gold : colors.slateLight }]}>{etichettaAvanzamento(v)}</Text>
                    </View>
                  ) : (
                    <View style={[s.pill, { backgroundColor: colore + '22' }]}>
                      <Text style={[s.pillText, { color: colore }]}>{ETICHETTA_STATO_ISCRIZIONI[stato]}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.slate} style={{ marginTop: 6 }} />
                </Pressable>
              </View>
            </Card>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Popup locandina (fix utente esplicito: "deve ingrandirsi come
          pop-up al tocco"). */}
      <Modal visible={!!locandinaAperta} transparent animationType="fade" onRequestClose={() => setLocandinaAperta(null)}>
        <Pressable style={s.locandinaSfondo} onPress={() => setLocandinaAperta(null)}>
          {locandinaAperta && <Image source={{ uri: locandinaAperta }} style={s.locandinaGrande} resizeMode="contain" />}
        </Pressable>
      </Modal>

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
    card: { marginBottom: Spacing.md },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    // Locandina (fix utente esplicito: "gli eventi a SX devono avere la
    // locandina") — stessa dimensione sia con immagine reale (solo evento
    // custom) sia con l'icona di tipo di ripiego (campionato/torneo, che
    // non hanno ancora un campo immagine nel modello dati).
    locandinaWrap: { width: 52, height: 52, borderRadius: Radius.md, overflow: 'hidden' },
    locandina: { width: '100%', height: '100%' },
    cardInfo: { flex: 1, minWidth: 0 },
    cardName: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    cardRiga: { marginTop: 2 },
    cardDestra: { alignItems: 'flex-end' },
    pill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    pillText: { fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    locandinaSfondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    locandinaGrande: { width: '100%', height: '80%' },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 360, maxHeight: '80%', borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } as any,
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: 4 },
    sottoTitolo: { color: colors.slate, fontSize: Font.small, fontWeight: '700', marginBottom: 4 },
    opzioneRigaCompatta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    opzioneLabel: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '700' },
  });
}
