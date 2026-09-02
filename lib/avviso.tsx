// Popup in-app per conferme/errori — sostituisce sia Alert.alert nativo
// (stile OS, non coerente col linguaggio grafico dell'app) sia il fallback
// precedente window.alert/confirm sul web (dialog col chrome del browser,
// "localhost:8081 dice…" — fix utente esplicito: NON deve più comparire).
// Stessa identica ricetta "vetro liquido" di tutti gli altri modali
// dell'app (vedi app/(tabs)/profilo.tsx, selettore sport): sfondo scuro
// semi-trasparente + card in blur/tinta chiara, squircle via Radius.modal.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from './theme';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../constants/theme';

type Bottone = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
interface AvvisoStato { titolo: string; messaggio?: string; bottoni: Bottone[] }

let pubblica: ((s: AvvisoStato | null) => void) | null = null;

/** Stessa firma di Alert.alert (titolo, messaggio, bottoni) — chiamabile da
 *  qualunque punto dell'app, non solo da componenti React (nessun hook). */
export function avvisa(titolo: string, messaggio?: string, bottoni?: Bottone[]) {
  const finali = bottoni && bottoni.length > 0 ? bottoni : [{ text: 'OK' }];
  pubblica?.({ titolo, messaggio, bottoni: finali });
}

/** Montato una sola volta alla radice dell'app (vedi app/_layout.tsx),
 *  dentro ThemeProvider — è l'unico posto che renderizza davvero il popup. */
export function AlertHost() {
  const [stato, setStato] = useState<AvvisoStato | null>(null);
  const { colors, glass, scheme } = useTheme();

  useEffect(() => {
    pubblica = setStato;
    return () => { pubblica = null; };
  }, []);

  if (!stato) return null;
  const s = makeStyles(colors, glass);
  const chiudi = (b: Bottone) => { setStato(null); b.onPress?.(); };
  const annulla = stato.bottoni.find((b) => b.style === 'cancel');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => annulla && chiudi(annulla)}>
      <View style={s.sfondo}>
        <View style={s.box}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <Text style={s.titolo}>{stato.titolo}</Text>
          {stato.messaggio ? <Text style={s.messaggio}>{stato.messaggio}</Text> : null}
          <View style={[s.bottoniRiga, stato.bottoni.length > 1 && { flexDirection: 'row' }]}>
            {stato.bottoni.map((b, i) => (
              <Pressable key={i} onPress={() => chiudi(b)}
                style={[s.bottone, b.style === 'cancel' && s.bottoneCancel, stato!.bottoni.length > 1 && { flex: 1 }]}>
                <Text style={[s.bottoneTesto, b.style === 'cancel' && s.bottoneTestoCancel, b.style === 'destructive' && s.bottoneTestoDanger]}>
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    sfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    box: { width: '100%', maxWidth: 360, borderRadius: Radius.modal, padding: Spacing.xl, overflow: 'hidden', borderWidth: 1, borderColor: glass.strongBorder },
    titolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', textAlign: 'center' },
    messaggio: { color: colors.slate, fontSize: Font.body, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 21 },
    bottoniRiga: { gap: Spacing.sm, marginTop: Spacing.xl },
    bottone: { backgroundColor: colors.gold, borderRadius: Radius.button, paddingVertical: Spacing.md, alignItems: 'center' },
    bottoneCancel: { backgroundColor: colors.navyCard },
    bottoneTesto: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },
    bottoneTestoCancel: { color: colors.slateLight, fontWeight: '700' },
    bottoneTestoDanger: { color: colors.red },
  });
}
