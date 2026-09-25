import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Calendar, DayStat } from "@/lib/task-stats";

// Rampa secuencial de un solo tono (el rojo Ares), de casi-fondo a neón.
// Nivel 0 es "sin actividad" y se queda en el gris de la rejilla.
const LEVEL_BG = [
  "oklch(0.24 0.012 264)",
  "oklch(0.36 0.09 32)",
  "oklch(0.46 0.14 32)",
  "oklch(0.56 0.18 32)",
  "oklch(0.68 0.22 32)",
];

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
];
const DAY_LABELS = ["", "lun", "", "mié", "", "vie", ""];

function levelOf(day: DayStat, t: Calendar["thresholds"]): number {
  if (day.count <= 0) return 0;
  if (day.count >= t[3]) return 4;
  if (day.count >= t[2]) return 3;
  if (day.count >= t[1]) return 2;
  return 1;
}

const fullDate = (ts: number) =>
  new Date(ts).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });

export function ActivityCalendar({ calendar }: { calendar: Calendar }) {
  // Una columna por semana (7 filas, domingo arriba), como en GitHub.
  const weeks = useMemo(() => {
    const out: DayStat[][] = [];
    for (let i = 0; i < calendar.days.length; i += 7) out.push(calendar.days.slice(i, i + 7));
    return out;
  }, [calendar.days]);

  // Etiqueta de mes sobre la primera semana en que empieza cada mes.
  const monthLabels = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let last = -1;
    weeks.forEach((week, i) => {
      const first = week[0];
      if (!first) return;
      const m = new Date(first.date).getMonth();
      if (m !== last && i < weeks.length - 1) {
        labels.push({ index: i, label: MONTHS[m]! });
        last = m;
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          <div className="mt-[18px] flex shrink-0 flex-col gap-[3px] pr-1">
            {DAY_LABELS.map((d, i) => (
              <span
                key={i}
                className="h-[11px] text-[9px] leading-[11px] text-muted-foreground"
                style={{ width: 22 }}
              >
                {d}
              </span>
            ))}
          </div>
          <div>
            <div className="mb-1 flex gap-[3px]">
              {weeks.map((_, i) => {
                const label = monthLabels.find((m) => m.index === i);
                return (
                  <span
                    key={i}
                    className="w-[11px] text-[9px] whitespace-nowrap text-muted-foreground"
                  >
                    {label?.label ?? ""}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day) => {
                    const level = levelOf(day, calendar.thresholds);
                    return (
                      <div
                        key={day.date}
                        title={
                          day.count === 0
                            ? `Sin actividad · ${fullDate(day.date)}`
                            : `${day.done} completada(s), ${day.started} en progreso · ${fullDate(day.date)}`
                        }
                        className={cn(
                          "size-[11px] rounded-[2px] ring-1 ring-inset ring-white/5",
                          level > 0 && "cursor-default",
                        )}
                        style={{ backgroundColor: LEVEL_BG[level] }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {calendar.totalActive} día(s) con actividad en el último año
          {calendar.max > 0 && ` · máximo ${calendar.max} en un día`}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          Menos
          {LEVEL_BG.map((bg, i) => (
            <span
              key={i}
              className="size-[11px] rounded-[2px] ring-1 ring-inset ring-white/5"
              style={{ backgroundColor: bg }}
            />
          ))}
          Más
        </span>
      </div>
    </div>
  );
}
