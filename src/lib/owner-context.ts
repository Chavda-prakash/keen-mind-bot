import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Single-owner mode: the app has no sign-in yet, so every server function runs
 * as one fixed owner. Swap this middleware back to `requireSupabaseAuth` when
 * multi-user auth is reintroduced.
 */
export const OWNER_ID = "00000000-0000-4000-8000-000000000000";
export const OWNER_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function ownerFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export const ownerContext = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) throw new Error("Backend is not configured");

  const supabase = createClient<Database>(url, serviceKey, {
    global: { fetch: ownerFetch(serviceKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  return next({ context: { supabase, userId: OWNER_ID } });
});
