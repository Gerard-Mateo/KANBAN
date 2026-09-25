import { useCustomTypes } from "@/lib/custom-types";
import { formatMinutes, type FocusStats } from "@/lib/focus-stats";
import { TOMATO, typeColor } from "./chart-theme";

const TOWER_H = 176;
const LEAF = "oklch(0.7 0.16 150)";
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });

function Tomato({ size, hollow }: { size: number; hollow?: boolean }) {
  if (hollow) {
    return (
      <span
        className="block shrink-0 rounded-full border-[1.5px] border-muted-foreground/60"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="relative block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, color-mix(in oklab, ${TOMATO} 70%, white), ${TOMATO} 60%)`,
      }}
    >
      {/* Rabito verde: sin él es un punto, con él es un tomate */}
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          top: -Math.max(1, size * 0.12),
          width: Math.max(3, size * 0.45),
          height: Math.max(2, size * 0.22),
          backgroundColor: LEAF,
        }}
      />
    </span>
  );
}

/** Una columna por día; cada tomate es un pomodoro completado. */
export function TomatoTower({ focus }: { focus: FocusStats }) {
  const tallest = Math.max(...focus.days.map((d) => d.completed + d.unfinished), 1);
  const size = Math.max(6, Math.min(16, Math.floor(TOWER_H / tallest) - 3));
  const last = focus.days.length - 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Tomato size={10} /> Pomodoro completado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Tomato size={10} hollow /> Iniciado sin cerrar
        </span>
      </div>
      <div
        className="flex items-end gap-[3px] border-b border-border"
        style={{ height: TOWER_H + 8 }}
      >
        {focus.days.map((d, i) => (
          <div
            key={d.date}
            tabIndex={0}
            title={`${dayLabel(d.date)} · ${d.completed} pomodoro(s) · ${formatMinutes(d.minutes)}${d.unfinished ? ` · ${d.unfinished} sin cerrar` : ""}`}
            className="flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-[3px] overflow-hidden rounded-sm pt-0.5 pb-1 outline-none hover:bg-secondary/60 focus-visible:bg-secondary/60"
          >
            {Array.from({ length: d.completed }, (_, k) => (
              <Tomato key={`c${k}`} size={size} />
            ))}
            {Array.from({ length: d.unfinished }, (_, k) => (
              <Tomato key={`u${k}`} size={size} hollow />
            ))}
            {i === last && d.completed + d.unfinished === 0 && (
              <span className="text-[9px] text-muted-foreground">·</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-muted-foreground">
        {focus.days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 text-center whitespace-nowrap">
            {i === last
              ? "hoy"
              : (last - i) % 7 === 0
                ? new Date(d.date).toLocaleDateString("es-EC", { day: "numeric", month: "short" })
                : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Semana × hora: cuanto más grande el círculo, más minutos de enfoque. */
export function FocusPunchCard({ focus }: { focus: FocusStats }) {
  const [from, to] = focus.hours;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const cell = new Map(focus.punch.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const best = focus.punch.reduce<(typeof focus.punch)[number] | null>(
    (b, c) => (!b || c.minutes > b.minutes ? c : b),
    null,
  );

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-max border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th
                  key={h}
                  className="min-w-5 text-center text-[9px] font-normal text-muted-foreground tabular-nums"
                >
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((w, wi) => (
              <tr key={w}>
                <th className="pr-1.5 text-right text-[10px] font-normal text-muted-foreground">
                  {w}
                </th>
                {hours.map((h) => {
                  const c = cell.get(`${wi}-${h}`);
                  const r = c ? Math.sqrt(c.minutes / focus.punchMax) : 0;
                  return (
                    <td
                      key={h}
                      className="h-5 min-w-5 p-0"
                      title={
                        c
                          ? `${w} ${h}:00 · ${c.count} pomodoro(s) · ${formatMinutes(c.minutes)}`
                          : `${w} ${h}:00 · sin enfoque`
                      }
                    >
                      <div className="grid h-5 place-items-center">
                        {c ? (
                          <span
                            className="block rounded-full"
                            style={{
                              width: 5 + r * 13,
                              height: 5 + r * 13,
                              backgroundColor: TOMATO,
                              opacity: 0.45 + r * 0.55,
                              boxShadow: r > 0.6 ? `0 0 8px ${TOMATO}` : undefined,
                            }}
                          />
                        ) : (
                          <span className="block size-[3px] rounded-full bg-border" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {best && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tu hora fuerte: <span className="text-foreground">{WEEKDAYS[best.weekday]}</span> a las{" "}
          <span className="text-foreground">{best.hour}:00</span> · {formatMinutes(best.minutes)}{" "}
          enfocados en total
        </p>
      )}
    </div>
  );
}

/** Minutos de enfoque por tipo de tarea, en el color de cada tipo. */
export function FocusByType({ focus }: { focus: FocusStats }) {
  const custom = useCustomTypes();
  const max = Math.max(...focus.byType.map((t) => t.minutes), 1);
  return (
    <ul className="space-y-2.5">
      {focus.byType.map((t) => (
        <li key={t.id} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 truncate text-foreground" title={t.label}>
            {t.label}
          </span>
          <div className="relative h-4 min-w-0 flex-1">
            <div
              className="absolute inset-y-0 left-0 rounded-r-[4px]"
              style={{
                width: `${(t.minutes / max) * 100}%`,
                minWidth: 3,
                backgroundColor: typeColor(t.id, custom),
              }}
            />
          </div>
          <span className="shrink-0 text-right whitespace-nowrap text-muted-foreground tabular-nums">
            {formatMinutes(t.minutes)} · {t.pomodoros} 🍅
          </span>
        </li>
      ))}
    </ul>
  );
}
