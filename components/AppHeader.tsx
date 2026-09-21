import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSport } from '../lib/sport';
import { getNotifiche, segnaNotificaLetta } from '../lib/api';
import { iconaSport } from '../lib/stars';
import { Avatar } from './ui';
import { Radius, Spacing, Font, AppColors, AppGlass, CORNER_SMOOTHING } from '../constants/theme';
import type { Notifica, PrioritaNotifica } from '../types/models';

// Header ridisegnato (fix utente esplicito): niente più logo/nome — a
// sinistra il toggle tema (sole/luna) e il selettore sport (apre una
// tendina con tutti gli sport). Il pill "SHOP" che stava qui a destra è
// stato tolto (fix utente esplicito: "rimuovi STAR dalla NAVBAR e spostaci
// SHOP") — Shop si raggiunge ora dalla navbar in basso (vedi
// app/(tabs)/_layout.tsx), niente più doppia via per la stessa schermata.
//
// Centro notifiche (Fase 1 del ticket "Sistema notifiche app", fix utente
// esplicito): la campanella ora legge un'entità reale generata dal backend
// (app/services/notifiche.py, vedi getNotifiche in lib/api.ts) invece di
// derivare una lista al volo dalle prenotazioni — stato letto/non letto
// persistito lato server (PATCH /notifiche/{id}), non più solo locale.
function emojiPriorita(p: PrioritaNotifica) {
  return p === 'azione' ? '🔴' : p === 'promemoria' ? '🟠' : p === 'positivo' ? '🟢' : '⚪';
}
function iconaTipo(tipo: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (tipo === 'pagamento_da_completare') return 'card-outline';
  if (tipo === 'risultato_da_inserire') return 'trophy-outline';
  if (tipo === 'promemoria_oggi' || tipo === 'promemoria_domani') return 'time-outline';
  if (tipo === 'partita_programmata') return 'calendar-outline';
  if (tipo === 'risultato_confermato') return 'checkmark-circle-outline';
  if (tipo === 'certificato_scadenza') return 'medkit-outline';
  if (tipo === 'tessera_scadenza') return 'id-card-outline';
  if (tipo === 'coin_saldo_basso') return 'wallet-outline';
  if (tipo === 'ranking_migliorato') return 'trending-up-outline';
  if (tipo.startsWith('torneo_') || tipo.startsWith('campionato_')) {
    if (tipo.endsWith('_concluso')) return 'flag-outline';
    if (tipo.endsWith('_suggerito')) return 'flame-outline';
    if (tipo.endsWith('_iscrizioni_in_chiusura')) return 'alarm-outline';
    return 'trophy-outline';
  }
  if (tipo === 'avanzamento_evento') return 'ribbon-outline';
  if (tipo === 'sfida_ricevuta') return 'flash-outline';
  return 'notifications-outline';
}

