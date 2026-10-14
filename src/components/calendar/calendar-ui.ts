// Piezas compartidas por las vistas del calendario (mes, semana y día).
import type { CSSProperties } from "react";
import { tagsForTask, type ColumnId, type Task } from "@/lib/kanban-data";
import { chipCss, colorOf, dotCss, type CustomType } from "@/lib/custom-types";
import { diffDays, fromIso, type IsoDay } from "@/lib/calendar";

export type Item = { task: Task; col: ColumnId };

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const STATUS_LABEL: Record<ColumnId, string> = {
  todo: "Por hacer",
  doing: "En progreso",
  done: "Hecha",
};

const NEUTRAL_TONES = new Set(["module", "other"]);

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LIFT_SHADOW = "0 8px 24px oklch(0 0 0 / 0.6), 0 0 0 1px var(--primary)";

/** Franja de color del tipo a la izquierda (y la sombra de "levantada" al arrastrar). */
export const edgeShadow = (accent: string, edge: boolean, lifted: boolean) =>
  [edge ? `inset 2px 0 0 ${accent}` : "", lifted ? LIFT_SHADOW : ""].filter(Boolean).join(", ") ||
  undefined;

/** Color de la barra: el del tipo de la tarea, o gris para los tipos neutros. */
export function barColors(
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

export function plannedAhead(task: Task, today: IsoDay) {
  return (task.days ?? []).some((d) => d >= today);
}

/** El día de la rejilla que hay bajo ese punto de la pantalla. */
export function dayAt(x: number, y: number): IsoDay | undefined {
  const hit = document
    .elementsFromPoint(x, y)
    .find((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset["day"]);
  return hit?.dataset["day"];
}

/** "Hoy", "Mañana", "Ayer", "En 3 días", "Hace 5 días". */
export function relativeDay(day: IsoDay, today: IsoDay): string {
  const n = diffDays(day, today);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}

/** "Miércoles, 14 de octubre" (con el año si no es el actual). */
export function longDate(day: IsoDay, today: IsoDay): string {
  const d = fromIso(day);
  const sameYear = d.getFullYear() === fromIso(today).getFullYear();
  return cap(
    d.toLocaleDateString("es", {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
    }),
  );
}

/** Claves de selección: un tramo del calendario o una tarea de la lista. */
export const runKey = (taskId: string, start: IsoDay) => `run:${taskId}:${start}`;
export const chipKey = (taskId: string) => `task:${taskId}`;

const STATUS_ORDER: Record<ColumnId, number> = { doing: 0, todo: 1, done: 2 };

/** Las tareas de un día en el orden en que se muestran: en progreso, por
 * hacer y hechas; dentro de cada grupo, el orden que les diste (las nunca
 * ordenadas al final, en el orden del tablero). */
export function dayList(items: Item[], day: IsoDay): Item[] {
  const rank = (it: Item) => it.task.dayOrder?.[day] ?? Number.POSITIVE_INFINITY;
  return items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.task.days?.includes(day))
    .sort((a, b) => {
      const ra = rank(a.it);
      const rb = rank(b.it);
      return (
        STATUS_ORDER[a.it.col] - STATUS_ORDER[b.it.col] ||
        (ra === rb ? 0 : ra < rb ? -1 : 1) ||
        a.i - b.i
      );
    })
    .map(({ it }) => it);
}
