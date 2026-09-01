import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { Button, Muted } from '../../components/ui';
import { Field } from './login';
import { useTheme } from '../../lib/theme';
import { Spacing, Font, AppColors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    setErr('');
    if (!nome || !cognome || !email || password.length < 6) {
      setErr('Compila tutti i campi (password almeno 6 caratteri).'); return;
    }
    setLoading(true);
    const { error } = await signUp(email.trim(), password, nome.trim(), cognome.trim());
    setLoading(false);
    if (error) setErr(error);
    else router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={22} color={colors.slateLight} />
            <Text style={s.backText}>Indietro</Text>
          </Pressable>
          <Text style={s.title}>Crea il tuo profilo</Text>
          <Muted style={{ marginBottom: Spacing.xl }}>Unisciti alla lega e inizia a giocare.</Muted>

          <Field icon="person" placeholder="Nome" value={nome} onChangeText={setNome} />
          <Field icon="person" placeholder="Cognome" value={cognome} onChangeText={setCognome} />
          <Field icon="mail" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field icon="lock-closed" placeholder="Password (min 6)" value={password} onChangeText={setPassword} secureTextEntry />

          {err ? <Text style={s.err}>{err}</Text> : null}
          <Button title="Registrati" onPress={onRegister} loading={loading} style={{ marginTop: Spacing.md }} />

          <View style={s.row}>
            <Muted>Hai già un account? </Muted>
            <Link href="/(auth)/login" asChild>
              <Pressable><Text style={s.link}>Accedi</Text></Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.xl, flexGrow: 1, justifyContent: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    back: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
    backText: { color: colors.slateLight, fontSize: Font.body },
    title: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '800' },
    err: { color: colors.red, marginTop: Spacing.sm, fontSize: Font.small },
    row: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
    link: { color: colors.gold, fontWeight: '700' },
  });
}
