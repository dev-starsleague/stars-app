import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../lib/auth';
import { getStarsCoinPerCentro } from '../lib/api';
import { Colors, Radius, Spacing, Font, Glass, CORNER_SMOOTHING } from '../constants/theme';

// Logo, campanella e avatar sono lo stesso tipo di elemento delle icone
// squircle 44x44 del gestionale (vedi src/routes/+page.svelte): sfondo
// disegnato da SquircleView invece di backgroundColor/borderRadius normali.
// Notifiche resta senza destinazione (decisione utente, fix precedente):
// solo campanella, nessun badge finto — 0 finché non esiste una fonte reale.
// Il pill Stars Coin apre la scheda dedicata (app/stars-coin.tsx, saldo per
// centro + Shop) — fix utente esplicito: "deve essere una scheda", non un
// popup nell'header.
export function AppHeader({ notifiche = 0 }: { notifiche?: number }) {
  const router = useRouter();
  const { me } = useAuth();
  const iniziale = (me?.nome?.[0] ?? 'P').toUpperCase();

  const [totale, setTotale] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!me) return;
    getStarsCoinPerCentro(me.id).then((saldi) => setTotale(saldi.reduce((acc, s) => acc + s.saldo, 0)));
  }, [me]));

  return (
    <View style={s.bar}>
      <Pressable style={s.left} onPress={() => router.push('/(tabs)')}>
        <View style={s.logo}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: Colors.gold }} />
          <Ionicons name="star" size={18} color={Colors.navyDeep} />
        </View>
        <Text style={s.brand}>Stars App</Text>
      </Pressable>
      <View style={s.right}>
        <Pressable style={s.coin} onPress={() => router.push('/stars-coin')}>
          <BlurView intensity={Glass.blur} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Glass.bg }]} />
          <Ionicons name="star" size={14} color={Colors.gold} />
          <Text style={s.coinText}>{totale}</Text>
          <Ionicons name="bag-outline" size={14} color={Colors.slateLight} />
        </Pressable>
        <View style={s.bell}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: Glass.bg, strokeColor: Glass.border, strokeWidth: 1 }} />
          <Ionicons name="notifications-outline" size={20} color={Colors.slateLight} />
          {notifiche > 0 && <View style={s.badge}><Text style={s.badgeText}>{notifiche}</Text></View>}
        </View>
        <Pressable style={s.avatar} onPress={() => router.push('/(tabs)/profilo')}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: Colors.gold }} />
          <Text style={s.avatarText}>{iniziale}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.bg },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logo: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  brand: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, borderColor: Glass.border, overflow: 'hidden' },
  coinText: { color: Colors.navyDeep, fontWeight: '800', fontSize: Font.small },
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: Colors.navyDeep, fontSize: 10, fontWeight: '900' },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.navyDeep, fontWeight: '900', fontSize: Font.body },
});
