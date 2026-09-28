// OKRs guardados en este navegador (localStorage), no en la nube: sin sesión
// iniciada, Supabase rechaza cualquier escritura por RLS y los OKRs no se podían
// crear. Ahora viven aquí, viajan en el Excel (hojas Objetivos / Resultados
// clave / Tareas KR) y se guardan con Guardar / Ctrl+G igual que el tablero.
import { useSyncExternalStore } from "react";

export type KrTask = {
  id: string;
  keyResultId: string;
  title: string;
  boardTaskTitle: string;
  done: boolean;
  position: number;
  /** Cuánto empuja el KR, de 1 a MAX_WEIGHT: una tarea de peso 3 vale el triple que una de 1. */
  weight: number;
  /** Tipo de la tarea en el tablero (el mismo id que Task.type); null = sin tipo. */
  type: string | null;
};

export const MAX_WEIGHT = 5;
export const clampWeight = (w: number) =>
  Math.min(MAX_WEIGHT, Math.max(1, Math.round(Number.isFinite(w) ? w : 1)));

/** "up": más es mejor (ventas, videos). "down": menos es mejor (ranking, costos). */
export type Direction = "up" | "down";

export type KeyResult = {
  id: string;
  objectiveId: string;
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  unit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  direction: Direction;
  /** La "T" de SMART: fecha límite (AAAA-MM-DD). */
  dueDate: string | null;
  position: number;
  /** Momento de creación (ms); es el arranque del plazo del KR. */
  createdAt: number;
  tasks: KrTask[];
};

export type Objective = {
  id: string;
  title: string;
  description: string;
  period: string;
  status: string;
  position: number;
  keyResults: KeyResult[];
};

export type KeyResultInput = {
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  unit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  direction: Direction;
  dueDate: string | null;
};

/* ------------------------------- Progreso ------------------------------- */

/** Progreso métrico del KR (0-100), en su dirección: subir hacia la meta o bajar hasta ella. */
export function metricProgress(kr: KeyResult): number {
  const down = kr.direction === "down";
  const total = down ? kr.startValue - kr.targetValue : kr.targetValue - kr.startValue;
  if (total <= 0) {
    const reached = down ? kr.currentValue <= kr.targetValue : kr.currentValue >= kr.targetValue;
    return reached ? 100 : 0;
  }
  const gained = down ? kr.startValue - kr.currentValue : kr.currentValue - kr.startValue;
  return Math.max(0, Math.min(100, Math.round((gained / total) * 100)));
}

/** Progreso por mini-tareas completadas, ponderado por su peso (0-100), o null si no hay tareas. */
export function taskProgress(kr: KeyResult): number | null {
  if (kr.tasks.length === 0) return null;
  const total = kr.tasks.reduce((n, t) => n + t.weight, 0);
  const done = kr.tasks.reduce((n, t) => n + (t.done ? t.weight : 0), 0);
  return Math.round((done / total) * 100);
}

/** Qué parte del avance por tareas aporta esta tarea (0-100). */
export function taskShare(kr: KeyResult, task: KrTask): number {
  const total = kr.tasks.reduce((n, t) => n + t.weight, 0);
  return total ? Math.round((task.weight / total) * 100) : 0;
}

/** Avance combinado del KR: métrica y mini-tareas a partes iguales (0-100). */
export function krProgress(kr: KeyResult): number {
  const tp = taskProgress(kr);
  const mp = metricProgress(kr);
  return tp === null ? mp : Math.round((mp + tp) / 2);
}

export function objectiveProgress(obj: Objective): number {
  if (obj.keyResults.length === 0) return 0;
  const sum = obj.keyResults.reduce((acc, kr) => acc + krProgress(kr), 0);
  return Math.round(sum / obj.keyResults.length);
}

/* --------------------------------- Ritmo --------------------------------- */

export type PaceStatus = "done" | "onTrack" | "behind" | "overdue";

export type KrPace = {
  status: PaceStatus;
  /** Porcentaje del plazo ya consumido, 0-100. */
  elapsed: number;
  /** Días que faltan (negativo = ya venció). */
  daysLeft: number;
};

const DAY = 86_400_000;
/** Margen para seguir "en ritmo" aunque vayas un poco por detrás del reloj. */
const PACE_SLACK = 10;

