// Espacio personal de cada cuenta: sus pendientes, su lista de regalos y la
// apariencia que eligió. No es el tablero de la empresa: vive en su propia
// tabla (una fila por cuenta) y además se copia en este navegador para abrir
// al instante y no perder nada si la base no responde.
import { useSyncExternalStore } from "react";
import { loadPersonalRemote, savePersonalRemote } from "./personal-cloud";

/** 3 = alta, 2 = media, 1 = baja. */
export type Importance = 1 | 2 | 3;

export type PersonalTodo = {
  id: string;
  title: string;
  importance: Importance;
  /** "AAAA-MM-DD" o null si no tiene fecha límite. */
  deadline: string | null;
  createdAt: number;
  /** Cuándo se tachó; null mientras está pendiente. */
  doneAt: number | null;
};

export type Gift = {
  id: string;
  idea: string;
  /** Para quién es la idea (texto libre: "Mamá", "Andrea"...). */
  person: string;
  /** Enlace al producto, un reel, etc. */
  link: string;
  note: string;
  createdAt: number;
  /** Cuándo se regaló; las ideas nunca se borran solas. */
  givenAt: number | null;
};

export type Background = { kind: "preset"; id: string } | { kind: "image"; src: string };

export type PersonalTheme = {
  title: string;
  accent: { hue: number; chroma: number };
  background: Background;
  /** Cuánto se oscurece el fondo (0-0.85) para que se lea bien encima. */
  dim: number;
  /** Desenfoque del fondo en px. */
  blur: number;
  card: "glass" | "solid";
  /** Opacidad de las tarjetas de cristal (0.25-1). */
  cardOpacity: number;
  font: "sans" | "serif" | "mono" | "rounded";
  todoIcon: string;
  giftIcon: string;
};

export type PersonalSpace = {
  version: 1;
  updatedAt: number;
  todos: PersonalTodo[];
  gifts: Gift[];
  theme: PersonalTheme;
};

export type SyncStatus = "idle" | "loading" | "saving" | "saved" | "offline";

export const DEFAULT_THEME: PersonalTheme = {
  title: "Mi espacio",
  accent: { hue: 300, chroma: 0.17 },
  background: { kind: "preset", id: "aurora" },
  dim: 0.3,
  blur: 0,
  card: "glass",
  cardOpacity: 0.62,
  font: "sans",
  todoIcon: "ListTodo",
  giftIcon: "Gift",
};

const emptySpace = (): PersonalSpace => ({
  version: 1,
  updatedAt: 0,
  todos: [],
  gifts: [],
  theme: DEFAULT_THEME,
});

/* ------------------------------ Normalizar ------------------------------- */

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const records = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const newId = () => crypto.randomUUID();

function normalizeTheme(raw: unknown): PersonalTheme {
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const accent = (t["accent"] ?? {}) as Record<string, unknown>;
  const bg = (t["background"] ?? {}) as Record<string, unknown>;
  const background: Background =
    bg["kind"] === "image" && typeof bg["src"] === "string" && bg["src"]
      ? { kind: "image", src: bg["src"] }
      : { kind: "preset", id: str(bg["id"]) || "aurora" };
  const font = t["font"];
  return {
    title: str(t["title"], DEFAULT_THEME.title).slice(0, 60) || DEFAULT_THEME.title,
    accent: {
      hue: ((num(accent["hue"], DEFAULT_THEME.accent.hue) % 360) + 360) % 360,
      chroma: clamp(num(accent["chroma"], DEFAULT_THEME.accent.chroma), 0, 0.22),
    },
    background,
    dim: clamp(num(t["dim"], DEFAULT_THEME.dim), 0, 0.85),
    blur: clamp(num(t["blur"], DEFAULT_THEME.blur), 0, 24),
    card: t["card"] === "solid" ? "solid" : "glass",
    cardOpacity: clamp(num(t["cardOpacity"], DEFAULT_THEME.cardOpacity), 0.25, 1),
    font: font === "serif" || font === "mono" || font === "rounded" ? font : "sans",
    todoIcon: str(t["todoIcon"], DEFAULT_THEME.todoIcon) || DEFAULT_THEME.todoIcon,
    giftIcon: str(t["giftIcon"], DEFAULT_THEME.giftIcon) || DEFAULT_THEME.giftIcon,
  };
}

/** Rellena lo que falte para que datos viejos, importados o de otra versión
 * siempre tengan forma válida. */
export function normalizeSpace(raw: unknown): PersonalSpace {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    version: 1,
    updatedAt: num(s["updatedAt"], 0),
    todos: records(s["todos"])
      .map((t) => {
        const imp = num(t["importance"], 2);
        const doneAt = t["doneAt"] == null ? null : num(t["doneAt"], Date.now());
        return {
          id: str(t["id"]) || newId(),
          title: str(t["title"]).trim(),
          importance: (imp >= 3 ? 3 : imp <= 1 ? 1 : 2) as Importance,
          deadline: isDay(t["deadline"]) ? t["deadline"] : null,
          createdAt: num(t["createdAt"], Date.now()),
          doneAt,
        };
      })
      .filter((t) => t.title),
    gifts: records(s["gifts"])
      .map((g) => ({
        id: str(g["id"]) || newId(),
        idea: str(g["idea"]).trim(),
        person: str(g["person"]).trim(),
        link: str(g["link"]).trim(),
        note: str(g["note"]).trim(),
        createdAt: num(g["createdAt"], Date.now()),
        givenAt: g["givenAt"] == null ? null : num(g["givenAt"], Date.now()),
      }))
      .filter((g) => g.idea),
    theme: normalizeTheme(s["theme"]),
  };
}

