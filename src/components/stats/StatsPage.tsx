import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStats, formatDays, type BoardStats } from "@/lib/task-stats";
import { computeFocus, formatMinutes, pacePoints, smartMatrix } from "@/lib/focus-stats";
import { listSessions, type PomodoroSession } from "@/lib/pomodoro-cloud";
import { loadOkrs, objectiveProgress, type Objective } from "@/lib/okr-cloud";
import { ActivityCalendar } from "./ActivityCalendar";
import { JuiceTubes } from "./JuiceTubes";
import { FocusByType, FocusPunchCard, TomatoTower } from "./FocusCharts";
import { ObjectiveRings, PaceChart, SmartGrid } from "./OkrCharts";
import { AXIS, CURSOR_FILL, GRID, tooltipStyle, typeColor } from "./chart-theme";
import { useCustomTypes } from "@/lib/custom-types";
import type { BoardState } from "@/lib/kanban-data";

const DONE_COLOR = "#f0513a";

type SpeedRow = { median: number };

/** Elige horas o días según la duración más larga, para que el eje no acabe
 * en notación científica cuando todo se completa en minutos. */
function durationScale(maxDays: number) {
  const [unit, factor] = maxDays < 1 / 12 ? [" min", 1440] : maxDays < 2 ? [" h", 24] : [" d", 1];
  return {
    unit,
    to: (days: number) => days * factor,
    // Techo mínimo para que un tablero recién estrenado no dibuje cinco ceros.
    max: Math.max(maxDays * factor, 1),
    tick: (v: number) => {
      if (v === 0) return "0";
      if (v >= 10) return String(Math.round(v));
      return String(Number(v.toFixed(1)));
    },
  };
}