/** Fecha límite (AAAA-MM-DD) como el final de ese día en hora local. */
export function dueTime(date: string): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime();
}

/** Cómo va el KR frente a su fecha límite; null si no tiene fecha. */
export function krPace(kr: KeyResult, now = Date.now()): KrPace | null {
  const end = kr.dueDate ? dueTime(kr.dueDate) : null;
  if (end == null) return null;
  const span = end - kr.createdAt;
  const elapsed = span <= 0 ? 100 : Math.min(100, Math.max(0, ((now - kr.createdAt) / span) * 100));
  const progress = krProgress(kr);
  // Días de calendario: el mismo día de la fecha límite ya es "0 días".
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(end);
  dueDay.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((dueDay.getTime() - today.getTime()) / DAY);
  const status: PaceStatus =
    progress >= 100
      ? "done"
      : now > end
        ? "overdue"
        : progress + PACE_SLACK >= elapsed
          ? "onTrack"
          : "behind";
  return { status, elapsed: Math.round(elapsed), daysLeft };
}

/* ------------------------------- Almacén -------------------------------- */

const KEY = "kanban-okrs-v1";
const EMPTY: Objective[] = [];

let cache: Objective[] | null = null;
const listeners = new Set<() => void>();

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const newId = () => crypto.randomUUID();

/** Rellena lo que falte para que datos viejos o importados siempre tengan forma válida. */
export function normalizeOkrs(raw: unknown): Objective[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o, oi) => {
      const objectiveId = str(o["id"]) || newId();
      const krs = Array.isArray(o["keyResults"]) ? (o["keyResults"] as unknown[]) : [];
      return {
        id: objectiveId,
        title: str(o["title"]),
        description: str(o["description"]),
        period: str(o["period"]),
        status: str(o["status"], "active") || "active",
        position: oi,
        keyResults: krs
          .filter((k): k is Record<string, unknown> => !!k && typeof k === "object")
          .map((k, ki) => {
            const krId = str(k["id"]) || newId();
            const tasks = Array.isArray(k["tasks"]) ? (k["tasks"] as unknown[]) : [];
            const due = k["dueDate"];
            const startValue = num(k["startValue"], 0);
            const targetValue = num(k["targetValue"], 100);
            const dir = k["direction"];
            return {
              id: krId,
              objectiveId,
              title: str(k["title"]),
              specific: str(k["specific"]),
              measurable: str(k["measurable"]),
              achievable: str(k["achievable"]),
              relevant: str(k["relevant"]),
              unit: str(k["unit"]),
              startValue,
              currentValue: num(k["currentValue"], 0),
              targetValue,
              // Los KRs sin dirección guardada la deducen: meta por debajo del inicio = bajar.
              direction:
                dir === "up" || dir === "down"
                  ? dir
                  : startValue > targetValue
                    ? ("down" as const)
                    : ("up" as const),
              dueDate: typeof due === "string" && due ? due : null,
              position: ki,
              createdAt: num(k["createdAt"], Date.now()),
              tasks: tasks
                .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
                .map((t, ti) => ({
                  id: str(t["id"]) || newId(),
                  keyResultId: krId,
                  title: str(t["title"]),
                  boardTaskTitle: str(t["boardTaskTitle"]),
                  done: t["done"] === true,
                  position: ti,
                  weight: clampWeight(num(t["weight"], 1)),
                  type: str(t["type"]) || null,
                })),
            };
          }),
      };
    });
}

