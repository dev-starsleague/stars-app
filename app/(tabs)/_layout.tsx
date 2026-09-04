import React from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { SquircleView } from 'react-native-figma-squircle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing, CORNER_SMOOTHING } from '../../constants/theme';
import { useTheme } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const ICON: Record<string, IconName> = { index: 'home-outline', classifiche: 'trophy-outline', eventi: 'flash-outline', stars: 'star-outline' };
const ICON_ACTIVE: Record<string, IconName> = { index: 'home', classifiche: 'trophy', eventi: 'flash', stars: 'star' };
const PILL_HEIGHT = 66;
const FAB_SIZE = 56;

// La navbar resta blu navy come la sidebar/header del gestionale, anche se
// il resto dell'app è chiaro: stessa idea di src/lib/styles.css --brand
// (struttura scura su un'app altrimenti chiara). Colori locali (non nel
// theme condiviso) perché è l'unica superficie scura intenzionale dell'app.
const NAVBAR = {
  bg: 'rgba(30, 49, 74, 0.82)',
  border: 'rgba(255, 255, 255, 0.16)',
  iconInactive: '#93A6C0',
};

// Navbar a pillola flottante in vetro liquido: sfondo BlurView + tinta navy
// semi-trasparente (stessa tecnica di components/ui.tsx Card, ma tinta blu
// come il gestionale invece che bianca), staccata dai bordi e sollevata da
// fondo pagina. "prenota" e "profilo" sono route raggiungibili ma non tab
// visibili (equivalente a options.href:null di expo-router, che qui non si
// applica perché il tabBar è custom: va filtrato a mano) — Profilo si apre
// solo dall'header, non dalla navbar.
//
// 5 SLOT VERI in riga (fix utente esplicito, non un FAB flottante calcolato
// sopra il bordo tra due tab): Home, Classifiche, [stella], Eventi, Stars,
// tutti flex:1 dello stesso row — la stella è il 3° di 5 slot uguali, quindi
// è il centro esatto per costruzione, non per un calcolo di larghezza
// misurata. Per farla sporgere sopra il bordo della pillola senza che
// l'angolo arrotondato la tagli, il blur/tinta di sfondo (che HA
// overflow:hidden, gli serve per gli angoli) sta in un livello separato
// dietro alla riga con i 5 slot, che invece non è mai clippata.
function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const byName = (n: string) => state.routes.find((r) => r.name === n)!;
  const slots = [byName('index'), byName('classifiche'), null, byName('eventi'), byName('stars')];

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 14) }]} pointerEvents="box-none">
      <View style={styles.pillWrap}>
        <View style={styles.pillClip} pointerEvents="none">
          {/* Pillola SEMPRE in vetro scuro, in entrambi i temi — stessa
              superficie scura intenzionale della sidebar del gestionale,
              non segue il toggle chiaro/scuro dell'app. */}
          <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.pillTint]} />
        </View>

        <View style={styles.row}>
          {slots.map((route, i) => {
            if (!route) {
              return (
                <View key="star" style={styles.item}>
                  {/* Il bordo della stella segue il tema: la punta sporge
                      sopra la pillola scura fissa, sul retro della pagina
                      chiara/scura sottostante — deve staccarsi da quella,
                      non dalla pillola. */}
                  <View style={[styles.fab, { borderColor: colors.surface }]}>
                    {/* Stella sempre navy scuro sul cerchio oro pieno: il
                        contrasto navy-su-oro funziona identico in entrambi
                        i temi, non deve seguire il toggle. */}
                    <Ionicons name="star" color="#16253A" size={26} />
                  </View>
                </View>
              );
            }

            const index = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <Pressable key={route.key} onPress={onPress} style={styles.item}>
                {isFocused && (
                  <SquircleView
                    style={StyleSheet.absoluteFillObject}
                    squircleParams={{ cornerRadius: Radius.control, cornerSmoothing: CORNER_SMOOTHING, fillColor: 'rgba(255,175,0,0.14)' }}
                  />
                )}
                <Ionicons name={isFocused ? ICON_ACTIVE[route.name] : ICON[route.name]} size={22} color={isFocused ? '#FFAF00' : NAVBAR.iconInactive} />
                <Text style={[styles.label, { color: isFocused ? '#FFAF00' : NAVBAR.iconInactive }]}>{String(options.title ?? route.name)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // La pillola è position:absolute e non riserva spazio da sola nel layout
  // delle schermate (a differenza della vecchia tabBarStyle piena): si dà
  // qui lo spazio equivalente in fondo a ogni schermata, altrimenti l'ultimo
  // contenuto finirebbe nascosto dietro il vetro.
  const reservedBottom = Math.max(insets.bottom, 14) + PILL_HEIGHT + Spacing.md;

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      sceneContainerStyle={{ paddingBottom: reservedBottom }}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="classifiche" options={{ title: 'Classifiche' }} />
      <Tabs.Screen name="eventi" options={{ title: 'Eventi' }} />
      <Tabs.Screen name="stars" options={{ title: 'Stars' }} />
      <Tabs.Screen name="profilo" options={{ title: 'Profilo', href: null }} />
      <Tabs.Screen name="prenota" options={{ href: null }} />
      {/* Schermate "di dettaglio" raggiunte con router.push, non tab vere
          (href:null) — stanno comunque DENTRO questo Tabs navigator (non
          nello Stack radice come prima) così la navbar flottante resta
          montata e visibile anche qui, non solo sulle 4 tab principali
          (fix utente esplicito: "quando navigo nelle pagine devo sempre
          vedere sia la navbar che l'header" — l'header lo aggiunge ogni
          schermata da sé con <AppHeader/>, la navbar la eredita gratis
          restando in questo stesso navigator). */}
      <Tabs.Screen name="stars-coin" options={{ href: null }} />
      <Tabs.Screen name="impegni" options={{ href: null }} />
      <Tabs.Screen name="amici" options={{ href: null }} />
      <Tabs.Screen name="modifica-profilo" options={{ href: null }} />
      <Tabs.Screen name="richiedi-valutazione" options={{ href: null }} />
      <Tabs.Screen name="giocatore/[id]" options={{ href: null }} />
      <Tabs.Screen name="giorno/[data]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
  // Nessun overflow:hidden qui: la stella dello slot centrale deve poter
  // sporgere sopra il bordo superiore senza essere tagliata.
  pillWrap: { width: '100%', height: PILL_HEIGHT, borderRadius: Radius.card, boxShadow: '0 10px 28px rgba(20,30,48,0.10), 0 2px 8px rgba(20,30,48,0.06)' } as any,
  // Livello di sfondo separato (blur/tinta/bordo), assoluto e clippato agli
  // angoli arrotondati — l'unico nodo con overflow:hidden, dietro alla riga.
  pillClip: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: Radius.card, overflow: 'hidden',
    borderWidth: 1, borderColor: NAVBAR.border,
  },
  pillTint: { backgroundColor: NAVBAR.bg },
  row: { height: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xs },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  // Stesso slot flex:1 degli altri 4 (garantisce che sia esattamente al
  // centro di 5), ma allineato in alto: il bottone stella sporge sopra il
  // bordo della pillola con un margine negativo, non con position:absolute
  // calcolato — è del tutto interno al flusso della riga.
  fab: {
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: 18, marginTop: 0,
    backgroundColor: '#FFAF00',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
    boxShadow: '0 6px 18px rgba(255,175,0,0.45)',
  } as any,
  label: { fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
});
