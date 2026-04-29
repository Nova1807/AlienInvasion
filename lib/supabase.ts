import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;
let configWarned = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (!configWarned) {
      configWarned = true;
      console.warn(
        '[Supabase] Konfiguration fehlt — EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY müssen gesetzt sein. Netzwerk-Modus ist deaktiviert.'
      );
    }
    throw new Error(
      'Supabase-Konfiguration fehlt. Bitte EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY in der .env setzen.'
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'alien-invasion-app',
        },
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return client;
}

export function resetSupabaseClient(): void {
  client = null;
}
