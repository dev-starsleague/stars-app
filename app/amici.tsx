import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { getAmici, cercaGiocatori, inviaRichiestaAmicizia, accettaAmicizia } from '../lib/api';
import { Card, H2, Muted, Avatar, Button, Chip, IconButton, Input } from '../components/ui';
import { Colors, Spacing, Font } from '../constants/theme';
import type { Amicizia, Giocatore } from '../types/models';

export default function Amici() {
  const { me, demoMode } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'amici' | 'cerca'>('amici');
  const [amici, setAmici] = useState<Amicizia[]>([]);
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<Giocatore[]>([]);

  const load = useCallback(async () => { if (me) setAmici(await getAmici(me.id)); }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accettati = amici.filter((a) => a.stato === 'accettata');
  const inArrivo = amici.filter((a) => a.stato === 'in_attesa' && a.destinatario_id === me?.id);

  const cerca = async (text: string) => {
    setQ(text);
    if (text.length < 2) { setRisultati([]); return; }
    const r = await cercaGiocatori(text);
    setRisultati(r.filter((g) => g.id !== me?.id));
  };

  const aggiungi = async (g: Giocatore) => {
    if (!me) return;
    await inviaRichiestaAmicizia(me.id, g.id);
    Alert.alert('Richiesta inviata', `Richiesta di amicizia inviata a ${g.nome}.${demoMode ? '\n\n(demo)' : ''}`);
  };
  const accetta = async (a: Amicizia) => { await accettaAmicizia(a.id); load(); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>Amici</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.tabs}>
        <Chip label="I miei amici" active={tab === 'amici'} onPress={() => setTab('amici')} />
        <Chip label="Cerca giocatori" active={tab === 'cerca'} onPress={() => setTab('cerca')} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'amici' ? (
          <>
            {inArrivo.length > 0 && (
              <>
                <H2 style={{ marginBottom: Spacing.md }}>Richieste ricevute</H2>
                {inArrivo.map((a) => (
                  <Card key={a.id} style={s.row}>
                    <Avatar name={`${a.amico?.nome} ${a.amico?.cognome}`} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.nome}>{a.amico?.nome} {a.amico?.cognome}</Text>
                      <Muted>Vuole essere tuo amico</Muted>
                    </View>
                    <Button title="Accetta" onPress={() => accetta(a)} style={{ paddingHorizontal: Spacing.lg, height: 40 }} />
                  </Card>
                ))}
                <View style={{ height: Spacing.lg }} />
              </>
            )}

            <H2 style={{ marginBottom: Spacing.md }}>Amici ({accettati.length})</H2>
            {accettati.length === 0 ? (
              <Card><Muted>Non hai ancora amici. Cerca giocatori per aggiungerli.</Muted></Card>
            ) : (
              accettati.map((a) => (
                <Pressable key={a.id} onPress={() => router.push(`/giocatore/${a.amico?.id}`)}>
                  <Card style={s.row}>
                    <Avatar name={`${a.amico?.nome} ${a.amico?.cognome}`} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.nome}>{a.amico?.nome} {a.amico?.cognome}</Text>
                      <Muted>{a.amico?.profilo?.nickname ?? 'Padel'}</Muted>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.slate} />
                  </Card>
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            <Input icon="search" placeholder="Cerca per nome o cognome" value={q} onChangeText={cerca} autoFocus style={{ marginBottom: Spacing.lg }} />
            {risultati.map((g) => (
              <Card key={g.id} style={s.row}>
                <Pressable onPress={() => router.push(`/giocatore/${g.id}`)} style={s.rowInner}>
                  <Avatar name={`${g.nome} ${g.cognome}`} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nome}>{g.nome} {g.cognome}</Text>
                    <Muted>{g.profilo?.nickname ?? 'Padel'}</Muted>
                  </View>
                </Pressable>
                <IconButton icon="person-add" variant="solid" size={40} onPress={() => aggiungi(g)} />
              </Card>
            ))}
            {q.length >= 2 && risultati.length === 0 && <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun giocatore trovato.</Muted>}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  scroll: { padding: Spacing.lg, paddingTop: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  nome: { color: Colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
});
