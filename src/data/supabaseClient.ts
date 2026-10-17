import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables (Vite client-side & potential server-side fallbacks)
export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  (import.meta.env.SUPABASE_URL as string | undefined)?.trim() ||
  (typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '') : '').trim();

export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '') : '').trim();

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    })
  : null;
