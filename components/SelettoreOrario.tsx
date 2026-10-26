// Scelta di un orario da una lista (ogni 30', dentro l'apertura del club):
// usato dall'editor delle disponibilità al posto del testo libero (fix
// utente esplicito: "orari di mezz'ora in mezz'ora, tenendo conto degli
// orari di apertura e chiusura del club").
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { AppColors, Font, Radius, Spacing } from '../constants/theme';

export function SelettoreOrario({ valore, opzioni, onCambia, etichetta }: {
  valore: string; opzioni: string[]; onCambia: (v: string) => void; etichetta: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [aperto, setAperto] = useState(false);
  // un orario salvato fuori dalle opzioni (vecchi dati) resta visibile
  const lista = valore && !opzioni.includes(valore) ? [...opzioni, valore].sort() : opzioni;
  return (
    <>
      <Pressable style={s.campo} onPress={() => setAperto(true)} accessibilityLabel={etichetta}>
        <Text style={s.valore}>{valore || '--:--'}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.slate} />
      </Pressable>
      <Modal transparent visible={aperto} animationType="fade" onRequestClose={() => setAperto(false)}>
        <Pressable style={s.overlay} onPress={() => setAperto(false)}>
          <View style={s.foglio}>
            <Text style={s.titolo}>{etichetta}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {lista.map((o) => (
                <Pressable key={o} style={[s.opzione, o === valore && s.scelta]} onPress={() => { onCambia(o); setAperto(false); }}>
                  <Text style={[s.opzioneTesto, o === valore && s.sceltaTesto]}>{o}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    campo: {
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12,
      borderRadius: 10, borderWidth: 1, borderColor: colors.navyLine, backgroundColor: colors.surface,
    },
    valore: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body, fontVariant: ['tabular-nums'] },
    overlay: { flex: 1, backgroundColor: 'rgba(8,12,20,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    foglio: { width: '100%', maxWidth: 320, backgroundColor: colors.surface, borderRadius: Radius.card, padding: Spacing.lg },
    titolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body, marginBottom: Spacing.sm },
    opzione: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
    scelta: { backgroundColor: colors.gold },
    opzioneTesto: { color: colors.navyDeep, fontSize: Font.body, fontVariant: ['tabular-nums'] },
    sceltaTesto: { fontWeight: '800', color: '#16253A' },
  });
}
