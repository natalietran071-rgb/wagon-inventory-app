import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()?.replace(/\/+$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim();

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
  console.error(
    'Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables (Secrets panel).'
  );
}

// Create a dummy client if not configured to prevent immediate crashes, 
// but it will still fail on actual calls with a clear message.
export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as any, {
      get: () => {
        throw new Error(
          'Supabase client is not configured. Please provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        );
      }
    });
