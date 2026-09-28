import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileDown,
  Hourglass,
  Link2,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_WEIGHT,
  boardIndex,
  boardTaskOf,
  createKeyResult,
  createKrTask,
  createObjective,
  deleteKeyResult,
  deleteKrTask,
  deleteObjective,
  getOkrs,
  krPace,
  krProgress,
  metricProgress,
  objectiveProgress,
  replaceOkrs,
  sameText,
  setKrTaskDone,
  taskProgress,
  taskShare,
  updateKeyResult,
  updateKrTask,
  useOkrs,
  type BoardTaskRef,
  type KeyResult,
  type KeyResultInput,
  type KrPace,
  type KrTask,
  type Objective,
  type PaceStatus,
} from "@/lib/okrs";
import { chipCss, colorOf, useAllTypes, useCustomTypes } from "@/lib/custom-types";
import { okrsToMarkdown } from "@/lib/okr-markdown";
import { stamp } from "@/lib/kanban-export";
import { STATUS } from "@/components/stats/chart-theme";
import { OkrAiDialog, type ImportMode } from "./OkrAiDialog";

/** Una tarjeta del tablero vista desde los OKRs (con el nombre de su etiqueta para la IA). */
export type BoardCard = BoardTaskRef & { label: string };

const emptyKr: KeyResultInput = {
  title: "",
  specific: "",
  measurable: "",
  achievable: "",
  relevant: "",
  unit: "",
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  direction: "up",
  dueDate: null,
};

// Los números van como texto mientras se edita para poder dejar un campo vacío.
type KrDraft = Omit<KeyResultInput, "startValue" | "currentValue" | "targetValue"> & {
  startValue: string;
  currentValue: string;
  targetValue: string;
};

const toDraft = (kr: KeyResultInput): KrDraft => ({
  title: kr.title,
  specific: kr.specific,
  measurable: kr.measurable,
  achievable: kr.achievable,
  relevant: kr.relevant,
  unit: kr.unit,
  direction: kr.direction,
  dueDate: kr.dueDate,
  startValue: String(kr.startValue),
  currentValue: String(kr.currentValue),
  targetValue: String(kr.targetValue),
});

// Un KR nuevo arranca donde estás hoy: inicial vacío = el valor actual.
const emptyDraft: KrDraft = { ...toDraft(emptyKr), startValue: "" };

const box =
  "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-card-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary";
