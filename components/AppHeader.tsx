import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SquircleView } from 'react-native-figma-squircle';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSport } from '../lib/sport';
import { getPartiteGiocatore } from '../lib/api';
import { serveRisultato, servePagamento } from '../lib/impegni';
import { Radius, Spacing, Font, AppColors, AppGlass, CORNER_SMOOTHING } from '../constants/theme';
import type { Prenotazione } from '../types/models';

// Header ridisegnato (fix utente esplicito): niente più logo/nome — a
// sinistra il toggle tema (sole/luna) e il selettore sport (apre una
// tendina con tutti gli sport). Il pill Stars Coin non mostra più il saldo,
// solo il simbolo moneta + "SHOP" (il saldo resta nella scheda dedicata,
// app/stars-coin.tsx). La campanella ora apre davvero una lista di
// notifiche interattive, derivate dagli stessi impegni di app/impegni.tsx
// (pagamenti da saldare, risultati mancanti, promemoria prossimi) — non
// esiste un'entità "notifiche" nel backend condiviso, quindi sono calcolate
// da dati reali già disponibili, non finte.
type TipoNotifica = 'pagamento' | 'risultato' | 'promemoria';
interface Notifica { id: string; tipo: TipoNotifica; testo: string }

function oggiISO() { return new Date().toISOString().slice(0, 10); }
function domaniISO() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

// Notifiche "lette" persistite per id (fix utente esplicito: "quando leggo
// una notifica deve scomparire") — non esiste un flag "letta" sul backend
// (le notifiche sono derivate, non un'entità reale, vedi sopra), quindi lo
// stato di lettura vive solo qui, sullo stesso AsyncStorage di tema/sport.
// Un id resta "letto" per sempre: è per (prenotazione+motivo), quindi se la
// stessa prenotazione genera più avanti un motivo diverso (es. "oggi" che
// ieri era "domani") ha un id nuovo e ricompare da sola, comportamento
// corretto — non è la prenotazione a sparire, è QUELLA specifica notifica.
const CHIAVE_LETTE = 'stars-notifiche-lette';

// Icona "moneta con stella" per il pill SHOP — UNA moneta sola (fix utente
// esplicito: via la seconda "a pila", bastava solo appesantire), ma vera:
// gradiente metallico, bordo esterno rilevato, un anello interno inciso (il
// bordo zigrinato di una moneta reale) e un riflesso, non un cerchio piatto.
function CoinIcon({ size = 18 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(120,70,0,0.5)',
    }}>
      <LinearGradient
        colors={[colors.goldSoft, colors.gold, colors.amber]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Anello interno inciso, come il bordo zigrinato di una moneta vera */}
      <View style={{
        position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%',
        borderRadius: size / 2, borderWidth: 1, borderColor: 'rgba(120,70,0,0.4)',
      }} />
      {/* Riflesso lucido in alto a sinistra */}
      <View style={{
        position: 'absolute', top: '10%', left: '14%', width: '34%', height: '16%',
        borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', transform: [{ rotate: '-30deg' }],
      }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="star" size={size * 0.56} color={colors.navyDeep} />
      </View>
    </View>
  );
}

