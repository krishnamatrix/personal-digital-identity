"use client";

import { createBrowserClient } from "@supabase/ssr";
import { folioneDbOptions } from "@/lib/db/schema";
import { requireSupabaseConfig } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey, { db: folioneDbOptions });
}
