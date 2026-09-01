// ============================================================
// Design tokens — linguaggio "iOS 26 / Liquid Glass", stessa struttura
// del gestionale (stars-system/src/lib/styles.css) portata su React
// Native. Palette del brand (Padel Stars League) invariata: qui si
// aggiungono la variante scura e le categorie di token mancanti
// (glass regular/clear, radius con concentricità, spacing, typography,
// motion, elevation) — vedi lib/theme.tsx per il provider che sceglie
// Light o Dark a runtime.
// ============================================================

export type ColorScheme = 'light' | 'dark';

export interface AppColors {
  navy: string; navyDeep: string; navyCard: string; navyLine: string;
  gold: string; goldSoft: string;
  slate: string; slateLight: string; cloud: string; white: string;
  green: string; red: string; amber: string;
  bg: string; bgElevated: string; surface: string;
  // --- token semantici (§17/§24 direttiva) ---
  background: string; surfacePrimary: string; surfaceSecondary: string; surfaceElevated: string;
  labelPrimary: string; labelSecondary: string; labelTertiary: string; separator: string;
}

// Palette chiara — invariata rispetto a prima (nessuna differenza
// visiva per chi non tocca il toggle, stesso principio del gestionale:
// il default resta sempre chiaro, mai agganciato al tema di sistema).
export const LightColors: AppColors = {
  navy: '#1E314A', navyDeep: '#16253A', navyCard: '#F0F3F7', navyLine: '#4A6080',
  gold: '#FFAF00', goldSoft: '#FFC94D',
  slate: '#66788D', slateLight: '#56687C', cloud: '#33404F', white: '#FFFFFF',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
  bg: '#EEF1F5', bgElevated: '#FFFFFF', surface: '#FFFFFF',
  background: '#EEF1F5', surfacePrimary: '#FFFFFF', surfaceSecondary: '#F5F7FA', surfaceElevated: 'rgba(255,255,255,0.86)',
  labelPrimary: '#16253A', labelSecondary: '#66788D', labelTertiary: 'rgba(22,37,58,0.5)', separator: 'rgba(74,96,128,0.22)',
};

// Palette scura — superfici vere, non un'inversione (§17): il navy
// "struttura" diventa lo sfondo invece del testo, l'oro resta oro
// (unico accento, non cambia con lo schema) ma leggermente più chiaro
// per restare leggibile su superfici scure.
export const DarkColors: AppColors = {
  navy: '#0E1420', navyDeep: '#EEF1F5', navyCard: '#1A2333', navyLine: 'rgba(191,201,213,0.24)',
  gold: '#FFAF00', goldSoft: '#FFC94D',
  slate: '#97A5B8', slateLight: '#AEBBCB', cloud: '#D7DEE8', white: '#FFFFFF',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
  bg: '#0E1420', bgElevated: '#161D2B', surface: '#161D2B',
  background: '#0E1420', surfacePrimary: '#161D2B', surfaceSecondary: '#101623', surfaceElevated: 'rgba(22,29,43,0.86)',
  labelPrimary: '#EEF1F5', labelSecondary: '#97A5B8', labelTertiary: 'rgba(238,241,245,0.5)', separator: 'rgba(255,255,255,0.12)',
};

export interface AppGlass {
  // regular: blur alto, superficie più opaca — navigation/toolbar/testo
  regularBg: string; regularBorder: string;
  // strong: variante "regular" ancora più opaca (popover/modal)
  strongBg: string; strongBorder: string;
  // clear: molto più trasparente — controlli sopra media/immagini,
  // SOLO dove lo sfondo garantisce lettura
  clearBg: string; clearBorder: string;
  shine: string; highlight: string;
  shadow: string; shadowLg: string;
  blur: number; blurStrong: number;
}

