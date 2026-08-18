import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { PhoneFrame } from '../components/PhoneFrame';
import { Colors } from '../constants/theme';

function RootNav() {
  const { session, demoMode, loading } = useAuth();
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
      <View style={{ flex: 1, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="amici" options={{ presentation: 'card' }} />
      <Stack.Screen name="modifica-profilo" options={{ presentation: 'card' }} />
      <Stack.Screen name="giocatore/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <PhoneFrame>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNav />
        </AuthProvider>
      </PhoneFrame>
    </SafeAreaProvider>
  );
}
