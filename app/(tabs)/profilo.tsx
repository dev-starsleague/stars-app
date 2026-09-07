import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useSport } from '../../lib/sport';
import {
  getCentro, getPartiteGiocatore, getRankingAttuale, getStoricoRanking, getTessera,
  caricaFotoProfilo, updateProfilo, haVinto,
} from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { apiUrl } from '../../lib/apiClient';
import { AppHeader } from '../../components/AppHeader';
import { Card, Chip, IconBadge, IconButton, Muted, Segmented, immagineProfiloDefault } from '../../components/ui';
import { RankingChart } from '../../components/RankingChart';
import { SocialInsightsCard } from '../../components/HomeCarousel';
import { BADGE_CATALOGO } from '../../lib/stars';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../../constants/theme';
import type {
  Centro, EventoStorico, ManoDominante, Posizione, Prenotazione, Tessera,
} from '../../types/models';

type TabP = 'ranking' | 'partite' | 'badge' | 'tesseramento';
type FiltroEsito = 'vittorie' | 'sconfitte';
type FiltroTipo = 'normali' | 'eventi';

function toggleInSet<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

function posizioneLabel(p?: Posizione | null): string {
  if (!p) return '—';
  return p === 'sinistra' ? 'Lato SX' : p === 'destra' ? 'Lato DX' : 'Entrambe';
}
function manoLabel(m?: ManoDominante | null): string {
  if (!m) return '—';
  return m === 'mancino' ? 'Mancino' : m === 'destro' ? 'Destrorso' : 'Ambidestro';
}

