import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { updateProfilo } from '../lib/api';
import { Card, Muted, Button, Chip } from '../components/ui';
import { Colors, Radius, Spacing, Font } from '../constants/theme';

export default function ModificaProfilo() {
  const { me, refreshMe, demoMode } = useAuth();
  const router = useRouter();
  const [nickname, setNickname] = useState(me?.profilo?.nickname ?? '');
  const [telefono, setTelefono] = useState(me?.telefono ?? '');
  const [posizione, setPosizione] = useState(me?.posizione ?? 'destra');
  const [mano, setMano] = useState(me?.mano_dominante ?? 'destro');
  const [saving, setSaving] = useState(false);

  const salva = async () => {
    if (!me) return;
    setSaving(true);
    await updateProfilo(me.id, {
      telefono, posizione: posizione as any, mano_dominante: mano as any,
      profilo: { ...(me.profilo ?? {}), nickname },
    });
    if (!demoMode) await refreshMe();
    setSaving(false);
    Alert.alert('Salvato', `Profilo aggiornato.${demoMode ? '\n\n(demo: non salvato sul server)' : ''}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={Colors.white} /></Pressable>
        <Text style={s.title}>Modifica profilo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: Spacing.lg }}>
          <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Es. Il Muro" />
          <Field label="Telefono" value={telefono} onChangeText={setTelefono} placeholder="+39..." keyboardType="phone-pad" />

          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Posizione in campo</Muted>
            <View style={s.chips}>
              {['destra', 'sinistra', 'entrambe'].map((p) => (
                <Chip key={p} label={cap(p)} active={posizione === p} onPress={() => setPosizione(p as any)} />
              ))}
            </View>
          </View>

          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Mano dominante</Muted>
            <View style={s.chips}>
              {['destro', 'mancino', 'ambidestro'].map((m) => (
                <Chip key={m} label={cap(m)} active={mano === m} onPress={() => setMano(m as any)} />
              ))}
            </View>
          </View>
        </Card>

        <Button title="Salva" onPress={salva} loading={saving} style={{ marginTop: Spacing.xl }} />
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...rest }: any) {
  return (
    <View>
      <Muted style={{ marginBottom: Spacing.sm }}>{label}</Muted>
      <TextInput placeholderTextColor={Colors.slate} style={s.input} {...rest} />
    </View>
  );
}
function cap(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { color: Colors.white, fontSize: Font.h2, fontWeight: '800' },
  scroll: { padding: Spacing.lg, paddingTop: 0 },
  input: { backgroundColor: Colors.navyDeep, borderRadius: Radius.md, color: Colors.white, height: 50, paddingHorizontal: Spacing.lg, fontSize: Font.body, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
});
