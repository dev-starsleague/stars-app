// Avviso sulla disponibilità del giocatore per i campionati (fix utente
// esplicito, "questi alert devono essere previsti anche sull'app lato
// giocatore"): rosso con 1 solo giorno, giallo con 2. Stessi testi del
// gestionale (stars-system, AvvisoDisponibilita.svelte).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { livelloRischio } from '../lib/disponibilita';
import { Spacing, Font, Radius } from '../constants/theme';

const TESTI = {
  rosso: '1 solo giorno disponibile: sarà difficile trovare un orario con gli avversari e rischi partite perse a tavolino. Aggiungi altri giorni.',
  giallo: '2 giorni disponibili: alcune partite potrebbero essere difficili da fissare. Ti consigliamo almeno 3 giorni.',
};

export function AvvisoDisponibilita({ giorni }: { giorni: number }) {
  const { colors } = useTheme();
  const livello = livelloRischio(giorni);
  if (!livello) return null;
  const colore = livello === 'rosso' ? colors.red : colors.amber;
  return (
    <View style={[s.box, { borderColor: colore, backgroundColor: colore + '1A' }]}>
      <Ionicons name={livello === 'rosso' ? 'alert-circle' : 'warning'} size={18} color={colore} />
      <Text style={[s.testo, { color: colors.navyDeep }]}>{TESTI[livello]}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
  testo: { flex: 1, fontSize: Font.small, fontWeight: '700', lineHeight: 18 },
});
