// Colores de los calendarios de actividad: una rampa por tipo (su mismo tono,
// de oscuro a neón) y, para el calendario de todo, la mezcla de los tipos de
// cada día pesada por cuántas tareas de cada uno hubo.
import { colorOf, type CustomType } from "./custom-types";

const NEUTRAL = new Set(["module", "other"]);

/** Día sin actividad: el gris de la rejilla. */
export const EMPTY_CELL = "oklch(0.24 0.012 264)";

// Niveles 1..4: más luz y más color cuanto más activo fue el día.
const LIGHT = [0.36, 0.46, 0.57, 0.69];
const CHROMA_K = [0.5, 0.7, 0.88, 1.05];
const GRAY_CHROMA = 0.015;

function baseOf(id: string, custom: CustomType[]): { c: number; h: number } {
  if (NEUTRAL.has(id)) return { c: 0, h: 264 };
  const { chroma, hue } = colorOf(id, custom);
  return { c: chroma, h: hue };
}

const oklch = (level: number, c: number, h: number) =>
  `oklch(${LIGHT[level - 1]} ${(c === 0 ? GRAY_CHROMA : c * CHROMA_K[level - 1]!).toFixed(4)} ${h.toFixed(1)})`;

/** Color del nivel 0..4 en el tono de un tipo. */
export function levelColor(id: string, level: number, custom: CustomType[]): string {
  if (level <= 0) return EMPTY_CELL;
  const { c, h } = baseOf(id, custom);
  return oklch(level, c, h);
}

/** Rampa gris de intensidad (la leyenda del calendario mezclado). */
export const grayLevel = (level: number) => (level <= 0 ? EMPTY_CELL : oklch(level, 0, 264));

/** Mezcla los tonos de los tipos del día en OKLab, pesados por su cantidad.
 * Se conserva la intensidad media (no la del promedio) para que mezclar rojo
 * y azul dé un violeta vivo en vez de un gris sucio. */
export function blendColor(
  types: { id: string; count: number }[],
  level: number,
  custom: CustomType[],
): string {
  if (level <= 0 || types.length === 0) return EMPTY_CELL;
  let a = 0;
  let b = 0;
  let chromaSum = 0;
  let total = 0;
  let dominant = types[0]!;
  for (const t of types) {
    const { c, h } = baseOf(t.id, custom);
    const rad = (h * Math.PI) / 180;
    a += t.count * c * Math.cos(rad);
    b += t.count * c * Math.sin(rad);
    chromaSum += t.count * c;
    total += t.count;
    if (t.count > dominant.count) dominant = t;
  }
  const meanC = chromaSum / total;
  // Tonos opuestos se anulan: entonces manda el tipo que más pesó ese día.
  const hue =
    Math.hypot(a, b) / total < meanC * 0.15
      ? baseOf(dominant.id, custom).h
      : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return oklch(level, meanC, hue);
}
