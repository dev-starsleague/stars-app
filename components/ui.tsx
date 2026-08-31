import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SquircleView } from 'react-native-figma-squircle';
import { Colors, Radius, Spacing, Font, Glass, CORNER_SMOOTHING } from '../constants/theme';

// Card "vetro liquido": stessa tecnica del gestionale (src/lib/styles.css
// .card) — blur reale dietro, tinta navy semi-trasparente sopra, riflesso
// delicato in alto, bordo chiaro sottile. Radius liscio (Radius.card),
// nessuno squircle: nel gestionale lo squircle è solo per gli elementi
// compatti (bottoni/icone), mai per le card grandi.
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  // Due livelli: quello esterno porta l'ombra (un box-shadow non può
  // convivere con overflow:hidden sullo stesso nodo, altrimenti verrebbe
  // tagliato), quello interno ritaglia blur/riflesso agli angoli arrotondati.
  return (
    <View style={[styles.cardOuter, style]}>
      <View style={styles.cardClip}>
        <BlurView intensity={Glass.blur} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Glass.bg }]} />
        <LinearGradient
          colors={[Glass.shine, 'transparent']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.cardContent}>{children}</View>
      </View>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

// Bottone squircle (Radius.compact + corner-shape squircle), stessa forma
// del .btn del gestionale — lo sfondo è disegnato da SquircleView (separato
// dallo style del Pressable, vedi API della libreria) invece che da
// backgroundColor/borderRadius normali.
export function Button({ title, onPress, variant = 'primary', loading, disabled, style }:
  { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? Colors.gold : variant === 'danger' ? Colors.red : 'transparent';
  const fg = variant === 'primary' ? Colors.navyDeep : variant === 'danger' ? Colors.white : Colors.gold;
  const strokeColor = variant === 'ghost' ? Colors.navyLine : 'transparent';
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, style, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <SquircleView
        style={StyleSheet.absoluteFillObject}
        squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: bg, strokeColor, strokeWidth: variant === 'ghost' ? 1 : 0 }}
      />
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

// Chip resta a forma di pillola (Radius.pill): nel gestionale i badge/pill
// (.badge, border-radius:999px) non usano corner-shape squircle — è una
// forma a sé, coerente così com'è.
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function RankBadge({ value, size = 44 }: { value: number; size?: number }) {
  return (
    <View style={[styles.rankBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.rankBadgeText}>{value.toFixed(2)}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, gold }: { name: string; size?: number; gold?: boolean }) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: gold ? Colors.gold : Colors.navyLine }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36, color: gold ? Colors.navyDeep : Colors.white }]}>{initials}</Text>
    </View>
  );
}

export function Pill({ label, color = Colors.gold }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  cardOuter: { borderRadius: Radius.card, boxShadow: Glass.shadow } as any,
  cardClip: { borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: Glass.border },
  cardContent: { padding: Spacing.lg },
  h1: { color: Colors.navyDeep, fontSize: Font.h1, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '700' },
  body: { color: Colors.cloud, fontSize: Font.body },
  muted: { color: Colors.slate, fontSize: Font.small },
  btn: { height: 50, borderRadius: Radius.compact, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, overflow: 'hidden' },
  btnText: { fontWeight: '700', fontSize: Font.body },
  chip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.slateLight, fontWeight: '600', fontSize: Font.small },
  chipTextActive: { color: Colors.navyDeep },
  rankBadge: { backgroundColor: Colors.navyDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.gold },
  rankBadgeText: { color: Colors.gold, fontWeight: '800', fontSize: Font.small },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  pillText: { fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: Colors.navyLine + '44', marginVertical: Spacing.md },
});