const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)] transition-colors hover:bg-primary/90";
const label = "block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";
const iconBtn =
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/* ------------------------------ Piezas visuales ----------------------------- */

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** true a partir del primer frame: las barras y anillos arrancan en 0 y se llenan. */
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Cuenta desde el valor anterior hasta el nuevo (los números "suben" al cambiar). */
function useCountUp(target: number, ms = 900) {
  const [shown, setShown] = useState(reducedMotion() ? target : 0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const from = shown;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(from + (target - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return shown;
}

/** Barra de progreso con brillo: se llena al entrar y un reflejo la recorre. */
function GlowBar({
  value,
  color = "var(--primary)",
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const mounted = useMounted();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary/80", className)}
    >
      <div
        className="glow-fill relative h-full overflow-hidden rounded-full"
        style={{
          width: mounted ? `${pct}%` : "0%",
          background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, transparent), ${color})`,
          boxShadow: pct > 0 ? `0 0 12px -1px ${color}` : undefined,
        }}
      >
        {pct > 0 && pct < 100 && <span className="glow-shimmer absolute inset-0" />}
      </div>
    </div>
  );
}

/** Anillo de avance con el porcentaje (que cuenta hacia arriba) en el centro. */
function Ring({
  value,
  size = 64,
  stroke = 6,
  color = "var(--primary)",
  caption,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  caption?: string;
}) {
  const mounted = useMounted();
  const shown = useCountUp(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <circle
          className="okr-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={mounted ? c * (1 - pct) : c}
          style={{ filter: pct > 0 ? `drop-shadow(0 0 4px ${color})` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <span
            className="font-semibold text-foreground tabular-nums"
            style={{ fontSize: Math.round(size * 0.26) }}
          >
            {shown}%
          </span>
          {caption && (
            <span className="mt-0.5 block text-[8px] tracking-widest text-muted-foreground uppercase">
              {caption}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const PACE: Record<PaceStatus, { text: string; color: string }> = {
  done: { text: "Cumplido", color: STATUS.good },
  onTrack: { text: "En ritmo", color: STATUS.info },
  behind: { text: "Atrasado", color: STATUS.warning },
  overdue: { text: "Vencido", color: STATUS.critical },
};
const NO_DATE_COLOR = "oklch(0.68 0.015 264)";

function StatusPill({ pace }: { pace: KrPace | null }) {
  const meta = pace ? PACE[pace.status] : { text: "Sin fecha", color: NO_DATE_COLOR };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={{
        color: meta.color,
        backgroundColor: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.text}
    </span>
  );
}

const longDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** El contador grande: días que faltan, con el color del estado del KR. */
function Countdown({ kr, pace }: { kr: KeyResult; pace: KrPace | null }) {
  const days = pace ? Math.abs(pace.daysLeft) : 0;
  const shown = useCountUp(days);
  if (!pace || !kr.dueDate) {
    return (
      <div>
        <Hourglass className="size-7 text-muted-foreground/60" />
        <p className="mt-2 text-sm font-medium text-muted-foreground">Sin fecha límite</p>
        <p className="text-[11px] text-muted-foreground/70">
          Ponle fecha con el lápiz: es la T de SMART.
        </p>
      </div>
    );
  }
  const color = PACE[pace.status].color;
  const big = pace.status === "done" ? "✓" : pace.daysLeft === 0 ? "Hoy" : String(shown);
  const caption =
    pace.status === "done"
      ? "cumplido"
      : pace.daysLeft < 0
        ? `día${days === 1 ? "" : "s"} vencido`
        : pace.daysLeft === 0
          ? "vence hoy"
          : `día${days === 1 ? "" : "s"} restante${days === 1 ? "" : "s"}`;
  return (
    <div>
      <p
        className="text-6xl leading-none font-bold tracking-tight tabular-nums"
        style={{ color, textShadow: `0 0 24px color-mix(in oklab, ${color} 55%, transparent)` }}
      >
        {big}
      </p>
      <p className="mt-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">
        {caption}
      </p>
      <p className="text-[11px] text-muted-foreground capitalize">{longDate(kr.dueDate)}</p>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Plazo usado</span>
          <span className="tabular-nums">{pace.elapsed}%</span>
        </div>
        <GlowBar value={pace.elapsed} color={NO_DATE_COLOR} className="h-1" />
      </div>
    </div>
  );
}

/** Cinco barritas de señal: clic para poner el peso de la tarea. */
function WeightPicker({ value, onChange }: { value: number; onChange: (w: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div
      role="radiogroup"
      aria-label="Peso de la tarea"
      className="flex h-4 items-end gap-[2px]"
      onMouseLeave={() => setHover(null)}
      title={`Peso ${value} de ${MAX_WEIGHT}: cuánto empuja el KR`}
    >
      {Array.from({ length: MAX_WEIGHT }, (_, i) => i + 1).map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={value === w}
          aria-label={`Peso ${w}`}
          onMouseEnter={() => setHover(w)}
          onClick={() => onChange(w)}
          className={cn(
            "w-[4px] rounded-[1px] transition-colors",
            w <= shown
              ? "bg-primary shadow-[0_0_6px_-1px_var(--primary)]"
              : "bg-muted-foreground/25",
          )}
          style={{ height: 5 + w * 2.2 }}
        />
      ))}
    </div>
  );
}

/** Selector del tipo con la pastilla del mismo color que en el tablero. */
function TypeSelect({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (type: string | null) => void;
  className?: string;
}) {
  const types = useAllTypes();
  const custom = useCustomTypes();
  // Módulo y General van en gris, igual que su pastilla en el tablero.
  const neutral = !value || value === "module" || value === "other";
  const style = neutral ? undefined : chipCss(colorOf(value, custom));
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      title="Tipo de la tarea en el tablero"
      className={cn(
        "max-w-32 cursor-pointer appearance-none truncate rounded-md border-0 px-2 py-0.5 text-[10px] font-semibold outline-none focus-visible:ring-1 focus-visible:ring-primary",
        neutral && "bg-secondary text-muted-foreground",
        className,
      )}
      style={style}
    >
      <option value="">Sin tipo</option>
      {types.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

const COLUMN_PILL: Record<BoardTaskRef["column"], { text: string; color: string }> = {
  todo: { text: "Por hacer", color: "var(--todo)" },
  doing: { text: "En progreso", color: "var(--doing)" },
  done: { text: "Hecho", color: "var(--done)" },
};

function Kpi({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className={label}>{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/* --------------------------------- Página --------------------------------- */

export function OkrPage({
  boardTasks,
  onCreateBoardTask,
  onSetBoardTaskDone,
  onSetBoardTaskType,
  onStartPomodoro,
}: {
  /** Todas las tarjetas del tablero: las mini-tareas son tarjetas normales. */
  boardTasks: BoardCard[];
  onCreateBoardTask: (title: string, type: string | null) => void;
  onSetBoardTaskDone: (title: string, done: boolean) => void;
  onSetBoardTaskType: (title: string, type: string | null) => void;
  onStartPomodoro: (title: string) => void;
}) {
  const objectives = useOkrs();
  const [error, setError] = useState<string | null>(null);
  const [newObj, setNewObj] = useState({ title: "", description: "", period: "" });
  const [objFormOpen, setObjFormOpen] = useState(false);
  const [krFormFor, setKrFormFor] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const index = useMemo(() => boardIndex(boardTasks), [boardTasks]);
  const pending = useMemo(
    () =>
      boardTasks
        .filter((t) => t.column !== "done")
        .map((t) => ({ title: t.title, column: t.column, type: t.label })),
    [boardTasks],
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      // No todos los errores son `Error`: se busca su mensaje para no esconder la causa real.
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "";
      setError(msg || "Error al guardar");
    }
  }, []);

  // Importa lo que escribió la IA: vincula las tareas que ya existen en el
  // tablero (aunque cambien espacios o mayúsculas), crea las nuevas pendientes
  // con su tipo y, al reemplazar, conserva la fecha de arranque de los KRs que siguen.
  function importOkrs(imported: Objective[], mode: ImportMode, createBoardTasks: boolean) {
    const known = new Map(boardTasks.map((t) => [sameText(t.title), t]));
    const previous = new Map(
      getOkrs().flatMap((o) => o.keyResults.map((k) => [sameText(k.title), k.createdAt] as const)),
    );
    let created = 0;
    const linked = imported.map((o) => ({
      ...o,
      keyResults: o.keyResults.map((k) => ({
        ...k,
        createdAt: (mode === "replace" && previous.get(sameText(k.title))) || k.createdAt,
        tasks: k.tasks.map((t) => {
          const card = known.get(sameText(t.title));
          if (card) return { ...t, title: card.title, boardTaskTitle: card.title, type: card.type };
          if (createBoardTasks && !t.done) {
            onCreateBoardTask(t.title, t.type);
            known.set(sameText(t.title), {
              title: t.title,
              column: "todo",
              type: t.type,
              label: "",
            });
            created += 1;
          }
          return t;
        }),
      })),
    }));
    void run(async () => {
      replaceOkrs(mode === "replace" ? linked : [...getOkrs(), ...linked]);
      const krs = linked.reduce((n, o) => n + o.keyResults.length, 0);
      setNotice(
        `Importados ${linked.length} objetivo(s) y ${krs} KR` +
          (created ? `; ${created} tarea(s) nuevas en Por Hacer.` : "."),
      );
    });
  }

  function exportMarkdown() {
    const url = URL.createObjectURL(
      new Blob([okrsToMarkdown(objectives)], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `okrs-${stamp()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Resumen para el tablero de mando de arriba.
  const summary = useMemo(() => {
    const krs = objectives.flatMap((o) => o.keyResults);
    const paces = krs.map((kr) => ({ kr, pace: krPace(kr) }));
    const counts: Record<PaceStatus | "none", number> = {
      done: 0,
      onTrack: 0,
      behind: 0,
      overdue: 0,
      none: 0,
    };
    for (const p of paces) counts[p.pace ? p.pace.status : "none"] += 1;
    const next = paces
      .filter((p) => p.pace && p.pace.status !== "done" && p.pace.daysLeft >= 0)
      .sort((a, b) => a.pace!.daysLeft - b.pace!.daysLeft)[0];
    const tasks = krs.flatMap((k) => k.tasks);
    const weight = tasks.reduce((n, t) => n + t.weight, 0);
    const doneWeight = tasks.reduce((n, t) => n + (t.done ? t.weight : 0), 0);
    return {
      krCount: krs.length,
      counts,
      next,
      tasksDone: tasks.filter((t) => t.done).length,
      tasksTotal: tasks.length,
      taskPct: weight ? Math.round((doneWeight / weight) * 100) : 0,
      global: objectives.length
        ? Math.round(objectives.reduce((a, o) => a + objectiveProgress(o), 0) / objectives.length)
        : 0,
    };
  }, [objectives]);

  const nextDays = useCountUp(summary.next?.pace?.daysLeft ?? 0);

  return (
    <div className="space-y-6">
      <section className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-4">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary shadow-[0_0_20px_-6px_var(--primary)]">
            <Target className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">OKRs</h2>
            <p className="text-xs text-muted-foreground">
              {objectives.length} objetivo(s) · {summary.krCount} resultado(s) clave
            </p>
          </div>
          {error && <span className="text-xs font-semibold text-destructive">⚠︎ {error}</span>}
          {notice && !error && <span className="text-xs font-semibold text-done">✓ {notice}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={exportMarkdown}
              disabled={objectives.length === 0}
              title="Descarga tus OKRs en el mismo .md que entiende la IA"
            >
              <FileDown className="size-3.5" /> Exportar .md
            </button>
            <button type="button" className={btn} onClick={() => setObjFormOpen((v) => !v)}>
              <Plus className="size-3.5" /> Objetivo
            </button>
            <button type="button" className={btnPrimary} onClick={() => setAiOpen(true)}>
              <Sparkles className="size-3.5" /> Arma tus OKRs con IA
            </button>
          </div>
        </div>

        {objFormOpen && (
          <form
            className="grid gap-2 border-b border-border px-5 py-4 sm:grid-cols-[2fr_2fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newObj.title.trim()) return;
              const payload = { ...newObj, title: newObj.title.trim() };
              setNewObj({ title: "", description: "", period: "" });
              setObjFormOpen(false);
              void run(() => createObjective(payload));
            }}
          >
            <input
              autoFocus
              className={box}
              placeholder="Nuevo objetivo (ej. Ser referente en software de RRHH)"
              value={newObj.title}
              onChange={(e) => setNewObj({ ...newObj, title: e.target.value })}
            />
            <input
              className={box}
              placeholder="Descripción / por qué importa"
              value={newObj.description}
              onChange={(e) => setNewObj({ ...newObj, description: e.target.value })}
            />
            <input
              className={box}
              placeholder="Periodo (Q1 2026)"
              value={newObj.period}
              onChange={(e) => setNewObj({ ...newObj, period: e.target.value })}
            />
            <button type="submit" className={btnPrimary}>
              <Plus className="size-3.5" /> Crear
            </button>
          </form>
        )}

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Avance global">
            <div className="flex items-center gap-4">
              <Ring value={summary.global} size={76} stroke={7} />
              <p className="text-xs text-muted-foreground">
                Promedio de tus {objectives.length} objetivo(s): métrica y tareas por partes
                iguales.
              </p>
            </div>
          </Kpi>
          <Kpi title="Estado de los KR">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {(["onTrack", "behind", "overdue", "done"] as const).map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: PACE[s].color,
                      boxShadow: `0 0 6px ${PACE[s].color}`,
                    }}
                  />
                  <span className="text-muted-foreground">{PACE[s].text}</span>
                  <span className="ml-auto text-sm font-semibold text-foreground tabular-nums">
                    {summary.counts[s]}
                  </span>
                </div>
              ))}
            </div>
            {summary.counts.none > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {summary.counts.none} sin fecha límite
              </p>
            )}
          </Kpi>
          <Kpi title="Próximo vencimiento">
            {summary.next ? (
              <div className="flex items-end gap-3">
                <p
                  className="text-4xl leading-none font-bold tabular-nums"
                  style={{
                    color: PACE[summary.next.pace!.status].color,
                    textShadow: `0 0 20px color-mix(in oklab, ${PACE[summary.next.pace!.status].color} 50%, transparent)`,
                  }}
                >
                  {summary.next.pace!.daysLeft === 0 ? "Hoy" : nextDays}
                </p>
                <div className="min-w-0 pb-0.5">
                  <p className="text-[11px] text-muted-foreground">
                    {summary.next.pace!.daysLeft === 0 ? "vence hoy" : "días"}
                  </p>
                  <p
                    className="line-clamp-2 text-xs font-medium text-foreground"
                    title={summary.next.kr.title}
                  >
                    {summary.next.kr.title}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nada por vencer.</p>
            )}
          </Kpi>
          <Kpi title="Mini-tareas">
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {summary.tasksDone}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {summary.tasksTotal} hechas
              </span>
            </p>
            <GlowBar value={summary.taskPct} color="var(--done)" className="mt-2" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {summary.taskPct}% del avance por tareas, contando el peso de cada una
            </p>
          </Kpi>
        </div>
      </section>

      {objectives.map((obj, oi) => (
        <ObjectiveCard
          key={obj.id}
          obj={obj}
          index={oi}
          boardIndexMap={index}
          krFormOpen={krFormFor === obj.id}
          onOpenKrForm={() => setKrFormFor(obj.id)}
          onCloseKrForm={() => setKrFormFor(null)}
          run={run}
          onCreateBoardTask={onCreateBoardTask}
          onSetBoardTaskDone={onSetBoardTaskDone}
          onSetBoardTaskType={onSetBoardTaskType}
          onStartPomodoro={onStartPomodoro}
          boardTasks={boardTasks}
        />
      ))}

      {objectives.length === 0 && (
        <div className="glass-panel grid place-items-center rounded-2xl px-6 py-14 text-center">
          <Sparkles className="size-8 text-primary" />
          <p className="mt-3 text-base font-semibold text-foreground">Aún no hay objetivos</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Pídeselos a tu IA y tenlos listos en un minuto, con KRs SMART, tareas con tipo y peso.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnPrimary} onClick={() => setAiOpen(true)}>
              <Sparkles className="size-3.5" /> Arma tus OKRs con IA
            </button>
            <button type="button" className={btn} onClick={() => setObjFormOpen(true)}>
              <Plus className="size-3.5" /> Crear a mano
            </button>
          </div>
        </div>
      )}

      <OkrAiDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        current={objectives}
        boardTasks={pending}
        onImport={importOkrs}
      />
    </div>
  );
}

