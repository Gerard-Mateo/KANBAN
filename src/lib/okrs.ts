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
};

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

/** Progreso por mini-tareas completadas (0-100), o null si no hay tareas. */
export function taskProgress(kr: KeyResult): number | null {
  if (kr.tasks.length === 0) return null;
  const done = kr.tasks.filter((t) => t.done).length;
  return Math.round((done / kr.tasks.length) * 100);
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
