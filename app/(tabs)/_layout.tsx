import React, { useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet, Image, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../lib/theme';

// Pressable animabile (opacity/scale via Animated.Value) senza perdere
// onPress/hitSlop — serve per il backdrop e il box del pop-up della
// stella, che devono sia animarsi sia restare toccabili.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconName = keyof typeof Ionicons.glyphMap;
const ICON: Record<string, IconName> = { index: 'home-outline', classifiche: 'trophy-outline', eventi: 'flash-outline', stars: 'star-outline' };
const ICON_ACTIVE: Record<string, IconName> = { index: 'home', classifiche: 'trophy', eventi: 'flash', stars: 'star' };
const PILL_HEIGHT = 66;
const FAB_SIZE = 78;

// Navbar sempre scura, in ENTRAMBI i temi (fix utente esplicito: "prova a
// rimettere la navbar scura anche per il tema scuro" — prima era
// invertita rispetto al tema dell'app, chiara nel tema scuro). Colore
// locale (non nel theme condiviso, che nel tema scuro va nella direzione
// opposta) perché è un valore fisso indipendente dallo schema attivo, non
// derivato da esso.
const NAVBAR_SCURA = { bg: 'rgba(30, 49, 74, 0.82)', border: 'rgba(255, 255, 255, 0.16)', iconInactive: '#93A6C0', blurTint: 'dark' as const };

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
  const { scheme, colors, glass } = useTheme();
  const nav = NAVBAR_SCURA;
  const byName = (n: string) => state.routes.find((r) => r.name === n)!;
  const slots = [byName('index'), byName('classifiche'), null, byName('eventi'), byName('stars')];
  // Stessa stella grigia (bfc9d5) in entrambi i temi (fix utente
  // esplicito: "metti la stella grigia anche per il tema scuro" — prima
  // era bfc9d5 solo in chiaro, 1d314a/blu scuro in scuro). Sollevato qui
  // (non più dentro slots.map) perché serve sia al bottone nella navbar
  // sia alla "navicella" del pop-up più sotto.
  const starIdle = require('../../assets/stella-liquidglass-bfc9d5.png');

  // Animazione di apertura della stella. Tre fasi in sequenza:
  // 1) riseAnim: sollevamento dalla navbar al centro schermo, virando
  //    all'oro durante il tragitto.
  // 2) spinAnim (fix utente esplicito, settima iterazione: "falla girare
  //    velocemente per poi farla diventare più grande" — sostituisce la
  //    precedente esplosione a 9 pezzi, troppo elaborata): la stella
  //    intera (ormai dorata) gira veloce su se stessa, ferma, prima di
  //    ingrandirsi.
  // 3) expandAnim: il riquadro dorato si espande dalla dimensione naturale
  //    della stella fino al pop-up.
  // Nota sul "riquadro che non mi piace" (fix precedente, ancora valido):
  // lo sfondo dorato pieno compare SOLO quando il riquadro inizia davvero
  // a crescere, non durante sollevamento/rotazione — durante quelle fasi
  // si vede solo la stella (prima idle poi oro), mai un blocco pieno
  // dietro di lei.
  //
  // (a) "deve prendere lo schermo del telefono... non tutto lo schermo del
  //     browser": su web, quando la finestra è larga, l'app vive dentro
  //     components/PhoneFrame.tsx (una cornice fissa, centrata, con
  //     overflow:hidden) — usare Dimensions.get('window') prendeva le
  //     dimensioni dell'INTERA finestra del browser, non quelle della
  //     cornice, quindi il pop-up sforava fuori dal telefono. Fix: niente
  //     Modal (che su web si comporta come un portale e scappa SEMPRE
  //     fuori dall'albero React, quindi anche dalla cornice) — un normale
  //     View assoluto dentro lo stesso albero della tab bar, che eredita
  //     naturalmente i confini (e il clipping) della cornice quando c'è, o
  //     dello schermo vero quando non c'è (nativo, o finestra stretta).
  //     overlayRef misura la PROPRIA posizione/dimensione reale
  //     (measureInWindow) — quella è la vera area disponibile, non la
  //     finestra del browser — e la stella viene convertita in coordinate
  //     LOCALI a quell'area (sottraendo l'offset della cornice).
  // (b) "410x765px tra l'header e la navbar": dimensione FISSA (non più
  //     "riempi tutto lo spazio disponibile"), centrata sia in
  //     orizzontale sia nello spazio verticale libero fra header e navbar.
  const riseAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const posX = useRef(new Animated.Value(0)).current;
  const posY = useRef(new Animated.Value(0)).current;
  const boxW = useRef(new Animated.Value(FAB_SIZE)).current;
  const boxH = useRef(new Animated.Value(FAB_SIZE)).current;
  const [popupVisibile, setPopupVisibile] = useState(false);
  const starAnchorRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const [origine, setOrigine] = useState({ x: 0, y: 0, w: FAB_SIZE, h: FAB_SIZE });
  // Dimensioni REALI dell'area disponibile (la cornice del telefono su web
  // largo, lo schermo vero altrimenti) — misurate, non dedotte dalla
  // finestra del browser. Il default (prima di ogni misura) non conta:
  // usato solo mentre popupVisibile è false.
  const [schermo, setSchermo] = useState({ w: 400, h: 800 });

  const insets = useSafeAreaInsets();
  // HEADER_H replica l'altezza reale di AppHeader.tsx (paddingVertical
  // Spacing.md×2 = 24 + contenuto 40px = 64): non misurabile da qui (vive
  // in un componente diverso, montato per ogni singola schermata), quindi
  // tenuto in sincrono a mano con components/AppHeader.tsx.
  const HEADER_H = 64;
  const POPUP_W = 410;
  const POPUP_H = 765;
  const MARGINE_MIN = 15;
  const headerBottom = insets.top + HEADER_H;

  // 765×410 è la dimensione voluta (fix utente esplicito), ma va ridotta
  // quando lo schermo/la cornice disponibile è più piccola di così —
  // altrimenti il riquadro sfora e il pulsante di chiusura/lo sfondo
  // toccabile finiscono fuori dall'area visibile (bug scoperto testando
  // dentro components/PhoneFrame.tsx, largo solo 440px): mai più stretto
  // però di MARGINE_MIN per lato.
  const calcolaPopup = (ow: number, oh: number) => {
    const navbarTopL = oh - 12 - PILL_HEIGHT; // 12 = bottom fisso della pillola (vedi styles.wrap)
    const w = Math.min(POPUP_W, Math.max(1, ow - MARGINE_MIN * 2));
    const h = Math.min(POPUP_H, Math.max(1, navbarTopL - headerBottom - MARGINE_MIN * 2));
    const x = (ow - w) / 2;
    const y = headerBottom + (navbarTopL - headerBottom - h) / 2;
    return { x, y, w, h };
  };

  const target = calcolaPopup(schermo.w, schermo.h);
  const targetX = target.x, targetY = target.y, targetW = target.w, targetH = target.h;
  const targetCentroX = targetX + targetW / 2;
  const targetCentroY = targetY + targetH / 2;

  const apriPopupStella = () => {
    overlayRef.current?.measureInWindow((ox, oy, ow, oh) => {
      starAnchorRef.current?.measureInWindow((x, y, w, h) => {
        // Coordinate LOCALI all'area disponibile (sottraendo l'offset
        // della cornice, se c'è) — vedi nota (a) sopra.
        const locale = { x: x - ox, y: y - oy, w, h };
        setSchermo({ w: ow, h: oh });
        setOrigine(locale);
        posX.setValue(locale.x); posY.setValue(locale.y); boxW.setValue(locale.w); boxH.setValue(locale.h);
        setPopupVisibile(true);

        const t = calcolaPopup(ow, oh);
        const centratoLeft = t.x + t.w / 2 - locale.w / 2;
        const centratoTop = t.y + t.h / 2 - locale.h / 2;

        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(posX, { toValue: centratoLeft, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(posY, { toValue: centratoTop, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(riseAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]).start(() => {
            Animated.timing(spinAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
              Animated.parallel([
                Animated.timing(posX, { toValue: t.x, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(posY, { toValue: t.y, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(boxW, { toValue: t.w, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(boxH, { toValue: t.h, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
                Animated.timing(expandAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              ]).start(() => {
                Animated.timing(contentAnim, { toValue: 1, duration: 160, easing: Easing.linear, useNativeDriver: true }).start();
              });
            });
          });
        });
      });
    });
  };
  const chiudiPopupStella = () => {
    const centratoLeft = targetCentroX - origine.w / 2;
    const centratoTop = targetCentroY - origine.h / 2;
    Animated.timing(contentAnim, { toValue: 0, duration: 130, easing: Easing.linear, useNativeDriver: true }).start(() => {
      Animated.parallel([
        Animated.timing(posX, { toValue: centratoLeft, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(posY, { toValue: centratoTop, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(boxW, { toValue: origine.w, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(boxH, { toValue: origine.h, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(expandAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        spinAnim.setValue(0);
        Animated.parallel([
          Animated.timing(posX, { toValue: origine.x, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
          Animated.timing(posY, { toValue: origine.y, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
          Animated.timing(riseAnim, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start(() => {
          setPopupVisibile(false);
        });
      });
    });
  };

  const riseIdleOpacity = riseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // 3 giri completi, veloci (fix utente esplicito: "falla girare
  // velocemente") — avviene mentre la stella è ancora a dimensione
  // naturale, prima che cominci a crescere (vedi apriPopupStella).
  const spinRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] });
  // Sfondo pieno del riquadro: compare SOLO a crescita quasi conclusa (fix
  // utente esplicito, seconda volta: "nell'animazione forma un quadrato
  // che è proprio brutto") — comparire prima (es. al 25% della crescita)
  // lo mostrava ancora piccolo e quasi quadrato (la stella di partenza è
  // quadrata, il pop-up finale è molto più alto che largo: a metà crescita
  // non è ancora abbastanza allungato) — un "quadratino dorato" innaturale
  // in mezzo allo schermo. Ora appare solo quando il riquadro ha già preso
  // la sua forma definitiva (rettangolo alto), non prima.
  const sfondoPienoOpacity = expandAnim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1] });
  // Layer "ponte" (dorato) visibile fino all'arrivo del contenuto vero,
  // poi crossfade veloce — non uno scambio secco.
  const shapeOpacity = Animated.subtract(1, contentAnim);

  return (
    <>
    {/* 12px fissi dal bordo inferiore vero, in entrambi i temi (fix utente
        esplicito) — non legato a insets.bottom. */}
    <View style={[styles.wrap, { bottom: 12 }]} pointerEvents="box-none">
      <View style={styles.pillWrap}>
        <View style={[styles.pillClip, { borderColor: nav.border }]} pointerEvents="none">
          {/* Pillola sempre nel tono OPPOSTO al tema attivo (fix utente
              esplicito) — mai la stessa tonalità della pagina sotto. */}
          <BlurView intensity={34} tint={nav.blurTint} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: nav.bg }]} />
        </View>

        <View style={styles.row}>
          {slots.map((route, i) => {
            if (!route) {
              // Stella logo. Nessun alone/ombra sottostante (fix utente
              // esplicito: "rimuovi tutte le sfumature sottostanti") —
              // SOLO il logo, nessun riquadro/contenitore intorno.
              return (
                <Pressable key="star" style={styles.item} onPress={apriPopupStella}>
                  {/* ref qui: è il rettangolo che measureInWindow misura
                      come "origine" del sollevamento verso il centro
                      schermo — deve restare esattamente questo nodo, non
                      un genitore/figlio diverso, altrimenti la misura non
                      corrisponde a quello che l'utente vede.
                      Nascosta (opacity 0) durante l'intera animazione: da
                      lì in poi è la "navicella" dentro il Modal a
                      rappresentarla (stessa posizione/dimensione di
                      partenza, nessun doppione visibile). */}
                  <View ref={starAnchorRef} style={[styles.fabWrap, { opacity: popupVisibile ? 0 : 1 }]}>
                    <Image source={starIdle} style={styles.fabStar} resizeMode="contain" />
                  </View>
                </Pressable>
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
                <View style={styles.iconWrap}>
                  {/* Stato attivo = SOLO colore (icona+testo in arancione),
                      mai un contenitore/pill dietro alla voce (fix utente
                      esplicito, stile tab bar nativa Apple) — l'unica
                      concessione è questo alone radiale minuscolo e
                      sfumatissimo dietro alla sola icona, ottenuto con un
                      cerchietto quasi trasparente + box-shadow sfocata
                      (nessun bordo, nessuna superficie distinta). */}
                  {isFocused && <View style={styles.glow} pointerEvents="none" />}
                  <Ionicons name={isFocused ? ICON_ACTIVE[route.name] : ICON[route.name]} size={22} color={isFocused ? '#FFAF00' : nav.iconInactive} />
                </View>
                <Text style={[styles.label, { color: isFocused ? '#FFAF00' : nav.iconInactive }]}>{String(options.title ?? route.name)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>

    {/* Pop-up della stella: contenuto ancora da definire ("poi ti dico
        deve succedere nel pop-up") — per ora solo l'involucro. La stella
        stessa (cresciuta/dorata) VOLA e cambia forma fino a diventare
        questo riquadro (fix utente esplicito: "la stella deve proprio
        diventare un pop-up, deve cambiare forma"), vedi styles.morphShape
        e i commenti su origine/schermo più sopra.
        NIENTE <Modal>: su web è un portale che scappa SEMPRE fuori
        dall'albero React (quindi anche dalla cornice PhoneFrame quando
        c'è) — un View assoluto qui, nello stesso albero della tab bar,
        eredita naturalmente i confini/il clipping della cornice o dello
        schermo vero (fix utente esplicito: "deve prendere lo schermo del
        telefono, non tutto lo schermo del browser"). pointerEvents
        box-none quando chiuso: non deve rubare i tocchi al resto dell'app. */}
    <View
      ref={overlayRef}
      style={StyleSheet.absoluteFillObject}
      pointerEvents={popupVisibile ? 'auto' : 'box-none'}>
      {popupVisibile && (
        <>
          {/* Sfondo che si scurisce durante il sollevamento (riseAnim):
              deve essere già scuro quando la stella arriva al centro, per
              coprire la navbar reale sotto (nascosta con opacity:0 nel
              frattempo, vedi sopra). */}
          <AnimatedPressable style={[styles.popupSfondo, { opacity: riseAnim }]} onPress={chiudiPopupStella} />

          {/* "Navicella": nasce ESATTAMENTE alla posizione/dimensione della
              stella misurata (posX/posY/boxW/boxH, layout vero non
              transform — vedi il commento sopra sul bug del borderRadius
              deformato) — prima si sposta al centro schermo a dimensione
              invariata, poi gira veloce su se stessa (fix utente
              esplicito: "falla girare velocemente"), poi cresce fino al
              riquadro del pop-up. È la stessa stella che si solleva, gira
              e si espande, non un elemento diverso che appare al centro. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.morphShape, { left: posX, top: posY, width: boxW, height: boxH, opacity: shapeOpacity }]}>
              {/* Sfondo pieno: NON durante il sollevamento/la rotazione
                  (altrimenti si vede un riquadro squadrato dietro alla
                  sagoma stellata, bruttino — fix utente esplicito) —
                  compare solo quando il riquadro comincia davvero a
                  crescere. */}
              <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFAF00', opacity: sfondoPienoOpacity, borderRadius: Radius.modal }]} />
              {/* Icona nel colore idle (stesso asset del tema corrente),
                  sfuma via mentre sale — crossfade col colore oro, non un
                  tintColor (ignorato in silenzio da Image su React Native
                  Web, già scoperto in un fix precedente). Non ruota: solo
                  la versione oro (sotto) gira. */}
              <Animated.Image source={starIdle} style={[styles.morphStar, { opacity: riseIdleOpacity }]} resizeMode="contain" />
              {/* Rotazione veloce (fix utente esplicito, sostituisce la
                  precedente esplosione a pezzi): 3 giri completi mentre è
                  ancora a dimensione naturale, PRIMA che cominci a
                  crescere — niente distorsione dallo scale del riquadro,
                  che parte solo dopo. */}
              <Animated.Image
                source={require('../../assets/stella-liquidglass-ffaf00.png')}
                style={[styles.morphStar, { opacity: riseAnim, transform: [{ rotate: spinRotate }] }]}
                resizeMode="contain"
              />
            </Animated.View>

            {/* Vero box del pop-up: crossfade in ingresso (contentAnim)
                subito dopo l'arrivo della navicella, nella stessa identica
                posizione target (410×765, centrato fra header e navbar —
                fix utente esplicito) — nessun salto percepibile fra
                "navicella" e "contenuto". Bordo arancione "liquid glass"
                (fix utente esplicito: "quando si forma del tutto vorrei
                che SOLO i bordi rimanessero arancioni... il resto deve
                essere in base al tema chiaro o scuro") — l'interno resta
                il vetro liquido normale dell'app (BlurView + glass.strongBg,
                tema-dipendente), SOLO il bordo è dorato, con un riflesso
                caldo in alto per l'effetto vetro (stile Card in
                components/ui.tsx, tinta oro invece che neutra) e un alone
                dorato morbido intorno (shadow* nativi sul livello ESTERNO,
                che non ha overflow:hidden — altrimenti verrebbe tagliato,
                stesso accorgimento di Card). */}
            <AnimatedPressable
              style={[
                styles.popupBoxOuter,
                {
                  left: targetX, top: targetY, width: targetW, height: targetH, opacity: contentAnim,
                  shadowColor: '#FFAF00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 18,
                },
              ]}
              onPress={(e) => e.stopPropagation()}>
              <View style={styles.popupBoxInner}>
                {/* Più opaco e più sfocato del vetro "strong" normale
                    dell'app (fix utente esplicito: "molta meno trasparenza
                    ... più offuscamento, deve essere più blurrato") — solo
                    per questo pop-up, non tocca glass.strongBg/blurStrong
                    condivisi con gli altri modali. */}
                <BlurView intensity={70} tint={scheme} style={StyleSheet.absoluteFillObject} />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: scheme === 'dark' ? 'rgba(22,29,43,0.93)' : 'rgba(255,255,255,0.93)' }]} />
                {/* Riflesso appena accennato (non un lavaggio caldo su
                    tutta la card, fix: era troppo intenso/troppo esteso —
                    "il resto deve essere in base al tema") — solo una
                    striscia sottile in alto, stessa idea del riflesso di
                    Card in ui.tsx ma con un pizzico di oro. */}
                <LinearGradient
                  colors={['rgba(255,196,92,0.16)', 'rgba(255,175,0,0)']}
                  start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.22 }}
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents="none"
                />
                <Pressable style={styles.popupChiudi} onPress={chiudiPopupStella} hitSlop={10}>
                  <Ionicons name="close" size={20} color={colors.labelSecondary} />
                </Pressable>
                <Text style={[styles.popupTitolo, { color: colors.labelPrimary }]}>Presto disponibile</Text>
                <Text style={[styles.popupSottotitolo, { color: colors.labelSecondary }]}>Contenuto in arrivo</Text>
              </View>
            </AnimatedPressable>
        </>
      )}
    </View>
    </>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  // La pillola è position:absolute e non riserva spazio da sola nel layout
  // delle schermate (a differenza della vecchia tabBarStyle piena): si dà
  // qui lo spazio equivalente in fondo a ogni schermata, altrimenti l'ultimo
  // contenuto finirebbe nascosto dietro il vetro. 12 = lo stesso bottom
  // fisso della pillola.
  const reservedBottom = 12 + PILL_HEIGHT + Spacing.md;

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      // sceneContainerStyle di default è bianco (tema di React Navigation,
      // ignaro del nostro toggle chiaro/scuro): senza backgroundColor qui,
      // lo spazio riservato in fondo ad ogni schermata per non finire
      // dietro il vetro della pillola restava bianco fisso in ENTRAMBI i
      // temi — è quella la "sezione sotto la navbar tutta bianca" (fix
      // utente esplicito: in chiaro combacia già con colors.bg quindi non
      // si notava, in scuro no).
      sceneContainerStyle={{ paddingBottom: reservedBottom, backgroundColor: colors.bg }}
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
  // Niente boxShadow qui: su native creava un riquadro fantasma intorno
  // alla pillola invece di un'ombra morbida (stesso identico bug già
  // trovato e tolto sul pulsante ADV della Home, fix utente esplicito).
  pillWrap: { width: '100%', height: PILL_HEIGHT, borderRadius: Radius.card },
  // Livello di sfondo separato (blur/tinta/bordo), assoluto e clippato agli
  // angoli arrotondati — l'unico nodo con overflow:hidden, dietro alla riga.
  pillClip: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: Radius.card, overflow: 'hidden',
    borderWidth: 1, // colore del bordo applicato inline (dipende dallo schema, vedi nav.border)
  },
  row: { height: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xs },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  // Contenitore solo per centrare l'alone dietro all'icona — niente
  // dimensione propria visibile (nessun background, nessun bordo).
  iconWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  // Alone radiale discreto: cerchio (base rotonda più grande, blur più
  // piccolo rispetto a un cerchietto minuscolo — meno soggetto a
  // deformarsi in un blur software) con riempimento quasi trasparente +
  // una sfocatura leggera ai bordi. Diametro percepito totale ≈ 28 + 2×10
  // = 48px, dentro il range 40–50px richiesto; opacità bassissima, nessun
  // bordo netto, nessuna superficie distinta.
  glow: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,175,0,0.09)',
    boxShadow: '0 0 10px 0px rgba(255,175,0,0.14)',
  } as any,
  // Stesso slot flex:1 degli altri 4 (garantisce che sia esattamente al
  // centro di 5).
  // SOLO il logo, nessun riquadro/superficie/alone intorno (fix utente
  // esplicito, ribadito più volte: "rimuovi PROPRIO il riquadro", poi
  // "rimuovi l'alone" due volte). Nessun boxShadow stringa (stesso bug già
  // trovato più volte su questo file).
  fabWrap: { width: FAB_SIZE, height: FAB_SIZE, marginTop: 0, alignItems: 'center', justifyContent: 'center' },
  // position:absolute: le due Image (idle + oro) devono sovrapporsi esatte
  // per il crossfade dell'animazione di apertura, non affiancarsi in flow.
  fabStar: { position: 'absolute', width: FAB_SIZE, height: FAB_SIZE },
  label: { fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
  // Pop-up della stella: stesso pattern "sfondo scuro + box in vetro
  // liquido centrato" già usato altrove nell'app (es. modali di
  // impegni.tsx) — vedi i commenti nella return sopra sul perché non è un
  // <Modal>.
  popupSfondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,38,0.45)' },
  // "Navicella": position:absolute con left/top/width/height impostati
  // inline (dipendono dalla misura della stella e da Dimensions, non sono
  // valori fissi di stile). overflow:hidden: lo sfondo dorato animato
  // (child) deve restare clippato agli angoli arrotondati mentre la forma
  // scala da piccola stella a riquadro pop-up.
  morphShape: {
    position: 'absolute', borderRadius: Radius.modal, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  morphStar: { position: 'absolute', width: '45%', height: '45%' },
  // Vero box del pop-up: dimensione/posizione TARGET impostate inline
  // (left/top/width/height = 410×765 centrato fra header e navbar — fix
  // utente esplicito). Due livelli come Card in components/ui.tsx: quello
  // esterno porta l'ombra/alone dorato (shadow* nativi inline — non può
  // convivere con overflow:hidden sullo stesso nodo, altrimenti verrebbe
  // tagliato), quello interno ritaglia blur/bordo/riflesso agli angoli
  // arrotondati.
  popupBoxOuter: { position: 'absolute', borderRadius: Radius.modal },
  // SOLO questo bordo è dorato (fix utente esplicito: "SOLO i bordi
  // rimanessero arancioni... il resto in base al tema") — l'interno
  // (BlurView + glass.strongBg) resta tema-dipendente come ogni altro
  // modale dell'app.
  popupBoxInner: {
    flex: 1, borderRadius: Radius.modal, padding: Spacing.xl,
    overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,175,0,0.6)',
    alignItems: 'center', gap: Spacing.xs,
  },
  popupChiudi: { position: 'absolute', top: Spacing.md, right: Spacing.md, padding: Spacing.xs },
  popupTitolo: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm },
  popupSottotitolo: { fontSize: 13, textAlign: 'center' },
});
