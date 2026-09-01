import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { getStarsCoinPerCentro } from '../lib/api';
import { Radius, Spacing, Font, CORNER_SMOOTHING } from '../constants/theme';

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
  const { colors, glass, scheme, toggleTheme } = useTheme();
  const iniziale = (me?.nome?.[0] ?? 'P').toUpperCase();

  const [totale, setTotale] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!me) return;
    getStarsCoinPerCentro(me.id).then((saldi) => setTotale(saldi.reduce((acc, s) => acc + s.saldo, 0)));
  }, [me]));

  return (
    <View style={[s.bar, { backgroundColor: colors.bg }]}>
      <View style={s.left}>
        {/* La stellina del logo è il toggle tema (fix utente esplicito): un
            tap la sul badge oro cambia chiaro/scuro, non naviga — per andare
            in Home resta il testo "Stars App" accanto. */}
        <Pressable onPress={toggleTheme} hitSlop={8}>
          <View style={s.logo}>
            <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: colors.gold }} />
            <Ionicons name="star" size={18} color={colors.navyDeep} />
          </View>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)')}>
          <Text style={[s.brand, { color: colors.navyDeep }]}>Stars App</Text>
        </Pressable>
      </View>
      <View style={s.right}>
        <Pressable style={[s.coin, { borderColor: glass.regularBorder }]} onPress={() => router.push('/stars-coin')}>
          <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
          <Ionicons name="star" size={14} color={colors.gold} />
          <Text style={[s.coinText, { color: colors.navyDeep }]}>{totale}</Text>
          <Ionicons name="bag-outline" size={14} color={colors.slateLight} />
        </Pressable>
        <View style={s.bell}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: glass.regularBg, strokeColor: glass.regularBorder, strokeWidth: 1 }} />
          <Ionicons name="notifications-outline" size={20} color={colors.slateLight} />
          {notifiche > 0 && <View style={[s.badge, { backgroundColor: colors.gold }]}><Text style={[s.badgeText, { color: colors.navyDeep }]}>{notifiche}</Text></View>}
        </View>
        <Pressable style={s.avatar} onPress={() => router.push('/(tabs)/profilo')}>
          <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: colors.gold }} />
          <Text style={[s.avatarText, { color: colors.navyDeep }]}>{iniziale}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logo: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: Font.h3, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, overflow: 'hidden' },
  coinText: { fontWeight: '800', fontSize: Font.small },
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900', fontSize: Font.body },
});
