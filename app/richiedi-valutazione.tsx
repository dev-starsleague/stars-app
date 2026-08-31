import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { getCentri, richiediValutazione } from '../lib/api';
import { Muted } from '../components/ui';
import { Colors, Radius, Spacing, Font } from '../constants/theme';
import type { Centro } from '../types/models';

// Sceglie il centro da cui farsi valutare: crea la riga giocatori_centri
// (origine "richiesta_app") che fa comparire il giocatore nella coda
// "Giocatori da valutare" del gestionale — vedi lib/api.ts richiediValutazione.
export default function RichiediValutazione() {
  const { sport } = useLocalSearchParams<{ sport?: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const [centri, setCentri] = useState<Centro[]>([]);
  const [inviando, setInviando] = useState<string | null>(null);

  useEffect(() => { getCentri().then(setCentri); }, []);

  const scegli = async (c: Centro) => {
    if (!me) return;
    setInviando(c.id);
    const res = await richiediValutazione(me.id, c.id);
    setInviando(null);
    if (res.ok) {
      Alert.alert('Richiesta inviata', `${c.nome} valuterà il tuo livello di gioco a ${sport ?? 'padel'}. Ti avviseremo appena sarà pronto.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('Errore', res.error ?? 'Richiesta non riuscita.');
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={Colors.navyDeep} /></Pressable>
        <Text style={s.title}>Scopri il tuo ranking</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Muted style={{ marginBottom: Spacing.lg }}>
          Scegli il centro da cui vuoi farti valutare{sport ? ` a ${sport}` : ''}. Comparirai nella loro coda "Giocatori da valutare".
        </Muted>

        {centri.length === 0 && <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xl }} />}
        {centri.map((c) => (
          <Pressable key={c.id} style={s.row} onPress={() => scegli(c)} disabled={inviando !== null}>
            <View style={s.icon}><Ionicons name="business" size={20} color={Colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.nome}>{c.nome}</Text>
              {c.citta ? <Muted>{c.citta}</Muted> : null}
            </View>
            {inviando === c.id ? <ActivityIndicator color={Colors.gold} /> : <Ionicons name="chevron-forward" size={20} color={Colors.slate} />}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
  scroll: { padding: Spacing.lg, paddingTop: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.card, padding: Spacing.lg, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.navyLine + '33' },
  icon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  nome: { color: Colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
});
