// Modo MySQL local (`npm run dev:mysql`): tareas y pomodoros van a la API de
// mysql/server.mjs en vez de a Supabase, y no hace falta iniciar sesión.
export const USE_LOCAL_MYSQL = import.meta.env["VITE_DB"] === "mysql";

export const LOCAL_USER_ID = "local";

const API_URL = import.meta.env["VITE_MYSQL_API_URL"] ?? "http://localhost:8787";

export async function localApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    `${API_URL}${path}`,
    body === undefined
      ? { method }
      : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `MySQL local: ${res.status}`);
  }
  return (await res.json()) as T;
}
