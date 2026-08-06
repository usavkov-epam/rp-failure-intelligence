import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;
let browserClientUrl = "";

export function getSupabaseBrowserClient(url: string, anonKey: string) {
  if (!browserClient || browserClientUrl !== url) {
    browserClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    browserClientUrl = url;
  }
  return browserClient;
}
