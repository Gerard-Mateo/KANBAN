import { useMemo } from "react";
import type { Calendar, DayStat, TypeCalendar } from "@/lib/task-stats";
import { useCustomTypes, type CustomType } from "@/lib/custom-types";
import { blendColor, grayLevel, levelColor } from "@/lib/activity-colors";
import { typeColor } from "./chart-theme";

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

/** Rejilla de un año al estilo GitHub: una columna por semana, domingo arriba. */
function Heatmap({
  calendar,
  color,
  tooltip,
  cell = 11,
  gap = 3,
}: {
  calendar: Calendar;
  color: (day: DayStat, level: number) => string;
  tooltip: (day: DayStat) => string;
  cell?: number;
  gap?: number;
}) {
  const weeks = useMemo(() => {
    const out: DayStat[][] = [];
    for (let i = 0; i < calendar.days.length; i += 7) out.push(calendar.days.slice(i, i + 7));
    return out;
  }, [calendar.days]);

  // Etiqueta de mes sobre la primera semana en que empieza cada mes.
  const monthLabels = useMemo(() => {
    const labels = new Map<number, string>();
    let last = -1;
    weeks.forEach((week, i) => {
      const first = week[0];
      if (!first) return;
      const m = new Date(first.date).getMonth();
      if (m !== last && i < weeks.length - 1) {
        labels.set(i, MONTHS[m]!);
        last = m;
      }
    });
    return labels;
  }, [weeks]);

  const radius = cell >= 10 ? 2 : 1.5;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex" style={{ gap }}>
        <div className="flex shrink-0 flex-col pr-1" style={{ gap, marginTop: cell + 7 }}>
          {DAY_LABELS.map((d, i) => (
            <span
              key={i}
              className="text-[9px] text-muted-foreground"
              style={{ width: 22, height: cell, lineHeight: `${cell}px` }}
            >
              {d}
            </span>
          ))}
        </div>
        <div>
          <div className="mb-1 flex" style={{ gap }}>
            {weeks.map((_, i) => (
              <span
                key={i}
                className="text-[9px] whitespace-nowrap text-muted-foreground"
                style={{ width: cell, height: cell + 3 }}
              >
                {monthLabels.get(i) ?? ""}
              </span>
            ))}
          </div>
          <div className="flex" style={{ gap }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap }}>
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={tooltip(day)}
                    className="ring-1 ring-white/5 ring-inset"
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: radius,
                      backgroundColor: color(day, levelOf(day, calendar.thresholds)),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatches({ colors, size = 11 }: { colors: string[]; size?: number }) {
  return (
    <>
      {colors.map((bg, i) => (
        <span
          key={i}
          className="rounded-[2px] ring-1 ring-white/5 ring-inset"
          style={{ width: size, height: size, backgroundColor: bg }}
        />
      ))}
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Todo" (los colores de los tipos mezclados por día) y un calendario por tipo. */
export function ActivityHeatmaps({
  calendar,
  typeCalendars,
}: {
  calendar: Calendar;
  typeCalendars: TypeCalendar[];
}) {
  const custom = useCustomTypes();
  const labelOf = new Map(typeCalendars.map((t) => [t.id, t.label]));
  const breakdown = (day: DayStat) =>
    [...day.types]
      .sort((a, b) => b.count - a.count)
      .map((t) => `${labelOf.get(t.id) ?? t.id} ${t.count}`)
      .join(", ");

  return (
    <div className="space-y-6">
      <div>
        <Heatmap
          calendar={calendar}
          color={(day, level) => blendColor(day.types, level, custom)}
          tooltip={(day) =>
            day.count === 0
              ? `Sin actividad · ${fullDate(day.date)}`
              : `${fullDate(day.date)}\n${day.done} completada(s), ${day.started} en progreso\n${breakdown(day)}`
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <span>
            {plural(calendar.totalActive, "día", "días")} con actividad en el último año
            {calendar.max > 0 && ` · máximo ${calendar.max} en un día`}
          </span>
          {typeCalendars.length > 1 && (
            <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
              Color = mezcla de
              {typeCalendars.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 text-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: typeColor(t.id, custom) }}
                  />
                  {t.label}
                </span>
              ))}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1">
            Menos
            <Swatches colors={[0, 1, 2, 3, 4].map(grayLevel)} />
            Más
          </span>
        </div>
      </div>

      {typeCalendars.length > 0 && (
        <div className="grid gap-x-8 gap-y-5 border-t border-border pt-5 xl:grid-cols-2">
          {typeCalendars.map((t) => (
            <TypeHeatmap key={t.id} calendar={t} custom={custom} />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeHeatmap({ calendar, custom }: { calendar: TypeCalendar; custom: CustomType[] }) {
  const total = calendar.days.reduce((s, d) => s + d.count, 0);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: typeColor(calendar.id, custom) }}
        />
        <span className="font-medium text-foreground">{calendar.label}</span>
        <span className="text-[11px] text-muted-foreground">
          {plural(calendar.totalActive, "día activo", "días activos")} ·{" "}
          {plural(total, "movimiento", "movimientos")}
        </span>
        <span className="ml-auto inline-flex items-center gap-[3px] text-[10px] text-muted-foreground">
          <Swatches
            size={8}
            colors={[0, 1, 2, 3, 4].map((l) => levelColor(calendar.id, l, custom))}
          />
        </span>
      </div>
      <Heatmap
        calendar={calendar}
        cell={9}
        gap={2}
        color={(_, level) => levelColor(calendar.id, level, custom)}
        tooltip={(day) =>
          day.count === 0
            ? `${calendar.label}: sin actividad · ${fullDate(day.date)}`
            : `${calendar.label} · ${fullDate(day.date)}\n${day.done} completada(s), ${day.started} en progreso`
        }
      />
    </div>
  );
}