function Panel({
  title,
  hint,
  children,
  table,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  table?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors",
              showTable
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Table2 className="size-3" /> Tabla
          </button>
        )}
      </div>
      {showTable && table ? table : children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-56 place-items-center text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border pb-2">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Carga remota de una sección: null mientras llega, string si falló. */
type Remote<T> = { data: T | null; error: string | null };

function useRemote<T>(load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setState({ data: null, error: e instanceof Error ? e.message : "No se pudo cargar" }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

function RemoteState({ remote, what }: { remote: Remote<unknown>; what: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
      {remote.error ? `⚠ No se pudieron cargar ${what}: ${remote.error}` : `Cargando ${what}…`}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TypesTable({ stats }: { stats: BoardStats }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border text-left">
          <th className="py-1.5 font-medium">Tipo</th>
          <th className="py-1.5 text-right font-medium">Total</th>
          <th className="py-1.5 text-right font-medium">En progreso</th>
          <th className="py-1.5 text-right font-medium">Hechas</th>
          <th className="py-1.5 text-right font-medium">%</th>
        </tr>
      </thead>
      <tbody>
        {stats.types.map((t) => (
          <tr key={t.id} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 text-foreground">{t.label}</td>
            <td className="py-1.5 text-right text-muted-foreground">{t.total}</td>
            <td className="py-1.5 text-right text-muted-foreground">{t.doing}</td>
            <td className="py-1.5 text-right text-muted-foreground">{t.done}</td>
            <td className="py-1.5 text-right font-medium text-foreground">{t.pct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SpeedTable({ stats }: { stats: BoardStats }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border text-left">
          <th className="py-1.5 font-medium">Tipo</th>
          <th className="py-1.5 text-right font-medium">Mediana</th>
          <th className="py-1.5 text-right font-medium">Más rápida</th>
          <th className="py-1.5 text-right font-medium">Más lenta</th>
          <th className="py-1.5 text-right font-medium">Tareas</th>
        </tr>
      </thead>
      <tbody>
        {stats.speeds.map((s) => (
          <tr key={s.id} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 text-foreground">{s.label}</td>
            <td className="py-1.5 text-right font-medium text-foreground">
              {formatDays(s.median)}
            </td>
            <td className="py-1.5 text-right text-muted-foreground">{formatDays(s.fastest)}</td>
            <td className="py-1.5 text-right text-muted-foreground">{formatDays(s.slowest)}</td>
            <td className="py-1.5 text-right text-muted-foreground">{s.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsPage({ board }: { board: BoardState }) {
  const stats = useMemo(() => computeStats(board), [board]);
  const custom = useCustomTypes();
  // Cada tipo lleva el mismo color que su pastilla en el tablero, en todas las gráficas.
  const colorOf = (id: string) => typeColor(id, custom);

  const maxDays = stats.doneTasks.reduce((m, t) => Math.max(m, t.days), 0);
  const speedScale = durationScale(maxDays);

  // Se piden al abrir la pestaña (el componente solo se monta entonces).
  const sessions = useRemote<PomodoroSession[]>(listSessions);
  const okrs = useRemote<Objective[]>(loadOkrs);

  // Un punto por tarea: eje X = lo que tardó, eje Y = su tipo. Va todo en una
  // sola serie con <Cell> por punto: con varias <Scatter> el eje de categorías
  // reparte mal los puntos entre filas.
  const scatterPoints = stats.doneTasks.map((t) => ({
    x: speedScale.to(t.days),
    y: t.typeLabel,
    title: t.title,
    days: t.days,
    color: colorOf(t.typeId),
  }));
  const scatterRows = stats.speeds.map((s) => s.label);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <SectionHeader
          title="Tareas"
          hint="Lo que sale del tablero y su historial de movimientos."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Tareas totales" value={String(stats.total)} />
          <StatTile label="Completadas" value={`${stats.done}`} sub={`${stats.pct}% del tablero`} />
          <StatTile
            label="Tiempo típico"
            value={stats.medianDays == null ? "—" : formatDays(stats.medianDays)}
            sub="mediana hasta Hecho"
          />
          <StatTile
            label="Tipos en uso"
            value={String(stats.types.length)}
            sub={stats.untimed > 0 ? `${stats.untimed} hechas sin fecha` : undefined}
          />
        </div>

        <Panel
          title="Actividad del año"
          hint="Un cuadro por día. Cuanto más fuerte el tono, más tareas pusiste en progreso o completaste ese día."
        >
          <ActivityCalendar calendar={stats.calendar} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Completadas por tipo"
            hint="Un vaso por tipo: su altura es el total de tareas y se llena con lo que ya hiciste."
            table={<TypesTable stats={stats} />}
          >
            {stats.types.length === 0 ? (
              <Empty>Aún no hay tareas.</Empty>
            ) : (
              <JuiceTubes types={stats.types} />
            )}
          </Panel>

          <Panel
            title="Qué tan rápido se terminan"
            hint="Mediana de días desde que creas la tarea hasta que llega a Hecho, por tipo."
            table={<SpeedTable stats={stats} />}
          >
            {stats.speeds.length === 0 ? (
              <Empty>
                Todavía no hay tareas completadas con fecha.
                <br />
                Mueve alguna a Hecho y aparecerá aquí.
              </Empty>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.speeds.map((s) => ({ ...s, value: speedScale.to(s.median) }))}
                  layout="vertical"
                  margin={{ left: 8, right: 64, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis
                    type="number"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    tickFormatter={speedScale.tick}
                    unit={speedScale.unit}
                    domain={[0, speedScale.max]}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={90}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    cursor={{ fill: CURSOR_FILL }}
                    formatter={(_v: number, _n: string, item: { payload?: SpeedRow }) => [
                      item.payload ? formatDays(item.payload.median) : "—",
                      "Mediana",
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    label={{
                      position: "right",
                      fill: AXIS,
                      fontSize: 11,
                      formatter: (v: number) => speedScale.tick(v as number) + speedScale.unit,
                    }}
                  >
                    {stats.speeds.map((s) => (
                      <Cell key={s.id} fill={colorOf(s.id)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Cada tarea, una por una"
            hint="Un punto por tarea completada, colocado según lo que tardó. Pasa el cursor para ver cuál es."
          >
            {stats.doneTasks.length === 0 ? (
              <Empty>Todavía no hay tareas completadas con fecha.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Duración"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    tickFormatter={speedScale.tick}
                    unit={speedScale.unit}
                    domain={[0, speedScale.max]}
                  />
                  <YAxis
                    type="category"
                    dataKey="y"
                    width={90}
                    domain={scatterRows}
                    allowDuplicatedCategory={false}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ZAxis range={[70, 70]} />
                  <Tooltip
                    {...tooltipStyle}
                    cursor={{ stroke: GRID }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]!.payload as { title: string; days: number; y: string };
                      return (
                        <div className="max-w-64 rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                          <p className="font-medium text-foreground">{p.title || "(sin título)"}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {p.y} · {formatDays(p.days)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterPoints} fillOpacity={0.8}>
                    {scatterPoints.map((p, i) => (
                      <Cell key={`${p.title}-${i}`} fill={p.color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel
            title="Ritmo semanal"
            hint="Cuántas tareas llegaron a Hecho cada semana, en las últimas 8."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.weeks} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ fill: CURSOR_FILL }}
                  formatter={(value: number) => [`${value} tarea(s)`, "Completadas"]}
                  labelFormatter={(l: string) => `Semana del ${l}`}
                />
                <Bar
                  dataKey="done"
                  fill={DONE_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  label={{ position: "top", fill: AXIS, fontSize: 11 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Pomodoro" hint="Cuánto te enfocas, cuándo y en qué." />
        {sessions.data ? (
          <FocusSection sessions={sessions.data} board={board} />
        ) : (
          <RemoteState remote={sessions} what="los pomodoros" />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="OKRs y SMART"
          hint="Avance de cada objetivo, ritmo frente al plazo y calidad de los KRs."
        />
        {okrs.data ? (
          <OkrSection objectives={okrs.data} />
        ) : (
          <RemoteState remote={okrs} what="los OKRs" />
        )}
      </section>
    </div>
  );
}

function FocusSection({ sessions, board }: { sessions: PomodoroSession[]; board: BoardState }) {
  const focus = useMemo(() => computeFocus(sessions, board), [sessions, board]);
  if (focus.started === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <Empty>
          Aún no has corrido ningún pomodoro.
          <br />
          Empieza uno desde la pestaña Pomodoro y aparecerá aquí.
        </Empty>
      </div>
    );
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Pomodoros completados"
          value={String(focus.completed)}
          sub={`${focus.completionRate}% de los que empezaste`}
        />
        <StatTile label="Tiempo enfocado" value={formatMinutes(focus.minutes)} />
        <StatTile
          label="Racha actual"
          value={`${focus.streak} día(s)`}
          sub={`la mejor: ${focus.bestStreak} día(s)`}
        />
        <StatTile
          label="Pomodoro típico"
          value={focus.completed ? formatMinutes(Math.round(focus.minutes / focus.completed)) : "—"}
          sub="promedio por sesión"
        />
      </div>

      <Panel
        title="Torre de tomates"
        hint={`Últimos ${focus.days.length} días. Cada tomate es un pomodoro completado; pasa el cursor por un día para ver los minutos.`}
        table={<FocusDaysTable focus={focus} />}
      >
        <TomatoTower focus={focus} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Cuándo te enfocas"
          hint="Día de la semana por hora de inicio. Cuanto más grande el tomate, más minutos de enfoque."
        >
          <FocusPunchCard focus={focus} />
        </Panel>
        <Panel
          title="En qué se va tu enfoque"
          hint="Minutos de pomodoro por tipo de tarea, con el color de cada tipo."
        >
          {focus.byType.length === 0 ? (
            <Empty>Aún no hay pomodoros completados.</Empty>
          ) : (
            <FocusByType focus={focus} />
          )}
        </Panel>
      </div>
    </>
  );
}

function FocusDaysTable({ focus }: { focus: ReturnType<typeof computeFocus> }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border text-left">
          <th className="py-1.5 font-medium">Día</th>
          <th className="py-1.5 text-right font-medium">Pomodoros</th>
          <th className="py-1.5 text-right font-medium">Sin cerrar</th>
          <th className="py-1.5 text-right font-medium">Minutos</th>
        </tr>
      </thead>
      <tbody>
        {[...focus.days].reverse().map((d) => (
          <tr key={d.date} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 text-foreground">
              {new Date(d.date).toLocaleDateString("es-EC", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </td>
            <td className="py-1.5 text-right text-foreground">{d.completed}</td>
            <td className="py-1.5 text-right text-muted-foreground">{d.unfinished}</td>
            <td className="py-1.5 text-right text-muted-foreground">{d.minutes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OkrSection({ objectives }: { objectives: Objective[] }) {
  if (objectives.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <Empty>
          Aún no hay objetivos.
          <br />
          Crea uno en la pestaña OKRs y sus anillos aparecerán aquí.
        </Empty>
      </div>
    );
  }
  const krCount = objectives.reduce((n, o) => n + o.keyResults.length, 0);
  const avg = Math.round(
    objectives.reduce((sum, o) => sum + objectiveProgress(o), 0) / objectives.length,
  );
  const { points } = pacePoints(objectives);
  const onPace = points.filter((p) => p.status === "done" || p.status === "onTrack").length;
  const smart = smartMatrix(objectives);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Objetivos"
          value={String(objectives.length)}
          sub={`${krCount} resultado(s) clave`}
        />
        <StatTile label="Avance medio" value={`${avg}%`} sub="promedio de los objetivos" />
        <StatTile
          label="KRs a tiempo"
          value={points.length ? `${onPace} de ${points.length}` : "—"}
          sub={points.length ? "cumplidos o en ritmo" : "ningún KR tiene fecha"}
        />
        <StatTile
          label="SMART completos"
          value={krCount ? `${smart.complete} de ${krCount}` : "—"}
          sub="con las 5 letras definidas"
        />
      </div>

      <Panel
        title="Anillos de objetivos"
        hint="Un anillo por resultado clave, de fuera hacia dentro. El número del centro es el avance del objetivo."
      >
        <ObjectiveRings objectives={objectives} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="¿Vas a tiempo?"
          hint="Cada punto es un KR: cuánto del plazo ya pasó frente a cuánto llevas hecho. Sobre la diagonal vas adelantado."
        >
          <PaceChart objectives={objectives} />
        </Panel>
        <Panel
          title="Calidad SMART"
          hint="Qué letras tiene definidas cada KR. El porcentaje de arriba es cuántos KRs cumplen esa letra."
        >
          <SmartGrid objectives={objectives} />
        </Panel>
      </div>
    </>
  );
}
