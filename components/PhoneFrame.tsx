import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useTheme } from '../lib/theme';

// Larghezza oltre la quale consideriamo di essere su desktop/web largo
// e mostriamo l'app dentro una cornice da smartphone centrata.
const PHONE_MAX_WIDTH = 440;
const PHONE_MAX_HEIGHT = 940;

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  // Su mobile vero, o quando la finestra è già stretta, nessuna cornice:
  // l'app occupa tutto lo schermo come un'app normale.
  const needsFrame = Platform.OS === 'web' && width > PHONE_MAX_WIDTH + 40;

  if (!needsFrame) {
    return <View style={[styles.full, { backgroundColor: colors.bg }]}>{children}</View>;
  }

  return (
    <View style={styles.backdrop}>
      <View style={[styles.phone, { backgroundColor: colors.bg }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: '#0B1523',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  phone: {
    width: PHONE_MAX_WIDTH,
    height: '100%',
    maxHeight: PHONE_MAX_HEIGHT,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 10,
    borderColor: '#05386B00',
    // ombra/bordo scuro tipo device
    boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
    // @ts-ignore - proprietà web
    outlineStyle: 'none',
  } as any,
});
