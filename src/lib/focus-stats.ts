// Métricas de Pomodoro y de OKRs/SMART para la pestaña de estadísticas.
import { COLUMNS, type BoardState } from "./kanban-data";
import { krProgress, type Objective } from "./okr-cloud";
import type { PomodoroSession } from "./pomodoro-cloud";
import { typeOf } from "./task-stats";

const DAY = 86_400_000;

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Medianoche de `n` días antes; pasa por el mediodía para no tropezar con el cambio de horario. */
const daysBefore = (midnight: number, n: number) => dayStart(midnight - n * DAY + DAY / 2);

/* -------------------------------- Pomodoro -------------------------------- */

export type FocusDay = {
  date: number;
  completed: number;
  /** Sesiones que se iniciaron y nunca se cerraron. */
  unfinished: number;
  minutes: number;
};

export type PunchCell = { weekday: number; hour: number; minutes: number; count: number };

export type FocusType = { id: string; label: string; minutes: number; pomodoros: number };

export type FocusStats = {
  completed: number;
  started: number;
  minutes: number;
  /** 0-100: sesiones cerradas sobre sesiones iniciadas. */
  completionRate: number;
  /** Días seguidos con al menos un pomodoro, hasta hoy (o ayer si hoy aún no). */
  streak: number;
  bestStreak: number;
  days: FocusDay[];
  /** Semana × hora (lunes = 0). Solo las celdas con actividad. */
  punch: PunchCell[];
  punchMax: number;
  /** Rango de horas a dibujar, siempre al menos de 8 a 20. */
  hours: [number, number];
  byType: FocusType[];
};