/* -------------------------------- Almacén -------------------------------- */

const cacheKey = (userId: string) => `kanban-personal-v1:${userId}`;
const SAVE_DELAY = 700;

let owner: string | null = null;
let state: PersonalSpace = emptySpace();
let status: SyncStatus = "idle";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const usePersonal = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
export const usePersonalStatus = () =>
  useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );

function setStatus(next: SyncStatus) {
  if (status === next) return;
  status = next;
  emit();
}

function writeCache() {
  if (!owner) return;
  try {
    localStorage.setItem(cacheKey(owner), JSON.stringify(state));
  } catch {
    /* sin espacio en el navegador: queda la copia de la base */
  }
}

async function pushRemote() {
  if (!owner) return;
  const user = owner;
  setStatus("saving");
  try {
    await savePersonalRemote(user, state);
    if (owner === user) setStatus("saved");
  } catch {
    if (owner === user) setStatus("offline");
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void pushRemote(), SAVE_DELAY);
}

/** Abre el espacio de esta cuenta: primero la copia del navegador (al
 * instante) y luego la de la base; gana la más reciente. */
export async function openPersonal(userId: string) {
  if (owner !== userId) {
    owner = userId;
    let cached: PersonalSpace | null = null;
    try {
      const raw = localStorage.getItem(cacheKey(userId));
      cached = raw ? normalizeSpace(JSON.parse(raw)) : null;
    } catch {
      cached = null;
    }
    state = cached ?? emptySpace();
    emit();
  }
  setStatus("loading");
  try {
    const remote = await loadPersonalRemote(userId);
    if (owner !== userId) return;
    const fromRemote = remote ? normalizeSpace(remote) : null;
    if (fromRemote && fromRemote.updatedAt > state.updatedAt) {
      state = fromRemote;
      writeCache();
      emit();
      setStatus("saved");
    } else if (state.updatedAt > (fromRemote?.updatedAt ?? 0)) {
      // Lo de este navegador es más nuevo (p. ej. se editó sin conexión).
      await pushRemote();
    } else setStatus("saved");
  } catch {
    if (owner === userId) setStatus("offline");
  }
}

function commit(next: Omit<PersonalSpace, "updatedAt" | "version">) {
  state = { ...next, version: 1, updatedAt: Date.now() };
  writeCache();
  emit();
  scheduleSave();
}

/* -------------------------------- Acciones ------------------------------- */

export function addTodo(title: string, importance: Importance, deadline: string | null) {
  const clean = title.trim();
  if (!clean) return;
  commit({
    ...state,
    todos: [
      ...state.todos,
      { id: newId(), title: clean, importance, deadline, createdAt: Date.now(), doneAt: null },
    ],
  });
}

export function updateTodo(id: string, patch: Partial<Omit<PersonalTodo, "id">>) {
  commit({ ...state, todos: state.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

export const setTodoDone = (id: string, done: boolean) =>
  updateTodo(id, { doneAt: done ? Date.now() : null });

export function deleteTodo(id: string) {
  commit({ ...state, todos: state.todos.filter((t) => t.id !== id) });
}

export function clearDoneTodos() {
  commit({ ...state, todos: state.todos.filter((t) => !t.doneAt) });
}

export function addGift(gift: { idea: string; person: string; link: string; note: string }) {
  if (!gift.idea.trim()) return;
  commit({
    ...state,
    gifts: [
      ...state.gifts,
      {
        id: newId(),
        idea: gift.idea.trim(),
        person: gift.person.trim(),
        link: gift.link.trim(),
        note: gift.note.trim(),
        createdAt: Date.now(),
        givenAt: null,
      },
    ],
  });
}

export function updateGift(id: string, patch: Partial<Omit<Gift, "id">>) {
  commit({ ...state, gifts: state.gifts.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
}

export const setGiftGiven = (id: string, given: boolean) =>
  updateGift(id, { givenAt: given ? Date.now() : null });

export function deleteGift(id: string) {
  commit({ ...state, gifts: state.gifts.filter((g) => g.id !== id) });
}

export function setTheme(patch: Partial<PersonalTheme>) {
  commit({ ...state, theme: { ...state.theme, ...patch } });
}

export const resetTheme = () => commit({ ...state, theme: DEFAULT_THEME });

/** Copia de seguridad en JSON (todo el espacio, imagen de fondo incluida). */
export const exportSpace = () => JSON.stringify(state, null, 2);

/** Restaura una copia: reemplaza todo el espacio de esta cuenta. */
export function importSpace(json: string) {
  const parsed = normalizeSpace(JSON.parse(json));
  commit({ todos: parsed.todos, gifts: parsed.gifts, theme: parsed.theme });
}
