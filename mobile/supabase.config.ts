/* Supabase project coordinates. Paste your project's values here (or set them
   as EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env).
   Both values are safe to ship in the app — security comes from row-level
   security, and the AI key never lives in the client. */

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR-ANON-KEY';

export const supabaseConfigured =
  !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
