import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { krProgress, objectiveProgress, type Objective } from "@/lib/okr-cloud";
import {
  SMART_LETTERS,
  pacePoints,
  smartMatrix,
  type PacePoint,
  type PaceStatus,
} from "@/lib/focus-stats";
import { AXIS, GRID, STATUS, seriesColor } from "./chart-theme";

const RING_SIZE = 132;

/** Un anillo por KR (de fuera hacia dentro); el centro es el avance del objetivo. */
function Rings({ obj, drawn }: { obj: Objective; drawn: boolean }) {
  const krs = obj.keyResults;
  const outer = RING_SIZE / 2 - 4;
  const gap = 3;
  const stroke = Math.max(4, Math.min(9, (outer - 22) / Math.max(krs.length, 1) - gap));
  const pct = objectiveProgress(obj);

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      role="img"
      aria-label={`${obj.title}: ${pct}%`}
      className="shrink-0"
    >
      {krs.map((kr, i) => {
        const r = outer - stroke / 2 - i * (stroke + gap);
        if (r < 8) return null;
        const c = 2 * Math.PI * r;
        const p = krProgress(kr) / 100;
        return (
          <g key={kr.id} transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              fill="none"
              stroke={GRID}
              strokeWidth={stroke}
            />
            <circle
              className="okr-ring-arc"
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              fill="none"
              stroke={seriesColor(i)}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={drawn ? c * (1 - p) : c}
              style={{ filter: p > 0 ? `drop-shadow(0 0 3px ${seriesColor(i)})` : undefined }}
            >
              <title>{`${kr.title}: ${krProgress(kr)}%`}</title>
            </circle>
          </g>
        );
      })}
      <text
        x="50%"
        y="50%"
        dy="0.1em"
        textAnchor="middle"
        className="fill-foreground text-[20px] font-semibold"
      >
        {pct}%
      </text>
      <text
        x="50%"
        y="50%"
        dy="1.6em"
        textAnchor="middle"
        className="fill-muted-foreground text-[9px] tracking-widest uppercase"
      >
        avance
      </text>
    </svg>
  );
}

