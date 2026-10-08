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
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMNS, tagsForTask, type BoardState, type ColumnId, type Task } from "@/lib/kanban-data";
import { chipCss, colorOf, dotCss, useCustomTypes, type CustomType } from "@/lib/custom-types";
import {
  addDays,
  diffDays,
  fromIso,
  layoutWeek,
  monthWeeks,
  rangeDays,
  replaceDays,
  toIso,
  todayIso,
  weekOf,
  type IsoDay,
  type WeekSegment,
} from "@/lib/calendar";

type Item = { task: Task; col: ColumnId };
type View = "month" | "week";

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
    };

/** Lo que se arrastra, con el día del tramo que quedó bajo el puntero. */
type Drag = DragData & { grabDay: IsoDay | null; width: number | null };

type Resize = { taskId: string; run: IsoDay[]; edge: "start" | "end"; base: IsoDay[] };

const VIEW_KEY = "kanban-calendar-view";
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const NEUTRAL_TONES = new Set(["module", "other"]);
const STATUS_COLOR: Record<ColumnId, string> = {
  todo: "var(--todo)",
  doing: "var(--doing)",
  done: "var(--done)",
};
const STATUS_LABEL: Record<ColumnId, string> = {
  todo: "Por hacer",
  doing: "En progreso",
  done: "Hecha",
};

// Medidas de la rejilla: cabecera del día y alto de cada carril de barras.
const SIZES = {
  month: { head: 26, lane: 22, more: 18 },
  week: { head: 40, lane: 30, more: 18 },
} as const;
const LANE_GAP = 3;
/** Cuánto más ancho es hoy que los demás días en la vista de semana. */
const TODAY_SPAN = 2.2;
// Lo que ocupan la cabecera de la página, los controles y la lista de abajo.
const CHROME_PX = 360;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LIFT_SHADOW = "0 8px 24px oklch(0 0 0 / 0.6), 0 0 0 1px var(--primary)";

/** Franja de color del tipo a la izquierda (y la sombra de "levantada" al arrastrar). */
const edgeShadow = (accent: string, edge: boolean, lifted: boolean) =>
  [edge ? `inset 2px 0 0 ${accent}` : "", lifted ? LIFT_SHADOW : ""].filter(Boolean).join(", ") ||
  undefined;

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

/** Color de la barra: el del tipo de la tarea, o gris para los tipos neutros. */
/** El día de la rejilla que hay bajo ese punto de la pantalla. */
function dayAt(x: number, y: number): IsoDay | undefined {
  const hit = document
    .elementsFromPoint(x, y)
    .find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset["day"]);
  return hit?.dataset["day"];
}

function barColors(
  task: Task,
  customTypes: CustomType[],
): { style: CSSProperties; accent: string } {
  const tone = tagsForTask(task)[0]?.tone;
  if (!tone || NEUTRAL_TONES.has(tone)) {
    return {
      style: { backgroundColor: "var(--secondary)", color: "var(--foreground)" },
      accent: "var(--muted-foreground)",
    };
  }
  const c = colorOf(tone, customTypes);
  return { style: chipCss(c), accent: dotCss(c) };
}

function plannedAhead(task: Task, today: IsoDay) {
  return (task.days ?? []).some((d) => d >= today);
}

