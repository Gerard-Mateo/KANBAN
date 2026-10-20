import { useEffect, useState, type CSSProperties } from "react";
import { Cloud, CloudOff, Gift as GiftIcon, Loader2, Palette } from "lucide-react";
import { openPersonal, usePersonal, usePersonalStatus, type PersonalTheme } from "@/lib/personal";
import { diffDays, todayIso } from "@/lib/calendar";
import { longDate } from "@/components/calendar/calendar-ui";
import { BACKGROUNDS, FONTS, accentOf, cardStyle } from "./personal-theme";
import { TodoList } from "./TodoList";
import { GiftList } from "./GiftList";
import { Customizer } from "./Customizer";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** El fondo elegido, a pantalla completa detrás de todo el espacio. */
function Backdrop({ theme }: { theme: PersonalTheme }) {
  const accent = accentOf(theme);
  const bg =
    theme.background.kind === "image"
      ? `center / cover no-repeat url("${theme.background.src.replace(/"/g, "%22")}"), oklch(0.12 0.01 264)`
      : (
          BACKGROUNDS.find(
            (b) => theme.background.kind === "preset" && b.id === theme.background.id,
          ) ?? BACKGROUNDS[0]!
        ).css(accent);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -inset-10 transition-[filter] duration-300"
        style={{ background: bg, filter: theme.blur ? `blur(${theme.blur}px)` : undefined }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `oklch(0.1 0.01 264 / ${theme.dim})` }}
      />
    </div>
  );
}

const STATUS_TEXT = {
  idle: "",
  loading: "Cargando…",
  saving: "Guardando…",
  saved: "Guardado en tu cuenta",
  offline: "Sin conexión: guardado en este navegador",
} as const;

/** Tu espacio personal: lo de tu cuenta, aparte del tablero de la empresa. */
export function PersonalPage({ userId }: { userId: string }) {
  const space = usePersonal();
  const status = usePersonalStatus();
  const [customizing, setCustomizing] = useState(false);
  const theme = space.theme;
  const accent = accentOf(theme);

  useEffect(() => {
    void openPersonal(userId);
  }, [userId]);

  const today = todayIso();
  const open = space.todos.filter((t) => !t.doneAt);
  const urgent = open.filter((t) => t.deadline && diffDays(t.deadline, today) <= 0).length;
  const ideas = space.gifts.filter((g) => !g.givenAt).length;
  const StatusIcon =
    status === "offline" ? CloudOff : status === "saving" || status === "loading" ? Loader2 : Cloud;

  const vars = { fontFamily: FONTS[theme.font].css } as CSSProperties;

  return (
    <div className="relative" style={vars}>
      <Backdrop theme={theme} />

      <div className="relative z-[1] space-y-5">
        <section
          className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
          style={{
            ...cardStyle(theme),
            backgroundImage: `radial-gradient(90% 140% at 0% 0%, color-mix(in oklch, ${accent} 22%, transparent), transparent 60%)`,
          }}
        >
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: accent }}
              >
                {greeting()}
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {theme.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{longDate(today, today)}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-foreground">
                  <span className="font-semibold tabular-nums">{open.length}</span>{" "}
                  <span className="text-muted-foreground">pendientes</span>
                </span>
                {urgent > 0 && (
                  <span
                    className="rounded-full px-3 py-1 font-medium"
                    style={{
                      background: "color-mix(in oklch, oklch(0.7 0.19 25) 18%, transparent)",
                      color: "oklch(0.78 0.16 25)",
                    }}
                  >
                    {urgent} para hoy o vencidas
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-foreground">
                  <GiftIcon className="size-3.5" style={{ color: accent }} />
                  <span className="font-semibold tabular-nums">{ideas}</span>
                  <span className="text-muted-foreground">ideas de regalo</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => setCustomizing(true)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-background shadow-lg transition-transform hover:scale-[1.03]"
                style={{
                  background: accent,
                  boxShadow: `0 8px 30px color-mix(in oklch, ${accent} 40%, transparent)`,
                }}
              >
                <Palette className="size-4" /> Personalizar
              </button>
              {STATUS_TEXT[status] && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <StatusIcon
                    className={
                      status === "saving" || status === "loading" ? "size-3 animate-spin" : "size-3"
                    }
                  />
                  {STATUS_TEXT[status]}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <TodoList todos={space.todos} theme={theme} />
          <GiftList gifts={space.gifts} theme={theme} />
        </div>
      </div>

      {customizing && <Customizer theme={theme} onClose={() => setCustomizing(false)} />}
    </div>
  );
}
