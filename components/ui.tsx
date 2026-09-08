import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ViewStyle, TextStyle, TextInputProps, StyleProp, ActivityIndicator, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SquircleView } from 'react-native-figma-squircle';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, Font, CORNER_SMOOTHING } from '../constants/theme';
import { useTheme } from '../lib/theme';
import { apiUrl } from '../lib/apiClient';

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
      {/* flex:1 + alignSelf:'stretch' qui (bug reale trovato dall'utente più
          volte, "box dentro box"): questo nodo è l'UNICO figlio di quello
          sopra, quindi normalmente riempirebbe da solo tutto lo spazio del
          genitore — TRANNE quando `style` passato a <Card> imposta un
          `alignItems` o un `flexDirection` (es. ogni card-riga icona+testo+
          prezzo, o una card a colonna centrata come le box statistiche):
          quel valore FINISCE ANCHE sul nodo esterno (serve perché
          CONTENT_LAYOUT_KEYS lo applichi anche al contenuto vero, sotto),
          e un `alignItems` diverso da 'stretch' lì sopra fa sì che questo
          figlio si restringa al proprio contenuto sull'asse trasversale
          invece di riempirlo — lasciando il riquadro vero (bordo/sfondo/
          blur) più piccolo del box che porta l'ombra, con l'ombra visibile
          oltre il bordo come se ci fosse "un'altra card" dietro. flex:1
          copre l'asse principale (es. flexDirection:'row' → larghezza),
          alignSelf:'stretch' copre SEMPRE l'asse trasversale qualunque sia
          l'alignItems del genitore (es. flexDirection di default/'column'
          con alignItems:'center' → larghezza, il caso delle box
          statistiche centrate) — servono entrambi, uno non basta senza
          l'altro. */}
      <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: border }}>
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
      {/* Bug reale trovato (non solo qui — in OGNI Input dell'app, incluso
          login): su web backdrop-filter fa sì che questi due livelli
          decorativi vengano DIPINTI sopra il vero <input> nonostante siano
          dichiarati prima nel JSX (backdrop-filter crea un proprio stacking
          context che qui finiva davanti) — sia nell'hit-test (click
          bloccati, fix già fatto con pointerEvents:'none') SIA nel disegno
          a schermo (il testo digitato restava visivamente sotto la patina
          di vetro, illeggibile/sfocato anche quando ormai si poteva
          scrivere). zIndex esplicito forza l'ordine reale: decorazioni
          dietro, contenuto (icona+testo) sempre sopra. */}
      <BlurView intensity={glass.blur} tint={scheme} style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none', zIndex: 0 }]} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.regularBg, pointerEvents: 'none', zIndex: 0 }]} />
      {icon && <Ionicons name={icon} size={18} color={colors.slate} style={{ marginRight: 10, zIndex: 1 }} />}
      <TextInput placeholderTextColor={colors.slate} style={{ flex: 1, color: colors.navyDeep, fontSize: Font.body, height: '100%', zIndex: 1 }} {...rest} />
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

// Immagine di profilo di default per genere (fix utente esplicito: prima
// c'erano solo iniziali colorate) — silhouette "liquid glass", una per
// uomo/donna. NIENTE sfondo colorato dietro l'immagine (fix utente
// esplicito: "rimuovi lo sfondo. e lascialo trasparente") — il cerchio/
// squircle resta trasparente e lascia vedere la superficie sotto.
const IMMAGINE_PROFILO_M = require('../assets/profilo-liquidglass-m.png');
const IMMAGINE_PROFILO_F = require('../assets/profilo-liquidglass-f.png');

/** Immagine di profilo di default per un genere — null se il genere non è
 *  noto (in quel caso chi chiama ricade sulle iniziali, come prima). */
export function immagineProfiloDefault(genere?: string | null) {
  if (genere === 'M') return IMMAGINE_PROFILO_M;
  if (genere === 'F') return IMMAGINE_PROFILO_F;
  return null;
}

