import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ViewStyle, TextStyle, TextInputProps, StyleProp, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SquircleView } from 'react-native-figma-squircle';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing, Font, Glass, CORNER_SMOOTHING } from '../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Proprietà di layout del CONTENUTO (non del box esterno): `style` passato a
// Card deve poterle usare per disporre i figli (es. flexDirection:'row' per
// una riga icona+testo+chevron) — ma il nodo che porta l'ombra non può
// essere lo stesso che clippa gli angoli (vedi sotto), quindi vanno
// duplicate sul nodo giusto invece di finire solo su quello esterno, dove
// su un contenitore a figlio singolo non avrebbero alcun effetto visibile.
const CONTENT_LAYOUT_KEYS = ['flexDirection', 'alignItems', 'justifyContent', 'gap', 'rowGap', 'columnGap', 'flexWrap'] as const;

// Card "vetro liquido": stessa tecnica del gestionale (src/lib/styles.css
// .card) — blur reale dietro, tinta navy semi-trasparente sopra, riflesso
// delicato in alto, bordo chiaro sottile. Radius liscio (Radius.card),
// nessuno squircle: nel gestionale lo squircle è solo per gli elementi
// compatti (bottoni/icone), mai per le card grandi.
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  // Due livelli: quello esterno porta l'ombra (un box-shadow non può
  // convivere con overflow:hidden sullo stesso nodo, altrimenti verrebbe
  // tagliato), quello interno ritaglia blur/riflesso agli angoli arrotondati.
  const flat = style ? (StyleSheet.flatten(style) as Record<string, unknown>) : undefined;
  const contentLayout: ViewStyle = {};
  if (flat) {
    for (const k of CONTENT_LAYOUT_KEYS) {
      if (flat[k] !== undefined) (contentLayout as Record<string, unknown>)[k] = flat[k];
    }
  }
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
        <View style={[styles.cardContent, contentLayout]}>{children}</View>
      </View>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

// Bottone squircle (Radius.compact + corner-shape squircle), stessa forma
// del .btn del gestionale — lo sfondo è disegnato da SquircleView (separato
// dallo style del Pressable, vedi API della libreria) invece che da
// backgroundColor/borderRadius normali.
export function Button({ title, onPress, variant = 'primary', loading, disabled, style }:
  { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
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

// Bottone icona-sola, squircle come Button — "glass" (blur+tinta chiara, per
// barre sopra contenuto già colorato, es. frecce/torna indietro), "solid"
// (tinta dorata piena, azioni primarie tipo il tasto fotocamera) o "dark"
// (tinta navy piena, per contrasto su superfici chiare tipo l'ingranaggio
// impostazioni). Stessa forma di IconBadge, ma premibile.
export function IconButton({ icon, onPress, size = 38, variant = 'glass', color, disabled, style }: {
  icon: IoniconName; onPress?: () => void; size?: number; variant?: 'glass' | 'solid' | 'dark'; color?: string; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const fill = variant === 'solid' ? Colors.gold : variant === 'dark' ? Colors.navyDeep : Glass.bg;
  const iconColor = color ?? (variant === 'solid' ? Colors.navyDeep : variant === 'dark' ? Colors.white : Colors.slateLight);
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.iconBtn, { width: size, height: size, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}>
      <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{
        cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: fill,
        strokeColor: variant === 'glass' ? Glass.border : 'transparent', strokeWidth: variant === 'glass' ? 1 : 0,
      }} />
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={iconColor} />
    </Pressable>
  );
}

// Badge icona-sola, stessa forma squircle di IconButton ma non premibile —
// intestazione di righe/card (icona su pallino/squircle tinto), sostituisce
// i tanti quadratini colorati ad-hoc sparsi per le schermate.
export function IconBadge({ icon, size = 44, color = Colors.gold, iconSize, style }: {
  icon: IoniconName; size?: number; color?: string; iconSize?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.iconBtn, { width: size, height: size }, style]}>
      <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING, fillColor: color + '22' }} />
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.45)} color={color} />
    </View>
  );
}

// Gruppo di segmenti in vetro liquido (sostituisce i tanti toggle/subtab ad
// hoc a riempimento pieno): traccia in blur chiaro, segmento attivo in
// squircle dorato TRANSLUCIDO — stessa identica tinta dello stato attivo
// della navbar (rgba(255,175,0,0.14)), non un riempimento pieno.
export function Segmented<T extends string>({ options, value, onChange, style }: {
  options: { value: T; label: string; icon?: IoniconName }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segWrap, style]}>
      <BlurView intensity={Glass.blur} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Glass.bg }]} />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.segItem}>
            {active && (
              <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{
                cornerRadius: Radius.compact, cornerSmoothing: CORNER_SMOOTHING,
                fillColor: 'rgba(255,175,0,0.16)', strokeColor: Colors.gold + '55', strokeWidth: 1,
              }} />
            )}
            {o.icon && <Ionicons name={o.icon} size={15} color={active ? Colors.gold : Colors.slate} />}
            <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Campo di testo in vetro liquido (blur + tinta chiara + bordo), stessa
// tecnica di Card — sostituisce i campi flat (backgroundColor pieno) usati
// finora nei form (login/registrazione/modifica profilo/ricerche).
export function Input({ icon, style, ...rest }: TextInputProps & { icon?: IoniconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.inputWrap, style]}>
      <BlurView intensity={Glass.blur} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Glass.bg }]} />
      {icon && <Ionicons name={icon} size={18} color={Colors.slate} style={{ marginRight: 10 }} />}
      <TextInput placeholderTextColor={Colors.slate} style={styles.input} {...rest} />
    </View>
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
  iconBtn: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  segWrap: { flexDirection: 'row', borderRadius: Radius.card, padding: 4, gap: 4, borderWidth: 1, borderColor: Glass.border, overflow: 'hidden' },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: Radius.compact },
  segText: { color: Colors.slate, fontWeight: '700', fontSize: Font.small },
  segTextActive: { color: Colors.gold },
  inputWrap: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: Radius.compact, borderWidth: 1, borderColor: Glass.border, paddingHorizontal: Spacing.lg, overflow: 'hidden' },
  input: { flex: 1, color: Colors.navyDeep, fontSize: Font.body, height: '100%' },
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
