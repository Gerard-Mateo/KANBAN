// Métricas del tablero para la pestaña de estadísticas. Todo se calcula a
// partir del historial de movimientos que ya guarda cada tarea.
import { COLUMNS, tagsForTask, type BoardState, type Task } from "./kanban-data";

const DAY = 86_400_000;

export type TypeStat = {
  id: string;
  label: string;
  total: number;
  done: number;
  /** En "En Progreso" ahora mismo. */
  doing: number;
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

/** Un día del calendario de actividad. */
export type DayStat = {
  date: number;
  /** Movimientos a "En Progreso" + a "Hecho" ese día. */
  count: number;
  started: number;
  done: number;
};

export type Calendar = {
  days: DayStat[];
  /** Corte de intensidad por nivel 1..4 (escala relativa a tu propio ritmo). */
  thresholds: [number, number, number, number];
  max: number;
  totalActive: number;
};

export type BoardStats = {
  total: number;
  done: number;
  pct: number;
  types: TypeStat[];
  doneTasks: DoneTask[];
  speeds: SpeedStat[];
  weeks: WeekStat[];
  calendar: Calendar;
  medianDays: number | null;
  /** Tareas hechas sin fecha utilizable (no cuentan para la velocidad). */
  untimed: number;
};

export const typeOf = (task: Task) => {
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
      const entry = types.get(id) ?? { id, label, total: 0, done: 0, doing: 0, pct: 0 };
      entry.total += 1;
      if (col.id === "done") entry.done += 1;
      if (col.id === "doing") entry.doing += 1;
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

  // Calendario de actividad del último año: cada movimiento a "En Progreso"
  // o a "Hecho" cuenta como actividad de ese día.
  const perDay = new Map<number, { started: number; done: number }>();
  for (const col of COLUMNS) {
    for (const task of board[col.id]) {
      for (const ev of task.history ?? []) {
        if (ev.to !== "doing" && ev.to !== "done") continue;
        const day = new Date(ev.at);
        day.setHours(0, 0, 0, 0);
        const key = day.getTime();
        const entry = perDay.get(key) ?? { started: 0, done: 0 };
        if (ev.to === "doing") entry.started += 1;
        else entry.done += 1;
        perDay.set(key, entry);
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Arranca un domingo para que las columnas del calendario cuadren como en GitHub.
  const firstDay = new Date(today.getTime() - 363 * DAY);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());

  const days: DayStat[] = [];
  for (let d = firstDay.getTime(); d <= today.getTime(); d += DAY) {
    const entry = perDay.get(d) ?? { started: 0, done: 0 };
    days.push({
      date: d,
      started: entry.started,
      done: entry.done,
      count: entry.started + entry.done,
    });
  }

  const active = days.filter((d) => d.count > 0);
  const max = active.reduce((m, d) => Math.max(m, d.count), 0);
  // Cortes relativos: en un tablero tranquilo 2 tareas ya es un día fuerte.
  const q = (p: number) => {
    if (active.length === 0) return 1;
    const sorted = active.map((d) => d.count).sort((a, b) => a - b);
    return Math.max(1, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!);
  };
  const thresholds: [number, number, number, number] = [1, q(0.5), q(0.8), q(0.95)];

  const doneCount = board.done.length;
  return {
    total,
    done: doneCount,
    pct: total ? Math.round((doneCount / total) * 100) : 0,
    types: [...types.values()].sort((a, b) => b.total - a.total),
    doneTasks: doneTasks.sort((a, b) => a.days - b.days),
    speeds,
    weeks,
    calendar: { days, thresholds, max, totalActive: active.length },
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
