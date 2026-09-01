import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ViewStyle, TextStyle, TextInputProps, StyleProp, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SquircleView } from 'react-native-figma-squircle';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, Font, CORNER_SMOOTHING } from '../constants/theme';
import { useTheme } from '../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Proprietà di layout del CONTENUTO (non del box esterno): `style` passato a
// Card deve poterle usare per disporre i figli (es. flexDirection:'row' per
// una riga icona+testo+chevron) — ma il nodo che porta l'ombra non può
// essere lo stesso che clippa gli angoli (vedi sotto), quindi vanno
// duplicate sul nodo giusto invece di finire solo su quello esterno, dove
// su un contenitore a figlio singolo non avrebbero alcun effetto visibile.
const CONTENT_LAYOUT_KEYS = ['flexDirection', 'alignItems', 'justifyContent', 'gap', 'rowGap', 'columnGap', 'flexWrap'] as const;

// Tutte le primitive sotto leggono colori/vetro da useTheme() invece che
// dagli export statici di constants/theme.ts: così un componente creato UNA
// volta (a module-scope, come sempre in RN) resta comunque reattivo al
// toggle chiaro/scuro (§17 — il tema non è opzionale, è parte del sistema).

// Card "vetro liquido": stessa tecnica del gestionale (src/lib/styles.css
// .card) — blur reale dietro, tinta semi-trasparente sopra, riflesso
// delicato in alto, bordo sottile. Radius liscio (Radius.card), nessuno
// squircle: nel gestionale lo squircle è solo per gli elementi compatti
// (bottoni/icone), mai per le card grandi.
export function Card({ children, style, variant = 'regular' }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; variant?: 'regular' | 'clear';
}) {
  const { scheme, glass } = useTheme();
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
  const bg = variant === 'clear' ? glass.clearBg : glass.regularBg;
  const border = variant === 'clear' ? glass.clearBorder : glass.regularBorder;
  return (
    <View style={[{ borderRadius: Radius.card, boxShadow: glass.shadow } as any, style]}>
      <View style={{ borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: border }}>
        {/* Il vetro reagisce al contenuto sottostante (§2 direttiva): tint
            chiaro su superficie chiara, scuro su superficie scura. */}
        <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]} />
        <LinearGradient
          colors={[glass.shine, 'transparent']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={[{ padding: Spacing.lg }, contentLayout]}>{children}</View>
      </View>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.navyDeep, fontSize: Font.h1, fontWeight: '800', letterSpacing: -0.5 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.navyDeep, fontSize: Font.h2, fontWeight: '700' }, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.slate, fontSize: Font.small }, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.cloud, fontSize: Font.body }, style]}>{children}</Text>;
}

// Bottone squircle (Radius.button + corner-shape squircle), stessa forma
// del .btn del gestionale — lo sfondo è disegnato da SquircleView (separato
// dallo style del Pressable, vedi API della libreria) invece che da
// backgroundColor/borderRadius normali. Risposta fisica al press: scale
// leggerissima (Motion.pressScale), non solo opacity.
export function Button({ title, onPress, variant = 'primary', loading, disabled, style }:
  { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, reducedMotion } = useTheme();
  const bg = variant === 'primary' ? colors.gold : variant === 'danger' ? colors.red : 'transparent';
  const fg = variant === 'primary' ? colors.navyDeep : variant === 'danger' ? colors.white : colors.gold;
  const strokeColor = variant === 'ghost' ? colors.navyLine : 'transparent';
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [
        { height: 50, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, overflow: 'hidden' },
        style,
        { opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed && !reducedMotion ? 0.975 : 1 }] },
      ]}>
      <SquircleView
        style={StyleSheet.absoluteFillObject}
        squircleParams={{ cornerRadius: Radius.button, cornerSmoothing: CORNER_SMOOTHING, fillColor: bg, strokeColor, strokeWidth: variant === 'ghost' ? 1 : 0 }}
      />
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontWeight: '700', fontSize: Font.body, color: fg }}>{title}</Text>}
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
  const { colors, glass, reducedMotion } = useTheme();
  // "dark" usa colors.navy (struttura, resta scuro in entrambi i temi) e non
  // colors.navyDeep: quello è inchiostro testo che in dark mode diventa quasi
  // bianco, il che renderebbe invisibile l'icona bianca sopra.
  const fill = variant === 'solid' ? colors.gold : variant === 'dark' ? colors.navy : glass.regularBg;
  const iconColor = color ?? (variant === 'solid' ? colors.navyDeep : variant === 'dark' ? colors.white : colors.slateLight);
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [
        { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        { width: size, height: size },
        { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed && !reducedMotion ? 0.94 : 1 }] },
        style,
      ]}>
      <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{
        cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: fill,
        strokeColor: variant === 'glass' ? glass.regularBorder : 'transparent', strokeWidth: variant === 'glass' ? 1 : 0,
      }} />
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={iconColor} />
    </Pressable>
  );
}

