import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SquircleView } from 'react-native-figma-squircle';
import { useAuth } from '../../lib/auth';
import { isMock } from '../../lib/api';
import { Button, Card, Input, Muted } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, CORNER_SMOOTHING, AppColors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Login() {
  const { signIn, enterDemo } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [entrandoDemo, setEntrandoDemo] = useState(false);

  const onLogin = async () => {
    setErr(''); setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setErr(traduci(error));
    else router.replace('/(tabs)');
  };

  const onDemo = async () => {
    setEntrandoDemo(true);
    await enterDemo();
    setEntrandoDemo(false);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <View style={s.logoBadge}>
              <SquircleView style={StyleSheet.absoluteFillObject} squircleParams={{ cornerRadius: Radius.card, cornerSmoothing: CORNER_SMOOTHING, fillColor: colors.gold }} />
              <Ionicons name="tennisball" size={34} color={colors.navyDeep} />
            </View>
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

          {isMock() && (
            <Card style={s.demoBox}>
              <Ionicons name="information-circle" size={18} color={colors.slateLight} />
              <Text style={s.demoText}>Backend non ancora configurato. Puoi esplorare l'app in modalità demo.</Text>
            </Card>
          )}
          <Button title="Entra in modalità demo" variant="ghost" onPress={onDemo} loading={entrandoDemo}
            style={{ marginTop: Spacing.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Field(props: any) {
  return <Input style={{ marginBottom: Spacing.md }} {...props} />;
}

function traduci(m: string): string {
  if (/invalid login/i.test(m)) return 'Email o password non corretti.';
  if (/Email not confirmed/i.test(m)) return 'Conferma la tua email prima di accedere.';
  return m;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.xl, flexGrow: 1, justifyContent: 'center' },
    logoWrap: { alignItems: 'center', marginBottom: Spacing.xxl },
    logoBadge: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, overflow: 'hidden' },
    brand: { color: colors.navyDeep, fontSize: 26, fontWeight: '900', letterSpacing: 4 },
    brandGold: { color: colors.gold, fontSize: 20, fontWeight: '900', letterSpacing: 8 },
    title: { color: colors.navyDeep, fontSize: Font.h1, fontWeight: '800' },
    err: { color: colors.red, marginTop: Spacing.sm, fontSize: Font.small },
    row: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
    link: { color: colors.gold, fontWeight: '700' },
    demoBox: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: Spacing.xxl },
    demoText: { color: colors.slateLight, flex: 1, fontSize: Font.small },
  });
}
