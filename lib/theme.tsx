// ============================================================
// Tema chiaro/scuro — attivazione SOLO manuale, stesso principio già
// deciso per il gestionale (stars-system/src/lib/theme.js): il default
// resta sempre chiaro per tutti, non si aggancia al tema di sistema
// del telefono. Persistito con AsyncStorage, toggle in Profilo.
// ============================================================
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import {
  ColorScheme, LightColors, DarkColors, LightGlass, DarkGlass, AppColors, AppGlass,
} from '../constants/theme';

const CHIAVE = 'stars-tema';

interface ThemeContextValue {
  scheme: ColorScheme;
  colors: AppColors;
  glass: AppGlass;
  toggleTheme: () => void;
  reducedMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light', colors: LightColors, glass: LightGlass, toggleTheme: () => {}, reducedMotion: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState<ColorScheme>('light');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHIAVE).then((v) => { if (v === 'dark') setScheme('dark'); });
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReducedMotion);
    return () => sub?.remove?.();
  }, []);

  const toggleTheme = () => {
    setScheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(CHIAVE, next).catch(() => {});
      return next;
    });
  };

  const value = useMemo<ThemeContextValue>(() => ({
    scheme,
    colors: scheme === 'dark' ? DarkColors : LightColors,
    glass: scheme === 'dark' ? DarkGlass : LightGlass,
    toggleTheme,
    reducedMotion,
  }), [scheme, reducedMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
