import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  FilterX,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnId } from "@/lib/kanban-data";
import type { CustomType } from "@/lib/custom-types";
import { typeOf } from "@/lib/task-stats";
import { diffDays, fromIso, type IsoDay } from "@/lib/calendar";
import { barColors, chipKey, relativeDay, STATUS_LABEL, type Item } from "./calendar-ui";
import { StatusCheck } from "./StatusCheck";

/* Lista de tareas al estilo "Detalles" del Explorador de Windows: columnas
 * que se ordenan con doble clic en su cabecera, menú con clic derecho para
 * restablecer el orden o activar filtros, y un filtro de casillas por
 * columna. Las filas se seleccionan como archivos y se arrastran al
 * calendario (solas o en grupo). */

export type TableColKey = "title" | "type" | "status" | "plan" | "days" | "created";
type Dir = "asc" | "desc";
type PlanState = "planned" | "overdue" | "past" | "none";

type Row = {
  item: Item;
  key: string;
  typeId: string;
  typeLabel: string;
  accent: string;
  next: IsoDay | null;
  last: IsoDay | null;
  plan: PlanState;
  dayCount: number;
  created: number | null;
};

type TableState = {
  sort: { key: TableColKey; dir: Dir } | null;
  /** Valores ocultos por columna (las casillas desmarcadas). */
  excluded: Partial<Record<TableColKey, string[]>>;
  query: string;
  filtersOn: boolean;
};

const STATE_KEY = "kanban-calendar-table-v1";
const DEFAULT_EXCLUDED: TableState["excluded"] = { status: ["done"] };
const DEFAULT_STATE: TableState = {
  sort: null,
  excluded: DEFAULT_EXCLUDED,
  query: "",
  filtersOn: false,
};

const COLS: { key: TableColKey; label: string; width: string; right?: boolean }[] = [
  { key: "title", label: "Tarea", width: "minmax(16rem, 1fr)" },
  { key: "type", label: "Tipo", width: "9.5rem" },
  { key: "status", label: "Estado", width: "8.5rem" },
  { key: "plan", label: "Planificación", width: "11rem" },
  { key: "days", label: "Días", width: "5rem", right: true },
  { key: "created", label: "Creada", width: "7.5rem" },
];
const TEMPLATE = COLS.map((c) => c.width).join(" ");
const ROW_H = 28;

const PLAN_LABEL: Record<PlanState, string> = {
  planned: "Planificada",
  overdue: "Atrasada",
  past: "Ya pasó",
  none: "Sin planificar",
};
const STATUS_RANK: Record<ColumnId, number> = { todo: 0, doing: 1, done: 2 };
const WARN = "oklch(0.78 0.15 80)";
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

const daysBucket = (n: number) => (n === 0 ? "0" : n === 1 ? "1" : n <= 3 ? "2-3" : "4+");
const DAYS_LABEL: Record<string, string> = {
  "0": "Ninguno",
  "1": "1 día",
  "2-3": "2 a 3 días",
  "4+": "4 o más",
};

function createdBucket(ts: number | null): string {
  if (ts == null) return "none";
  const now = new Date();
  const d = new Date(ts);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 7) return "week";
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return "month";
  if (d.getFullYear() === now.getFullYear()) return "year";
  return "older";
}
const CREATED_LABEL: Record<string, string> = {
  today: "Hoy",
  week: "Últimos 7 días",
  month: "Este mes",
  year: "Este año",
  older: "Antes",
  none: "Sin fecha",
};

/** El valor de la fila para el filtro de casillas de cada columna. */
function filterValue(col: TableColKey, r: Row): { id: string; label: string } {
  switch (col) {
    case "type":
      return { id: r.typeId, label: r.typeLabel };
    case "status":
      return { id: r.item.col, label: STATUS_LABEL[r.item.col] };
    case "plan":
      return { id: r.plan, label: PLAN_LABEL[r.plan] };
    case "days": {
      const b = daysBucket(r.dayCount);
      return { id: b, label: DAYS_LABEL[b]! };
    }
    case "created": {
      const b = createdBucket(r.created);
      return { id: b, label: CREATED_LABEL[b]! };
    }
    default:
      return { id: "", label: "" };
  }
}

