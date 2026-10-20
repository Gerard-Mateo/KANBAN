// Dónde vive el espacio personal de cada cuenta: una fila por usuario en
// `personal_spaces` (MySQL local o Supabase, donde solo su dueño la ve).
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { USE_LOCAL_MYSQL, localApi } from "./local-db";

/** Lo guardado para esa cuenta, o null si aún no tiene nada. */
export async function loadPersonalRemote(userId: string): Promise<unknown> {
  if (USE_LOCAL_MYSQL) {
    const row = await localApi<{ data: unknown } | null>(
      "GET",
      `/personal/${encodeURIComponent(userId)}`,
    );
    return row?.data ?? null;
  }
  const { data, error } = await supabase
    .from("personal_spaces")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function savePersonalRemote(userId: string, space: unknown): Promise<void> {
  if (USE_LOCAL_MYSQL) {
    await localApi("PUT", `/personal/${encodeURIComponent(userId)}`, { data: space });
    return;
  }
  const { error } = await supabase.from("personal_spaces").upsert({
    user_id: userId,
    data: space as Json,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
