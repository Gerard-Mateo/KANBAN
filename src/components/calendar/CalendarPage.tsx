import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Maximize2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMNS, type BoardState, type ColumnId } from "@/lib/kanban-data";
import { useCustomTypes, type CustomType } from "@/lib/custom-types";
import {
  addDays,
  diffDays,
  fromIso,
  layoutWeek,
  monthWeeks,
  rangeDays,
  replaceDays,
  runsOf,
  toIso,
  todayIso,
  weekOf,
  type IsoDay,
  type WeekSegment,
} from "@/lib/calendar";
import {
  barColors,
  cap,
  dayAt,
  edgeShadow,
  plannedAhead,
  STATUS_LABEL,
  WEEKDAYS,
  type Item,
} from "./calendar-ui";
import { StatusCheck } from "./StatusCheck";
import { DayView, type OccDrag } from "./DayView";

type View = "month" | "week" | "day";
type RunRef = { taskId: string; run: IsoDay[] };

type DragData =
  | { kind: "task"; taskId: string }
  | {
      kind: "run";
      taskId: string;
      run: IsoDay[];
      /** Primer día del tramo visible en esa semana y cuántos días se ven. */
      firstShown: IsoDay;
      shownDays: number;
      /** dnd-kit aún no ha medido la barra al empezar: se mide aquí. */
      measure: () => DOMRect | null;
    }
  | OccDrag;

/** Lo que se arrastra: el día del tramo que quedó bajo el puntero y, si era
 * parte de una selección, todo el grupo que viaja con él. */
type Drag = DragData & {
  grabDay: IsoDay | null;
  width: number | null;
  /** Tramos seleccionados que se mueven juntos (incluye el arrastrado). */
  runs: RunRef[] | null;
  /** Tareas de la lista seleccionadas que se sueltan juntas. */
  taskIds: string[] | null;
};

type Resize = { taskId: string; run: IsoDay[]; edge: "start" | "end"; base: IsoDay[] };
type Box = { left: number; top: number; right: number; bottom: number };

const VIEW_KEY = "kanban-calendar-view";

// Medidas de la rejilla: cabecera del día y alto de cada carril de barras.
const SIZES = {
  month: { head: 26, lane: 22, more: 18 },
  week: { head: 40, lane: 30, more: 18 },
} as const;
const LANE_GAP = 3;
/** Cuánto más ancho es el día enfocado que los demás en la vista de semana. */
const FOCUS_SPAN = 2.2;
// Lo que ocupan la cabecera de la página, los controles y la lista de abajo.
const CHROME_PX = 360;

const runKey = (taskId: string, start: IsoDay) => `run:${taskId}:${start}`;
const chipKey = (taskId: string) => `task:${taskId}`;
const isTyping = (el: Element | null) =>
  !!el?.closest("input, textarea, select, [contenteditable='true']");

function monthLabel(anchor: IsoDay) {
  return cap(fromIso(anchor).toLocaleDateString("es", { month: "long", year: "numeric" }));
}

function weekLabel(week: IsoDay[]) {
  const a = fromIso(week[0]!);
  const b = fromIso(week[6]!);
  const month = (d: Date) => d.toLocaleDateString("es", { month: "short" }).replace(".", "");
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
}

function byTask(runs: RunRef[]): Map<string, IsoDay[]> {
  const out = new Map<string, IsoDay[]>();
  for (const r of runs) out.set(r.taskId, [...(out.get(r.taskId) ?? []), ...r.run]);
  return out;
}

const HINTS: Record<View, string> = {
  month:
    "Clic en un día para acercarte · arrastra en vacío para seleccionar varias · estira las barras por sus bordes · Ctrl al soltar copia",
  week: "Clic en un día para enfocarlo y en su número para abrirlo · arrastra en vacío para seleccionar varias · Supr las quita",
  day: "Arrastra una tarea a otro día de la semana para moverla · ← → cambian de día",
};

