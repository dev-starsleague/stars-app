import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Button, Muted } from '../../components/ui';
import { Colors, Radius, Spacing, Font } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Login() {
  const { signIn, enterDemo } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setErr(''); setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setErr(traduci(error));
    else router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <View style={s.logoBadge}><Ionicons name="tennisball" size={34} color={Colors.navyDeep} /></View>
            <Text style={s.brand}>PADEL STARS</Text>
            <Text style={s.brandGold}>LEAGUE</Text>
          </View>

          <Text style={s.title}>Bentornato</Text>
          <Muted style={{ marginBottom: Spacing.xl }}>Accedi per prenotare, iscriverti agli eventi e scalare la classifica.</Muted>

          <Field icon="mail" placeholder="Email" value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" />
          <Field icon="lock-closed" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

          {err ? <Text style={s.err}>{err}</Text> : null}

          <Button title="Accedi" onPress={onLogin} loading={loading} style={{ marginTop: Spacing.md }} />

          <View style={s.row}>
            <Muted>Non hai un account? </Muted>
            <Link href="/(auth)/register" asChild>
              <Pressable><Text style={s.link}>Registrati</Text></Pressable>
            </Link>
          </View>

          {!isSupabaseConfigured && (
            <View style={s.demoBox}>
              <Ionicons name="information-circle" size={18} color={Colors.slateLight} />
              <Text style={s.demoText}>Supabase non è ancora configurato. Puoi esplorare l'app in modalità demo.</Text>
            </View>
          )}
          <Button title="Entra in modalità demo" variant="ghost" onPress={() => { enterDemo(); router.replace('/(tabs)'); }}
            style={{ marginTop: Spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Field(props: any) {
  const { icon, ...rest } = props;
  return (
    <View style={s.field}>
      <Ionicons name={icon} size={18} color={Colors.slate} style={{ marginRight: 10 }} />
      <TextInput placeholderTextColor={Colors.slate} style={s.input} {...rest} />
    </View>
  );
}

function traduci(m: string): string {
  if (/invalid login/i.test(m)) return 'Email o password non corretti.';
  if (/Email not confirmed/i.test(m)) return 'Conferma la tua email prima di accedere.';
  return m;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  scroll: { padding: Spacing.xl, flexGrow: 1, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.xxl },
  logoBadge: { width: 68, height: 68, borderRadius: 20, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  brand: { color: Colors.white, fontSize: 26, fontWeight: '900', letterSpacing: 4 },
  brandGold: { color: Colors.gold, fontSize: 20, fontWeight: '900', letterSpacing: 8 },
  title: { color: Colors.white, fontSize: Font.h1, fontWeight: '800' },
  field: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navyCard, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.navyLine + '55' },
  input: { flex: 1, color: Colors.white, height: 52, fontSize: Font.body },
  err: { color: Colors.red, marginTop: Spacing.sm, fontSize: Font.small },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  link: { color: Colors.gold, fontWeight: '700' },
  demoBox: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: Spacing.xxl, padding: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: Radius.md },
  demoText: { color: Colors.slateLight, flex: 1, fontSize: Font.small },
});
