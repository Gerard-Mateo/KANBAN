import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useCustomTypes } from "@/lib/custom-types";
import type { TypeStat } from "@/lib/task-stats";
import { niceTicks, typeColor } from "./chart-theme";

const PLOT_H = 220;
/** Un tubo casi vacío sigue siendo visible (el número exacto va encima). */
const MIN_TUBE = 14;

/** Espuma: el mismo tono, translúcido y con burbujitas. */
const foamStyle = (color: string): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} 34%, transparent)`,
  backgroundImage: `radial-gradient(circle at 30% 40%, color-mix(in oklab, ${color} 60%, white) 0 1.2px, transparent 1.6px), radial-gradient(circle at 75% 70%, color-mix(in oklab, ${color} 60%, white) 0 1px, transparent 1.4px)`,
  backgroundSize: "9px 9px, 11px 11px",
});

function Tube({
  t,
  max,
  color,
  filled,
  edge,
}: {
  t: TypeStat;
  max: number;
  color: string;
  filled: boolean;
  /** Los vasos de los extremos anclan el tooltip hacia dentro para no salirse. */
  edge: "start" | "end" | null;
}) {
  const todo = t.total - t.done - t.doing;
  const tubePx = Math.max(MIN_TUBE, (t.total / max) * PLOT_H);
  const juice = t.total ? (t.done / t.total) * 100 : 0;
  const foam = t.total ? (t.doing / t.total) * 100 : 0;

  return (
    <div
      tabIndex={0}
      aria-label={`${t.label}: ${t.done} hechas, ${t.doing} en progreso, ${todo} por hacer de ${t.total}`}
      className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
    >
      {/* Tooltip (también con el teclado) */}
      <div
        className={cn(
          "pointer-events-none absolute z-10 w-max max-w-48 rounded-lg",
          edge === "start" ? "left-0" : edge === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          "border border-border bg-popover px-2.5 py-1.5 text-[11px] hidden shadow-lg group-hover:block group-focus-visible:block",
        )}
        style={{ bottom: tubePx + 28 }}
      >
        <p className="font-semibold text-foreground">{t.label}</p>
        <p className="text-muted-foreground">
          {t.done} hechas · {t.doing} en progreso · {todo} por hacer
        </p>
        <p className="text-muted-foreground">{t.pct}% completado</p>
      </div>

      <span className="mb-1.5 text-[11px] font-medium text-foreground tabular-nums">
        {t.done}
        <span className="text-muted-foreground">/{t.total}</span>
      </span>

      <div className="relative w-full max-w-[46px]" style={{ height: tubePx }}>
        {/* Borde superior del vaso */}
        <div className="absolute -inset-x-[3px] -top-[3px] z-[2] h-[6px] rounded-full border border-white/20 bg-background/60" />
        <div
          className={cn(
            "juice-glass absolute inset-0 overflow-hidden rounded-t-[3px] rounded-b-[16px] border border-white/15 bg-white/[0.03]",
            "transition-[border-color,box-shadow] duration-200 group-hover:border-white/35 group-focus-visible:border-white/35",
          )}
        >
          {/* Jugo = hechas */}
          <div
            className="juice-level absolute inset-x-0 bottom-0"
            style={{
              height: filled ? `${juice}%` : "0%",
              background: `linear-gradient(to top, color-mix(in oklab, ${color} 70%, black), ${color})`,
              boxShadow: `0 0 18px -2px ${color}`,
            }}
          >
            {juice > 0 && (
              <>
                <svg
                  aria-hidden
                  className="juice-wave absolute -top-[5px] left-0 h-[6px] w-[200%]"
                  viewBox="0 0 80 6"
                  preserveAspectRatio="none"
                >
                  <path d="M0 3 Q 10 0 20 3 T 40 3 T 60 3 T 80 3 V 6 H 0 Z" fill={color} />
                </svg>
                <div className="absolute inset-0 overflow-hidden">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="juice-bubble absolute bottom-0 size-[4px] rounded-full bg-white/50"
                      style={{ left: `${22 + i * 24}%`, animationDelay: `${i * 0.9}s` }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Espuma = en progreso, flotando sobre el jugo */}
          <div
            className="juice-level absolute inset-x-0"
            style={{
              bottom: filled ? `${juice}%` : "0%",
              height: filled ? `${foam}%` : "0%",
              ...foamStyle(color),
            }}
          />
          {/* Reflejo del vidrio */}
          <div className="absolute top-2 bottom-3 left-[16%] w-[3px] rounded-full bg-white/15" />
        </div>
      </div>
    </div>
  );
}

export function JuiceTubes({ types }: { types: TypeStat[] }) {
  const custom = useCustomTypes();
  const [filled, setFilled] = useState(false);

  // Se sirve vacío y se llena en el siguiente frame, para que el jugo suba.
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const ticks = niceTicks(Math.max(...types.map((t) => t.total), 1));
  const max = ticks[ticks.length - 1]!;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2.5 rounded-b-[4px] bg-foreground/70" /> Jugo = hechas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2.5 rounded-b-[4px]" style={foamStyle("oklch(0.9 0 0)")} />
          Espuma = en progreso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-2.5 rounded-b-[4px] border border-white/30" /> Vacío = por hacer
        </span>
        <span className="ml-auto">La altura del vaso es el total de tareas</span>
      </div>

      <div className="flex gap-2">
        {/* Eje Y */}
        <div className="relative w-6 shrink-0" style={{ height: PLOT_H + 24 }}>
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-0 translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ bottom: (v / max) * PLOT_H }}
            >
              {v}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: PLOT_H + 24 }}>
          {ticks.map((v) => (
            <div
              key={v}
              className="absolute inset-x-0 border-t border-border/70"
              style={{ bottom: (v / max) * PLOT_H }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-2 px-1 sm:gap-3">
            {types.map((t, i) => (
              <Tube
                key={t.id}
                t={t}
                max={max}
                color={typeColor(t.id, custom)}
                filled={filled}
                edge={i === 0 ? "start" : i === types.length - 1 && i > 0 ? "end" : null}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Nombres, alineados con cada vaso */}
      <div className="mt-2 flex gap-2 pl-8">
        <div className="flex min-w-0 flex-1 gap-2 px-1 sm:gap-3">
          {types.map((t) => (
            <div key={t.id} className="min-w-0 flex-1 text-center" title={t.label}>
              {/* Sin punto de color: el vaso de encima ya lo lleva, y así cabe el nombre. */}
              <p className="truncate text-[10px] text-foreground sm:text-[11px]">{t.label}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{t.pct}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