export function CalendarPage({
  board,
  active,
  onSetDays,
  onOpenTask,
  onToggleDone,
  onStartPomodoro,
}: {
  board: BoardState;
  /** Si la pestaña está a la vista (los atajos de teclado solo valen entonces). */
  active: boolean;
  /** Debe ser estable (useCallback): lo usa el estirado mientras dura. */
  onSetDays: (taskId: string, days: IsoDay[]) => void;
  onOpenTask: (taskId: string) => void;
  /** La casilla de una barra: marca la tarea como hecha o la devuelve. */
  onToggleDone: (taskId: string) => void;
  onStartPomodoro: (taskId: string) => void;
}) {
  const customTypes = useCustomTypes();
  const today = todayIso();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<IsoDay>(today);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [copy, setCopy] = useState(false);
  const copyRef = useRef(false);
  const justDragged = useRef(false);
  const [resize, setResize] = useState<Resize | null>(null);
  const [viewportH, setViewportH] = useState(900);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "week" || saved === "day") setView(saved);
    } catch {
      /* sin almacenamiento: vista de mes */
    }
    const onResize = () => setViewportH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function changeView(next: View) {
    setView(next);
    if (next === "day") setSelected(new Set());
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* no pasa nada si no se recuerda */
    }
  }

  const items = useMemo<Item[]>(
    () => COLUMNS.flatMap((c) => board[c.id].map((task) => ({ task, col: c.id }))),
    [board],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.task.id, i])), [items]);
  const scheduled = useMemo(() => items.filter((i) => i.task.days?.length), [items]);
  const daysOf = (id: string) => byId.get(id)?.task.days ?? [];

  const anchorDate = fromIso(anchor);
  const grid = view === "day" ? "week" : view;
  const weeks =
    view === "month"
      ? monthWeeks(anchorDate.getFullYear(), anchorDate.getMonth())
      : [weekOf(anchor)];
  const sizes = SIZES[grid];
  // En el mes caben tantos carriles como deja la altura de la pantalla; el
  // resto se resume en puntitos y se ve completo en la vista de semana.
  const rowPx =
    view === "month"
      ? Math.max(108, (viewportH - CHROME_PX) / weeks.length)
      : Math.max(320, viewportH - CHROME_PX);
  const laneCap =
    view === "month"
      ? Math.max(1, Math.floor((rowPx - sizes.head - sizes.more - 6) / (sizes.lane + LANE_GAP)))
      : Infinity;

  const showingToday =
    view === "day"
      ? anchor === today
      : view === "week"
        ? weekOf(anchor).includes(today)
        : anchor.slice(0, 7) === today.slice(0, 7);

  function shift(dir: 1 | -1) {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(toIso(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1)));
  }

  function openDay(day: IsoDay) {
    setAnchor(day);
    changeView("day");
  }

  /* ------------------------------ Selección ------------------------------ */
  // Como en el tablero: clic selecciona una, Ctrl+clic suma o quita, arrastrar
  // en vacío dibuja un rectángulo y doble clic abre los detalles.

  const selectedRuns = useMemo<RunRef[]>(
    () =>
      scheduled.flatMap((i) =>
        runsOf(i.task.days ?? [])
          .filter((r) => selected.has(runKey(i.task.id, r[0]!)))
          .map((run) => ({ taskId: i.task.id, run })),
      ),
    [scheduled, selected],
  );
  const selectedChips = useMemo(
    () => items.filter((i) => selected.has(chipKey(i.task.id))).map((i) => i.task.id),
    [items, selected],
  );

  function selectClick(key: string, e: React.MouseEvent) {
    // El segundo clic de un doble clic no debe deshacer la selección.
    if (justDragged.current || e.detail > 1) return;
    const additive = e.ctrlKey || e.metaKey;
    setSelected((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      if (prev.size === 1 && prev.has(key)) return new Set();
      return new Set([key]);
    });
  }

  function removeRuns(runs: RunRef[]) {
    for (const [taskId, days] of byTask(runs))
      onSetDays(taskId, replaceDays(daysOf(taskId), days, []));
  }

  function moveRuns(runs: RunRef[], delta: number, keep: boolean) {
    for (const [taskId, days] of byTask(runs))
      onSetDays(
        taskId,
        replaceDays(
          daysOf(taskId),
          keep ? [] : days,
          days.map((d) => addDays(d, delta)),
        ),
      );
  }

  // Rectángulo de selección: arranca en un hueco (no en una barra ni un botón).
  // Si el ratón no se mueve es un clic: en un día, acerca la vista a ese día.
  const press = useRef<{
    x: number;
    y: number;
    base: Set<string>;
    target: HTMLElement;
    additive: boolean;
    moved: boolean;
  } | null>(null);
  const onDayClick = useRef<(day: IsoDay) => void>(() => {});
  onDayClick.current = (day) => {
    if (view === "month") {
      setAnchor(day);
      changeView("week");
    } else if (view === "week") setAnchor(day);
  };

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || view === "day") return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "[data-sel-key], button, input, textarea, select, a, [role='dialog'], [role='menu']",
      )
    )
      return;
    const additive = e.ctrlKey || e.metaKey;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      base: additive ? new Set(selected) : new Set(),
      target,
      additive,
      moved: false,
    };
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      p.moved = true;
      const box = {
        left: Math.min(p.x, e.clientX),
        right: Math.max(p.x, e.clientX),
        top: Math.min(p.y, e.clientY),
        bottom: Math.max(p.y, e.clientY),
      };
      setMarquee(box);
      const hit = new Set(p.base);
      rootRef.current?.querySelectorAll<HTMLElement>("[data-sel-key]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const key = el.dataset["selKey"];
        if (
          key &&
          r.right >= box.left &&
          r.left <= box.right &&
          r.bottom >= box.top &&
          r.top <= box.bottom
        )
          hit.add(key);
      });
      setSelected(hit);
    };
    const onUp = () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      if (p.moved) {
        setMarquee(null);
        return;
      }
      if (!p.additive) setSelected(new Set());
      const day = p.target.closest<HTMLElement>("[data-day]")?.dataset["day"];
      if (day) onDayClick.current(day);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Atajos de la pestaña: Esc limpia, Supr quita del calendario lo
  // seleccionado y las flechas cambian de mes, semana o día.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (isTyping(document.activeElement) || document.querySelector("[role='dialog']")) return;
    if (e.ctrlKey || e.metaKey || e.altKey || resize) return;
    if (e.key === "Escape") setSelected(new Set());
    else if ((e.key === "Delete" || e.key === "Backspace") && selectedRuns.length > 0) {
      e.preventDefault();
      removeRuns(selectedRuns);
      setSelected(new Set());
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      shift(e.key === "ArrowLeft" ? -1 : 1);
    }
  };
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  /* ------------------------------ Arrastrar ------------------------------ */

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Ctrl (o Cmd) al soltar copia en vez de mover; se sigue en vivo para que
  // la etiqueta "Copiar" aparezca en cuanto se pulsa.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const sync = (e: KeyboardEvent | PointerEvent) => {
      const on = e.ctrlKey || e.metaKey;
      copyRef.current = on;
      setCopy(on);
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("pointermove", sync);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("pointermove", sync);
    };
  }, [dragging]);

  /** Días que recibirían las tareas al soltarlas sobre `day`. */
  function targetDays(d: Drag, day: IsoDay): IsoDay[] {
    if (d.kind !== "run" || !d.grabDay) return [day];
    const delta = diffDays(day, d.grabDay);
    return (d.runs ?? [{ taskId: d.taskId, run: d.run }]).flatMap((r) =>
      r.run.map((x) => addDays(x, delta)),
    );
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as DragData | undefined;
    if (!data) return;
    const pointer = e.activatorEvent as PointerEvent;
    let grabDay: IsoDay | null = null;
    let width: number | null = null;
    let runs: RunRef[] | null = null;
    let taskIds: string[] | null = null;
    if (data.kind === "run") {
      const rect = data.measure();
      if (rect) {
        // Qué día de la barra se agarró (el que está bajo el puntero, porque en
        // la semana el día enfocado es más ancho): el tramo se mueve desde ahí.
        width = rect.width;
        const under = dayAt(pointer.clientX, pointer.clientY);
        if (under && data.run.includes(under)) grabDay = under;
        else {
          const col = Math.floor(((pointer.clientX - rect.left) / rect.width) * data.shownDays);
          grabDay = addDays(data.firstShown, Math.min(data.shownDays - 1, Math.max(0, col)));
        }
      }
      if (selected.has(runKey(data.taskId, data.run[0]!)) && selectedRuns.length > 1)
        runs = selectedRuns;
    } else if (data.kind === "task") {
      if (selected.has(chipKey(data.taskId)) && selectedChips.length > 1) taskIds = selectedChips;
    }
    copyRef.current = pointer.ctrlKey || pointer.metaKey;
    setCopy(copyRef.current);
    setDrag({ ...data, grabDay, width, runs, taskIds });
  }

  // El clic que llega justo después de soltar (o de estirar, si el puntero
  // acaba encima de la barra) no debe seleccionar ni abrir nada.
  function swallowClick() {
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
  }

  function finishDrag() {
    setDrag(null);
    setOverId(null);
    swallowClick();
  }

  function handleDragEnd(e: DragEndEvent) {
    const d = drag;
    finishDrag();
    if (!d || !e.over) return;
    const over = String(e.over.id);
    const keep = copyRef.current;
    if (over === "pool") {
      if (d.kind === "run") removeRuns(d.runs ?? [{ taskId: d.taskId, run: d.run }]);
      else if (d.kind === "occ") onSetDays(d.taskId, replaceDays(daysOf(d.taskId), [d.day], []));
      return;
    }
    if (!over.startsWith("day:")) return;
    const day = over.slice(4);
    if (d.kind === "task") {
      for (const id of d.taskIds ?? [d.taskId]) onSetDays(id, replaceDays(daysOf(id), [], [day]));
      return;
    }
    if (d.kind === "occ") {
      if (day !== d.day)
        onSetDays(d.taskId, replaceDays(daysOf(d.taskId), keep ? [] : [d.day], [day]));
      return;
    }
    const delta = diffDays(day, d.grabDay ?? d.run[0]!);
    if (delta === 0) return;
    const runs = d.runs ?? [{ taskId: d.taskId, run: d.run }];
    moveRuns(runs, delta, keep);
    // Lo seleccionado sigue seleccionado en su nuevo sitio.
    if (!keep)
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of runs)
          if (next.delete(runKey(r.taskId, r.run[0]!)))
            next.add(runKey(r.taskId, addDays(r.run[0]!, delta)));
        return next;
      });
  }

  const preview = useMemo(() => {
    if (!drag || !overId?.startsWith("day:")) return null;
    return new Set(targetDays(drag, overId.slice(4)));
  }, [drag, overId]);

  // Las barras que se van de su sitio se atenúan mientras se arrastran.
  const movingKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!drag || copy || drag.kind !== "run") return keys;
    for (const r of drag.runs ?? [{ taskId: drag.taskId, run: drag.run }])
      keys.add(runKey(r.taskId, r.run[0]!));
    return keys;
  }, [drag, copy]);
  const movingChips = useMemo(
    () => new Set(drag?.kind === "task" ? (drag.taskIds ?? [drag.taskId]) : []),
    [drag],
  );

  /* ------------------------------- Estirar ------------------------------- */
  // Los bordes de una barra se estiran a otros días como en cualquier
  // calendario; el cambio se aplica en vivo y Escape lo deshace.

  function startResize(e: React.PointerEvent, taskId: string, run: IsoDay[], edge: Resize["edge"]) {
    e.preventDefault();
    e.stopPropagation();
    const task = byId.get(taskId)?.task;
    if (task) setResize({ taskId, run, edge, base: task.days ?? [] });
  }

  useEffect(() => {
    if (!resize) return;
    const fixed = resize.edge === "end" ? resize.run[0]! : resize.run[resize.run.length - 1]!;
    let last: IsoDay | null = null;
    const onMove = (e: PointerEvent) => {
      const day = dayAt(e.clientX, e.clientY);
      if (!day || day === last) return;
      last = day;
      // El borde fijo no se cruza: al encoger, el tramo se queda en un día.
      const moving =
        resize.edge === "end" ? (day < fixed ? fixed : day) : day > fixed ? fixed : day;
      onSetDays(resize.taskId, replaceDays(resize.base, resize.run, rangeDays(fixed, moving)));
    };
    const onUp = () => {
      swallowClick();
      setResize(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onSetDays(resize.taskId, resize.base);
      setResize(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKeyDown);
    document.body.style.cursor = "ew-resize";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = "";
    };
  }, [resize, onSetDays]);

  const openTask = (id: string) => {
    if (!justDragged.current) onOpenTask(id);
  };

  const activeItem = drag ? byId.get(drag.taskId) : undefined;
  const groupSize = drag ? (drag.runs?.length ?? drag.taskIds?.length ?? 1) : 1;

  return (
    <div
      ref={rootRef}
      className="select-none"
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={finishDrag}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Anterior"
              title="Anterior (←)"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              disabled={showingToday}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Siguiente"
              title="Siguiente (→)"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h2 className="min-w-48 text-lg font-semibold tracking-tight text-foreground">
            {view === "month"
              ? monthLabel(anchor)
              : view === "week"
                ? weekLabel(weeks[0]!)
                : cap(
                    anchorDate.toLocaleDateString("es", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }),
                  )}
          </h2>
          <div
            role="radiogroup"
            aria-label="Vista del calendario"
            className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5"
          >
            {(
              [
                ["month", "Mes"],
                ["week", "Semana"],
                ["day", "Día"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  view === v
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {selected.size > 0 && view !== "day" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-medium text-primary">
              {selected.size} seleccionada(s)
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Quitar selección"
                className="grid size-4 place-items-center rounded-full hover:bg-primary/20"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <p className="ml-auto hidden max-w-[46rem] text-right text-[11px] text-muted-foreground lg:block">
            {HINTS[view]}
          </p>
        </div>

        {view === "day" ? (
          <DayView
            day={anchor}
            today={today}
            items={items}
            customTypes={customTypes}
            preview={preview}
            draggingTaskId={drag?.kind === "occ" && !copy ? drag.taskId : null}
            onGoto={setAnchor}
            onOpenTask={openTask}
            onToggleDone={onToggleDone}
            onStartPomodoro={onStartPomodoro}
            onSetDays={onSetDays}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card/40">
            {view === "month" && (
              <div className="grid grid-cols-7 border-b border-border bg-card/60">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}
            {weeks.map((week) => (
              <WeekRow
                key={week[0]}
                week={week}
                view={grid}
                month={anchorDate.getMonth()}
                today={today}
                focusDay={view === "week" ? anchor : null}
                items={scheduled}
                rowPx={rowPx}
                laneCap={laneCap}
                preview={preview}
                selected={selected}
                movingKeys={movingKeys}
                customTypes={customTypes}
                onSelect={selectClick}
                onOpen={openTask}
                onOpenDay={openDay}
                onToggleDone={onToggleDone}
                onRemove={(taskId, run) => removeRuns([{ taskId, run }])}
                onResizeStart={startResize}
                onShowWeek={(day) => {
                  setAnchor(day);
                  changeView("week");
                }}
              />
            ))}
          </div>
        )}

        <Pool
          items={items}
          today={today}
          customTypes={customTypes}
          drag={drag}
          selected={selected}
          moving={movingChips}
          onSelect={selectClick}
          onOpen={openTask}
          onToggleDone={onToggleDone}
        />

        <DragOverlay dropAnimation={null}>
          {drag && activeItem ? (
            <div
              className="relative cursor-grabbing"
              style={drag.kind === "run" && drag.width ? { width: drag.width } : undefined}
            >
              {/* El resto del grupo viaja apilado debajo, como en el tablero. */}
              {Array.from({ length: Math.min(groupSize - 1, 3) }, (_, i) => i + 1)
                .reverse()
                .map((depth) => (
                  <div
                    key={depth}
                    aria-hidden
                    className="absolute inset-0 rounded-md border border-primary/40 bg-card"
                    style={{
                      transform: `translate(${depth * 4}px, ${depth * 4}px)`,
                      opacity: 1 - depth * 0.2,
                    }}
                  />
                ))}
              <div className="relative">
                {drag.kind === "run" ? (
                  <BarBody
                    item={activeItem}
                    customTypes={customTypes}
                    height={sizes.lane}
                    detailed={view === "week"}
                    lifted
                  />
                ) : (
                  <ChipBody item={activeItem} today={today} customTypes={customTypes} lifted />
                )}
              </div>
              {groupSize > 1 && (
                <span className="absolute -top-2 -left-2 z-10 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground shadow">
                  {groupSize}
                </span>
              )}
              {copy && drag.kind !== "task" && (
                <span className="absolute -top-2.5 -right-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                  <Copy className="size-2.5" /> Copiar
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-sm border border-primary/60 bg-primary/10"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Semana -------------------------------- */

type ResizeStart = (
  e: React.PointerEvent,
  taskId: string,
  run: IsoDay[],
  edge: Resize["edge"],
) => void;

function WeekRow({
  week,
  view,
  month,
  today,
  focusDay,
  items,
  rowPx,
  laneCap,
  preview,
  selected,
  movingKeys,
  customTypes,
  onSelect,
  onOpen,
  onOpenDay,
  onToggleDone,
  onRemove,
  onResizeStart,
  onShowWeek,
}: {
  week: IsoDay[];
  view: "month" | "week";
  month: number;
  today: IsoDay;
  /** El día enfocado de la semana: más ancho y con acceso a su vista de día. */
  focusDay: IsoDay | null;
  items: Item[];
  rowPx: number;
  laneCap: number;
  preview: Set<IsoDay> | null;
  selected: Set<string>;
  movingKeys: Set<string>;
  customTypes: CustomType[];
  onSelect: (key: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onOpenDay: (day: IsoDay) => void;
  onToggleDone: (id: string) => void;
  onRemove: (taskId: string, run: IsoDay[]) => void;
  onResizeStart: ResizeStart;
  onShowWeek: (day: IsoDay) => void;
}) {
  const sizes = SIZES[view];
  const { segments, lanes } = layoutWeek(items, (i) => i.task.days, week);
  const shown = Math.min(lanes, laneCap);
  const hiddenPerDay = week.map((_, c) =>
    segments
      .filter((s) => s.lane >= laneCap && s.startCol <= c && s.endCol >= c)
      .map((s) => s.item),
  );

  // Ancho de cada día, para decidir cuántos puntitos caben.
  const rowRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(180);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setColWidth(entry.contentRect.width / 7));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rowRef}
      className="relative grid grid-cols-7 border-b border-border last:border-b-0"
      style={{
        // En la semana, el día enfocado se ensancha (con transición) para leer
        // mejor sus tareas.
        ...(focusDay && week.includes(focusDay)
          ? {
              gridTemplateColumns: week
                .map((d) => `minmax(0, ${d === focusDay ? FOCUS_SPAN : 1}fr)`)
                .join(" "),
              transition: "grid-template-columns 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }
          : {}),
        gridTemplateRows: `${sizes.head}px repeat(${shown}, ${sizes.lane}px) minmax(${sizes.more}px, 1fr)`,
        rowGap: LANE_GAP,
        minHeight: rowPx,
      }}
    >
      {week.map((day, c) => (
        <DayCell
          key={day}
          day={day}
          col={c}
          view={view}
          outside={view === "month" && fromIso(day).getMonth() !== month}
          isToday={day === today}
          focused={day === focusDay}
          highlighted={preview?.has(day) ?? false}
          onOpenDay={onOpenDay}
        />
      ))}

      {segments
        .filter((s) => s.lane < laneCap)
        .map((s) => {
          const key = runKey(s.item.task.id, s.run[0]!);
          return (
            <RunBar
              key={`${s.item.task.id}:${s.run[0]}`}
              seg={s}
              selKey={key}
              week={week}
              view={view}
              customTypes={customTypes}
              selected={selected.has(key)}
              dimmed={movingKeys.has(key)}
              onSelect={onSelect}
              onOpen={onOpen}
              onToggleDone={onToggleDone}
              onRemove={onRemove}
              onResizeStart={onResizeStart}
            />
          );
        })}

      {hiddenPerDay.map((hidden, c) =>
        hidden.length > 0 ? (
          <HiddenDots
            key={c}
            items={hidden}
            width={colWidth - 16}
            customTypes={customTypes}
            onClick={() => onShowWeek(week[c]!)}
            style={{ gridColumn: c + 1, gridRow: shown + 2 }}
          />
        ) : null,
      )}
    </div>
  );
}

const DOT = 7;
const DOT_GAP = 3;
/** Separación mínima entre fichas apiladas antes de pasar a la cápsula. */
const MIN_STEP = 3.5;
const COUNT_PX = 22;

/** Las tareas que no caben en el día: un puntito por tarea en el color de su
 * tipo. Si no hay sitio, los puntitos se apilan como fichas de póker; y si ni
 * así caben, se funden en una cápsula con el reparto de colores y el total. */
function HiddenDots({
  items,
  width,
  customTypes,
  onClick,
  style,
}: {
  items: Item[];
  width: number;
  customTypes: CustomType[];
  onClick: () => void;
  style: CSSProperties;
}) {
  // Agrupados por color: así las fichas y la cápsula leen por tipo.
  const dots = items
    .map((item) => ({ item, color: barColors(item.task, customTypes).accent }))
    .sort((a, b) => a.color.localeCompare(b.color));
  const n = dots.length;
  const mode =
    n * DOT + (n - 1) * DOT_GAP <= width
      ? "dots"
      : DOT + (n - 1) * MIN_STEP <= width
        ? "stack"
        : "capsule";
  const step = mode === "dots" ? DOT + DOT_GAP : (width - DOT) / Math.max(1, n - 1);
  const titles = items.map((i) => `• ${i.task.title || "(sin título)"}`).join("\n");

  const groups: { color: string; count: number }[] = [];
  for (const d of dots) {
    const last = groups[groups.length - 1];
    if (last?.color === d.color) last.count += 1;
    else groups.push({ color: d.color, count: 1 });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${n} tarea(s) más · clic para ver la semana\n${titles}`}
      aria-label={`${n} tarea(s) más; ver la semana`}
      style={style}
      className="group/more relative z-10 mx-1.5 flex h-[18px] items-center self-start justify-self-start rounded-full outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {mode === "capsule" ? (
        <span className="flex items-center gap-1.5">
          <span
            className="flex h-1.5 overflow-hidden rounded-full transition-[height] group-hover/more:h-2"
            style={{ width: Math.max(24, width - COUNT_PX - 6), gap: 2 }}
          >
            {groups.map((g) => (
              <span
                key={g.color}
                style={{ flexGrow: g.count, flexBasis: 0, minWidth: 3, backgroundColor: g.color }}
              />
            ))}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums group-hover/more:text-foreground">
            {n}
          </span>
        </span>
      ) : (
        <span className="relative block" style={{ width: DOT + (n - 1) * step, height: DOT }}>
          {dots.map((d, i) => (
            <span
              key={d.item.task.id}
              className="absolute top-0 rounded-full transition-transform duration-150 group-hover/more:scale-125"
              style={{
                left: i * step,
                width: DOT,
                height: DOT,
                zIndex: i,
                backgroundColor: d.color,
                opacity: d.item.col === "done" ? 0.45 : 1,
                // Al apilarse, un aro del color del fondo separa cada ficha.
                boxShadow: mode === "stack" ? "0 0 0 1.5px var(--background)" : undefined,
                transitionDelay: `${Math.min(i, 20) * 12}ms`,
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

function DayCell({
  day,
  col,
  view,
  outside,
  isToday,
  focused,
  highlighted,
  onOpenDay,
}: {
  day: IsoDay;
  col: number;
  view: "month" | "week";
  outside: boolean;
  isToday: boolean;
  focused: boolean;
  highlighted: boolean;
  onOpenDay: (day: IsoDay) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const date = fromIso(day);
  const weekend = col >= 5;
  const number = (
    <span
      className={cn(
        "inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums transition-colors",
        isToday ? "bg-primary text-primary-foreground" : "text-foreground",
      )}
    >
      {date.getDate()}
    </span>
  );
  return (
    <div
      ref={setNodeRef}
      data-day={day}
      style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
      className={cn(
        "px-2 pt-1.5 transition-colors",
        col < 6 && "border-r border-border",
        view === "month" ? "cursor-zoom-in" : !focused && "cursor-pointer",
        weekend && "bg-background/40",
        outside && "bg-background/70",
        focused && "bg-primary/[0.04]",
        (highlighted || isOver) && "bg-primary/10 shadow-[inset_0_0_0_1px_var(--primary)]",
      )}
    >
      {view === "month" ? (
        <span
          className={cn(
            "inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums",
            isToday
              ? "bg-primary text-primary-foreground"
              : outside
                ? "text-muted-foreground/40"
                : "text-muted-foreground",
          )}
        >
          {date.getDate()}
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {WEEKDAYS[col]}
          </span>
          {focused ? (
            // En el día enfocado, su número abre la vista de día.
            <button
              type="button"
              onClick={() => onOpenDay(day)}
              title="Ver este día"
              className="group/day inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <span className="rounded-full ring-primary/60 transition-shadow group-hover/day:ring-2">
                {number}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors group-hover/day:bg-secondary group-hover/day:text-foreground">
                <Maximize2 className="size-3" /> Ver día
              </span>
            </button>
          ) : (
            number
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Barras -------------------------------- */

function BarBody({
  item,
  customTypes,
  height,
  detailed,
  lifted,
  continuesBefore = false,
  continuesAfter = false,
  onToggleDone,
}: {
  item: Item;
  customTypes: CustomType[];
  height: number;
  detailed: boolean;
  lifted?: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  onToggleDone?: (() => void) | undefined;
}) {
  const { task, col } = item;
  const { style, accent } = barColors(task, customTypes);
  const done = col === "done";
  return (
    <div
      className={cn(
        "flex h-full items-center gap-1.5 overflow-hidden px-2 text-[11px] leading-none font-medium",
        continuesBefore ? "rounded-l-none" : "rounded-l-md",
        continuesAfter ? "rounded-r-none" : "rounded-r-md",
      )}
      style={{ ...style, height, boxShadow: edgeShadow(accent, !continuesBefore, !!lifted) }}
    >
      <StatusCheck col={col} accent={accent} onToggle={onToggleDone} />
      <span className={cn("truncate", done && "line-through opacity-60")}>
        {task.title || "(sin título)"}
      </span>
      {detailed && (
        <span className="ml-auto shrink-0 text-[10px] font-normal opacity-60">
          {STATUS_LABEL[col]}
        </span>
      )}
    </div>
  );
}

function RunBar({
  seg,
  selKey,
  week,
  view,
  customTypes,
  selected,
  dimmed,
  onSelect,
  onOpen,
  onToggleDone,
  onRemove,
  onResizeStart,
}: {
  seg: WeekSegment<Item>;
  selKey: string;
  week: IsoDay[];
  view: "month" | "week";
  customTypes: CustomType[];
  selected: boolean;
  dimmed: boolean;
  onSelect: (key: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
  onRemove: (taskId: string, run: IsoDay[]) => void;
  onResizeStart: ResizeStart;
}) {
  const { task } = seg.item;
  const firstShown = week[seg.startCol]!;
  const shownDays = seg.endCol - seg.startCol + 1;
  const node = useRef<HTMLDivElement | null>(null);
  const data: DragData = {
    kind: "run",
    taskId: task.id,
    run: seg.run,
    firstShown,
    shownDays,
    measure: () => node.current?.getBoundingClientRect() ?? null,
  };
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `run:${task.id}:${seg.run[0]}:${firstShown}`,
    data,
  });
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const handle =
    "absolute inset-y-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 after:absolute after:inset-y-1 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-current";

  return (
    <div
      ref={(el) => {
        node.current = el;
        setNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      data-sel-key={selKey}
      title={`${task.title} · ${seg.run.length} día(s)\nClic selecciona · doble clic abre los detalles`}
      onClick={(e) => onSelect(selKey, e)}
      onDoubleClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task.id)}
      style={{
        gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
        gridRow: seg.lane + 2,
      }}
      className={cn(
        "group relative z-10 min-w-0 cursor-grab rounded-md outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing",
        seg.continuesBefore ? "ml-0" : "ml-1",
        seg.continuesAfter ? "mr-0" : "mr-1",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        dimmed && "opacity-35",
      )}
    >
      <BarBody
        item={seg.item}
        customTypes={customTypes}
        height={SIZES[view].lane}
        detailed={view === "week"}
        continuesBefore={seg.continuesBefore}
        continuesAfter={seg.continuesAfter}
        onToggleDone={() => onToggleDone(task.id)}
      />
      {!seg.continuesBefore && (
        <span
          aria-hidden
          className={cn(handle, "left-0")}
          onPointerDown={(e) => onResizeStart(e, task.id, seg.run, "start")}
          onClick={stop}
        />
      )}
      {!seg.continuesAfter && (
        <span
          aria-hidden
          className={cn(handle, "right-0")}
          onPointerDown={(e) => onResizeStart(e, task.id, seg.run, "end")}
          onClick={stop}
        />
      )}
      <button
        type="button"
        aria-label="Quitar del calendario"
        title={seg.run.length > 1 ? `Quitar estos ${seg.run.length} días` : "Quitar este día"}
        onPointerDown={stop}
        onDoubleClick={stop}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(task.id, seg.run);
        }}
        className="absolute top-1/2 right-2.5 z-20 grid size-4 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

/* ------------------------- Lista de tareas de abajo ------------------------ */

function ChipBody({
  item,
  today,
  customTypes,
  lifted,
  onToggleDone,
}: {
  item: Item;
  today: IsoDay;
  customTypes: CustomType[];
  lifted?: boolean;
  onToggleDone?: (() => void) | undefined;
}) {
  const { task, col } = item;
  const { style, accent } = barColors(task, customTypes);
  const planned = (task.days ?? []).length;
  return (
    <div
      className={cn(
        "inline-flex h-6 max-w-[22rem] items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
        !lifted && plannedAhead(task, today) && "opacity-55",
      )}
      style={{ ...style, boxShadow: edgeShadow(accent, true, !!lifted) }}
    >
      <StatusCheck col={col} accent={accent} onToggle={onToggleDone} />
      <span className="truncate">{task.title || "(sin título)"}</span>
      {planned > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] opacity-70">
          <CalendarDays className="size-3" />
          {planned}
        </span>
      )}
    </div>
  );
}

function PoolChip({
  item,
  today,
  customTypes,
  selected,
  dimmed,
  onSelect,
  onOpen,
  onToggleDone,
}: {
  item: Item;
  today: IsoDay;
  customTypes: CustomType[];
  selected: boolean;
  dimmed: boolean;
  onSelect: (key: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const data: DragData = { kind: "task", taskId: item.task.id };
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `task:${item.task.id}`,
    data,
  });
  const days = item.task.days ?? [];
  const key = chipKey(item.task.id);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-sel-key={key}
      onClick={(e) => onSelect(key, e)}
      onDoubleClick={() => onOpen(item.task.id)}
      title={
        days.length
          ? `${item.task.title}\nPlanificada: ${days.map((d) => fromIso(d).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })).join(", ")}`
          : item.task.title
      }
      className={cn(
        "min-w-0 cursor-grab rounded-md outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        dimmed && "opacity-35",
      )}
    >
      <ChipBody
        item={item}
        today={today}
        customTypes={customTypes}
        onToggleDone={() => onToggleDone(item.task.id)}
      />
    </div>
  );
}

function Pool({
  items,
  today,
  customTypes,
  drag,
  selected,
  moving,
  onSelect,
  onOpen,
  onToggleDone,
}: {
  items: Item[];
  today: IsoDay;
  customTypes: CustomType[];
  drag: Drag | null;
  selected: Set<string>;
  moving: Set<string>;
  onSelect: (key: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cols, setCols] = useState<Set<ColumnId>>(() => new Set(["todo", "doing"]));
  const [hidePlanned, setHidePlanned] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });

  const q = query.trim().toLowerCase();
  const open = items.filter((i) => i.col !== "done");
  const visible = open.filter(
    (i) =>
      cols.has(i.col) &&
      (!q || i.task.title.toLowerCase().includes(q)) &&
      !(hidePlanned && plannedAhead(i.task, today)),
  );
  const unplanned = open.filter((i) => !plannedAhead(i.task, today)).length;
  const removing = drag?.kind === "run" || drag?.kind === "occ";

  const toggle = (c: ColumnId) =>
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const pill = (on: boolean) =>
    cn(
      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
      on
        ? "border-accent bg-accent/15 text-accent"
        : "border-border/60 text-muted-foreground hover:text-foreground",
    );

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-background/95 px-4 pt-2.5 pb-3 backdrop-blur transition-colors sm:-mx-6 sm:px-6",
        removing && "border-dashed",
        removing && isOver && "bg-destructive/10",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Tareas
        </span>
        <span className="text-[11px] text-muted-foreground">
          {unplanned} sin planificar de {open.length}
        </span>
        {(["todo", "doing"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            className={cn(pill(cols.has(c)), "inline-flex items-center gap-1.5")}
          >
            <StatusCheck col={c} accent="currentColor" size={11} />
            {STATUS_LABEL[c]} · {open.filter((i) => i.col === c).length}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHidePlanned((v) => !v)}
          className={pill(hidePlanned)}
        >
          Ocultar planificadas
        </button>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarea…"
            className="w-full rounded-md border border-border/60 bg-card/60 py-1 pr-2 pl-7 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent/60"
          />
        </div>
      </div>
      {removing ? (
        <p className="grid h-14 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          Suelta aquí para quitarlas del calendario
        </p>
      ) : (
        <div className="flex max-h-[7.5rem] flex-wrap gap-1.5 overflow-y-auto">
          {visible.map((i) => (
            <PoolChip
              key={i.task.id}
              item={i}
              today={today}
              customTypes={customTypes}
              selected={selected.has(chipKey(i.task.id))}
              dimmed={moving.has(i.task.id)}
              onSelect={onSelect}
              onOpen={onOpen}
              onToggleDone={onToggleDone}
            />
          ))}
          {visible.length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">No hay tareas con estos filtros.</p>
          )}
        </div>
      )}
    </section>
  );
}
