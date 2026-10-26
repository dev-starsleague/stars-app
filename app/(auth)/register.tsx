import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { useSport } from '../../lib/sport';
import { Button, Muted, Chip } from '../../components/ui';
import { Field } from './login';
import { useTheme } from '../../lib/theme';
import { Spacing, Font, AppColors } from '../../constants/theme';
import { SPORT_DISPONIBILI } from '../../lib/stars';
import { Ionicons } from '@expo/vector-icons';
import { ETA_MINIMA, MAGGIORE_ETA, eta, formattaData, italianoAIso } from '../../lib/eta';

// Informativa da mostrare alla registrazione (documento GDPR, punto 5.5).
// Finché la Privacy Policy dell'app non è pubblicata punta all'informativa
// del sito: va sostituita con quella dell'app prima del lancio.
const URL_PRIVACY = 'https://starsleague.it/privacy/';

export default function Register() {
  const { signUp } = useAuth();
  const { setSportAttivo } = useSport();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sport, setSport] = useState(SPORT_DISPONIBILI[0]);
  const [nascita, setNascita] = useState('');
  const [privacyLetta, setPrivacyLetta] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const nascitaIso = italianoAIso(nascita);
  const anni = nascitaIso ? eta(nascitaIso) : null;
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    setErr('');
    if (!nome || !cognome || !email || password.length < 6) {
      setErr('Compila tutti i campi (password almeno 6 caratteri).'); return;
    }
    if (!nascitaIso) { setErr('Inserisci la data di nascita (GG-MM-AAAA).'); return; }
    if (anni !== null && anni < ETA_MINIMA) {
      setErr(`L'app è per chi ha almeno ${ETA_MINIMA} anni. Chi è più giovane può essere iscritto da un genitore direttamente al centro.`); return;
    }
    if (!privacyLetta) { setErr("Per registrarti conferma di aver letto l'informativa privacy."); return; }
    setLoading(true);
    const { error } = await signUp(email.trim(), password, nome.trim(), cognome.trim(), {
      data_nascita: nascitaIso,
      // prova della presa visione e del consenso facoltativo
      privacy: { versione: '1.0', letta_il: new Date().toISOString(), marketing },
    });
    setLoading(false);
    if (error) setErr(error);
    else {
      // Lo sport scelto qui diventa lo sport attivo di default dell'app
      // (fix utente esplicito) — stesso meccanismo usato dal selettore
      // nell'header (vedi lib/sport.tsx), solo impostato in anticipo.
      setSportAttivo(sport);
      router.replace('/(tabs)');
    }
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

          <Field icon="calendar" placeholder="Data di nascita (GG-MM-AAAA)" value={nascita} onChangeText={(t: string) => setNascita(formattaData(t))} keyboardType="number-pad" />
          {anni !== null && anni >= ETA_MINIMA && anni < MAGGIORE_ETA && (
            <Muted style={{ marginTop: -Spacing.sm, marginBottom: Spacing.md }}>Hai meno di 18 anni: per prenotazioni e acquisti serve l'autorizzazione di un genitore.</Muted>
          )}

          <Muted style={{ marginBottom: Spacing.sm }}>Che sport giochi?</Muted>
          <View style={s.chips}>
            {SPORT_DISPONIBILI.map((sp) => (
              <Chip key={sp} label={sp} active={sport === sp} onPress={() => setSport(sp)} />
            ))}
          </View>

          <Pressable style={s.check} onPress={() => setPrivacyLetta((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: privacyLetta }}>
            <Ionicons name={privacyLetta ? 'checkbox' : 'square-outline'} size={20} color={privacyLetta ? colors.gold : colors.slate} />
            <Text style={s.checkTesto}>
              Ho letto l'<Text style={s.link} onPress={() => Linking.openURL(URL_PRIVACY)}>informativa privacy</Text> e so che il mio profilo sarà consultabile dai centri affiliati Stars League. (necessario)
            </Text>
          </Pressable>
          <Pressable style={s.check} onPress={() => setMarketing((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: marketing }}>
            <Ionicons name={marketing ? 'checkbox' : 'square-outline'} size={20} color={marketing ? colors.gold : colors.slate} />
            <Text style={s.checkTesto}>Acconsento a ricevere comunicazioni promozionali da Stars League e dai centri in cui gioco. (facoltativo)</Text>
          </Pressable>

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
    chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: Spacing.md },
    err: { color: colors.red, marginTop: Spacing.sm, fontSize: Font.small },
    row: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
    link: { color: colors.gold, fontWeight: '700' },
    check: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginBottom: Spacing.md },
    checkTesto: { flex: 1, color: colors.slate, fontSize: Font.small, lineHeight: 18 },
  });
}
