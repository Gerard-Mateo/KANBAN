import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type Mode = "signin" | "signup";

// Dev-only convenience: set VITE_DEV_EMAIL/VITE_DEV_PASSWORD in .env.local
// (gitignored, never shipped) so real sign-in is attempted silently in the
// background. Unset/irrelevant in production builds regardless.
const DEV_EMAIL = import.meta.env.DEV ? import.meta.env["VITE_DEV_EMAIL"] : undefined;
const DEV_PASSWORD = import.meta.env.DEV ? import.meta.env["VITE_DEV_PASSWORD"] : undefined;

// Local-only stand-in used when dev mode has no real session yet (e.g. the
// Supabase account isn't confirmed). Board renders immediately with this;
// cloud save/load will fail (no real JWT -> RLS rejects it as `anon`), so
// tasks only live in local state until a real session takes over.
const DEV_BYPASS_SESSION = {
  user: { id: "dev-local-user", email: DEV_EMAIL ?? "dev@localhost" },
} as Session;

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const triedDevAutoLogin = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setReady(true);
      // Try the real account in the background; if/when it succeeds,
      // onAuthStateChange below swaps the bypass session for the real one.
      if (!data.session && DEV_EMAIL && DEV_PASSWORD && !triedDevAutoLogin.current) {
        triedDevAutoLogin.current = true;
        void supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session) {
    if (import.meta.env.DEV) return <>{children(DEV_BYPASS_SESSION)}</>;
    return <AuthCard />;
  }
  return <>{children(session)}</>;
}

// Unreachable in dev (AuthGate bypasses straight to the board there) --
// this only ever renders in a real, non-dev build.
function AuthCard() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setMessage("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setBusy(false);
  }

  async function google() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setError("No se pudo iniciar sesión con Google.");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="glass-panel w-full max-w-sm rounded-xl p-6">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">Tablero Kanban</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {mode === "signin" ? "Entra a tus tareas" : "Crea tu cuenta"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tus tareas se guardan en la nube, así no pierdes nada.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="contraseña"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "signin" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <button
          onClick={google}
          className="mt-3 w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Continuar con Google
        </button>

        {error && <p className="mt-3 text-xs font-medium text-destructive">{error}</p>}
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="mt-4 text-xs text-muted-foreground underline"
        >
          {mode === "signin" ? "No tengo cuenta, registrarme" : "Ya tengo cuenta, entrar"}
        </button>
      </div>
    </div>
  );
}
