// Métricas del tablero para la pestaña de estadísticas. Todo se calcula a
// partir del historial de movimientos que ya guarda cada tarea.
import { COLUMNS, tagsForTask, type BoardState, type Task } from "./kanban-data";

const DAY = 86_400_000;

export type TypeStat = {
  id: string;
  label: string;
  total: number;
  done: number;
  /** 0-100; 0 cuando el tipo no tiene tareas. */
  pct: number;
};

export type DoneTask = {
  id: string;
  title: string;
  typeId: string;
  typeLabel: string;
  /** Días entre la creación y el momento en que llegó a "Hecho". */
  days: number;
  doneAt: number;
};

export type SpeedStat = {
  id: string;
  label: string;
  /** Mediana de días hasta completarse (más honesta que el promedio con outliers). */
  median: number;
  fastest: number;
  slowest: number;
  count: number;
};

export type WeekStat = { weekStart: number; label: string; done: number };

export type BoardStats = {
  total: number;
  done: number;
  pct: number;
  types: TypeStat[];
  doneTasks: DoneTask[];
  speeds: SpeedStat[];
  weeks: WeekStat[];
  medianDays: number | null;
  /** Tareas hechas sin fecha utilizable (no cuentan para la velocidad). */
  untimed: number;
};

const typeOf = (task: Task) => {
  const tag = tagsForTask(task)[0];
  return { id: tag?.tone ?? "other", label: tag?.label ?? "General" };
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Momento en que la tarea llegó a "Hecho" por última vez. */
function doneAtOf(task: Task): number | null {
  const events = task.history ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.to === "done") return ev.at;
  }
  return null;
}

/** Inicio de la semana (lunes) a medianoche local. */
function weekStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function computeStats(board: BoardState, weeksBack = 8): BoardStats {
  const types = new Map<string, TypeStat>();
  let total = 0;

  for (const col of COLUMNS) {
    for (const task of board[col.id]) {
      total += 1;
      const { id, label } = typeOf(task);
      const entry = types.get(id) ?? { id, label, total: 0, done: 0, pct: 0 };
      entry.total += 1;
      if (col.id === "done") entry.done += 1;
      types.set(id, entry);
    }
  }
  for (const t of types.values()) t.pct = t.total ? Math.round((t.done / t.total) * 100) : 0;

  // Duración: de la creación (o del primer movimiento) hasta llegar a "Hecho".
  const doneTasks: DoneTask[] = [];
  let untimed = 0;
  for (const task of board.done) {
    const { id, label } = typeOf(task);
    const doneAt = doneAtOf(task);
    const start = task.createdAt ?? task.history?.[0]?.at ?? null;
    if (doneAt == null || start == null || doneAt < start) {
      untimed += 1;
      continue;
    }
    doneTasks.push({
      id: task.id,
      title: task.title,
      typeId: id,
      typeLabel: label,
      days: Math.max(0, (doneAt - start) / DAY),
      doneAt,
    });
  }

  const byType = new Map<string, DoneTask[]>();
  for (const t of doneTasks) {
    const list = byType.get(t.typeId) ?? [];
    list.push(t);
    byType.set(t.typeId, list);
  }
  const speeds: SpeedStat[] = [...byType.entries()]
    .map(([id, list]) => {
      const days = list.map((t) => t.days);
      return {
        id,
        label: list[0]!.typeLabel,
        median: median(days),
        fastest: Math.min(...days),
        slowest: Math.max(...days),
        count: list.length,
      };
    })
    .sort((a, b) => a.median - b.median);

  // Cuántas se completaron por semana (las últimas `weeksBack`, incluida la actual).
  const weeks: WeekStat[] = [];
  const thisWeek = weekStartOf(Date.now());
  const counts = new Map<number, number>();
  for (const t of doneTasks)
    counts.set(weekStartOf(t.doneAt), (counts.get(weekStartOf(t.doneAt)) ?? 0) + 1);
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = thisWeek - i * 7 * DAY;
    weeks.push({
      weekStart: start,
      label: new Date(start).toLocaleDateString("es-EC", { day: "2-digit", month: "short" }),
      done: counts.get(start) ?? 0,
    });
  }

  const doneCount = board.done.length;
  return {
    total,
    done: doneCount,
    pct: total ? Math.round((doneCount / total) * 100) : 0,
    types: [...types.values()].sort((a, b) => b.total - a.total),
    doneTasks: doneTasks.sort((a, b) => a.days - b.days),
    speeds,
    weeks,
    medianDays: doneTasks.length ? median(doneTasks.map((t) => t.days)) : null,
    untimed,
  };
}

export function formatDays(days: number): string {
  if (days < 1 / 24) return "menos de 1 h";
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 10) return `${days.toFixed(1)} d`;
  return `${Math.round(days)} d`;
}
