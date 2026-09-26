import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export const demoModeEnabled = import.meta.env.VITE_DEMO_MODE === "true";
const url = demoModeEnabled ? undefined : import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = demoModeEnabled
  ? undefined
  : (
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.VITE_SUPABASE_ANON_KEY
    )?.trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const isBackendAvailable = demoModeEnabled || isSupabaseConfigured;

export const supabase: SupabaseClient<Database> | null =
  !import.meta.env.SSR && url && publishableKey
    ? createClient<Database>(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

export const dataMode = demoModeEnabled ? "demo" : "supabase";

export const googleAuthEnabled =
  demoModeEnabled ||
  (isSupabaseConfigured && import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true");
