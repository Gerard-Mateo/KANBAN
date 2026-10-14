import { useId, useRef, useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarCheck2, GripVertical, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomType } from "@/lib/custom-types";
import type { ColumnId, TaskGoal } from "@/lib/kanban-data";
import { typeOf } from "@/lib/task-stats";
import { addDays, diffDays, fromIso, runContaining, weekOf, type IsoDay } from "@/lib/calendar";
import {
  barColors,
  dayList,
  longDate,
  relativeDay,
  STATUS_LABEL,
  WEEKDAYS,
  type Item,
} from "./calendar-ui";
import { StatusCheck } from "./StatusCheck";

/** Arrastrar una tarea de la vista de día mueve solo ese día suyo. */
export type OccDrag = {
  kind: "occ";
  taskId: string;
  day: IsoDay;
  /** Su grupo (estado): se reordena dentro de él. */
  group: ColumnId;
  measure: () => DOMRect | null;
};
const GROUP_LABEL: Record<ColumnId, string> = {
  doing: "En progreso",
  todo: "Por hacer",
  done: "Hechas",
};
const SUMMARY_LABEL: Record<ColumnId, string> = {
  todo: "por hacer",
  doing: "en progreso",
  done: "hechas",
};
const PENDING_FILL = "oklch(0.42 0.02 264)";

/* -------------------------------- Tooltip -------------------------------- */

type Tip = { x: number; y: number; text: string } | null;

/** Un tooltip propio (más rápido y legible que el `title` del navegador). */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, text }),
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, text }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] max-w-72 rounded-md border border-border bg-card px-2 py-1 text-[11px] whitespace-pre-line text-foreground shadow-[0_6px_20px_oklch(0_0_0_/_0.55)]"
      style={{ left: tip.x + 14, top: tip.y + 14 }}
    >
      {tip.text}
    </div>
  ) : null;
  return { bind, node };
}

type Bind = ReturnType<typeof useTip>["bind"];

/* ---------------------------------- Vista --------------------------------- */

