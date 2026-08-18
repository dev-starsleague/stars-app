import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { getAmici, cercaGiocatori, inviaRichiestaAmicizia, accettaAmicizia } from '../lib/api';
import { Card, H2, Muted, Avatar, Button, Chip } from '../components/ui';
import { Colors, Radius, Spacing, Font } from '../constants/theme';
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
        <Pressable onPress={() => router.back()} style={s.back}><Ionicons name="chevron-back" size={24} color={Colors.white} /></Pressable>
        <Text style={s.title}>Amici</Text>
        <View style={{ width: 24 }} />
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
            <View style={s.search}>
              <Ionicons name="search" size={18} color={Colors.slate} />
              <TextInput placeholder="Cerca per nome o cognome" placeholderTextColor={Colors.slate}
                style={s.searchInput} value={q} onChangeText={cerca} autoFocus />
            </View>
            {risultati.map((g) => (
              <Card key={g.id} style={s.row}>
                <Pressable onPress={() => router.push(`/giocatore/${g.id}`)} style={s.rowInner}>
                  <Avatar name={`${g.nome} ${g.cognome}`} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nome}>{g.nome} {g.cognome}</Text>
                    <Muted>{g.profilo?.nickname ?? 'Padel'}</Muted>
                  </View>
                </Pressable>
                <Pressable onPress={() => aggiungi(g)} style={s.addBtn}>
                  <Ionicons name="person-add" size={18} color={Colors.navyDeep} />
                </Pressable>
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
  back: { width: 24 },
  title: { color: Colors.white, fontSize: Font.h2, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  scroll: { padding: Spacing.lg, paddingTop: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  nome: { color: Colors.white, fontSize: Font.body, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  searchInput: { flex: 1, color: Colors.white, height: 50, fontSize: Font.body },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
});
