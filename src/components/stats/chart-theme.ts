// Tokens compartidos por las gráficas de la pestaña Stats (tema TRON oscuro).
import { hueFor, type CustomType } from "@/lib/custom-types";

// Slots categóricos TRON (orden fijo, nunca ciclado), validados contra el
// fondo oscuro: rojo Ares, cian de la Grid, ámbar, magenta, violeta, verde,
// azul y oliva.
export const SERIES = [
  "#f0513a",
  "#0e97bb",
  "#c48400",
  "#d1489a",
  "#8b7ae8",
  "#00a377",
  "#5b7fd4",
  "#7f9422",
];
export const seriesColor = (i: number) => SERIES[i % SERIES.length]!;

export const AXIS = "oklch(0.68 0.015 264)";
export const GRID = "oklch(0.3 0.02 264)";
export const CURSOR_FILL = "oklch(0.25 0.016 264)";
export const TOMATO = "oklch(0.63 0.21 32)";

// Estados (reservados: solo significan bien / aviso / mal, siempre con etiqueta).
export const STATUS = {
  good: "oklch(0.7 0.16 165)",
  info: "#0e97bb",
  warning: "oklch(0.78 0.15 80)",
  critical: "oklch(0.64 0.23 22)",
};

export const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid oklch(0.3 0.02 264)",
    background: "oklch(0.2 0.014 264)",
    fontSize: 12,
    boxShadow: "0 4px 20px oklch(0 0 0 / 0.6)",
  },
  labelStyle: { fontWeight: 600, color: "oklch(0.95 0.008 80)" },
  itemStyle: { color: "oklch(0.95 0.008 80)" },
};

/** El mismo tono que la pastilla del tipo en el tablero; los tipos neutros
 * (Módulo, General) van en gris, igual que allí. */
export function typeColor(id: string, custom: CustomType[]): string {
  if (id === "module" || id === "other") return "oklch(0.74 0.02 264)";
  return `oklch(0.68 0.19 ${hueFor(id, custom)})`;
}

/** Topes redondos para un eje: 1, 2, 5 × 10ⁿ, con ~4 marcas. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}