function read(): Objective[] {
  if (cache) return cache;
  try {
    cache = normalizeOkrs(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: Objective[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error("No hay espacio en el navegador para guardar los OKRs.");
  } finally {
    listeners.forEach((l) => l());
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOkrs(): Objective[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const getOkrs = () => read();

/** Sustituye todos los OKRs (al importar un Excel que los trae). */
export function replaceOkrs(list: Objective[]) {
  write(normalizeOkrs(list));
}

/* ---------------------------- Modificaciones ---------------------------- */
// Devuelven promesas para encajar con el `run` de la página de OKRs.

const mapKrs = (fn: (kr: KeyResult) => KeyResult) =>
  read().map((o) => ({ ...o, keyResults: o.keyResults.map(fn) }));

export async function createObjective(input: {
  title: string;
  description: string;
  period: string;
}): Promise<void> {
  const list = read();
  write([
    ...list,
    {
      id: newId(),
      title: input.title,
      description: input.description,
      period: input.period,
      status: "active",
      position: list.length,
      keyResults: [],
    },
  ]);
}

export async function deleteObjective(id: string): Promise<void> {
  write(read().filter((o) => o.id !== id));
}

export async function createKeyResult(objectiveId: string, input: KeyResultInput): Promise<void> {
  write(
    read().map((o) =>
      o.id !== objectiveId
        ? o
        : {
            ...o,
            keyResults: [
              ...o.keyResults,
              {
                ...input,
                id: newId(),
                objectiveId,
                position: o.keyResults.length,
                createdAt: Date.now(),
                tasks: [],
              },
            ],
          },
    ),
  );
}

export async function updateKeyResult(id: string, patch: Partial<KeyResultInput>): Promise<void> {
  write(mapKrs((kr) => (kr.id === id ? { ...kr, ...patch } : kr)));
}

export async function deleteKeyResult(id: string): Promise<void> {
  write(read().map((o) => ({ ...o, keyResults: o.keyResults.filter((kr) => kr.id !== id) })));
}

export async function createKrTask(
  keyResultId: string,
  title: string,
  boardTaskTitle: string,
  opts: { weight?: number; type?: string | null } = {},
): Promise<void> {
  write(
    mapKrs((kr) =>
      kr.id !== keyResultId
        ? kr
        : {
            ...kr,
            tasks: [
              ...kr.tasks,
              {
                id: newId(),
                keyResultId,
                title,
                boardTaskTitle,
                done: false,
                position: kr.tasks.length,
                weight: clampWeight(opts.weight ?? 1),
                type: opts.type ?? null,
              },
            ],
          },
    ),
  );
}

export async function setKrTaskDone(id: string, done: boolean): Promise<void> {
  write(
    mapKrs((kr) => ({ ...kr, tasks: kr.tasks.map((t) => (t.id === id ? { ...t, done } : t)) })),
  );
}

export async function deleteKrTask(id: string): Promise<void> {
  write(mapKrs((kr) => ({ ...kr, tasks: kr.tasks.filter((t) => t.id !== id) })));
}

export async function updateKrTask(
  id: string,
  patch: Partial<Pick<KrTask, "weight" | "type">>,
): Promise<void> {
  const fixed =
    patch.weight === undefined ? patch : { ...patch, weight: clampWeight(patch.weight) };
  write(
    mapKrs((kr) => ({ ...kr, tasks: kr.tasks.map((t) => (t.id === id ? { ...t, ...fixed } : t)) })),
  );
}

/* ------------------------- Sincronía con el tablero ----------------------- */
// Las mini-tareas son tareas normales del tablero: si su tarjeta llega a Hecho
// la mini-tarea queda hecha (y al revés), y su tipo es el de la tarjeta.

export type BoardTaskRef = {
  title: string;
  column: "todo" | "doing" | "done";
  /** Task.type de la tarjeta (id del tipo), o null. */
  type: string | null;
};

/** Para reconocer la misma tarea aunque cambien espacios, saltos o mayúsculas. */
export const sameText = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();

export function boardIndex(tasks: BoardTaskRef[]): Map<string, BoardTaskRef> {
  const map = new Map<string, BoardTaskRef>();
  for (const t of tasks)
    if (t.title.trim() && !map.has(sameText(t.title))) map.set(sameText(t.title), t);
  return map;
}

/** La tarjeta del tablero de esta mini-tarea, si existe. */
export const boardTaskOf = (index: Map<string, BoardTaskRef>, t: KrTask) =>
  index.get(sameText(t.boardTaskTitle || t.title));

/** Copia a los OKRs el estado de las tarjetas enlazadas; solo escribe si algo cambió. */
export function syncKrTasksWithBoard(tasks: BoardTaskRef[]) {
  const list = read();
  if (list.length === 0) return;
  const index = boardIndex(tasks);
  let changed = false;
  const next = list.map((o) => ({
    ...o,
    keyResults: o.keyResults.map((kr) => ({
      ...kr,
      tasks: kr.tasks.map((t) => {
        const card = boardTaskOf(index, t);
        if (!card) return t;
        const done = card.column === "done";
        if (done === t.done && card.type === t.type) return t;
        changed = true;
        return { ...t, done, type: card.type };
      }),
    })),
  }));
  if (changed) write(next);
}