export function ObjectiveRings({ objectives }: { objectives: Objective[] }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {objectives.map((obj) => (
        <div
          key={obj.id}
          className="flex min-w-0 gap-4 rounded-lg border border-border/70 bg-background/40 p-3"
        >
          <Rings obj={obj} drawn={drawn} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{obj.title}</p>
            {obj.period && <p className="text-[11px] text-muted-foreground">{obj.period}</p>}
            {obj.keyResults.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Sin resultados clave.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {obj.keyResults.map((kr, i) => (
                  <li key={kr.id} className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: seriesColor(i) }}
                    />
                    <span className="truncate text-muted-foreground" title={kr.title}>
                      {kr.title}
                    </span>
                    <span className="ml-auto pl-1 font-medium text-foreground tabular-nums">
                      {krProgress(kr)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const PACE: Record<PaceStatus, { label: string; color: string }> = {
  done: { label: "Cumplido", color: STATUS.good },
  onTrack: { label: "En ritmo", color: STATUS.info },
  behind: { label: "Atrasado", color: STATUS.warning },
  overdue: { label: "Vencido", color: STATUS.critical },
};

function daysLeftText(p: PacePoint) {
  if (p.daysLeft < 0) return `venció hace ${-p.daysLeft} día(s)`;
  if (p.daysLeft === 0) return "vence hoy";
  return `quedan ${p.daysLeft} día(s)`;
}

/** Tiempo consumido vs. avance: por encima de la diagonal vas adelantado. */
export function PaceChart({ objectives }: { objectives: Objective[] }) {
  const { points, undated } = pacePoints(objectives);
  const present = (Object.keys(PACE) as PaceStatus[]).filter((s) =>
    points.some((p) => p.status === s),
  );

  if (points.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-center text-xs text-muted-foreground">
        Ningún resultado clave tiene fecha límite todavía.
        <br />
        Ponle fecha a un KR y verás si vas a tiempo.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {present.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: PACE[s].color }} />
            {PACE[s].label}
          </span>
        ))}
        {undated > 0 && <span className="ml-auto">{undated} KR sin fecha no aparecen</span>}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute top-2 left-14 text-[10px] tracking-widest text-muted-foreground/70 uppercase">
          ↖ Adelantado
        </span>
        <span className="pointer-events-none absolute right-6 bottom-16 text-[10px] tracking-widest text-muted-foreground/70 uppercase">
          Atrasado ↘
        </span>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ left: 0, right: 12, top: 8, bottom: 16 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="elapsed"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              unit="%"
              padding={{ left: 8, right: 8 }}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              label={{
                value: "del plazo transcurrido",
                position: "insideBottom",
                offset: -10,
                fill: AXIS,
                fontSize: 10,
              }}
            />
            <YAxis
              type="number"
              dataKey="progress"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              unit="%"
              width={44}
              padding={{ top: 8, bottom: 8 }}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <ZAxis range={[110, 110]} />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ]}
              stroke={AXIS}
              strokeOpacity={0.5}
              ifOverflow="hidden"
            />
            <Tooltip
              cursor={{ stroke: GRID }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as PacePoint;
                return (
                  <div className="max-w-64 rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                    <p className="font-medium text-foreground">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground">{p.objective}</p>
                    <p className="mt-1 text-muted-foreground">
                      {PACE[p.status].label} · {p.progress}% hecho con {p.elapsed}% del plazo
                    </p>
                    <p className="text-muted-foreground">
                      {p.dueDate} · {daysLeftText(p)}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={points}>
              {points.map((p) => (
                <Cell
                  key={p.id}
                  fill={PACE[p.status].color}
                  stroke="oklch(0.19 0.014 264)"
                  strokeWidth={2}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Qué letras SMART tiene definidas cada KR, y cuál se te suele olvidar. */
export function SmartGrid({ objectives }: { objectives: Objective[] }) {
  const { rows, coverage, complete } = smartMatrix(objectives);
  if (rows.length === 0) {
    return (
      <div className="grid h-40 place-items-center text-xs text-muted-foreground">
        Aún no hay resultados clave.
      </div>
    );
  }
  const weakest = coverage.indexOf(Math.min(...coverage));

  return (
    <div>
      <div className="max-h-[320px] overflow-y-auto pr-1">
        <table className="w-full border-separate border-spacing-y-1 text-xs">
          <thead className="sticky top-0 z-[1] bg-card">
            <tr>
              <th className="pb-1 text-left text-[10px] font-medium text-muted-foreground">
                Resultado clave
              </th>
              {SMART_LETTERS.map((l, i) => (
                <th key={l.key} className="w-9 pb-1 text-center" title={l.name}>
                  <span className="block text-[11px] font-bold text-foreground">{l.letter}</span>
                  <span className="block text-[9px] font-normal text-muted-foreground tabular-nums">
                    {coverage[i]}%
                  </span>
                </th>
              ))}
              <th className="w-9 pb-1 text-right text-[10px] font-medium text-muted-foreground">
                /5
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td
                  className="max-w-0 truncate pr-2 text-foreground"
                  title={`${r.title} · ${r.objective}`}
                >
                  {r.title}
                </td>
                {r.filled.map((on, i) => (
                  <td key={i} className="text-center">
                    <span
                      className={cn(
                        "mx-auto grid size-6 place-items-center rounded-md text-[10px] font-bold",
                        on
                          ? "bg-primary text-primary-foreground shadow-[0_0_10px_-2px_var(--primary)]"
                          : "border border-border text-muted-foreground/50",
                      )}
                      title={`${SMART_LETTERS[i]!.name}: ${on ? "definido" : "falta"}`}
                    >
                      {SMART_LETTERS[i]!.letter}
                    </span>
                  </td>
                ))}
                <td className="text-right font-medium text-foreground tabular-nums">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="text-foreground">{complete}</span> de {rows.length} KR son SMART completos.
        {coverage[weakest]! < 100 && (
          <>
            {" "}
            La letra que más se te escapa es{" "}
            <span className="text-foreground">
              {SMART_LETTERS[weakest]!.letter} · {SMART_LETTERS[weakest]!.name}
            </span>{" "}
            ({coverage[weakest]}%).
          </>
        )}
      </p>
    </div>
  );
}
