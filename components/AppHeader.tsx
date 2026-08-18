import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { Colors, Radius, Spacing, Font } from '../constants/theme';

export function AppHeader({ coin = 10, notifiche = 2 }: { coin?: number; notifiche?: number }) {
  const router = useRouter();
  const { me } = useAuth();
  const iniziale = (me?.nome?.[0] ?? 'P').toUpperCase();

  return (
    <View style={s.bar}>
      <View style={s.left}>
        <View style={s.logo}><Ionicons name="star" size={18} color={Colors.navyDeep} /></View>
        <Text style={s.brand}>Stars League</Text>
      </View>
      <View style={s.right}>
        <Pressable style={s.coin} onPress={() => router.push('/(tabs)/stars')}>
          <Ionicons name="star" size={14} color={Colors.gold} />
          <Text style={s.coinText}>{coin}</Text>
          <Ionicons name="bag-outline" size={14} color={Colors.slateLight} />
        </Pressable>
        <View style={s.bell}>
          <Ionicons name="notifications-outline" size={20} color={Colors.slateLight} />
          {notifiche > 0 && <View style={s.badge}><Text style={s.badgeText}>{notifiche}</Text></View>}
        </View>
        <Pressable style={s.avatar} onPress={() => router.push('/(tabs)/profilo')}>
          <Text style={s.avatarText}>{iniziale}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.navy },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logo: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  brand: { color: Colors.white, fontSize: Font.h3, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.navyCard, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  coinText: { color: Colors.white, fontWeight: '800', fontSize: Font.small },
  bell: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.navyCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.navyLine + '55' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: Colors.navyDeep, fontSize: 10, fontWeight: '900' },
  avatar: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.navyDeep, fontWeight: '900', fontSize: Font.body },
});
