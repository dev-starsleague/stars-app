import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Se le chiavi non sono impostate usiamo dei placeholder validi: così l'app
// parte comunque (modalità demo) senza far crashare createClient, che altrimenti
// lancerebbe "supabaseUrl is required" bloccando anche il build web su Vercel.
const url = isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const key = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key';

// Su web usiamo lo storage di default (localStorage); su native AsyncStorage.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(url, key, {
  auth: {
    storage,
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: isSupabaseConfigured && Platform.OS === 'web',
  },
});
