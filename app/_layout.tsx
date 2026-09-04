import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme';
import { SportProvider } from '../lib/sport';
import { AlertHost } from '../lib/avviso';
import { PhoneFrame } from '../components/PhoneFrame';

function RootNav() {
  const { session, demoMode, loading } = useAuth();
  const { colors, scheme } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const authed = Boolean(session) || demoMode;

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!authed && !inAuth) router.replace('/(auth)/login');
    else if (authed && inAuth) router.replace('/(tabs)');
  }, [authed, segments, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Le schermate di dettaglio (amici, profilo giocatore, stars-coin,
          ecc.) non sono più qui: vivono dentro (tabs) come Tabs.Screen
          nascoste, così la navbar flottante resta visibile anche lì (fix
          utente esplicito — vedi commento in (tabs)/_layout.tsx). */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <AlertHost />
    </>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PhoneFrame>
          <AuthProvider>
            <SportProvider>
              <RootNav />
            </SportProvider>
          </AuthProvider>
        </PhoneFrame>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