export function DayView({
  day,
  today,
  items,
  customTypes,
  preview,
  draggingTaskId,
  onGoto,
  onOpenTask,
  onToggleDone,
  onStartPomodoro,
  onSetDays,
}: {
  day: IsoDay;
  today: IsoDay;
  items: Item[];
  customTypes: CustomType[];
  /** Días que recibirían lo que se arrastra (resalta la tira de la semana). */
  preview: Set<IsoDay> | null;
  draggingTaskId: string | null;
  onGoto: (day: IsoDay) => void;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onStartPomodoro: (id: string) => void;
  onSetDays: (taskId: string, days: IsoDay[]) => void;
}) {
  const tip = useTip();
  const planned = dayList(items, day);
  const count = (c: ColumnId) => planned.filter((p) => p.col === c).length;
  const done = count("done");
  const total = planned.length;
  const left = total - done;
  const past = day < today;

  // Hoy: lo que quedó pendiente de días anteriores y no tiene día nuevo.
  const overdue =
    day === today
      ? items.filter(
          (i) =>
            i.col !== "done" &&
            (i.task.days?.length ?? 0) > 0 &&
            !i.task.days!.some((d) => d >= today),
        )
      : [];

  const message =
    total === 0
      ? past
        ? "No había nada planificado este día."
        : "Día libre: arrastra tareas desde la lista de abajo para planificarlo."
      : left === 0
        ? "Día completo: todo lo planificado está hecho."
        : past
          ? `Quedaron ${left} sin terminar de ${total}.`
          : `Te quedan ${left} de ${total}.`;

  const removeDay = (taskId: string) => {
    const days = items.find((i) => i.task.id === taskId)?.task.days ?? [];
    onSetDays(
      taskId,
      days.filter((d) => d !== day),
    );
  };

  return (
    <div className="space-y-4">
      <WeekStrip day={day} today={today} items={items} preview={preview} onGoto={onGoto} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <section
            className="relative overflow-hidden rounded-2xl border border-border bg-card/50 p-5"
            style={{
              backgroundImage:
                "radial-gradient(120% 140% at 0% 0%, color-mix(in oklch, var(--primary) 11%, transparent), transparent 55%)",
            }}
          >
            <div className="flex flex-wrap items-center gap-6">
              <DayRing planned={planned} bind={tip.bind} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                  {relativeDay(day, today)}
                </p>
                <h2 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
                  {longDate(day, today)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                {total > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["todo", "doing", "done"] as const).map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <StatusCheck col={c} accent="currentColor" size={11} />
                        <span className="font-semibold text-foreground tabular-nums">
                          {count(c)}
                        </span>
                        {SUMMARY_LABEL[c]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <DayDrop day={day} empty={total === 0} past={past}>
            {(["doing", "todo", "done"] as const).map((c) => {
              const list = planned.filter((p) => p.col === c);
              if (list.length === 0) return null;
              return (
                <div key={c}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <StatusCheck col={c} accent="currentColor" size={10} />
                    {GROUP_LABEL[c]} · {list.length}
                  </p>
                  {/* Arrastrar una tarjeta arriba o abajo la reordena en su grupo. */}
                  <SortableContext
                    items={list.map((it) => `occ:${it.task.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1.5">
                      {list.map((it) => (
                        <DayCard
                          key={it.task.id}
                          item={it}
                          day={day}
                          customTypes={customTypes}
                          dimmed={draggingTaskId === it.task.id}
                          onOpen={onOpenTask}
                          onToggleDone={onToggleDone}
                          onStartPomodoro={onStartPomodoro}
                          onRemoveDay={removeDay}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </DayDrop>

          {overdue.length > 0 && (
            <Overdue
              items={overdue}
              today={today}
              customTypes={customTypes}
              onMoveToday={(it) => onSetDays(it.task.id, [...(it.task.days ?? []), today])}
            />
          )}
        </div>

        <aside className="space-y-4">
          <ChartCard title="Esta semana" hint="Tareas planificadas por día y cuántas se hicieron.">
            <WeekBars day={day} items={items} onGoto={onGoto} bind={tip.bind} />
          </ChartCard>
          <ChartCard
            title="Ritmo del día"
            hint="Cómo se fueron completando las tareas del día, hora a hora."
          >
            <DayPace day={day} today={today} planned={planned} bind={tip.bind} />
          </ChartCard>
          <ChartCard title="Por tipo" hint="Lo hecho de cada tipo en este día.">
            <TypeProgress planned={planned} customTypes={customTypes} bind={tip.bind} />
          </ChartCard>
        </aside>
      </div>
      {tip.node}
    </div>
  );
}

/* -------------------------- Tira de la semana ------------------------------ */

function WeekStrip({
  day,
  today,
  items,
  preview,
  onGoto,
}: {
  day: IsoDay;
  today: IsoDay;
  items: Item[];
  preview: Set<IsoDay> | null;
  onGoto: (day: IsoDay) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {weekOf(day).map((d, i) => (
        <StripDay
          key={d}
          d={d}
          label={WEEKDAYS[i]!}
          current={d === day}
          isToday={d === today}
          items={items.filter((it) => it.task.days?.includes(d))}
          highlighted={preview?.has(d) ?? false}
          onGoto={onGoto}
        />
      ))}
    </div>
  );
}

function StripDay({
  d,
  label,
  current,
  isToday,
  items,
  highlighted,
  onGoto,
}: {
  d: IsoDay;
  label: string;
  current: boolean;
  isToday: boolean;
  items: Item[];
  highlighted: boolean;
  onGoto: (day: IsoDay) => void;
}) {
  // Soltar una tarea sobre otro día de la tira la cambia a ese día.
  const { setNodeRef, isOver } = useDroppable({
    id: current ? "strip-current" : `day:${d}`,
    disabled: current,
  });
  const total = items.length;
  const done = items.filter((i) => i.col === "done").length;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onGoto(d)}
      aria-current={current ? "date" : undefined}
      title={
        current
          ? undefined
          : `Ir al ${label.toLowerCase()} ${fromIso(d).getDate()} · o suelta aquí una tarea para pasarla a ese día`
      }
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors",
        current
          ? "border-primary/60 bg-primary/10"
          : "border-border/70 bg-card/40 hover:border-border hover:bg-card/70",
        (highlighted || isOver) && !current && "border-primary bg-primary/15",
      )}
    >
      <span className="flex w-full items-baseline gap-1.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            "inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums",
            isToday ? "bg-primary text-primary-foreground" : "text-foreground",
          )}
        >
          {fromIso(d).getDate()}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {total ? `${done}/${total}` : ""}
        </span>
      </span>
      <span
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ background: total ? PENDING_FILL : "transparent" }}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: total ? `${(done / total) * 100}%` : 0, background: "var(--done)" }}
        />
      </span>
    </button>
  );
}

/* --------------------------------- Anillo --------------------------------- */

/** Un aro de neón que se llena con lo hecho del día (verde al completarlo). */
function DayRing({ planned, bind }: { planned: Item[]; bind: Bind }) {
  const glowId = `neon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const size = 132;
  const r = 54;
  const sw = 8;
  const c = 2 * Math.PI * r;
  const n = planned.length;
  const done = planned.filter((p) => p.col === "done").length;
  const doing = planned.filter((p) => p.col === "doing").length;
  const pct = n ? Math.round((done / n) * 100) : 0;
  const color = n > 0 && done === n ? "var(--done)" : "var(--primary)";
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      {...bind(
        n ? `${done} de ${n} hechas${doing ? ` · ${doing} en progreso` : ""}` : "Nada planificado",
      )}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        overflow="visible"
        role="img"
        aria-label={`${done} de ${n} tareas hechas`}
      >
        <defs>
          {/* Dos halos difuminados bajo el trazo: el brillo de neón. */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="near" />
            <feGaussianBlur stdDeviation="7" result="far" />
            <feMerge>
              <feMergeNode in="far" />
              <feMergeNode in="near" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          opacity={0.12}
          style={{ transition: "stroke 500ms" }}
        />
        {done > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - done / n)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            filter={`url(#${glowId})`}
            style={{
              transition: "stroke-dashoffset 700ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 500ms",
            }}
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {n ? `${pct}%` : "—"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {n ? `${done} de ${n} hechas` : "sin tareas"}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- Tareas --------------------------------- */

function DayDrop({
  day,
  empty,
  past,
  children,
}: {
  day: IsoDay;
  empty: boolean;
  past: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "space-y-4 rounded-2xl border border-transparent p-1 transition-colors",
        isOver && "border-primary/60 bg-primary/5",
      )}
    >
      {empty ? (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-center">
          <div>
            <CalendarCheck2 className="mx-auto size-6 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">
              {past ? "Nada planificado." : "Suelta aquí tareas de la lista de abajo."}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function DayCard({
  item,
  day,
  customTypes,
  dimmed,
  onOpen,
  onToggleDone,
  onStartPomodoro,
  onRemoveDay,
}: {
  item: Item;
  day: IsoDay;
  customTypes: CustomType[];
  dimmed: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
  onStartPomodoro: (id: string) => void;
  onRemoveDay: (id: string) => void;
}) {
  const { task, col } = item;
  const node = useRef<HTMLDivElement | null>(null);
  const data: OccDrag = {
    kind: "occ",
    taskId: task.id,
    day,
    group: col,
    measure: () => node.current?.getBoundingClientRect() ?? null,
  };
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: `occ:${task.id}`,
    data,
  });
  return (
    <div
      ref={(el) => {
        node.current = el;
        setNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onOpen(task.id)}
      title="Doble clic para ver detalles · arrástrala arriba o abajo para reordenar, o a otro día de la tira para moverla"
      className={cn(
        "cursor-grab rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing",
        dimmed && "opacity-35",
      )}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <DayCardBody
        item={item}
        day={day}
        customTypes={customTypes}
        onToggleDone={onToggleDone}
        onStartPomodoro={onStartPomodoro}
        onRemoveDay={onRemoveDay}
      />
    </div>
  );
}

/** La tarjeta en sí; sin manejadores es la que vuela al arrastrar. */
export function DayCardBody({
  item,
  day,
  customTypes,
  lifted,
  onToggleDone,
  onStartPomodoro,
  onRemoveDay,
}: {
  item: Item;
  day: IsoDay;
  customTypes: CustomType[];
  lifted?: boolean;
  onToggleDone?: (id: string) => void;
  onStartPomodoro?: (id: string) => void;
  onRemoveDay?: (id: string) => void;
}) {
  const { task, col } = item;
  const { style, accent } = barColors(task, customTypes);
  const type = typeOf(task);
  const days = task.days ?? [];
  const run = runContaining(days, day);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const action =
    "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border border-border/60 bg-card/70 py-2.5 pr-2 pl-3.5 transition-[border-color,background-color] hover:border-border hover:bg-card",
        lifted && "border-primary bg-card",
      )}
      style={{
        boxShadow: lifted
          ? `inset 3px 0 0 ${accent}, 0 12px 32px oklch(0 0 0 / 0.6)`
          : `inset 3px 0 0 ${accent}`,
      }}
    >
      <GripVertical className="absolute top-1/2 left-0.5 size-3 -translate-y-1/2 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
      <div className="pt-0.5">
        <StatusCheck
          col={col}
          accent={accent}
          size={18}
          onToggle={onToggleDone && (() => onToggleDone(task.id))}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug font-medium text-foreground",
            col === "done" && "text-muted-foreground line-through decoration-muted-foreground/60",
          )}
        >
          {task.title || "(sin título)"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={style}>
            {type.label}
          </span>
          {run.length > 1 && <RunDots run={run} day={day} accent={accent} />}
          {days.length > run.length && <span>{days.length} días en total</span>}
          {task.goal && <GoalMini goal={task.goal} accent={accent} />}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
          lifted && "hidden",
        )}
      >
        {col !== "done" && onStartPomodoro && (
          <button
            type="button"
            title="Iniciar pomodoro"
            aria-label="Iniciar pomodoro"
            onPointerDown={stop}
            onDoubleClick={stop}
            onClick={() => onStartPomodoro(task.id)}
            className={action}
          >
            <Timer className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="Quitar de este día"
          aria-label="Quitar de este día"
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={() => onRemoveDay?.(task.id)}
          className={action}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** "Día 2 de 3" con un puntito por día del tramo. */
function RunDots({ run, day, accent }: { run: IsoDay[]; day: IsoDay; accent: string }) {
  const idx = run.indexOf(day);
  return (
    <span className="inline-flex items-center gap-1.5">
      Día {idx + 1} de {run.length}
      {run.length <= 10 && (
        <span className="inline-flex gap-[3px]">
          {run.map((d, i) => (
            <span
              key={d}
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: i <= idx ? accent : "transparent",
                boxShadow: `inset 0 0 0 1px ${accent}`,
                opacity: i === idx ? 1 : 0.7,
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

function GoalMini({ goal, accent }: { goal: TaskGoal; accent: string }) {
  const pct = Math.min(100, (goal.current / goal.target) * 100);
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span
        className="h-1 w-12 overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklch, ${accent} 18%, transparent)` }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: accent }}
        />
      </span>
      {goal.current}/{goal.target}
    </span>
  );
}

function Overdue({
  items,
  today,
  customTypes,
  onMoveToday,
}: {
  items: Item[];
  today: IsoDay;
  customTypes: CustomType[];
  onMoveToday: (item: Item) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <section className="rounded-2xl border border-dashed border-border p-3">
      <p className="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Pendientes de días anteriores · {items.length}
      </p>
      <div className="space-y-1">
        {shown.map((it) => {
          const { accent } = barColors(it.task, customTypes);
          const last = [...(it.task.days ?? [])].sort().at(-1)!;
          return (
            <div
              key={it.task.id}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-card/60"
            >
              <StatusCheck col={it.col} accent={accent} size={12} />
              <span className="min-w-0 truncate text-foreground">
                {it.task.title || "(sin título)"}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {relativeDay(last, today).toLowerCase()}
              </span>
              <button
                type="button"
                onClick={() => onMoveToday(it)}
                className="ml-auto shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
              >
                Pasar a hoy
              </button>
            </div>
          );
        })}
      </div>
      {items.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Ver {items.length - shown.length} más
        </button>
      )}
    </section>
  );
}

/* --------------------------------- Gráficas -------------------------------- */

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Barras apiladas de la semana: hechas abajo (verde) y pendientes encima. */
function WeekBars({
  day,
  items,
  onGoto,
  bind,
}: {
  day: IsoDay;
  items: Item[];
  onGoto: (day: IsoDay) => void;
  bind: Bind;
}) {
  const week = weekOf(day);
  const stats = week.map((d) => {
    const p = items.filter((i) => i.task.days?.includes(d));
    return { d, total: p.length, done: p.filter((i) => i.col === "done").length };
  });
  const max = Math.max(1, ...stats.map((s) => s.total));
  const H = 84;
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: H + 18 }}>
        {stats.map((s, i) => {
          const h = s.total ? Math.max(6, (s.total / max) * H) : 2;
          const label = fromIso(s.d).toLocaleDateString("es", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          return (
            <button
              key={s.d}
              type="button"
              onClick={() => onGoto(s.d)}
              aria-label={`${label}: ${s.done} de ${s.total} hechas`}
              {...bind(
                s.total ? `${label}\n${s.done} de ${s.total} hechas` : `${label}\nNada planificado`,
              )}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  s.d === day ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {s.total || ""}
              </span>
              <span
                className={cn(
                  "flex w-full max-w-7 flex-col justify-end overflow-hidden rounded-t-[4px] transition-[height] duration-500",
                  s.d === day && "ring-1 ring-primary ring-offset-2 ring-offset-card",
                )}
                style={{ height: h, gap: s.done && s.done < s.total ? 2 : 0 }}
              >
                {s.total === 0 ? (
                  <span className="h-full bg-border" />
                ) : (
                  <>
                    <span style={{ flexGrow: s.total - s.done, background: PENDING_FILL }} />
                    <span style={{ flexGrow: s.done, background: "var(--done)" }} />
                  </>
                )}
              </span>
              <span
                className={cn(
                  "text-[10px]",
                  s.d === day ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {WEEKDAYS[i]!.charAt(0)}
              </span>
            </button>
          );
        })}
      </div>
      <Legend
        items={[
          {
            label: "Hechas",
            swatch: <span className="size-2 rounded-[2px]" style={{ background: "var(--done)" }} />,
          },
          {
            label: "Pendientes",
            swatch: <span className="size-2 rounded-[2px]" style={{ background: PENDING_FILL }} />,
          },
        ]}
      />
    </div>
  );
}

type PaceEvent = { at: number; kind: "done" | "undo" | "start"; title: string };

/** Escalera de tareas hechas a lo largo del día, a partir del historial de
 * movimientos de cada tarea (no son horas planificadas: es lo que pasó). */
function DayPace({
  day,
  today,
  planned,
  bind,
}: {
  day: IsoDay;
  today: IsoDay;
  planned: Item[];
  bind: Bind;
}) {
  const start = fromIso(day).getTime();
  const end = fromIso(addDays(day, 1)).getTime();
  const events: PaceEvent[] = [];
  let initial = 0;
  for (const { task } of planned) {
    let doneAtStart = false;
    const title = task.title || "(sin título)";
    for (const ev of task.history ?? []) {
      if (ev.at < start) doneAtStart = ev.to === "done";
      else if (ev.at < end) {
        if (ev.to === "done") events.push({ at: ev.at, kind: "done", title });
        else if (ev.from === "done") events.push({ at: ev.at, kind: "undo", title });
        if (ev.to === "doing") events.push({ at: ev.at, kind: "start", title });
      }
    }
    if (doneAtStart) initial += 1;
  }
  events.sort((a, b) => a.at - b.at);

  if (diffDays(day, today) > 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Este día aún no llega.</p>;
  }

  const W = 300;
  const H = 120;
  const padL = 22;
  const padB = 18;
  const padT = 10;
  const hourOf = (t: number) => (t - start) / 3_600_000;
  const firstHour = events.length ? Math.floor(hourOf(events[0]!.at)) : 6;
  const h0 = Math.max(0, Math.min(6, firstHour));
  const isToday = day === today;
  const nowHour = isToday ? hourOf(Date.now()) : 24;
  const lastHour = events.length ? hourOf(events[events.length - 1]!.at) : h0;
  const endHour = isToday ? Math.min(24, Math.max(nowHour, lastHour, h0 + 1)) : 24;

  let value = initial;
  let peak = initial;
  const steps: { h: number; v: number; ev: PaceEvent }[] = [];
  for (const ev of events) {
    if (ev.kind === "done") value += 1;
    else if (ev.kind === "undo") value = Math.max(0, value - 1);
    peak = Math.max(peak, value);
    steps.push({ h: hourOf(ev.at), v: value, ev });
  }
  const yMax = Math.max(1, planned.length, peak);
  const x = (h: number) => padL + ((h - h0) / (24 - h0)) * (W - padL - 4);
  const y = (v: number) => H - padB - (v / yMax) * (H - padB - padT);

  let path = `M ${x(h0)} ${y(initial)}`;
  for (const s of steps.filter((s) => s.ev.kind !== "start")) path += ` H ${x(s.h)} V ${y(s.v)}`;
  path += ` H ${x(endHour)}`;
  const area = `${path} V ${y(0)} H ${x(h0)} Z`;
  const ticks = [6, 12, 18, 24].filter((t) => t > h0);
  const clock = (t: number) =>
    new Date(t).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Tareas hechas a lo largo del día"
      >
        <line x1={padL} x2={W - 4} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {planned.length > 0 && (
          <>
            <line
              x1={padL}
              x2={W - 4}
              y1={y(planned.length)}
              y2={y(planned.length)}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 4"
              opacity={0.5}
            />
            <text x={2} y={y(planned.length) + 3} fontSize={9} fill="var(--muted-foreground)">
              {planned.length}
            </text>
          </>
        )}
        <text x={2} y={y(0) + 3} fontSize={9} fill="var(--muted-foreground)">
          0
        </text>
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            fontSize={9}
            textAnchor={t === 24 ? "end" : "middle"}
            fill="var(--muted-foreground)"
          >
            {t === 24 ? "24 h" : `${t} h`}
          </text>
        ))}
        <path d={area} fill="var(--done)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--done)" strokeWidth={2} strokeLinejoin="round" />
        {isToday && nowHour > h0 && nowHour < 24 && (
          <>
            <line
              x1={x(nowHour)}
              x2={x(nowHour)}
              y1={padT}
              y2={y(0)}
              stroke="var(--primary)"
              strokeDasharray="2 3"
            />
            <text
              x={x(nowHour)}
              y={padT - 2}
              fontSize={8}
              textAnchor="middle"
              fill="var(--primary)"
            >
              ahora
            </text>
          </>
        )}
        {steps.map((s, i) =>
          s.ev.kind === "start" ? (
            <circle
              key={i}
              cx={x(s.h)}
              cy={y(0)}
              r={3}
              fill="var(--card)"
              stroke="var(--doing)"
              strokeWidth={1.5}
              {...bind(`${clock(s.ev.at)} · empezó\n${s.ev.title}`)}
            />
          ) : (
            <circle
              key={i}
              cx={x(s.h)}
              cy={y(s.v)}
              r={s.ev.kind === "done" ? 4 : 3}
              fill={s.ev.kind === "done" ? "var(--done)" : "var(--card)"}
              stroke={s.ev.kind === "done" ? "var(--card)" : "var(--muted-foreground)"}
              strokeWidth={2}
              {...bind(
                `${clock(s.ev.at)} · ${s.ev.kind === "done" ? "hecha" : "la devolviste"}\n${s.ev.title}`,
              )}
            />
          ),
        )}
        {events.length === 0 && (
          <text
            x={(padL + W) / 2}
            y={(padT + H - padB) / 2}
            fontSize={10}
            textAnchor="middle"
            fill="var(--muted-foreground)"
          >
            Sin movimientos registrados este día
          </text>
        )}
      </svg>
      <Legend
        items={[
          {
            label: "Hecha",
            swatch: <span className="size-2 rounded-full" style={{ background: "var(--done)" }} />,
          },
          {
            label: "Empezada",
            swatch: (
              <span
                className="size-2 rounded-full"
                style={{ boxShadow: "inset 0 0 0 1.5px var(--doing)" }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function TypeProgress({
  planned,
  customTypes,
  bind,
}: {
  planned: Item[];
  customTypes: CustomType[];
  bind: Bind;
}) {
  const rows = new Map<
    string,
    { label: string; accent: string; total: number; done: number; doing: number }
  >();
  for (const it of planned) {
    const { id, label } = typeOf(it.task);
    const row = rows.get(id) ?? {
      label,
      accent: barColors(it.task, customTypes).accent,
      total: 0,
      done: 0,
      doing: 0,
    };
    row.total += 1;
    if (it.col === "done") row.done += 1;
    if (it.col === "doing") row.doing += 1;
    rows.set(id, row);
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  if (list.length === 0)
    return <p className="py-3 text-center text-xs text-muted-foreground">Nada planificado.</p>;
  return (
    <div className="space-y-3">
      {list.map((r) => (
        <div
          key={r.label}
          {...bind(`${r.label}\n${r.done} hechas · ${r.doing} en progreso · ${r.total} en total`)}
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs">
            <span className="size-2 rounded-full" style={{ backgroundColor: r.accent }} />
            <span className="truncate text-foreground">{r.label}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {r.done}/{r.total}
            </span>
          </div>
          <div
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
            style={{ background: `color-mix(in oklch, ${r.accent} 16%, transparent)` }}
          >
            <span
              className="rounded-full transition-[width] duration-500"
              style={{ width: `${(r.done / r.total) * 100}%`, background: r.accent }}
            />
            <span
              className="rounded-full transition-[width] duration-500"
              style={{
                width: `${(r.doing / r.total) * 100}%`,
                background: r.accent,
                opacity: 0.45,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