export function AppHeader() {
  const router = useRouter();
  const { me } = useAuth();
  const { colors, glass, scheme, toggleTheme } = useTheme();
  const { sportAttivo, setSportAttivo, sportDisponibili } = useSport();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);
  const iniziale = (me?.nome?.[0] ?? 'P').toUpperCase();

  const [sportModaleAperto, setSportModaleAperto] = useState(false);
  const [notificheAperte, setNotificheAperte] = useState(false);
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const [lette, setLette] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(CHIAVE_LETTE).then((raw) => {
      if (raw) setLette(new Set(JSON.parse(raw)));
    });
  }, []);

  useFocusEffect(useCallback(() => {
    if (!me) return;
    getPartiteGiocatore(me.id).then((partite: Prenotazione[]) => {
      const oggi = oggiISO(); const domani = domaniISO();
      const righe: Notifica[] = [];
      for (const p of partite) {
        const nomeCampo = p.campo?.nome ?? 'campo';
        if (p.data && p.data < oggi) {
          if (servePagamento(p)) righe.push({ id: `pag-${p.id}`, tipo: 'pagamento', testo: `Da pagare: ${nomeCampo} · €${p.prezzo}` });
          if (serveRisultato(p)) righe.push({ id: `ris-${p.id}`, tipo: 'risultato', testo: `Inserisci il risultato: ${nomeCampo}` });
        } else if (p.data === oggi) {
          righe.push({ id: `oggi-${p.id}`, tipo: 'promemoria', testo: `Oggi alle ${p.inizio?.slice(0, 5) ?? ''}: ${nomeCampo}` });
        } else if (p.data === domani) {
          righe.push({ id: `dom-${p.id}`, tipo: 'promemoria', testo: `Domani alle ${p.inizio?.slice(0, 5) ?? ''}: ${nomeCampo}` });
        }
      }
      setNotifiche(righe.slice(0, 12));
    });
  }, [me]));

  // Solo le non lette contano/si vedono (fix utente esplicito: "quando
  // leggo una notifica deve scomparire") — il badge sul campanello riflette
  // sempre e solo questo elenco filtrato, mai il totale calcolato.
  const notificheNonLette = useMemo(() => notifiche.filter((n) => !lette.has(n.id)), [notifiche, lette]);

  const coloreNotifica = (t: TipoNotifica) => t === 'pagamento' ? colors.red : t === 'risultato' ? colors.gold : colors.green;
  const leggiNotifica = (n: Notifica) => {
    setLette((cur) => {
      const next = new Set(cur);
      next.add(n.id);
      AsyncStorage.setItem(CHIAVE_LETTE, JSON.stringify([...next])).catch(() => {});
      return next;
    });
    setNotificheAperte(false);
    router.push('/impegni');
  };

  return (
    <View style={[s.bar, { backgroundColor: colors.bg }]}>
      <View style={s.left}>
        <Pressable onPress={toggleTheme} hitSlop={8} style={s.iconBtn}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <Ionicons name={scheme === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.gold} />
        </Pressable>
        <Pressable onPress={() => setSportModaleAperto(true)} style={s.sportPill}>
          <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
          <Ionicons name="tennisball-outline" size={15} color={colors.navyDeep} />
          <Text style={s.sportPillText}>{sportAttivo}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.slate} />
        </Pressable>
      </View>
      <View style={s.right}>
        <Pressable style={[s.coin, { borderColor: glass.regularBorder }]} onPress={() => router.push('/stars-coin')}>
          <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
          <CoinIcon size={16} />
          <Text style={[s.coinText, { color: colors.navyDeep }]}>SHOP</Text>
        </Pressable>
        <Pressable style={s.bell} onPress={() => setNotificheAperte(true)}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <Ionicons name="notifications-outline" size={20} color={colors.slateLight} />
          {notificheNonLette.length > 0 && <View style={[s.badge, { backgroundColor: colors.gold }]}><Text style={[s.badgeText, { color: colors.navyDeep }]}>{notificheNonLette.length}</Text></View>}
        </Pressable>
        <Pressable style={s.avatar} onPress={() => router.push('/(tabs)/profilo')}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: colors.gold }} />
          <Text style={[s.avatarText, { color: colors.navyDeep }]}>{iniziale}</Text>
        </Pressable>
      </View>

      {/* Tendina sport: apre tutti gli sport disponibili (fix utente esplicito) */}
      <Modal visible={sportModaleAperto} transparent animationType="fade" onRequestClose={() => setSportModaleAperto(false)}>
        <Pressable style={s.modaleSfondo} onPress={() => setSportModaleAperto(false)}>
          <View style={s.modaleBox}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Text style={s.modaleTitolo}>Sport</Text>
            {sportDisponibili.map((sp) => (
              <Pressable key={sp} style={s.modaleRiga} onPress={() => { setSportAttivo(sp); setSportModaleAperto(false); }}>
                <Ionicons name={sp === sportAttivo ? 'radio-button-on' : 'radio-button-off'} size={20} color={sp === sportAttivo ? colors.gold : colors.slate} />
                <Text style={s.modaleRigaText}>{sp}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Lista notifiche interattive: derivate da pagamenti/risultati/promemoria reali */}
      <Modal visible={notificheAperte} transparent animationType="fade" onRequestClose={() => setNotificheAperte(false)}>
        <Pressable style={s.modaleSfondo} onPress={() => setNotificheAperte(false)}>
          <View style={s.notificheBox}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Text style={s.modaleTitolo}>Notifiche</Text>
            {notificheNonLette.length === 0 ? (
              <Text style={s.notificaVuota}>Nessuna notifica al momento.</Text>
            ) : (
              notificheNonLette.map((n) => (
                <Pressable key={n.id} style={s.notificaRiga} onPress={() => leggiNotifica(n)}>
                  <View style={[s.notificaDot, { backgroundColor: coloreNotifica(n.tipo) }]} />
                  <Text style={s.notificaTesto}>{n.testo}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.slate} />
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    sportPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 8, overflow: 'hidden' },
    sportPillText: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small },
    right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    coin: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, overflow: 'hidden' },
    coinText: { fontWeight: '800', fontSize: Font.small, letterSpacing: 0.3 },
    bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    badgeText: { fontSize: 10, fontWeight: '900' },
    avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontWeight: '900', fontSize: Font.body },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 320, borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: glass.regularBorder },
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    modaleRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    modaleRigaText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    notificheBox: { width: '100%', maxWidth: 360, borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: glass.regularBorder, gap: Spacing.xs },
    notificaRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    notificaDot: { width: 8, height: 8, borderRadius: 4 },
    notificaTesto: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    notificaVuota: { color: colors.slate, fontSize: Font.small },
  });
}
