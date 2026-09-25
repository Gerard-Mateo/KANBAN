// Tipos de tarea personalizados. Un tipo personalizado se guarda en la tarea
// como su propia etiqueta; aquí solo se recuerda el color y qué tipos existen
// (por navegador, en localStorage).
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { BUILTIN_TONES, isBuiltinTone, typeLabel } from "./kanban-data";

export type CustomType = { label: string; hue: number };

const KEY = "kanban-custom-types-v1";
export const HUES = [25, 55, 85, 150, 200, 264, 300, 340];
const EMPTY: CustomType[] = [];

let cache: CustomType[] | null = null;
const listeners = new Set<() => void>();

function read(): CustomType[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(raw)
      ? raw.filter(
          (r): r is CustomType => !!r && typeof r.label === "string" && typeof r.hue === "number",
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: CustomType[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento: queda solo en memoria */
  }
  listeners.forEach((l) => l());
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

export function useCustomTypes(): CustomType[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export type TypeOption = { id: string; label: string; custom: boolean };

/** Tipos incluidos + personalizados, en el orden en que se muestran. */
export function useAllTypes(): TypeOption[] {
  const custom = useCustomTypes();
  return useMemo(
    () => [
      ...BUILTIN_TONES.map((id) => ({ id, label: typeLabel(id), custom: false })),
      ...custom.map((c) => ({ id: c.label, label: c.label, custom: true })),
    ],
    [custom],
  );
}

const norm = (v: string) => v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const hashHue = (label: string) => {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
};

// Los tipos incluidos también tienen su tono fijo: rojo Ares para Video y
// cian de la Grid para Guion, para que no se confundan entre sí.
const BUILTIN_HUES: Record<string, number> = { video: 32, guion: 220 };

export const hueFor = (label: string, list: CustomType[]) =>
  list.find((c) => c.label === label)?.hue ?? BUILTIN_HUES[label] ?? hashHue(label);

export function addCustomType(
  rawLabel: string,
  hue: number,
): { ok: true; label: string } | { ok: false; error: string } {
  const label = rawLabel.trim().replace(/\s+/g, " ");
  if (!/[\p{L}\p{N}]/u.test(label)) return { ok: false, error: "Escribe un nombre." };
  if (label.length > 24) return { ok: false, error: "Máximo 24 caracteres." };
  const n = norm(label);
  const taken =
    BUILTIN_TONES.some((id) => norm(typeLabel(id)) === n || id === n) ||
    read().some((c) => norm(c.label) === n);
  if (taken) return { ok: false, error: "Ya existe un tipo con ese nombre." };
  write([...read(), { label, hue }]);
  return { ok: true, label };
}

/** Registra un tipo que aparece en tareas (nube / importación) si aún no existe. */
export function ensureCustomType(label: string) {
  if (!label || isBuiltinTone(label) || read().some((c) => c.label === label)) return;
  write([...read(), { label, hue: hashHue(label) }]);
}

export const getCustomTypes = () => read();

/** Crea el tipo con ese color, o le cambia el color si ya existe. */
export function upsertCustomType(label: string, hue: number) {
  if (!label || isBuiltinTone(label)) return;
  const list = read();
  if (list.some((c) => c.label === label)) {
    write(list.map((c) => (c.label === label ? { ...c, hue } : c)));
  } else {
    write([...list, { label, hue }]);
  }
}

// Nombres de color para el Excel (en vez de un número de matiz).
export const HUE_NAMES = [
  "Rojo",
  "Naranja",
  "Amarillo",
  "Verde",
  "Turquesa",
  "Azul",
  "Morado",
  "Rosa",
];

export const hueName = (hue: number) => HUE_NAMES[HUES.indexOf(hue)] ?? String(hue);

/** Acepta el nombre del color ("Rosa") o el número de matiz. */
export function hueFromValue(value: unknown): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const byName = HUE_NAMES.findIndex((n) => norm(n) === norm(raw));
  if (byName >= 0) return HUES[byName];
  const num = Number(raw);
  return Number.isFinite(num) ? ((num % 360) + 360) % 360 : undefined;
}

export function removeCustomType(label: string) {
  write(read().filter((c) => c.label !== label));
}

export function typeChipStyle(label: string, list: CustomType[]): CSSProperties {
  const h = hueFor(label, list);
  // Pastilla oscura con texto de neón, para que brille sobre la rejilla negra.
  return {
    backgroundColor: `oklch(0.28 0.07 ${h})`,
    color: `oklch(0.82 0.17 ${h})`,
  };
}

export const typeDotColor = (label: string, list: CustomType[]) =>
  `oklch(0.62 0.17 ${hueFor(label, list)})`;