type TaskActions = {
  run: (fn: () => Promise<void>) => Promise<void>;
  onCreateBoardTask: (title: string, type: string | null) => void;
  onSetBoardTaskDone: (title: string, done: boolean) => void;
  onSetBoardTaskType: (title: string, type: string | null) => void;
  onStartPomodoro: (title: string) => void;
};

function ObjectiveCard({
  obj,
  index,
  boardIndexMap,
  boardTasks,
  krFormOpen,
  onOpenKrForm,
  onCloseKrForm,
  ...actions
}: {
  obj: Objective;
  index: number;
  boardIndexMap: Map<string, BoardTaskRef>;
  boardTasks: BoardCard[];
  krFormOpen: boolean;
  onOpenKrForm: () => void;
  onCloseKrForm: () => void;
} & TaskActions) {
  const pct = objectiveProgress(obj);
  const soonest = obj.keyResults
    .map((kr) => krPace(kr))
    .filter((p): p is KrPace => !!p && p.status !== "done")
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];

  return (
    <section className="glass-panel group/obj overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-start gap-4 p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-xs font-bold text-primary">
          O{index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">{obj.title}</h3>
            {obj.period && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {obj.period}
              </span>
            )}
            {soonest && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                <Hourglass className="size-3" style={{ color: PACE[soonest.status].color }} />
                {soonest.daysLeft < 0
                  ? `vencido hace ${-soonest.daysLeft} d`
                  : soonest.daysLeft === 0
                    ? "vence hoy"
                    : `${soonest.daysLeft} días`}
              </span>
            )}
          </div>
          {obj.description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{obj.description}</p>
          )}
          <GlowBar value={pct} className="mt-4" />
        </div>
        <Ring value={pct} size={68} stroke={6} caption="avance" />
        <button
          type="button"
          className={cn(iconBtn, "hover:text-destructive")}
          title="Eliminar objetivo"
          onClick={() => {
            if (confirm(`¿Eliminar el objetivo "${obj.title}" y sus KRs?`))
              void actions.run(() => deleteObjective(obj.id));
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </header>

      <div className="space-y-4 px-5 pb-5">
        {obj.keyResults.map((kr, ki) => (
          <KeyResultCard
            key={kr.id}
            kr={kr}
            code={`KR ${index + 1}.${ki + 1}`}
            boardIndexMap={boardIndexMap}
            boardTasks={boardTasks}
            {...actions}
          />
        ))}

        {krFormOpen ? (
          <KrForm
            initial={emptyDraft}
            heading="Nuevo resultado clave (SMART)"
            submitLabel="Guardar KR"
            onCancel={onCloseKrForm}
            onSubmit={(input) => {
              onCloseKrForm();
              void actions.run(() => createKeyResult(obj.id, input));
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onOpenKrForm}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-3.5" /> Resultado clave
          </button>
        )}
      </div>
    </section>
  );
}

function KeyResultCard({
  kr,
  code,
  boardIndexMap,
  boardTasks,
  ...actions
}: {
  kr: KeyResult;
  code: string;
  boardIndexMap: Map<string, BoardTaskRef>;
  boardTasks: BoardCard[];
} & TaskActions) {
  const [editing, setEditing] = useState(false);

  if (editing)
    return (
      <KrForm
        initial={toDraft(kr)}
        heading="Editar resultado clave"
        submitLabel="Guardar cambios"
        onCancel={() => setEditing(false)}
        onSubmit={(input) => {
          setEditing(false);
          void actions.run(() => updateKeyResult(kr.id, input));
        }}
      />
    );

  const pace = krPace(kr);
  const mp = metricProgress(kr);
  const tp = taskProgress(kr);
  const total = krProgress(kr);
  const down = kr.direction === "down";
  const smart = (
    [
      ["S", "Específico", kr.specific],
      ["M", "Medible", kr.measurable],
      ["A", "Alcanzable", kr.achievable],
      ["R", "Relevante", kr.relevant],
    ] as const
  ).filter(([, , v]) => v.trim());

  return (
    <article className="group/kr grid overflow-hidden rounded-xl border border-border bg-background/50 lg:grid-cols-[230px_1fr]">
      {/* Carril izquierdo: el reloj y la métrica */}
      <aside className="grid content-start gap-6 border-b border-border bg-secondary/25 p-4 sm:grid-cols-2 lg:grid-cols-1 lg:border-r lg:border-b-0">
        <div>
          <StatusPill pace={pace} />
          <div className="mt-3">
            <Countdown kr={kr} pace={pace} />
          </div>
        </div>
        <MetricPanel kr={kr} mp={mp} down={down} run={actions.run} />
      </aside>

      <div className="min-w-0 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              {code}
            </p>
            <h4 className="mt-0.5 text-base leading-snug font-semibold text-foreground">
              {kr.title}
            </h4>
          </div>
          <div className="text-right">
            <p className="text-2xl leading-none font-bold text-foreground tabular-nums">{total}%</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">avance del KR</p>
          </div>
          <div className="flex gap-0.5 opacity-60 transition-opacity group-hover/kr:opacity-100">
            <button
              type="button"
              className={iconBtn}
              title="Editar KR"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className={cn(iconBtn, "hover:text-destructive")}
              title="Eliminar KR"
              onClick={() => {
                if (confirm("¿Eliminar este resultado clave?"))
                  void actions.run(() => deleteKeyResult(kr.id));
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        <GlowBar value={total} className="mt-3" />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Métrica <span className="text-foreground tabular-nums">{mp}%</span>
          {tp !== null && (
            <>
              {" "}
              · tareas <span className="text-foreground tabular-nums">{tp}%</span> (mitad y mitad)
            </>
          )}
        </p>

        {smart.length > 0 && (
          <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {smart.map(([letter, name, text]) => (
              <div key={letter} className="flex gap-2 text-xs">
                <dt
                  title={name}
                  className="grid size-5 shrink-0 place-items-center rounded-md bg-primary/15 text-[10px] font-bold text-primary"
                >
                  {letter}
                </dt>
                <dd className="text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        )}

        <MiniTasks kr={kr} boardIndexMap={boardIndexMap} boardTasks={boardTasks} {...actions} />
      </div>
    </article>
  );
}

/** Valor actual → meta, con su barra y un editor rápido (− / + / escribir). */
function MetricPanel({
  kr,
  mp,
  down,
  run,
}: {
  kr: KeyResult;
  mp: number;
  down: boolean;
  run: TaskActions["run"];
}) {
  const [value, setValue] = useState(String(kr.currentValue));
  useEffect(() => setValue(String(kr.currentValue)), [kr.currentValue]);
  const decimals = [kr.startValue, kr.currentValue, kr.targetValue].some(
    (v) => !Number.isInteger(v),
  );
  const step = decimals ? 0.1 : 1;
  const parsed = Number(value);
  const dirty = value.trim() !== "" && Number.isFinite(parsed) && parsed !== kr.currentValue;

  const save = (v: number) => {
    const clean = Math.round(v * 1000) / 1000;
    setValue(String(clean));
    if (clean !== kr.currentValue) void run(() => updateKeyResult(kr.id, { currentValue: clean }));
  };

  return (
    <div>
      <p className={label}>Métrica</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-foreground">
        <span className="text-2xl font-bold tabular-nums">{kr.currentValue}</span>
        <span className="text-muted-foreground">{down ? "↓" : "→"}</span>
        <span className="text-lg font-semibold tabular-nums">{kr.targetValue}</span>
        <span className="text-xs text-muted-foreground">{kr.unit}</span>
      </p>
      <p className="mb-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        {down ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
        {down ? "Menos es mejor" : "Más es mejor"} · desde {kr.startValue}
      </p>
      <GlowBar value={mp} color="#0e97bb" />
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, "size-8 px-0")}
          aria-label="Restar"
          onClick={() => save((Number.isFinite(parsed) ? parsed : kr.currentValue) - step)}
        >
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          aria-label="Valor actual"
          className={cn(box, "h-8 min-w-0 flex-1 text-center tabular-nums")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save(parsed)}
        />
        <button
          type="button"
          className={cn(btn, "size-8 px-0")}
          aria-label="Sumar"
          onClick={() => save((Number.isFinite(parsed) ? parsed : kr.currentValue) + step)}
        >
          <Plus className="size-3.5" />
        </button>
        {dirty && (
          <button
            type="button"
            className={cn(btnPrimary, "size-8 px-0")}
            aria-label="Guardar valor"
            onClick={() => save(parsed)}
          >
            <Check className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function MiniTasks({
  kr,
  boardIndexMap,
  boardTasks,
  run,
  onCreateBoardTask,
  onSetBoardTaskDone,
  onSetBoardTaskType,
  onStartPomodoro,
}: {
  kr: KeyResult;
  boardIndexMap: Map<string, BoardTaskRef>;
  boardTasks: BoardCard[];
} & TaskActions) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [weight, setWeight] = useState(1);
  const [linkExisting, setLinkExisting] = useState(false);
  const doneCount = kr.tasks.filter((t) => t.done).length;
  const tp = taskProgress(kr);

  function toggle(t: KrTask, done: boolean) {
    const card = boardTaskOf(boardIndexMap, t);
    // La tarjeta del tablero manda: se mueve a Hecho (o sale de ahí) y la mini-tarea la sigue.
    if (card) onSetBoardTaskDone(card.title, done);
    void run(() => setKrTaskDone(t.id, done));
  }

  function changeType(t: KrTask, next: string | null) {
    const card = boardTaskOf(boardIndexMap, t);
    if (card) onSetBoardTaskType(card.title, next);
    void run(() => updateKrTask(t.id, { type: next }));
  }

  function add() {
    const clean = title.trim();
    if (!clean) return;
    const existing = boardIndexMap.get(sameText(clean));
    const finalTitle = existing?.title ?? clean;
    const finalType = existing ? existing.type : type;
    if (!existing) onCreateBoardTask(clean, type);
    setTitle("");
    void run(() => createKrTask(kr.id, finalTitle, finalTitle, { weight, type: finalType }));
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="size-3.5 text-muted-foreground" />
        <p className={label}>Mini-tareas</p>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {doneCount}/{kr.tasks.length}
          {tp !== null && ` · ${tp}% ponderado`}
        </span>
      </div>

      {kr.tasks.length > 0 && (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
          {kr.tasks.map((t) => {
            const card = boardTaskOf(boardIndexMap, t);
            const pill = card ? COLUMN_PILL[card.column] : null;
            return (
              <li
                key={t.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 transition-colors hover:bg-secondary/30",
                  t.done && "bg-done/[0.04]",
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? "Marcar como pendiente" : "Marcar como hecha"}
                  onClick={() => toggle(t, !t.done)}
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-md border transition-all",
                    t.done
                      ? "scale-100 border-done bg-done text-background shadow-[0_0_10px_-2px_var(--done)]"
                      : "border-muted-foreground/50 hover:border-primary",
                  )}
                >
                  {t.done && <Check className="size-3" strokeWidth={3} />}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 basis-48 text-sm",
                    t.done ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {t.title}
                </span>
                <div className="flex items-center gap-2">
                  <TypeSelect value={t.type} onChange={(next) => changeType(t, next)} />
                  {pill ? (
                    <span
                      className="hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline"
                      style={{
                        color: pill.color,
                        backgroundColor: `color-mix(in oklab, ${pill.color} 12%, transparent)`,
                      }}
                      title="Columna de la tarjeta en el tablero"
                    >
                      {pill.text}
                    </span>
                  ) : (
                    <span
                      className="hidden text-[10px] text-muted-foreground/70 sm:inline"
                      title="No hay una tarjeta con este título en el tablero"
                    >
                      fuera del tablero
                    </span>
                  )}
                  <WeightPicker
                    value={t.weight}
                    onChange={(w) => void run(() => updateKrTask(t.id, { weight: w }))}
                  />
                  <span
                    className="w-9 text-right text-[10px] text-muted-foreground tabular-nums"
                    title="Parte del avance por tareas que da esta tarea"
                  >
                    {taskShare(kr, t)}%
                  </span>
                  <button
                    type="button"
                    className={cn(iconBtn, "size-6 hover:text-primary")}
                    title="Iniciar pomodoro"
                    onClick={() => onStartPomodoro(card?.title ?? (t.boardTaskTitle || t.title))}
                  >
                    <Timer className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn(iconBtn, "size-6 hover:text-destructive")}
                    title="Quitar del KR (la tarjeta sigue en el tablero)"
                    onClick={() => void run(() => deleteKrTask(t.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={cn(box, "h-8 min-w-0 flex-1 basis-56")}
          list={linkExisting ? `board-tasks-${kr.id}` : undefined}
          placeholder={
            linkExisting
              ? "Busca una tarea del tablero…"
              : "Nueva mini-tarea (se crea en Por Hacer)"
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {linkExisting && (
          <datalist id={`board-tasks-${kr.id}`}>
            {boardTasks.map((t) => (
              <option key={`${t.column}-${t.title}`} value={t.title}>
                {COLUMN_PILL[t.column].text}
              </option>
            ))}
          </datalist>
        )}
        {!linkExisting && (
          <>
            <TypeSelect value={type} onChange={setType} className="h-8 py-0 text-[11px]" />
            <div className="flex h-8 items-center gap-1.5 rounded-md bg-secondary/60 px-2">
              <span className="text-[10px] text-muted-foreground">Peso</span>
              <WeightPicker value={weight} onChange={setWeight} />
            </div>
          </>
        )}
        <button type="submit" className={cn(btnPrimary, "h-8")}>
          <Plus className="size-3.5" /> Añadir
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setLinkExisting((v) => !v)}
        >
          <Link2 className="size-3" />
          {linkExisting ? "Crear tarea nueva" : "Vincular tarea existente"}
        </button>
      </form>
    </div>
  );
}

const DIRECTIONS = [
  { dir: "up", Icon: ArrowUp, text: "Más es mejor", hint: "ventas, videos, clientes" },
  { dir: "down", Icon: ArrowDown, text: "Menos es mejor", hint: "ranking, costos, tiempos" },
] as const;

function KrForm({
  initial,
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: KrDraft;
  heading: string;
  submitLabel: string;
  onSubmit: (input: KeyResultInput) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<KrDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? fallback : n;
  };
  const current = num(draft.currentValue, 0);
  const start = num(draft.startValue, current);
  const target = num(draft.targetValue, 100);
  const down = draft.direction === "down";

  // La meta tiene que quedar del lado correcto del inicio; si no, el avance no tiene sentido.
  const wrongSide = down ? target > start : target < start;
  const problem =
    target === start
      ? "La meta tiene que ser distinta del valor inicial."
      : wrongSide
        ? down
          ? `Para bajar, la meta (${target}) debe quedar por debajo del inicio (${start}).`
          : `La meta (${target}) está por debajo del inicio (${start}): eso es bajar.`
        : null;

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-background/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{heading}</span>
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-foreground"
          title="Cancelar"
          onClick={onCancel}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-2">
        <div>
          <span className={label}>Resultado clave</span>
          <input
            className={box}
            placeholder="Ej. Publicar 20 videos de módulos antes de junio"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["specific", "S · Específico", "¿Qué exactamente?"],
              ["measurable", "M · Medible", "¿Cómo se mide?"],
              ["achievable", "A · Alcanzable", "¿Con qué recursos?"],
              ["relevant", "R · Relevante", "¿Por qué importa?"],
            ] as const
          ).map(([key, text, ph]) => (
            <div key={key}>
              <span className={label}>{text}</span>
              <input
                className={box}
                placeholder={ph}
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <span className={label}>T · Con plazo (fecha límite)</span>
            <input
              type="date"
              className={box}
              value={draft.dueDate ?? ""}
              onChange={(e) => set({ dueDate: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <span className={label}>Dirección de la métrica</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Dirección de la métrica"
              className="inline-flex overflow-hidden rounded-md border border-border"
            >
              {DIRECTIONS.map(({ dir, Icon, text }) => (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={draft.direction === dir}
                  onClick={() => set({ direction: dir })}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    draft.direction === dir
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" /> {text}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Ej. {DIRECTIONS.find((d) => d.dir === draft.direction)?.hint}
              {down ? ": el avance crece mientras el número baja." : "."}
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <span className={label}>Inicial</span>
            <input
              type="number"
              className={box}
              placeholder={`= actual (${current})`}
              value={draft.startValue}
              onChange={(e) => set({ startValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Actual</span>
            <input
              type="number"
              className={box}
              value={draft.currentValue}
              onChange={(e) => set({ currentValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Meta</span>
            <input
              type="number"
              className={box}
              value={draft.targetValue}
              onChange={(e) => set({ targetValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Unidad</span>
            <input
              className={box}
              placeholder="videos, %, USD"
              value={draft.unit}
              onChange={(e) => set({ unit: e.target.value })}
            />
          </div>
        </div>

        {problem && (
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-destructive">
            ⚠︎ {problem}
            {wrongSide && (
              <button
                type="button"
                className={btn}
                onClick={() => set({ direction: down ? "up" : "down" })}
              >
                {down ? "Usar ↑ Más es mejor" : "Usar ↓ Menos es mejor"}
              </button>
            )}
          </p>
        )}

        <button
          type="button"
          disabled={!!problem}
          className={`${btnPrimary} justify-self-start disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => {
            const title = draft.title.trim();
            if (!title) return;
            onSubmit({
              ...draft,
              title,
              startValue: start,
              currentValue: current,
              targetValue: target,
            });
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