export function AppHeader() {
  const router = useRouter();
  const { me } = useAuth();
  const { colors, glass, scheme, toggleTheme } = useTheme();
  const { sportAttivo, setSportAttivo, sportDisponibili } = useSport();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);

  const [sportModaleAperto, setSportModaleAperto] = useState(false);
  const [notificheAperte, setNotificheAperte] = useState(false);
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);

  useFocusEffect(useCallback(() => {
    if (!me) return;
    getNotifiche(me.id).then(setNotifiche);
  }, [me]));

  // Il badge sul campanello conta solo le non lette; la lista sotto invece
  // le mostra tutte (già ordinate dalle più recenti da getNotifiche) così
  // lo stato letto/non letto resta visibile e consultabile, non sparisce
  // dalla lista appena aperta (fix rispetto alla versione precedente, che
  // filtrava via le lette: qui "letta" è un fatto persistito, non un modo
  // per far sparire la riga).
  const nonLette = useMemo(() => notifiche.filter((n) => !n.letta).length, [notifiche]);

  const coloreNotifica = (p: PrioritaNotifica) =>
    p === 'azione' ? colors.red : p === 'promemoria' ? colors.gold : p === 'positivo' ? colors.green : colors.slate;

  const apriNotifica = (n: Notifica) => {
    if (!n.letta) {
      setNotifiche((cur) => cur.map((x) => (x.id === n.id ? { ...x, letta: true } : x)));
      segnaNotificaLetta(n.id).catch(() => {});
    }
    setNotificheAperte(false);
    router.push((n.cta_rotta ?? '/impegni') as any);
  };

  return (
    <View style={[s.bar, { backgroundColor: colors.bg }]}>
      <View style={s.left}>
        <Pressable onPress={toggleTheme} hitSlop={8} style={s.iconBtn}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <Ionicons name={scheme === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.gold} />
        </Pressable>
        <Pressable onPress={() => setSportModaleAperto(true)} style={s.sportPill}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <MaterialCommunityIcons name={iconaSport(sportAttivo) as any} size={16} color={colors.navyDeep} />
          <Text style={s.sportPillText}>{sportAttivo}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.slate} />
        </Pressable>
      </View>
      <View style={s.right}>
        <Pressable style={s.bell} onPress={() => setNotificheAperte(true)}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <Ionicons name="notifications-outline" size={20} color={colors.slateLight} />
          {nonLette > 0 && <View style={[s.badge, { backgroundColor: colors.gold }]}><Text style={[s.badgeText, { color: colors.navyDeep }]}>{nonLette > 9 ? '9+' : nonLette}</Text></View>}
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/profilo')}>
          <Avatar name={me?.nome ?? 'Player'} uri={me?.avatar_url} genere={me?.genere} size={40} squircle gold />
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
                <MaterialCommunityIcons name={iconaSport(sp) as any} size={18} color={sp === sportAttivo ? colors.gold : colors.slate} />
                <Text style={s.modaleRigaText}>{sp}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Centro notifiche: popup compatto (non una schermata intera), mini-
          anteprima per riga con priorità/tipo, stato letto/non letto e CTA
          diretta — vedi sezioni 1 e 8 del ticket "Sistema notifiche app". */}
      <Modal visible={notificheAperte} transparent animationType="fade" onRequestClose={() => setNotificheAperte(false)}>
        <Pressable style={s.modaleSfondo} onPress={() => setNotificheAperte(false)}>
          <View style={s.notificheBox}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            <Text style={s.modaleTitolo}>Notifiche</Text>
            {notifiche.length === 0 ? (
              <Text style={s.notificaVuota}>Nessuna notifica al momento.</Text>
            ) : (
              <ScrollView style={s.notificheLista} showsVerticalScrollIndicator={false}>
                {notifiche.map((n) => (
                  <Pressable key={n.id} style={s.notificaCard} onPress={() => apriNotifica(n)}>
                    <View style={[s.notificaBarra, { backgroundColor: coloreNotifica(n.priorita) }]} />
                    <Ionicons name={iconaTipo(n.tipo)} size={18} color={coloreNotifica(n.priorita)} style={s.notificaIcona} />
                    <View style={s.notificaCorpo}>
                      <View style={s.notificaTestata}>
                        <Text style={s.notificaEmoji}>{emojiPriorita(n.priorita)}</Text>
                        <Text style={[s.notificaTitolo, { color: colors.navyDeep }, !n.letta && s.notificaTitoloNonLetta]} numberOfLines={1}>
                          {n.titolo}
                        </Text>
                        {!n.letta && <View style={[s.puntinoNonLetta, { backgroundColor: colors.gold }]} />}
                      </View>
                      {!!n.corpo && <Text style={[s.notificaSottotitolo, { color: colors.slate }]} numberOfLines={1}>{n.corpo}</Text>}
                      {!!n.cta_testo && <Text style={[s.notificaCta, { color: coloreNotifica(n.priorita) }]}>→ {n.cta_testo}</Text>}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
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
    sportPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.control, paddingHorizontal: Spacing.md, paddingVertical: 8, overflow: 'hidden' },
    sportPillText: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small },
    right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    badgeText: { fontSize: 10, fontWeight: '900' },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 320, borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: glass.regularBorder },
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    modaleRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    modaleRigaText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '600' },
    notificheBox: { width: '100%', maxWidth: 380, maxHeight: '70%', borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: glass.regularBorder },
    notificheLista: { gap: Spacing.xs },
    notificaCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: glass.regularBorder },
    notificaBarra: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
    notificaIcona: { marginTop: 2 },
    notificaCorpo: { flex: 1, gap: 2 },
    notificaTestata: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notificaEmoji: { fontSize: 11 },
    notificaTitolo: { flex: 1, fontSize: Font.small, fontWeight: '600' },
    notificaTitoloNonLetta: { fontWeight: '800' },
    puntinoNonLetta: { width: 7, height: 7, borderRadius: 4 },
    notificaSottotitolo: { fontSize: Font.small - 1 },
    notificaCta: { fontSize: Font.small - 1, fontWeight: '700', marginTop: 1 },
    notificaVuota: { color: colors.slate, fontSize: Font.small },
  });
}