// Badge icona-sola, stessa forma squircle di IconButton ma non premibile —
// intestazione di righe/card (icona su pallino/squircle tinto), sostituisce
// i tanti quadratini colorati ad-hoc sparsi per le schermate.
export function IconBadge({ icon, size = 44, color, iconSize, style }: {
  icon: IoniconName; size?: number; color?: string; iconSize?: number; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const c = color ?? colors.gold;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, { width: size, height: size }, style]}>
      <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: c + '22' }} />
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.45)} color={c} />
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
  const { colors, glass, scheme } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', borderRadius: Radius.card, padding: 4, gap: 4, borderWidth: 1, borderColor: glass.regularBorder, overflow: 'hidden' }, style]}>
      <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: Radius.control }}>
            {active && (
              <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{
                cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING,
                fillColor: 'rgba(255,175,0,0.16)', strokeColor: colors.gold + '55', strokeWidth: 1,
              }} />
            )}
            {o.icon && <Ionicons name={o.icon} size={15} color={active ? colors.gold : colors.slate} />}
            <Text style={{ color: active ? colors.gold : colors.slate, fontWeight: '700', fontSize: Font.small }} numberOfLines={1}>{o.label}</Text>
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
  const { colors, glass, scheme } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: Radius.control, borderWidth: 1, borderColor: glass.regularBorder, paddingHorizontal: Spacing.lg, overflow: 'hidden' }, style]}>
      <BlurView intensity={glass.blur} tint={scheme} style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg }]} />
      {icon && <Ionicons name={icon} size={18} color={colors.slate} style={{ marginRight: 10 }} />}
      <TextInput placeholderTextColor={colors.slate} style={{ flex: 1, color: colors.navyDeep, fontSize: Font.body, height: '100%' }} {...rest} />
    </View>
  );
}

// Chip resta a forma di pillola (Radius.pill): nel gestionale i badge/pill
// (.badge, border-radius:999px) non usano corner-shape squircle — è una
// forma a sé, coerente così com'è.
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.pill,
      backgroundColor: active ? colors.gold : colors.navyCard, borderWidth: 1, borderColor: active ? colors.gold : colors.navyLine + '55',
    }}>
      <Text style={{ color: active ? colors.navyDeep : colors.slateLight, fontWeight: '600', fontSize: Font.small }}>{label}</Text>
    </Pressable>
  );
}

export function RankBadge({ value, size = 44 }: { value: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gold }}>
      <Text style={{ color: colors.gold, fontWeight: '800', fontSize: Font.small }}>{value.toFixed(2)}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, gold }: { name: string; size?: number; gold?: boolean }) {
  const { colors } = useTheme();
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: gold ? colors.gold : colors.navyLine }}>
      <Text style={{ fontWeight: '800', fontSize: size * 0.36, color: gold ? colors.navyDeep : colors.white }}>{initials}</Text>
    </View>
  );
}

export function Pill({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.gold;
  return (
    <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.pill, borderWidth: 1, alignSelf: 'flex-start', backgroundColor: c + '22', borderColor: c + '55' }}>
      <Text style={{ fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: c }}>{label}</Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.navyLine + '44', marginVertical: Spacing.md }} />;
}