export function computeFocus(
  sessions: PomodoroSession[],
  board: BoardState,
  daysBack = 21,
): FocusStats {
  const done = sessions.filter((s) => s.completed);
  const minutes = done.reduce((m, s) => m + s.durationMinutes, 0);

  // Días recientes, del más antiguo a hoy.
  const today = dayStart(Date.now());
  const perDay = new Map<number, FocusDay>();
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = daysBefore(today, i);
    perDay.set(date, { date, completed: 0, unfinished: 0, minutes: 0 });
  }
  for (const s of sessions) {
    const entry = perDay.get(dayStart(s.startedAt));
    if (!entry) continue;
    if (s.completed) {
      entry.completed += 1;
      entry.minutes += s.durationMinutes;
    } else {
      entry.unfinished += 1;
    }
  }

  // Rachas sobre todo el historial, no solo la ventana visible.
  const activeDays = new Set(done.map((s) => dayStart(s.startedAt)));
  let streak = 0;
  let cursor = activeDays.has(today) ? today : daysBefore(today, 1);
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = daysBefore(cursor, 1);
  }
  let bestStreak = 0;
  let run = 0;
  let prev = 0;
  for (const d of [...activeDays].sort((a, b) => a - b)) {
    run = daysBefore(d, 1) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }

  const cells = new Map<string, PunchCell>();
  let minHour = 8;
  let maxHour = 20;
  for (const s of done) {
    const d = new Date(s.startedAt);
    const weekday = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    minHour = Math.min(minHour, hour);
    maxHour = Math.max(maxHour, hour);
    const key = `${weekday}-${hour}`;
    const cell = cells.get(key) ?? { weekday, hour, minutes: 0, count: 0 };
    cell.minutes += s.durationMinutes;
    cell.count += 1;
    cells.set(key, cell);
  }
  const punch = [...cells.values()];

  // Enfoque por tipo: la sesión guarda el título, así que se cruza con el tablero.
  // Si la tarea ya no existe, el tipo se deduce del propio título.
  const typeByTitle = new Map<string, { id: string; label: string }>();
  for (const col of COLUMNS)
    for (const task of board[col.id]) typeByTitle.set(task.title, typeOf(task));
  const types = new Map<string, FocusType>();
  for (const s of done) {
    const { id, label } = typeByTitle.get(s.taskTitle) ?? typeOf({ id: "", title: s.taskTitle });
    const entry = types.get(id) ?? { id, label, minutes: 0, pomodoros: 0 };
    entry.minutes += s.durationMinutes;
    entry.pomodoros += 1;
    types.set(id, entry);
  }

  return {
    completed: done.length,
    started: sessions.length,
    minutes,
    completionRate: sessions.length ? Math.round((done.length / sessions.length) * 100) : 0,
    streak,
    bestStreak,
    days: [...perDay.values()],
    punch,
    punchMax: punch.reduce((m, c) => Math.max(m, c.minutes), 0),
    hours: [minHour, maxHour],
    byType: [...types.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ------------------------------- OKR / SMART ------------------------------ */

export type PaceStatus = "done" | "onTrack" | "behind" | "overdue";

export type PacePoint = {
  id: string;
  title: string;
  objective: string;
  /** Avance combinado 0-100. */
  progress: number;
  /** Porcentaje del plazo ya consumido, 0-100. */
  elapsed: number;
  dueDate: string;
  daysLeft: number;
  status: PaceStatus;
};

/** Margen para seguir "en ritmo" aunque vayas un poco por debajo de la diagonal. */
const PACE_SLACK = 10;

/** Fecha límite (yyyy-mm-dd) como final de ese día en hora local. */
function dueTime(date: string): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime();
}

export function pacePoints(objectives: Objective[], now = Date.now()) {
  const points: PacePoint[] = [];
  let undated = 0;
  for (const obj of objectives) {
    for (const kr of obj.keyResults) {
      const end = kr.dueDate ? dueTime(kr.dueDate) : null;
      if (end == null) {
        undated += 1;
        continue;
      }
      const span = end - kr.createdAt;
      const elapsed =
        span <= 0 ? 100 : Math.min(100, Math.max(0, ((now - kr.createdAt) / span) * 100));
      const progress = krProgress(kr);
      const status: PaceStatus =
        progress >= 100
          ? "done"
          : now > end
            ? "overdue"
            : progress + PACE_SLACK >= elapsed
              ? "onTrack"
              : "behind";
      points.push({
        id: kr.id,
        title: kr.title,
        objective: obj.title,
        progress,
        elapsed: Math.round(elapsed),
        dueDate: kr.dueDate!,
        daysLeft: Math.ceil((end - now) / DAY),
        status,
      });
    }
  }
  return { points, undated };
}

export const SMART_LETTERS = [
  { key: "specific", letter: "S", name: "Específico" },
  { key: "measurable", letter: "M", name: "Medible" },
  { key: "achievable", letter: "A", name: "Alcanzable" },
  { key: "relevant", letter: "R", name: "Relevante" },
  { key: "timeBound", letter: "T", name: "Con plazo" },
] as const;

export type SmartRow = {
  id: string;
  title: string;
  objective: string;
  /** Un booleano por letra, en el orden de SMART_LETTERS. */
  filled: boolean[];
  score: number;
};

export function smartMatrix(objectives: Objective[]) {
  const rows: SmartRow[] = [];
  for (const obj of objectives) {
    for (const kr of obj.keyResults) {
      // "T" también cuenta si el KR tiene fecha límite aunque el texto esté vacío.
      const filled = SMART_LETTERS.map(
        ({ key }) => kr[key].trim().length > 0 || (key === "timeBound" && !!kr.dueDate),
      );
      rows.push({
        id: kr.id,
        title: kr.title,
        objective: obj.title,
        filled,
        score: filled.filter(Boolean).length,
      });
    }
  }
  const coverage = SMART_LETTERS.map((_, i) =>
    rows.length ? Math.round((rows.filter((r) => r.filled[i]).length / rows.length) * 100) : 0,
  );
  return { rows, coverage, complete: rows.filter((r) => r.score === 5).length };
}