/** Con qué se compara cada columna; null va siempre al final. */
function sortValue(col: TableColKey, r: Row): string | number | null {
  switch (col) {
    case "title":
      return r.item.task.title;
    case "type":
      return r.typeLabel;
    case "status":
      return STATUS_RANK[r.item.col];
    case "plan":
      return r.next ?? r.last;
    case "days":
      return r.dayCount;
    case "created":
      return r.created;
  }
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return typeof a === "number" && typeof b === "number"
    ? a - b
    : collator.compare(String(a), String(b));
}

function loadState(): TableState {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as Partial<TableState> | null;
    return raw ? { ...DEFAULT_STATE, ...raw } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function shortDate(day: IsoDay, today: IsoDay) {
  const n = diffDays(day, today);
  if (n >= -1 && n <= 1) return relativeDay(day, today);
  return fromIso(day)
    .toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "");
}

export function TaskTable({
  items,
  today,
  customTypes,
  removing,
  height,
  selected,
  moving,
  onHeight,
  onSelect,
  onSelectKeys,
  onOpen,
  onToggleDone,
}: {
  items: Item[];
  today: IsoDay;
  customTypes: CustomType[];
  /** Se está arrastrando algo del calendario: la lista pasa a ser "soltar para quitar". */
  removing: boolean;
  height: number;
  selected: Set<string>;
  moving: Set<string>;
  onHeight: (h: number) => void;
  onSelect: (key: string, e: React.MouseEvent) => void;
  onSelectKeys: (keys: string[], add: boolean) => void;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const [state, setState] = useState<TableState>(DEFAULT_STATE);
  const [menu, setMenu] = useState<{ x: number; y: number; col: TableColKey } | null>(null);
  const [filterFor, setFilterFor] = useState<{ col: TableColKey; rect: DOMRect } | null>(null);
  const anchorKey = useRef<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });

  // Orden y filtros se recuerdan en este navegador.
  useEffect(() => setState(loadState()), []);
  const update = (patch: Partial<TableState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: dura lo que la pestaña */
      }
      return next;
    });

  const rows = useMemo<Row[]>(
    () =>
      items.map((item) => {
        const days = [...(item.task.days ?? [])].sort();
        const next = days.find((d) => d >= today) ?? null;
        const last = days.at(-1) ?? null;
        const { id, label } = typeOf(item.task);
        return {
          item,
          key: chipKey(item.task.id),
          typeId: id,
          typeLabel: label,
          accent: barColors(item.task, customTypes).accent,
          next,
          last,
          plan: next ? "planned" : !last ? "none" : item.col === "done" ? "past" : "overdue",
          dayCount: days.length,
          created: item.task.createdAt ?? null,
        };
      }),
    [items, today, customTypes],
  );

  const visible = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const hidden = Object.entries(state.excluded) as [TableColKey, string[]][];
    const out = rows.filter(
      (r) =>
        (!q || r.item.task.title.toLowerCase().includes(q)) &&
        hidden.every(([col, ids]) => !ids.length || !ids.includes(filterValue(col, r).id)),
    );
    if (state.sort) {
      const { key, dir } = state.sort;
      out.sort((a, b) => {
        const va = sortValue(key, a);
        const vb = sortValue(key, b);
        // Los vacíos siempre al final, ordenes en el sentido que ordenes.
        if (va == null || vb == null) return compare(va, vb);
        return dir === "asc" ? compare(va, vb) : compare(vb, va);
      });
    }
    return out;
  }, [rows, state]);

  const open = rows.filter((r) => r.item.col !== "done");
  const unplanned = open.filter((r) => !r.next).length;
  const activeFilters =
    COLS.filter(
      (c) =>
        JSON.stringify(state.excluded[c.key] ?? []) !==
        JSON.stringify(DEFAULT_EXCLUDED[c.key] ?? []),
    ).length + (state.query.trim() ? 1 : 0);

  function sortBy(col: TableColKey, dir?: Dir) {
    const next: Dir =
      dir ?? (state.sort?.key === col && state.sort.dir === "desc" ? "asc" : "desc");
    update({ sort: { key: col, dir: next } });
  }

  function rowClick(r: Row, e: React.MouseEvent) {
    if (e.shiftKey && anchorKey.current) {
      const from = visible.findIndex((v) => v.key === anchorKey.current);
      const to = visible.findIndex((v) => v.key === r.key);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        onSelectKeys(
          visible.slice(a, b + 1).map((v) => v.key),
          e.ctrlKey || e.metaKey,
        );
        return;
      }
    }
    anchorKey.current = r.key;
    onSelect(r.key, e);
  }

  // Arrastrar el borde de arriba cambia el alto de la lista.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) =>
      onHeight(
        Math.round(Math.min(window.innerHeight * 0.6, Math.max(96, h0 - (ev.clientY - y0)))),
      );
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "ns-resize";
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-background/95 px-4 pb-2 backdrop-blur transition-colors sm:-mx-6 sm:px-6",
        removing && "border-dashed",
        removing && isOver && "bg-destructive/10",
      )}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Cambiar el alto de la lista"
        title="Arrastra para cambiar el alto de la lista"
        onPointerDown={startResize}
        className="group/resize -mx-4 flex h-2.5 cursor-ns-resize items-center justify-center sm:-mx-6"
      >
        <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover/resize:bg-muted-foreground" />
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Tareas
        </span>
        <span className="text-[11px] text-muted-foreground">
          {unplanned} sin planificar de {open.length} · mostrando {visible.length}
        </span>
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => update({ excluded: DEFAULT_EXCLUDED, query: "" })}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            <FilterX className="size-3" /> {activeFilters} filtro(s) · restablecer
          </button>
        )}
        <span className="hidden text-[10px] text-muted-foreground/70 xl:inline">
          Doble clic en una columna ordena · clic derecho para restablecer o filtrar
        </span>
        <div className="relative ml-auto w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={state.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Buscar tarea…"
            className="w-full rounded-md border border-border/60 bg-card/60 py-1 pr-7 pl-7 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent/60"
          />
          {state.query && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => update({ query: "" })}
              className="absolute top-1/2 right-1.5 grid size-4 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {removing ? (
        <p
          className="grid place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
          style={{ height: height + ROW_H }}
        >
          Suelta aquí para quitarlas del calendario
        </p>
      ) : (
        <div
          className="overflow-auto rounded-lg border border-border/70"
          style={{ height: height + ROW_H }}
        >
          <div className="min-w-[56rem]">
            <div
              role="row"
              className="sticky top-0 z-10 grid border-b border-border bg-card text-[11px] text-muted-foreground"
              style={{ gridTemplateColumns: TEMPLATE, height: ROW_H }}
            >
              {COLS.map((c) => {
                const sorted = state.sort?.key === c.key ? state.sort.dir : null;
                const filtered =
                  c.key === "title"
                    ? !!state.query.trim()
                    : (state.excluded[c.key]?.length ?? 0) > 0;
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                    }
                    title="Doble clic para ordenar · clic derecho para más opciones"
                    onDoubleClick={() => sortBy(c.key)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, col: c.key });
                    }}
                    className={cn(
                      "group/head flex min-w-0 cursor-default items-center gap-1 border-r border-border/50 px-2 font-medium transition-colors last:border-r-0 hover:bg-secondary/60 hover:text-foreground",
                      c.right && "justify-end",
                      sorted && "text-foreground",
                    )}
                  >
                    <span className="truncate">{c.label}</span>
                    {sorted === "desc" && <ChevronDown className="size-3 shrink-0 text-primary" />}
                    {sorted === "asc" && <ChevronUp className="size-3 shrink-0 text-primary" />}
                    {state.filtersOn && (
                      <button
                        type="button"
                        aria-label={`Filtrar ${c.label}`}
                        onClick={(e) =>
                          setFilterFor({
                            col: c.key,
                            rect: e.currentTarget.getBoundingClientRect(),
                          })
                        }
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={cn(
                          "ml-auto grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-background",
                          c.right && "ml-1",
                          filtered ? "text-primary" : "text-muted-foreground/70",
                        )}
                      >
                        <Filter className={cn("size-3", filtered && "fill-current")} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {visible.map((r) => (
              <TableRow
                key={r.key}
                row={r}
                today={today}
                selected={selected.has(r.key)}
                dimmed={moving.has(r.item.task.id)}
                customTypes={customTypes}
                onClick={(e) => rowClick(r, e)}
                onOpen={onOpen}
                onToggleDone={onToggleDone}
              />
            ))}
            {visible.length === 0 && (
              <div className="grid h-16 place-items-center text-xs text-muted-foreground">
                <span>
                  No hay tareas con estos filtros.{" "}
                  <button
                    type="button"
                    onClick={() => update({ excluded: DEFAULT_EXCLUDED, query: "" })}
                    className="text-primary hover:underline"
                  >
                    Restablecer filtros
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {menu && (
        <HeaderMenu
          x={menu.x}
          y={menu.y}
          label={COLS.find((c) => c.key === menu.col)!.label}
          sort={state.sort?.key === menu.col ? state.sort.dir : null}
          anySort={!!state.sort}
          filtersOn={state.filtersOn}
          anyFilter={activeFilters > 0}
          onClose={() => setMenu(null)}
          onSort={(dir) => sortBy(menu.col, dir)}
          onResetSort={() => update({ sort: null })}
          onToggleFilters={() => {
            if (state.filtersOn) setFilterFor(null);
            update({ filtersOn: !state.filtersOn });
          }}
          onResetFilters={() => update({ excluded: DEFAULT_EXCLUDED, query: "" })}
        />
      )}

      {filterFor && (
        <FilterMenu
          rect={filterFor.rect}
          label={COLS.find((c) => c.key === filterFor.col)!.label}
          onClose={() => setFilterFor(null)}
        >
          {filterFor.col === "title" ? (
            <input
              autoFocus
              value={state.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Contiene…"
              className="w-full rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-accent/60"
            />
          ) : (
            <ValueChecklist
              col={filterFor.col}
              rows={rows}
              excluded={new Set(state.excluded[filterFor.col] ?? [])}
              accentOf={(id) => rows.find((r) => r.typeId === id)?.accent}
              onChange={(ids) =>
                update({ excluded: { ...state.excluded, [filterFor.col]: [...ids] } })
              }
            />
          )}
        </FilterMenu>
      )}
    </section>
  );
}

function TableRow({
  row,
  today,
  selected,
  dimmed,
  customTypes,
  onClick,
  onOpen,
  onToggleDone,
}: {
  row: Row;
  today: IsoDay;
  selected: boolean;
  dimmed: boolean;
  customTypes: CustomType[];
  onClick: (e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
}) {
  const { task, col } = row.item;
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `task:${task.id}`,
    data: { kind: "task", taskId: task.id },
  });
  const { style } = barColors(task, customTypes);
  const planText =
    row.plan === "planned"
      ? shortDate(row.next!, today)
      : row.plan === "overdue"
        ? `Atrasada · ${relativeDay(row.last!, today).toLowerCase()}`
        : row.plan === "past"
          ? shortDate(row.last!, today)
          : "—";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="row"
      aria-selected={selected}
      data-sel-key={row.key}
      onClick={onClick}
      onDoubleClick={() => onOpen(task.id)}
      title={task.title}
      className={cn(
        "grid cursor-default items-center border-b border-border/40 text-xs outline-none last:border-b-0 focus-visible:bg-secondary/60",
        selected ? "bg-primary/15 text-foreground" : "hover:bg-card/80",
        dimmed && "opacity-35",
      )}
      style={{ gridTemplateColumns: TEMPLATE, height: ROW_H }}
    >
      <div className="flex min-w-0 items-center gap-2 px-2">
        <StatusCheck col={col} accent={row.accent} onToggle={() => onToggleDone(task.id)} />
        <span
          className={cn(
            "truncate text-foreground",
            col === "done" && "text-muted-foreground line-through",
          )}
        >
          {task.title || "(sin título)"}
        </span>
      </div>
      <div className="min-w-0 px-2">
        <span
          className="inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={style}
        >
          {row.typeLabel}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-2 text-muted-foreground">
        <StatusCheck col={col} accent="currentColor" size={10} />
        <span className="truncate">{STATUS_LABEL[col]}</span>
      </div>
      <div
        className={cn(
          "truncate px-2",
          row.plan === "planned" ? "text-foreground" : "text-muted-foreground",
        )}
        style={row.plan === "overdue" ? { color: WARN } : undefined}
      >
        {planText}
      </div>
      <div className="px-2 text-right text-muted-foreground tabular-nums">
        {row.dayCount || "—"}
      </div>
      <div className="truncate px-2 text-muted-foreground tabular-nums">
        {row.created
          ? new Date(row.created).toLocaleDateString("es", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </div>
    </div>
  );
}

/** Se cierra al hacer clic fuera o con Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [ref, onClose]);
}

function HeaderMenu({
  x,
  y,
  label,
  sort,
  anySort,
  filtersOn,
  anyFilter,
  onClose,
  onSort,
  onResetSort,
  onToggleFilters,
  onResetFilters,
}: {
  x: number;
  y: number;
  label: string;
  sort: Dir | null;
  anySort: boolean;
  filtersOn: boolean;
  anyFilter: boolean;
  onClose: () => void;
  onSort: (dir: Dir) => void;
  onResetSort: () => void;
  onToggleFilters: () => void;
  onResetFilters: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const item = (
    icon: ReactNode,
    text: string,
    action: () => void,
    opts: { checked?: boolean; disabled?: boolean } = {},
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      onClick={() => {
        action();
        onClose();
      }}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="grid size-4 place-items-center text-muted-foreground">{icon}</span>
      <span className="flex-1">{text}</span>
      {opts.checked && <Check className="size-3.5 text-primary" />}
    </button>
  );
  // Abre hacia arriba: la lista vive pegada al borde de abajo.
  return (
    <div
      ref={ref}
      role="menu"
      className="glass-panel fixed z-50 w-60 rounded-lg p-1.5"
      style={{
        left: Math.min(x, window.innerWidth - 248),
        bottom: Math.max(8, window.innerHeight - y + 4),
      }}
    >
      <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {item(
        <ArrowDownWideNarrow className="size-3.5" />,
        "De mayor a menor",
        () => onSort("desc"),
        {
          checked: sort === "desc",
        },
      )}
      {item(<ArrowUpNarrowWide className="size-3.5" />, "De menor a mayor", () => onSort("asc"), {
        checked: sort === "asc",
      })}
      {item(<RotateCcw className="size-3.5" />, "Restablecer orden", onResetSort, {
        disabled: !anySort,
      })}
      <div className="my-1 h-px bg-border" />
      {item(
        <Filter className="size-3.5" />,
        filtersOn ? "Ocultar filtros" : "Activar filtros",
        onToggleFilters,
      )}
      {item(<FilterX className="size-3.5" />, "Restablecer filtros", onResetFilters, {
        disabled: !anyFilter,
      })}
    </div>
  );
}

function FilterMenu({
  rect,
  label,
  onClose,
  children,
}: {
  rect: DOMRect;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const below = window.innerHeight - rect.bottom > 280;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Filtrar ${label}`}
      className="glass-panel fixed z-50 w-64 rounded-lg p-2.5"
      style={{
        left: Math.max(8, Math.min(rect.left - 200, window.innerWidth - 272)),
        ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      }}
    >
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Filter className="size-3" /> Filtrar · {label}
      </p>
      {children}
    </div>
  );
}

/** Casillas con cada valor de la columna: desmarcar uno lo oculta. */
function ValueChecklist({
  col,
  rows,
  excluded,
  accentOf,
  onChange,
}: {
  col: TableColKey;
  rows: Row[];
  excluded: Set<string>;
  accentOf: (id: string) => string | undefined;
  onChange: (excluded: Set<string>) => void;
}) {
  const values = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const v = filterValue(col, r);
    const entry = values.get(v.id) ?? { label: v.label, count: 0 };
    entry.count += 1;
    values.set(v.id, entry);
  }
  const list = [...values.entries()].sort((a, b) =>
    col === "status"
      ? STATUS_RANK[a[0] as ColumnId] - STATUS_RANK[b[0] as ColumnId]
      : b[1].count - a[1].count,
  );
  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <div>
      <div className="mb-1.5 flex gap-1.5 text-[11px]">
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="rounded-md px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => onChange(new Set(list.map(([id]) => id)))}
          className="rounded-md px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Ninguno
        </button>
      </div>
      <div className="max-h-60 space-y-0.5 overflow-y-auto">
        {list.map(([id, v]) => {
          const on = !excluded.has(id);
          const accent = col === "type" ? accentOf(id) : undefined;
          return (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-secondary"
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(id)}
                className="size-3.5 accent-[var(--primary)]"
              />
              {accent && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              )}
              {col === "status" && (
                <StatusCheck col={id as ColumnId} accent="currentColor" size={10} />
              )}
              <span
                className={cn("flex-1 truncate", on ? "text-foreground" : "text-muted-foreground")}
              >
                {v.label}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{v.count}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