// `uri` mostra la foto reale del giocatore quando c'è; altrimenti, se
// `genere` è noto, l'immagine di profilo di default per quel genere (fix
// utente esplicito, vedi sopra) su sfondo trasparente; solo se manca anche
// il genere si ricade sulle iniziali colorate come prima. `ringColor`
// disegna un anello colorato attorno al cerchio (fix utente esplicito:
// avatar con bordo oro/rosso nella slide "avversari"). `squircle` passa
// dal cerchio alla squircle blu-notte del gestionale (.pl-av: sfondo scuro
// fisso in entrambi i temi, come le card coppia A/B — fix utente esplicito
// "più simile al gestionale") — anche qui l'immagine di default resta
// trasparente, non sul navy fisso di quella modalità.
export function Avatar({ name, size = 40, gold, uri, ringColor, squircle, genere }: {
  name: string; size?: number; gold?: boolean; uri?: string | null; ringColor?: string; squircle?: boolean; genere?: string | null;
}) {
  const { colors } = useTheme();
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  // `gold` non nasconde più l'immagine di default (fix utente esplicito:
  // "voglio vedere come si vede nei vari punti dove si deve vedere" — anche
  // nei punti che usavano `gold` come semplice evidenziazione, es. l'header
  // del profilo giocatore). Quando i due coesistono, `gold` diventa un
  // anello dorato attorno all'immagine invece di riempire lo sfondo: solo
  // quando il genere non è noto si ricade sul vecchio cerchio pieno oro +
  // iniziali blu-notte, comportamento invariato.
  const immagineDefault = !uri ? immagineProfiloDefault(genere) : null;
  const anello = immagineDefault ? (gold ? colors.gold : ringColor) : ringColor;
  return (
    <View style={{
      width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      ...(squircle ? {} : {
        borderRadius: size / 2, backgroundColor: immagineDefault ? 'transparent' : (gold ? colors.gold : colors.navyLine),
        ...(anello ? { borderWidth: 2, borderColor: anello } : null),
      }),
    }}>
      {squircle && (
        <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{
          cornerRadius: size * 0.3, cornerSmoothing: CORNER_SMOOTHING,
          fillColor: immagineDefault ? 'transparent' : (gold ? colors.gold : colors.navy),
          strokeColor: anello, strokeWidth: anello ? 2 : 0,
        }} />
      )}
      {uri
        ? <Image source={{ uri: uri.startsWith('http') ? uri : apiUrl(uri) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : immagineDefault
        ? <Image source={immagineDefault} style={{ width: '82%', height: '82%' }} resizeMode="contain" />
        : <Text style={{ fontWeight: '800', fontSize: size * 0.36, color: gold ? colors.navyDeep : colors.white }}>{initials}</Text>}
    </View>
  );
}

// Avatar "a metà" di una coppia (fix utente esplicito: "l'immagine del
// profilo deve essere l'immagine dei due giocatori a metà, metà uno e
// metà l'altro") — usato per il RanDuo (classifica di coppia). Ogni metà
// è ritagliata dalla stessa identica sorgente di Avatar (foto reale se
// presente, altrimenti l'illustrazione di default per genere, altrimenti
// l'iniziale): il contenitore di sinistra mostra la metà sinistra
// dell'immagine intera del giocatore 1, quello di destra la metà destra
// dell'immagine del giocatore 2 — non due miniature separate, un unico
// ritratto "diviso a metà" come richiesto.
function metaAvatarSource(uri?: string | null, genere?: string | null) {
  if (uri) return { uri: uri.startsWith('http') ? uri : apiUrl(uri) };
  return immagineProfiloDefault(genere);
}
export function AvatarCoppia({ nome1, nome2, genere1, genere2, avatar1, avatar2, size = 40, squircle = true }: {
  nome1: string; nome2: string; genere1?: string | null; genere2?: string | null;
  avatar1?: string | null; avatar2?: string | null; size?: number; squircle?: boolean;
}) {
  const { colors } = useTheme();
  const img1 = metaAvatarSource(avatar1, genere1);
  const img2 = metaAvatarSource(avatar2, genere2);
  const iniziale1 = (nome1 || '?')[0]?.toUpperCase() ?? '?';
  const iniziale2 = (nome2 || '?')[0]?.toUpperCase() ?? '?';
  return (
    <View style={{
      width: size, height: size, flexDirection: 'row', overflow: 'hidden',
      borderRadius: squircle ? size * 0.3 : size / 2,
    }}>
      {/* Ogni metà mostra la fascia CENTRALE della foto intera del
          giocatore (non il suo bordo esterno): l'immagine è larga `size`
          (stessa resa "cover" di un avatar normale, il volto resta
          centrato al suo interno) e viene spostata a sinistra di size/4 —
          così il centro dell'immagine intera coincide col centro della
          metà da size/2 che la contiene, sia a sinistra che a destra (fix
          utente esplicito: "il centro dell'immagine di ognuno deve essere
          nel centro della metà dell'immagine complessiva"). Prima si
          mostravano i bordi esterni (0..size/2 a sinistra, size/2..size a
          destra), tagliando i volti fuori centro. */}
      <View style={{ width: size / 2, height: size, backgroundColor: colors.navyLine, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {img1
          ? <Image source={img1} style={{ width: size, height: size, marginLeft: -size / 4 }} resizeMode="cover" />
          : <Text style={{ color: colors.white, fontWeight: '800', fontSize: size * 0.32 }}>{iniziale1}</Text>}
      </View>
      <View style={{ width: size / 2, height: size, backgroundColor: colors.navyLine, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {img2
          ? <Image source={img2} style={{ width: size, height: size, marginLeft: -size / 4 }} resizeMode="cover" />
          : <Text style={{ color: colors.white, fontWeight: '800', fontSize: size * 0.32 }}>{iniziale2}</Text>}
      </View>
    </View>
  );
}

// Distintivo "partita in attesa di abbinamento" (fix utente esplicito:
// "evidenziata con una stella nell'angolo alto dx") — da mettere come
// sibling assoluto SOPRA una card, il cui genitore diretto deve avere
// `position: 'relative'` (o essere già relative di default, come ogni View
// non-absolute) perché questo badge si posizioni rispetto a lei.
export function BadgeAttesa() {
  const { colors } = useTheme();
  return (
    <View style={{
      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, zIndex: 1,
      backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    }}>
      <Ionicons name="star" size={12} color="#fff" />
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
