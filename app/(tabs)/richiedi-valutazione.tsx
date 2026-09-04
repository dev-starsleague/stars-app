import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { getCentri, richiediValutazione } from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { AppHeader } from '../../components/AppHeader';
import { Card, IconBadge, IconButton, Muted } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { Centro } from '../../types/models';

// Sceglie il centro da cui farsi valutare: crea la riga giocatori_centri
// (origine "richiesta_app") che fa comparire il giocatore nella coda
// "Giocatori da valutare" del gestionale — vedi lib/api.ts richiediValutazione.
export default function RichiediValutazione() {
  const { sport } = useLocalSearchParams<{ sport?: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [inviando, setInviando] = useState<string | null>(null);

  useEffect(() => { getCentri().then(setCentri); }, []);

  const scegli = async (c: Centro) => {
    if (!me) return;
    setInviando(c.id);
    const res = await richiediValutazione(me.id, c.id);
    setInviando(null);
    if (res.ok) {
      avvisa('Richiesta inviata', `${c.nome} valuterà il tuo livello di gioco a ${sport ?? 'padel'}. Ti avviseremo appena sarà pronto.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      avvisa('Errore', res.error ?? 'Richiesta non riuscita.');
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>Scopri il tuo ranking</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Muted style={{ marginBottom: Spacing.lg }}>
          Scegli il centro da cui vuoi farti valutare{sport ? ` a ${sport}` : ''}. Comparirai nella loro coda "Giocatori da valutare".
        </Muted>

        {centri.length === 0 && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
        {centri.map((c) => (
          <Pressable key={c.id} onPress={() => scegli(c)} disabled={inviando !== null}>
            <Card style={s.row}>
              <IconBadge icon="business" />
              <View style={{ flex: 1 }}>
                <Text style={s.nome}>{c.nome}</Text>
                {c.citta ? <Muted>{c.citta}</Muted> : null}
              </View>
              {inviando === c.id ? <ActivityIndicator color={colors.gold} /> : <Ionicons name="chevron-forward" size={20} color={colors.slate} />}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    nome: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
  });
}