export function CalendarPage({
  board,
  onSetDays,
  onOpenTask,
}: {
  board: BoardState;
  /** Debe ser estable (useCallback): lo usa el estirado mientras dura. */
  onSetDays: (taskId: string, days: IsoDay[]) => void;
  onOpenTask: (taskId: string) => void;
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

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "week") setView("week");
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

  const anchorDate = fromIso(anchor);
  const weeks =
    view === "month"
      ? monthWeeks(anchorDate.getFullYear(), anchorDate.getMonth())
      : [weekOf(anchor)];
  const sizes = SIZES[view];
  // En el mes caben tantos carriles como deja la altura de la pantalla; el
  // resto se resume en "+N" y se ve completo en la vista de semana.
  const rowPx =
    view === "month"
      ? Math.max(108, (viewportH - CHROME_PX) / weeks.length)
      : Math.max(320, viewportH - CHROME_PX);
  const laneCap =
    view === "month"
      ? Math.max(1, Math.floor((rowPx - sizes.head - sizes.more - 6) / (sizes.lane + LANE_GAP)))
      : Infinity;

  const showingToday =
    weeks.some((w) => w.includes(today)) &&
    (view === "week" || anchorDate.getMonth() === fromIso(today).getMonth());

  function shift(dir: 1 | -1) {
    if (view === "week") setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(toIso(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1)));
  }

  /* ------------------------------ Arrastrar ------------------------------ */

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Ctrl (o Cmd) al soltar copia el tramo en vez de moverlo; se sigue en vivo
  // para que la etiqueta "Copiar" aparezca en cuanto se pulsa.
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

  /** Días que recibiría la tarea al soltarla sobre `day`. */
  function targetDays(d: Drag, day: IsoDay): IsoDay[] {
    if (d.kind === "task" || !d.grabDay) return [day];
    const delta = diffDays(day, d.grabDay);
    return d.run.map((x) => addDays(x, delta));
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as DragData | undefined;
    if (!data) return;
    const pointer = e.activatorEvent as PointerEvent;
    let grabDay: IsoDay | null = null;
    let width: number | null = null;
    const rect = data.kind === "run" ? data.measure() : null;
    if (data.kind === "run" && rect) {
      // Qué día de la barra se agarró (el que está bajo el puntero, porque en la
      // semana hoy es más ancho): así el tramo se mueve desde ese punto.
      width = rect.width;
      const under = dayAt(pointer.clientX, pointer.clientY);
      if (under && data.run.includes(under)) grabDay = under;
      else {
        const col = Math.floor(((pointer.clientX - rect.left) / rect.width) * data.shownDays);
        grabDay = addDays(data.firstShown, Math.min(data.shownDays - 1, Math.max(0, col)));
      }
    }
    copyRef.current = pointer.ctrlKey || pointer.metaKey;
    setCopy(copyRef.current);
    setDrag({ ...data, grabDay, width });
  }

  // El clic que llega justo después de soltar (o de estirar, si el puntero
  // acaba encima de la barra) no debe abrir los detalles.
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
    const item = byId.get(d.taskId);
    if (!item) return;
    const days = item.task.days ?? [];
    const over = String(e.over.id);
    if (over === "pool") {
      if (d.kind === "run") onSetDays(d.taskId, replaceDays(days, d.run, []));
      return;
    }
    if (!over.startsWith("day:")) return;
    const target = targetDays(d, over.slice(4));
    const remove = d.kind === "run" && !copyRef.current ? d.run : [];
    onSetDays(d.taskId, replaceDays(days, remove, target));
  }

  const preview = useMemo(() => {
    if (!drag || !overId?.startsWith("day:")) return null;
    return new Set(targetDays(drag, overId.slice(4)));
  }, [drag, overId]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onSetDays(resize.taskId, resize.base);
      setResize(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    document.body.style.cursor = "ew-resize";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      document.body.style.cursor = "";
    };
  }, [resize, onSetDays]);

  const openTask = (id: string) => {
    if (!justDragged.current) onOpenTask(id);
  };
  const removeRun = (taskId: string, run: IsoDay[]) => {
    const days = byId.get(taskId)?.task.days ?? [];
    onSetDays(taskId, replaceDays(days, run, []));
  };

  const activeItem = drag ? byId.get(drag.taskId) : undefined;

  return (
    <div className="select-none" onClick={(e) => e.stopPropagation()}>
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
              aria-label={view === "month" ? "Mes anterior" : "Semana anterior"}
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
              aria-label={view === "month" ? "Mes siguiente" : "Semana siguiente"}
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h2 className="min-w-48 text-lg font-semibold tracking-tight text-foreground">
            {view === "month" ? monthLabel(anchor) : weekLabel(weeks[0]!)}
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
          <p className="ml-auto hidden text-[11px] text-muted-foreground lg:block">
            Arrastra una tarea a un día · estira la barra por sus bordes · Ctrl al soltar la copia ·
            suéltala abajo para quitarla
          </p>
        </div>

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
              view={view}
              month={anchorDate.getMonth()}
              today={today}
              items={scheduled}
              rowPx={rowPx}
              laneCap={laneCap}
              preview={preview}
              draggingTaskId={drag && !copy ? drag.taskId : null}
              draggingRun={drag?.kind === "run" && !copy ? drag.run : null}
              customTypes={customTypes}
              onOpen={openTask}
              onRemove={removeRun}
              onResizeStart={startResize}
              onShowWeek={(day) => {
                changeView("week");
                setAnchor(day);
              }}
            />
          ))}
        </div>

        <Pool items={items} today={today} customTypes={customTypes} drag={drag} onOpen={openTask} />

        <DragOverlay dropAnimation={null}>
          {drag && activeItem ? (
            <div
              className="relative cursor-grabbing"
              style={drag.width ? { width: drag.width } : undefined}
            >
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
              {copy && drag.kind === "run" && (
                <span className="absolute -top-2.5 -right-2 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                  <Copy className="size-2.5" /> Copiar
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* --------------------------------- Semana -------------------------------- */

function WeekRow({
  week,
  view,
  month,
  today,
  items,
  rowPx,
  laneCap,
  preview,
  draggingTaskId,
  draggingRun,
  customTypes,
  onOpen,
  onRemove,
  onResizeStart,
  onShowWeek,
}: {
  week: IsoDay[];
  view: View;
  month: number;
  today: IsoDay;
  items: Item[];
  rowPx: number;
  laneCap: number;
  preview: Set<IsoDay> | null;
  draggingTaskId: string | null;
  draggingRun: IsoDay[] | null;
  customTypes: CustomType[];
  onOpen: (id: string) => void;
  onRemove: (taskId: string, run: IsoDay[]) => void;
  onResizeStart: (
    e: React.PointerEvent,
    taskId: string,
    run: IsoDay[],
    edge: Resize["edge"],
  ) => void;
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
        // En la semana, hoy se ensancha para leer mejor sus tareas.
        ...(view === "week" && week.includes(today)
          ? {
              gridTemplateColumns: week
                .map((d) => `minmax(0, ${d === today ? TODAY_SPAN : 1}fr)`)
                .join(" "),
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
          highlighted={preview?.has(day) ?? false}
        />
      ))}

      {segments
        .filter((s) => s.lane < laneCap)
        .map((s) => (
          <RunBar
            key={`${s.item.task.id}:${s.run[0]}`}
            seg={s}
            week={week}
            view={view}
            customTypes={customTypes}
            dimmed={
              draggingTaskId === s.item.task.id && !!draggingRun && draggingRun[0] === s.run[0]
            }
            onOpen={onOpen}
            onRemove={onRemove}
            onResizeStart={onResizeStart}
          />
        ))}

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
  highlighted,
}: {
  day: IsoDay;
  col: number;
  view: View;
  outside: boolean;
  isToday: boolean;
  highlighted: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const date = fromIso(day);
  const weekend = col >= 5;
  return (
    <div
      ref={setNodeRef}
      data-day={day}
      style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
      className={cn(
        "px-2 pt-1.5 transition-colors",
        col < 6 && "border-r border-border",
        weekend && "bg-background/40",
        outside && "bg-background/70",
        isToday && view === "week" && "bg-primary/[0.04]",
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
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {WEEKDAYS[col]}
          </span>
          <span
            className={cn(
              "inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums",
              isToday ? "bg-primary text-primary-foreground" : "text-foreground",
            )}
          >
            {date.getDate()}
          </span>
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
}: {
  item: Item;
  customTypes: CustomType[];
  height: number;
  detailed: boolean;
  lifted?: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
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
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLOR[col] }}
      />
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
  week,
  view,
  customTypes,
  dimmed,
  onOpen,
  onRemove,
  onResizeStart,
}: {
  seg: WeekSegment<Item>;
  week: IsoDay[];
  view: View;
  customTypes: CustomType[];
  dimmed: boolean;
  onOpen: (id: string) => void;
  onRemove: (taskId: string, run: IsoDay[]) => void;
  onResizeStart: (
    e: React.PointerEvent,
    taskId: string,
    run: IsoDay[],
    edge: Resize["edge"],
  ) => void;
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
      title={`${task.title} · ${seg.run.length} día(s)`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task.id)}
      style={{
        gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
        gridRow: seg.lane + 2,
      }}
      className={cn(
        "group relative z-10 min-w-0 cursor-grab outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing",
        seg.continuesBefore ? "ml-0" : "ml-1",
        seg.continuesAfter ? "mr-0" : "mr-1",
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
}: {
  item: Item;
  today: IsoDay;
  customTypes: CustomType[];
  lifted?: boolean;
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
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLOR[col] }}
      />
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
  onOpen,
}: {
  item: Item;
  today: IsoDay;
  customTypes: CustomType[];
  onOpen: (id: string) => void;
}) {
  const data: DragData = { kind: "task", taskId: item.task.id };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `task:${item.task.id}`,
    data,
  });
  const days = item.task.days ?? [];
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.task.id)}
      title={
        days.length
          ? `${item.task.title}\nPlanificada: ${days.map((d) => fromIso(d).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })).join(", ")}`
          : item.task.title
      }
      className={cn(
        "min-w-0 cursor-grab rounded-md outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing",
        isDragging && "opacity-35",
      )}
    >
      <ChipBody item={item} today={today} customTypes={customTypes} />
    </div>
  );
}

function Pool({
  items,
  today,
  customTypes,
  drag,
  onOpen,
}: {
  items: Item[];
  today: IsoDay;
  customTypes: CustomType[];
  drag: Drag | null;
  onOpen: (id: string) => void;
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
  const removing = drag?.kind === "run";

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
          <button key={c} type="button" onClick={() => toggle(c)} className={pill(cols.has(c))}>
            <span
              className="mr-1 inline-block size-1.5 rounded-full align-middle"
              style={{ backgroundColor: STATUS_COLOR[c] }}
            />
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
          Suelta aquí para quitar estos días del calendario
        </p>
      ) : (
        <div className="flex max-h-[7.5rem] flex-wrap gap-1.5 overflow-y-auto">
          {visible.map((i) => (
            <PoolChip
              key={i.task.id}
              item={i}
              today={today}
              customTypes={customTypes}
              onOpen={onOpen}
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
