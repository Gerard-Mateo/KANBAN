import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
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
import { ActivityCalendar } from "./ActivityCalendar";
import type { BoardState } from "@/lib/kanban-data";

// Slots categóricos en orden fijo (nunca ciclados): azul, naranja, aqua,
// amarillo, magenta, verde, violeta, rojo.
// Slots categóricos TRON (orden fijo, nunca ciclado), validados contra el
// fondo oscuro: rojo Ares, cian de la Grid, ámbar, magenta, violeta, verde,
// azul y oliva.
const SERIES = [
  "#f0513a",
  "#0e97bb",
  "#c48400",
  "#d1489a",
  "#8b7ae8",
  "#00a377",
  "#5b7fd4",
  "#7f9422",
];
const TOTAL_COLOR = "#0e97bb";
const DONE_COLOR = "#f0513a";
const AXIS = "oklch(0.68 0.015 264)";
const GRID = "oklch(0.3 0.02 264)";
const CURSOR_FILL = "oklch(0.25 0.016 264)";

const seriesColor = (i: number) => SERIES[i % SERIES.length]!;

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
    <section className="rounded-xl border border-border bg-card p-4">
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

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid oklch(0.3 0.02 264)",
    background: "oklch(0.2 0.014 264)",
    fontSize: 12,
    boxShadow: "0 4px 20px oklch(0 0 0 / 0.6)",
  },
  labelStyle: { fontWeight: 600, color: "oklch(0.95 0.008 80)" },
  itemStyle: { color: "oklch(0.95 0.008 80)" },
};

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
          <th className="py-1.5 text-right font-medium">Hechas</th>
          <th className="py-1.5 text-right font-medium">%</th>
        </tr>
      </thead>
      <tbody>
        {stats.types.map((t) => (
          <tr key={t.id} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 text-foreground">{t.label}</td>
            <td className="py-1.5 text-right text-muted-foreground">{t.total}</td>
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
  const typeIndex = useMemo(() => new Map(stats.types.map((t, i) => [t.id, i])), [stats.types]);

  const maxDays = stats.doneTasks.reduce((m, t) => Math.max(m, t.days), 0);
  const speedScale = durationScale(maxDays);

  const radarData = stats.types.map((t) => ({
    type: t.label,
    Total: t.total,
    Hechas: t.done,
    pct: t.pct,
  }));

  // Un punto por tarea: eje X = lo que tardó, eje Y = su tipo. Va todo en una
  // sola serie con <Cell> por punto: con varias <Scatter> el eje de categorías
  // reparte mal los puntos entre filas.
  const scatterPoints = stats.doneTasks.map((t) => ({
    x: speedScale.to(t.days),
    y: t.typeLabel,
    title: t.title,
    days: t.days,
    color: seriesColor(typeIndex.get(t.typeId) ?? 0),
  }));
  const scatterRows = stats.speeds.map((s) => s.label);

  return (
    <div className="space-y-4">
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
          hint="Cada eje es un tipo de tarea. El área rellena son las hechas frente al total."
          table={<TypesTable stats={stats} />}
        >
          {radarData.length === 0 ? (
            <Empty>Aún no hay tareas.</Empty>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TOTAL_COLOR }}
                  />
                  Total
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: DONE_COLOR }} />
                  Hechas
                </span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke={GRID} />
                  <PolarAngleAxis
                    dataKey="type"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    tick={{ fill: AXIS, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Radar
                    name="Total"
                    dataKey="Total"
                    stroke={TOTAL_COLOR}
                    strokeWidth={2}
                    fill={TOTAL_COLOR}
                    fillOpacity={0.14}
                  />
                  <Radar
                    name="Hechas"
                    dataKey="Hechas"
                    stroke={DONE_COLOR}
                    strokeWidth={2}
                    fill={DONE_COLOR}
                    fillOpacity={0.55}
                    dot={{ r: 3, fill: DONE_COLOR, strokeWidth: 0 }}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </>
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
                    <Cell key={s.id} fill={seriesColor(typeIndex.get(s.id) ?? 0)} />
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

      <p className="text-xs text-muted-foreground">
        Pomodoros y OKRs se añadirán aquí más adelante.
      </p>
    </div>
  );
}