export default function Profilo() {
  const { me, signOut, refreshMe } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);
  const [tab, setTab] = useState<TabP>('ranking');
  const apriGiocatore = (giocatoreId: string) => router.push({ pathname: '/(tabs)/giocatore/[id]', params: { id: giocatoreId } });

  const [centro, setCentro] = useState<Centro | null>(null);
  const [tessera, setTessera] = useState<Tessera | null>(null);
  const [fotoLocale, setFotoLocale] = useState<string | null>(null);
  const [caricandoFoto, setCaricandoFoto] = useState(false);

  const [rankingAttuale, setRankingAttuale] = useState<{ ranking: number; stato: string } | null>(null);
  const [storico, setStorico] = useState<EventoStorico[]>([]);
  const [caricandoRanking, setCaricandoRanking] = useState(true);

  const [partiteTutte, setPartiteTutte] = useState<Prenotazione[]>([]);
  const [filtroEsito, setFiltroEsito] = useState<Set<FiltroEsito>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<Set<FiltroTipo>>(new Set());
  const [meseNav, setMeseNav] = useState(() => new Date());
  const cambiaMeseNav = (delta: number) => setMeseNav((d) => { const n = new Date(d); n.setMonth(n.getMonth() + delta); return n; });

  const load = useCallback(async () => {
    if (!me) return;
    const [c, te, pr] = await Promise.all([getCentro(), getTessera(), getPartiteGiocatore(me.id)]);
    setCentro(c);
    setTessera(te);
    setPartiteTutte(pr);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sport globale dell'header (fix utente esplicito): ranking/storico/
  // partite di questa schermata seguono sportAttivo, non più una scelta
  // locale — si ricaricano anche quando cambia dall'header, non solo al
  // focus della schermata.
  useEffect(() => {
    if (!me) return;
    setCaricandoRanking(true);
    Promise.all([getRankingAttuale(me.id, sportAttivo), getStoricoRanking(me.id, sportAttivo)])
      .then(([r, st]) => { setRankingAttuale(r); setStorico(st); })
      .finally(() => setCaricandoRanking(false));
  }, [me, sportAttivo]);

  const nome = `${me?.nome ?? ''} ${me?.cognome ?? ''}`.trim() || 'Giocatore';
  const avatarUri = fotoLocale ?? (me?.avatar_url ? (me.avatar_url.startsWith('http') ? me.avatar_url : apiUrl(me.avatar_url)) : null);
  // Foto di profilo di default per genere quando non c'è ancora una foto
  // reale (fix utente esplicito) — stessa immagine del componente Avatar
  // condiviso, qui reimplementata perché questo blocco non passa da
  // <Avatar>. Sfondo trasparente (fix utente esplicito: "rimuovi lo
  // sfondo. e lascialo trasparente").
  const immagineDefault = !avatarUri ? immagineProfiloDefault(me?.genere) : null;

  const scegliFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { avvisa('Permesso negato', 'Serve il permesso per scegliere una foto dalla libreria.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0] || !me) return;
    const asset = res.assets[0];
    setFotoLocale(asset.uri); // anteprima immediata, anche in modalità demo
    setCaricandoFoto(true);
    const { url, error } = await caricaFotoProfilo(asset.uri, asset.mimeType ?? 'image/jpeg');
    if (!error && url) {
      await updateProfilo(me.id, { avatar_url: url });
      await refreshMe();
    } else if (error) {
      avvisa('Errore', error);
    }
    setCaricandoFoto(false);
  };

  const partiteSport = partiteTutte.filter((p) => (p.campo?.sport ?? 'Padel') === sportAttivo);
  const meseNavIso = `${meseNav.getFullYear()}-${String(meseNav.getMonth() + 1).padStart(2, '0')}`;
  const nomeMeseNav = meseNav.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const partiteFiltrate = partiteSport.filter((p) => {
    if ((p.data ?? '').slice(0, 7) !== meseNavIso) return false;
    if (filtroTipo.size > 0) {
      const eBucket: FiltroTipo = p.tipo === 'torneo' ? 'eventi' : 'normali';
      if (!filtroTipo.has(eBucket)) return false;
    }
    if (filtroEsito.size > 0 && me) {
      const vinta = haVinto(p, me.id);
      const eBucket: FiltroEsito | null = vinta === true ? 'vittorie' : vinta === false ? 'sconfitte' : null;
      if (!eBucket || !filtroEsito.has(eBucket)) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Card profilo */}
        <Card style={s.headCard}>
          <View style={s.headTop}>
            <View style={s.avatarWrap}>
              <View style={[s.avatarBig, immagineDefault ? { backgroundColor: 'transparent' } : null]}>
                {avatarUri
                  ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                  : immagineDefault
                  ? <Image source={immagineDefault} style={{ width: '82%', height: '82%' }} resizeMode="contain" />
                  : <Text style={s.avatarBigText}>{(me?.nome?.[0] ?? 'P').toUpperCase()}</Text>}
              </View>
              <Pressable style={s.camBtn} onPress={scegliFoto} disabled={caricandoFoto}>
                {caricandoFoto ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="camera" size={12} color={colors.white} />}
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headName}>{nome}</Text>
              <Text style={s.headNick}>{me?.profilo?.nickname ? `"${me.profilo.nickname}"` : 'Nessun nickname'}</Text>
            </View>
            <IconButton icon="settings-outline" variant="dark" onPress={() => router.push('/modifica-profilo')} />
          </View>

          <View style={s.headStats}>
            <View style={s.hStat}>
              <Text style={s.hStatValue}>{posizioneLabel(me?.posizione)}</Text>
              <Muted>Posizione</Muted>
            </View>
            <View style={s.hStat}>
              <Text style={s.hStatValue}>{manoLabel(me?.mano_dominante)}</Text>
              <Muted>Mano</Muted>
            </View>
          </View>
        </Card>

        {/* Tab interne */}
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as TabP)}
          style={{ marginTop: Spacing.md }}
          options={[
            { value: 'ranking', label: 'Ranking', icon: 'trophy-outline' },
            { value: 'partite', label: 'Partite', icon: 'git-compare-outline' },
            { value: 'badge', label: 'Badge', icon: 'ribbon-outline' },
            { value: 'tesseramento', label: 'Tessera', icon: 'document-text-outline' },
          ]}
        />

        {tab === 'ranking' && (
          <Card style={s.panel}>
            <Text style={s.panelTitle}>Il tuo ranking — {sportAttivo}</Text>
            {caricandoRanking ? (
              <ActivityIndicator color={colors.gold} style={{ marginVertical: Spacing.xl }} />
            ) : rankingAttuale ? (
              <>
                {/* Box "Stato" (Attivo/In verifica) rimossa (fix utente
                    esplicito: "non ha senso") — il ranking resta l'unico
                    protagonista, centrale invece che in due riquadri
                    affiancati di pari peso. */}
                <View style={s.rankRow}>
                  <View style={s.rankBox}>
                    <Text style={s.rankScore}>{rankingAttuale.ranking.toFixed(2)}</Text>
                    <Text style={s.rankBoxLabel}>RANKING ATTUALE</Text>
                  </View>
                </View>
                <RankingChart eventi={storico} />
              </>
            ) : (
              <Card style={s.emptyBox}>
                <Text style={s.emptyIcon}>🎯</Text>
                <Text style={s.emptyTitle}>Zero partite, zero gloria.</Text>
                <Muted style={{ textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                  Il tuo ranking si aggiorna automaticamente dopo ogni partita competitiva. Prima però dobbiamo valutare il tuo livello di gioco.
                </Muted>
                <Pressable style={s.scopriBtn} onPress={() => router.push({ pathname: '/richiedi-valutazione', params: { sport: sportAttivo } })}>
                  <Ionicons name="trending-up" size={16} color={colors.navyDeep} />
                  <Text style={s.scopriText}>Scopri il tuo ranking</Text>
                </Pressable>
              </Card>
            )}
          </Card>
        )}

        {/* Stessa scheda "Compagno/Nemesi/Preferito" della 3° slide del
            carosello Home (fix utente esplicito: "metti la 3° scheda della
            sezione ADV all'interno del profilo personale"). */}
        {tab === 'ranking' && me && (
          <View style={{ marginTop: Spacing.md, alignItems: 'center' }}>
            <SocialInsightsCard giocatoreId={me.id} sport={sportAttivo} onApriGiocatore={apriGiocatore} />
          </View>
        )}

        {tab === 'partite' && (
          <Card style={s.panel}>
            <View style={s.meseNav}>
              <IconButton icon="chevron-back" variant="glass" size={32} color={colors.navyDeep} onPress={() => cambiaMeseNav(-1)} />
              <Text style={s.meseNavTitolo}>{cap(nomeMeseNav)}</Text>
              <IconButton icon="chevron-forward" variant="glass" size={32} color={colors.navyDeep} onPress={() => cambiaMeseNav(1)} />
            </View>

            <View style={[s.filtriRiga, { flexWrap: 'wrap' }]}>
              <Chip label="Vittorie" active={filtroEsito.has('vittorie')} onPress={() => setFiltroEsito((p) => toggleInSet(p, 'vittorie'))} />
              <Chip label="Sconfitte" active={filtroEsito.has('sconfitte')} onPress={() => setFiltroEsito((p) => toggleInSet(p, 'sconfitte'))} />
              <Chip label="Normali" active={filtroTipo.has('normali')} onPress={() => setFiltroTipo((p) => toggleInSet(p, 'normali'))} />
              <Chip label="Eventi" active={filtroTipo.has('eventi')} onPress={() => setFiltroTipo((p) => toggleInSet(p, 'eventi'))} />
            </View>

            {partiteFiltrate.length === 0 ? (
              <Muted style={{ textAlign: 'center', paddingVertical: Spacing.xl }}>Nessuna partita con questi filtri.</Muted>
            ) : partiteFiltrate.map((p) => {
              const vinta = me ? haVinto(p, me.id) : null;
              return (
                <Card key={p.id} style={s.matchRow}>
                  <IconBadge icon="tennisball" size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.matchName}>{p.campo?.nome ?? 'Campo'}{p.tipo === 'torneo' ? ' · evento' : ''}</Text>
                    <Muted>{p.data} · {p.inizio?.slice(0, 5)}</Muted>
                  </View>
                  {vinta !== null && (
                    <View style={[s.esitoPill, { backgroundColor: (vinta ? colors.green : colors.red) + '22' }]}>
                      <Text style={[s.esitoText, { color: vinta ? colors.green : colors.red }]}>{vinta ? 'Vittoria' : 'Sconfitta'}</Text>
                    </View>
                  )}
                </Card>
              );
            })}
          </Card>
        )}

        {tab === 'badge' && (
          <Card style={s.panel}>
            <Text style={s.panelTitle}>Badge</Text>
            <View style={s.badgeGrid}>
              {BADGE_CATALOGO.map((b, i) => (
                <Card key={b.id} style={[s.badge, i > 1 && s.badgeLocked]}>
                  <Text style={s.badgeIcon}>{b.icona}</Text>
                  <Text style={s.badgeName}>{b.nome}</Text>
                  <Muted style={{ textAlign: 'center', fontSize: 11 }}>{i <= 1 ? 'Ottenuto' : 'Bloccato'}</Muted>
                </Card>
              ))}
            </View>
          </Card>
        )}

        {tab === 'tesseramento' && (
          <Card style={s.panel}>
            <Text style={s.panelTitle}>Tessera PSL</Text>
            <Card style={s.tesseraBox}>
              <View style={s.tesseraHead}>
                <Ionicons name="card" size={22} color={colors.gold} />
                <Text style={s.tesseraStato}>{tessera?.stato === 'attiva' ? 'Attiva' : 'Da rinnovare'}</Text>
              </View>
              <Text style={s.tesseraNum}>{tessera?.numero ?? 'PSL-2026-0001'}</Text>
              <Muted>Scadenza: {tessera?.scadenza ?? '—'} · Quota €{tessera?.quota ?? 25}</Muted>
              <Pressable style={s.otpBtn}>
                <Ionicons name="finger-print" size={16} color={colors.navyDeep} />
                <Text style={s.otpText}>Rinnova con firma OTP</Text>
              </Pressable>
            </Card>
          </Card>
        )}

        {/* Azioni finali */}
        <View style={s.footRow}>
          <Pressable style={s.footBtn} onPress={() => me && router.push(`/giocatore/${me.id}`)}>
            <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
            <Ionicons name="open-outline" size={16} color={colors.navyDeep} />
            <Text style={s.footText}>Profilo pubblico</Text>
          </Pressable>
          <Pressable style={s.footBtn} onPress={signOut}>
            <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
            <Ionicons name="log-out-outline" size={16} color={colors.red} />
            <Text style={[s.footText, { color: colors.red }]}>Esci</Text>
          </Pressable>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function cap(v: string): string { return v.charAt(0).toUpperCase() + v.slice(1); }

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    headCard: {},
    headTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    avatarWrap: { width: 68, height: 68 },
    avatarBig: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    avatarBigText: { color: colors.navyDeep, fontSize: 30, fontWeight: '900' },
    camBtn: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.navyCard },
    headName: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '900' },
    headNick: { color: colors.slate, fontSize: Font.body, fontStyle: 'italic' },
    headStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
    hStat: { flex: 1, backgroundColor: glass.strongBg, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 3 },
    hStatValue: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3 },
    panel: { marginTop: Spacing.md },
    panelTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.md },
    rankRow: { flexDirection: 'row', gap: Spacing.md },
    rankBox: { flex: 1, backgroundColor: glass.strongBg, borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center' },
    rankScore: { color: colors.navyDeep, fontSize: 32, fontWeight: '900' },
    rankBoxLabel: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
    emptyBox: { alignItems: 'center', marginTop: Spacing.md },
    emptyIcon: { fontSize: 34 },
    emptyTitle: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.sm },
    scopriBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gold, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.pill, marginTop: Spacing.lg },
    scopriText: { color: colors.navyDeep, fontWeight: '800' },
    meseNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
    meseNavTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },
    filtriRiga: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    matchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    matchName: { color: colors.navyDeep, fontWeight: '700' },
    esitoPill: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.pill },
    esitoText: { fontWeight: '800', fontSize: Font.tiny, textTransform: 'uppercase' },
    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    badge: { width: '30%', alignItems: 'center', gap: 4 },
    badgeLocked: { opacity: 0.45 },
    badgeIcon: { fontSize: 26 },
    badgeName: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small, textAlign: 'center' },
    tesseraBox: {},
    tesseraHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tesseraStato: { color: colors.gold, fontWeight: '800', fontSize: Font.small },
    tesseraNum: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.md, letterSpacing: 1 },
    otpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.gold, paddingVertical: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.lg },
    otpText: { color: colors.navyDeep, fontWeight: '800' },
    footRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
    footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: glass.regularBorder, paddingVertical: Spacing.lg, overflow: 'hidden' },
    footText: { color: colors.navyDeep, fontWeight: '800' },
  });
}
