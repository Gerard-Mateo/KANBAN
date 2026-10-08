// Días planificados de las tareas: fechas locales "AAAA-MM-DD", sin horas (el
// calendario reparte el trabajo por días, no agenda reuniones). Una tarea puede
// ocupar varios días, seguidos o no; cada racha de días seguidos es un "tramo"
// que el calendario dibuja como una sola barra.

export type IsoDay = string;

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (d: Date): IsoDay =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromIso(iso: IsoDay): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export const todayIso = () => toIso(new Date());

export function addDays(iso: IsoDay, n: number): IsoDay {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** a - b en días (redondeado: el cambio de horario no descuadra la cuenta). */
export const diffDays = (a: IsoDay, b: IsoDay) =>
  Math.round((fromIso(a).getTime() - fromIso(b).getTime()) / 86_400_000);

export const isIsoDay = (v: unknown): v is IsoDay =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && toIso(fromIso(v)) === v;

/** Días válidos, sin repetir y en orden. */
export function normalizeDays(raw: unknown): IsoDay[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isIsoDay))].sort();
}

/** Todos los días de a a b, ambos incluidos (en cualquier orden). */
export function rangeDays(a: IsoDay, b: IsoDay): IsoDay[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: IsoDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Lunes de la semana de ese día. */
export function weekStart(iso: IsoDay): IsoDay {
  const dow = (fromIso(iso).getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export const weekOf = (iso: IsoDay): IsoDay[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart(iso), i));

/** Semanas de lunes a domingo que cubren el mes (de 4 a 6). */
export function monthWeeks(year: number, month: number): IsoDay[][] {
  const first = toIso(new Date(year, month, 1));
  const last = toIso(new Date(year, month + 1, 0));
  const weeks: IsoDay[][] = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7))
    weeks.push(weekOf(start));
  return weeks;
}

/** Rachas de días seguidos: [1, 2, 5] -> [[1, 2], [5]]. */
export function runsOf(days: IsoDay[]): IsoDay[][] {
  const runs: IsoDay[][] = [];
  for (const day of normalizeDays(days)) {
    const last = runs[runs.length - 1];
    if (last && diffDays(day, last[last.length - 1]!) === 1) last.push(day);
    else runs.push([day]);
  }
  return runs;
}

/** El tramo de esa tarea que contiene el día. */
export const runContaining = (days: IsoDay[], day: IsoDay) =>
  runsOf(days).find((r) => r.includes(day)) ?? [];

/** Quita los días de `remove` y añade los de `add`. */
export function replaceDays(days: IsoDay[], remove: IsoDay[], add: IsoDay[]): IsoDay[] {
  const gone = new Set(remove);
  return normalizeDays([...days.filter((d) => !gone.has(d)), ...add]);
}

export type WeekSegment<T> = {
  item: T;
  /** El tramo completo, aunque siga en la semana anterior o la siguiente. */
  run: IsoDay[];
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Barras de una semana repartidas en carriles, como en cualquier calendario:
 * cada tramo ocupa el primer carril libre en todos sus días. */
export function layoutWeek<T>(
  items: T[],
  daysOf: (item: T) => IsoDay[] | undefined,
  week: IsoDay[],
): { segments: WeekSegment<T>[]; lanes: number } {
  const first = week[0]!;
  const last = week[week.length - 1]!;
  const segments: WeekSegment<T>[] = [];
  for (const item of items) {
    for (const run of runsOf(daysOf(item) ?? [])) {
      const runStart = run[0]!;
      const runEnd = run[run.length - 1]!;
      if (runEnd < first || runStart > last) continue;
      segments.push({
        item,
        run,
        startCol: Math.max(0, diffDays(runStart, first)),
        endCol: Math.min(week.length - 1, diffDays(runEnd, first)),
        lane: 0,
        continuesBefore: runStart < first,
        continuesAfter: runEnd > last,
      });
    }
  }
  // Los tramos largos primero en cada columna para que no queden partidos.
  segments.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);
  const laneEnds: number[] = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = seg.endCol;
    seg.lane = lane;
  }
  return { segments, lanes: laneEnds.length };
}
