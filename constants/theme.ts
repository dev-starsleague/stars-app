// Palette estratta dal build ufficiale "Padel Stars League" — tema chiaro
// (stessa struttura light-glass del gestionale, src/lib/styles.css: pagina
// grigio chiaro, card bianche/vetro). navy/navyDeep restano scuri: non sono
// più lo sfondo dell'app, ma il colore di testo/accento primario (già usati
// così ovunque, es. testo su chip attivi, FAB, badge dorati).
export const Colors = {
  navy: '#1E314A', // brand — accenti scuri intenzionali (FAB, chip attivi, bar CTA)
  navyDeep: '#16253A', // testo primario/ink e sfondo di elementi scuri intenzionali
  navyCard: '#F0F3F7', // superficie neutra chiara (chip, input, righe lista)
  navyLine: '#4A6080', // bordo — usato sempre a bassa opacità, resta leggibile su chiaro
  gold: '#FFAF00', // accento
  goldSoft: '#FFC94D',
  slate: '#66788D', // testo secondario/icone — scurito per leggibilità su chiaro
  slateLight: '#56687C',
  cloud: '#33404F', // testo body — scurito per leggibilità su chiaro
  white: '#FFFFFF', // bianco vero: testo su elementi scuri/colorati, non più sfondo pagina
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  bg: '#EEF1F5', // sfondo pagina, come --bg del gestionale
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF', // card/superfici opache (distinto da bg per dare profondità)
};

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
  // Stessa doppia scala "Liquid Glass" del gestionale (src/lib/styles.css):
  // card/modali grandi con raggio liscio, elementi compatti con raggio più
  // piccolo + corner-shape squircle (vedi components/ui.tsx, Squircle*).
  card: 18,
  compact: 12,
};

// Corner-smoothing "alla Figma" usato dal gestionale per lo squircle
// (corner-shape: squircle) — stesso valore su tutti gli elementi compatti
// per coerenza visiva (bottoni, chip, icone, indicatore navbar).
export const CORNER_SMOOTHING = 0.65;

// Materiali "liquid glass" — stessa tecnica del gestionale (src/lib/styles.css
// --glass-*): superficie bianca semi-trasparente + blur + bordo chiaro sottile
// + riflesso in alto. Su sfondo bianco il blur da solo non basta a
// distinguere la card (bianco su bianco): bordo e ombra fanno il lavoro di
// separazione visiva, esattamente come nel gestionale.
export const Glass = {
  bg: 'rgba(255, 255, 255, 0.55)',
  bgStrong: 'rgba(255, 255, 255, 0.75)',
  border: 'rgba(255, 255, 255, 0.9)',
  borderStrong: 'rgba(255, 255, 255, 0.95)',
  shine: 'rgba(255, 255, 255, 0.6)',
  shadow: '0 10px 28px rgba(20,30,48,0.10), 0 2px 8px rgba(20,30,48,0.06)',
  blur: 24,
  blurStrong: 34,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Font = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  small: 13,
  tiny: 11,
};
