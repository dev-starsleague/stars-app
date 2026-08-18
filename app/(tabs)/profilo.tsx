import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getStars, getMiePrenotazioni, getTessera } from '../../lib/api';
import { AppHeader } from '../../components/AppHeader';
import { Muted } from '../../components/ui';
import { BADGE_CATALOGO, COLORE_FASCIA } from '../../lib/stars';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import type { StarsProfilo, Tessera, Prenotazione } from '../../types/models';

type TabP = 'ranking' | 'partite' | 'badge' | 'tessera';

export default function Profilo() {
  const { me, signOut } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabP>('ranking');
  const [stars, setStars] = useState<StarsProfilo | null>(null);
  const [tessera, setTessera] = useState<Tessera | null>(null);
  const [pren, setPren] = useState<Prenotazione[]>([]);

  const load = useCallback(async () => {
    if (!me) return;
    const [st, te, pr] = await Promise.all([getStars(me.id), getTessera(), getMiePrenotazioni(me.id)]);
    setStars(st); setTessera(te); setPren(pr);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nome = `${me?.nome ?? ''} ${me?.cognome ?? ''}`.trim() || 'Giocatore';
  const stimato = stars?.stato_stima === 'stimato';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Card profilo scura */}
        <View style={s.headCard}>
          <View style={s.headTop}>
            <View style={s.avatarBig}>
              <Text style={s.avatarBigText}>{(me?.nome?.[0] ?? 'P').toUpperCase()}</Text>
              <View style={s.camBtn}><Ionicons name="camera" size={12} color={Colors.white} /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headName}>{nome}</Text>
              <Text style={s.headNick}>{me?.profilo?.nickname ? `"${me.profilo.nickname}"` : 'Nessun nickname'}</Text>
            </View>
            <Pressable style={s.gear} onPress={() => router.push('/modifica-profilo')}>
              <Ionicons name="settings-outline" size={18} color={Colors.slateLight} />
            </Pressable>
          </View>

          <View style={s.headStats}>
            <View style={s.hStat}>
              <Text style={s.hStatIcon}>🌟</Text>
              <Text style={[s.hStatTop, { color: stimato ? Colors.green : Colors.green }]}>{stimato ? 'Stimato' : 'Stimato'}</Text>
              <Muted>{stars?.stima_pts ?? 1000} pts</Muted>
            </View>
            <View style={s.hStat}>
              <Text style={s.hStatIcon}>🏃</Text>
              <Text style={s.hStatTopWhite}>{me?.posizione === 'sinistra' ? 'Lato SX' : 'Lato DX'}</Text>
              <Muted>Posizione</Muted>
            </View>
            <View style={s.hStat}>
              <Text style={s.hStatIcon}>✋</Text>
              <Text style={s.hStatTopWhite}>{me?.mano_dominante === 'mancino' ? 'Mancino' : 'Destrorso'}</Text>
              <Muted>Mano</Muted>
            </View>
          </View>
        </View>

        {/* Tab interne */}
        <View style={s.tabs}>
          <TabBtn icon="trophy-outline" label="Ranking" active={tab === 'ranking'} onPress={() => setTab('ranking')} />
          <TabBtn icon="git-compare-outline" label="Partite" active={tab === 'partite'} onPress={() => setTab('partite')} />
          <TabBtn icon="ribbon-outline" label="Badge" active={tab === 'badge'} onPress={() => setTab('badge')} />
          <TabBtn icon="document-text-outline" label="Tessera" active={tab === 'tessera'} onPress={() => setTab('tessera')} />
        </View>

        {tab === 'ranking' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Il tuo ranking</Text>
            <View style={s.rankRow}>
              <View style={s.rankBox}>
                <Text style={s.rankDash}>—</Text>
                <Text style={s.rankBoxLabel}>RANKING GLOBALE</Text>
              </View>
              <View style={s.rankBox}>
                <Text style={s.rankScore}>{(stars?.score ?? 0).toFixed(2)}</Text>
                <Text style={s.rankBoxLabel}>SCORE</Text>
              </View>
            </View>

            {!stimato && (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>🎯</Text>
                <Text style={s.emptyTitle}>Zero partite, zero gloria.</Text>
                <Muted style={{ textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                  Il tuo ranking si aggiorna automaticamente dopo ogni partita competitiva. Prima però dobbiamo valutare il tuo livello di gioco.
                </Muted>
                <Pressable style={s.scopriBtn} onPress={() => router.push('/(tabs)/eventi')}>
                  <Ionicons name="trending-up" size={16} color={Colors.navyDeep} />
                  <Text style={s.scopriText}>Scopri il tuo ranking</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {tab === 'partite' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Le mie partite</Text>
            {pren.length === 0 ? (
              <Muted style={{ textAlign: 'center', paddingVertical: Spacing.xl }}>Nessuna partita registrata.</Muted>
            ) : pren.map((p) => (
              <View key={p.id} style={s.matchRow}>
                <View style={s.matchIcon}><Ionicons name="tennisball" size={18} color={Colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.matchName}>{p.campo?.nome ?? 'Campo'}</Text>
                  <Muted>{p.data} · {p.inizio?.slice(0, 5)}</Muted>
                </View>
                <Text style={s.matchPrice}>€{p.prezzo}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'badge' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Badge</Text>
            <View style={s.badgeGrid}>
              {BADGE_CATALOGO.map((b, i) => (
                <View key={b.id} style={[s.badge, i > 1 && s.badgeLocked]}>
                  <Text style={s.badgeIcon}>{b.icona}</Text>
                  <Text style={s.badgeName}>{b.nome}</Text>
                  <Muted style={{ textAlign: 'center', fontSize: 11 }}>{i <= 1 ? 'Ottenuto' : 'Bloccato'}</Muted>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === 'tessera' && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Tessera PSL</Text>
            <View style={s.tesseraBox}>
              <View style={s.tesseraHead}>
                <Ionicons name="card" size={22} color={Colors.gold} />
                <Text style={s.tesseraStato}>{tessera?.stato === 'attiva' ? 'Attiva' : 'Da rinnovare'}</Text>
              </View>
              <Text style={s.tesseraNum}>{tessera?.numero ?? 'PSL-2026-0001'}</Text>
              <Muted>Scadenza: {tessera?.scadenza ?? '—'} · Quota €{tessera?.quota ?? 25}</Muted>
              <Pressable style={s.otpBtn}>
                <Ionicons name="finger-print" size={16} color={Colors.navyDeep} />
                <Text style={s.otpText}>Rinnova con firma OTP</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Azioni finali */}
        <View style={s.footRow}>
          <Pressable style={s.footBtn} onPress={() => router.push('/amici')}>
            <Ionicons name="open-outline" size={16} color={Colors.navyDeep} />
            <Text style={s.footText}>Profilo pubblico</Text>
          </Pressable>
          <Pressable style={s.footBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={16} color={Colors.red} />
            <Text style={[s.footText, { color: Colors.red }]}>Esci</Text>
          </Pressable>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TabBtn({ icon, label, active, onPress }: { icon: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.tabBtn, active && s.tabBtnActive]}>
      <Ionicons name={icon} size={16} color={active ? Colors.navyDeep : Colors.slate} />
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg },
  headCard: { backgroundColor: Colors.navyCard, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarBig: { width: 68, height: 68, borderRadius: 20, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarBigText: { color: Colors.navyDeep, fontSize: 30, fontWeight: '900' },
  camBtn: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.navyDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.navyCard },
  headName: { color: Colors.white, fontSize: Font.h2, fontWeight: '900' },
  headNick: { color: Colors.slate, fontSize: Font.body, fontStyle: 'italic' },
  gear: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.navyDeep, alignItems: 'center', justifyContent: 'center' },
  headStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  hStat: { flex: 1, backgroundColor: Colors.navyDeep + '99', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 3 },
  hStatIcon: { fontSize: 22 },
  hStatTop: { fontWeight: '800', fontSize: Font.body },
  hStatTopWhite: { color: Colors.white, fontWeight: '800', fontSize: Font.body },
  tabs: { flexDirection: 'row', backgroundColor: '#F7F8FA', borderRadius: Radius.md, padding: 4, marginTop: Spacing.lg },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: Radius.sm },
  tabBtnActive: { backgroundColor: Colors.navyDeep },
  tabText: { color: Colors.slate, fontWeight: '700', fontSize: Font.small },
  tabTextActive: { color: Colors.white },
  panel: { backgroundColor: '#F7F8FA', borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  panelTitle: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.md },
  rankRow: { flexDirection: 'row', gap: Spacing.md },
  rankBox: { flex: 1, backgroundColor: '#EEF1F5', borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center' },
  rankDash: { color: Colors.gold, fontSize: 32, fontWeight: '900' },
  rankScore: { color: Colors.navyDeep, fontSize: 32, fontWeight: '900' },
  rankBoxLabel: { color: Colors.slate, fontSize: Font.tiny, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
  emptyBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', marginTop: Spacing.md },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.sm },
  scopriBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.gold, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.pill, marginTop: Spacing.lg },
  scopriText: { color: Colors.navyDeep, fontWeight: '800' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  matchIcon: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  matchName: { color: Colors.navyDeep, fontWeight: '700' },
  matchPrice: { color: Colors.gold, fontWeight: '800', fontSize: Font.h3 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  badge: { width: '30%', backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4 },
  badgeLocked: { opacity: 0.45 },
  badgeIcon: { fontSize: 26 },
  badgeName: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.small, textAlign: 'center' },
  tesseraBox: { backgroundColor: Colors.navyDeep, borderRadius: Radius.lg, padding: Spacing.lg },
  tesseraHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tesseraStato: { color: Colors.gold, fontWeight: '800', fontSize: Font.small },
  tesseraNum: { color: Colors.white, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.md, letterSpacing: 1 },
  otpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, paddingVertical: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.lg },
  otpText: { color: Colors.navyDeep, fontWeight: '800' },
  footRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: Spacing.lg },
  footText: { color: Colors.navyDeep, fontWeight: '800' },
});