export const LightGlass: AppGlass = {
  regularBg: 'rgba(255,255,255,0.55)', regularBorder: 'rgba(255,255,255,0.55)',
  strongBg: 'rgba(255,255,255,0.75)', strongBorder: 'rgba(255,255,255,0.85)',
  clearBg: 'rgba(255,255,255,0.24)', clearBorder: 'rgba(255,255,255,0.35)',
  shine: 'rgba(255,255,255,0.6)', highlight: 'rgba(255,255,255,0.4)',
  shadow: '0 10px 28px rgba(20,30,48,0.10), 0 2px 8px rgba(20,30,48,0.06)',
  shadowLg: '0 20px 50px rgba(20,30,48,0.16), 0 4px 14px rgba(20,30,48,0.08)',
  blur: 24, blurStrong: 34,
};

export const DarkGlass: AppGlass = {
  regularBg: 'rgba(22,29,43,0.55)', regularBorder: 'rgba(255,255,255,0.10)',
  strongBg: 'rgba(22,29,43,0.76)', strongBorder: 'rgba(255,255,255,0.14)',
  clearBg: 'rgba(22,29,43,0.30)', clearBorder: 'rgba(255,255,255,0.12)',
  shine: 'rgba(255,255,255,0.08)', highlight: 'rgba(255,255,255,0.08)',
  shadow: '0 10px 28px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.20)',
  shadowLg: '0 20px 50px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.3)',
  blur: 24, blurStrong: 34,
};

// --- Radius: famiglia coerente + alias semantici (§4/§5, concentricità) ---
// Non cambia col tema. control/button/card/panel/modal/floating sono gli
// alias richiesti dalla direttiva, agganciati alla stessa scala di base
// così le curve restano imparentate quando un elemento ne contiene un altro.
export const Radius = {
  xs: 8, sm: 12, md: 14, lg: 20, xl: 28, pill: 999,
  control: 12, button: 12, card: 18, panel: 22, modal: 28, floating: 28,
  compact: 12, // alias legacy, uguale a control/button — non rinominato per compatibilità con l'uso esistente
};

export const CORNER_SMOOTHING = 0.65;

// --- Spacing scale (§15), base 4px ---
export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
};

// --- Typography scale (§13) ---
export const Font = {
  h1: 28, h2: 22, h3: 18, body: 15, small: 13, tiny: 11,
};
export const Typography = {
  caption: { fontSize: 11, fontWeight: '500' as const, lineHeight: 15 },
  footnote: { fontSize: 12, fontWeight: '500' as const, lineHeight: 17 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  callout: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  headline: { fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  title3: { fontSize: 18, fontWeight: '700' as const, lineHeight: 23 },
  title2: { fontSize: 22, fontWeight: '800' as const, lineHeight: 27 },
  title1: { fontSize: 26, fontWeight: '800' as const, lineHeight: 31 },
  largeTitle: { fontSize: 32, fontWeight: '800' as const, lineHeight: 38 },
};

// --- Motion (§19) — durate in ms, easing per Animated/LayoutAnimation ---
export const Motion = {
  fast: 120, normal: 200, slow: 260,
  pressScale: 0.975,
};

// --- Elevation (§24) — ombre pronte per lo stile RN (solo iOS le
// applica via shadow*; Android usa `elevation`, aggiunto separatamente
// dove serve un rilievo reale). ---
export const Elevation = {
  low: { shadowColor: '#141E30', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  medium: { shadowColor: '#141E30', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  floating: { shadowColor: '#141E30', shadowOpacity: 0.18, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
};

// --- Alias retro-compatibili: molti file esistenti fanno
// `import { Colors, Glass } from '../constants/theme'` aspettandosi la
// palette chiara fissa. Restano validi (nessuna rottura), ma NON sono
// più reattivi al tema — i file aggiornati a questa direttiva leggono
// invece da `useTheme()` (vedi lib/theme.tsx). ---
export const Colors = LightColors;
export const Glass = {
  bg: LightGlass.regularBg, bgStrong: LightGlass.strongBg,
  border: LightGlass.regularBorder, borderStrong: LightGlass.strongBorder,
  shine: LightGlass.shine, shadow: LightGlass.shadow, shadowLg: LightGlass.shadowLg,
  blur: LightGlass.blur, blurStrong: LightGlass.blurStrong,
};
