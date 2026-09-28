import { useRef, useState } from "react";
import { Dices } from "lucide-react";
import {
  DEFAULT_CHROMA,
  HUES,
  MAX_CHROMA,
  chipCss,
  clampColor,
  colorHex,
  dotCss,
  type TypeColor,
} from "@/lib/custom-types";
import { hexToOklch } from "@/lib/oklch";

// Franja de tonos de la vuelta completa; la capa de encima la lleva a gris
// hacia abajo, así el cuadro cubre cualquier tono con cualquier intensidad.
const HUE_STOPS = Array.from({ length: 13 }, (_, i) => `oklch(0.62 ${MAX_CHROMA} ${i * 30})`).join(
  ", ",
);
const PAD_BG = `linear-gradient(to bottom, transparent, oklch(0.62 0 0)), linear-gradient(to right, ${HUE_STOPS})`;

export const randomColor = (): TypeColor => ({
  hue: Math.round(Math.random() * 360),
  chroma: 0.12 + Math.random() * (MAX_CHROMA - 0.12),
});

export function ColorPicker({
  value,
  onChange,
  previewLabel,
}: {
  value: TypeColor;
  onChange: (c: TypeColor) => void;
  previewLabel: string;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Solo hay borrador mientras escribes; si no, el campo muestra el color actual.
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const hexError = hexDraft !== null && hexDraft.trim() !== "" && !hexToOklch(hexDraft);

  function pick(clientX: number, clientY: number) {
    const r = padRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    onChange(clampColor(Math.round(x * 360), (1 - y) * MAX_CHROMA));
  }

  function applyHex() {
    if (hexDraft === null) return;
    const lch = hexToOklch(hexDraft);
    if (lch) onChange(clampColor(lch.h, lch.c));
    // Un hex inválido se descarta y el campo vuelve al color actual.
    setHexDraft(null);
  }

  function onKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 30 : 5;
    const cStep = e.shiftKey ? 0.04 : 0.01;
    let next: TypeColor | null = null;
    if (e.key === "ArrowLeft") next = clampColor(value.hue - step, value.chroma);
    else if (e.key === "ArrowRight") next = clampColor(value.hue + step, value.chroma);
    else if (e.key === "ArrowUp") next = clampColor(value.hue, value.chroma + cStep);
    else if (e.key === "ArrowDown") next = clampColor(value.hue, value.chroma - cStep);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div
        ref={padRef}
        role="slider"
        tabIndex={0}
        aria-label="Color: tono de izquierda a derecha, intensidad de arriba a abajo"
        aria-valuetext={`Tono ${Math.round(value.hue)}, intensidad ${Math.round((value.chroma / MAX_CHROMA) * 100)}%`}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKey}
        className="relative h-24 w-56 shrink-0 cursor-crosshair touch-none rounded-lg ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        style={{ background: PAD_BG }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_oklch(0_0_0_/_0.6)]"
          style={{
            left: `${(value.hue / 360) * 100}%`,
            top: `${(1 - value.chroma / MAX_CHROMA) * 100}%`,
            backgroundColor: dotCss(value),
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Color rápido ${h}`}
              onClick={() => onChange({ hue: h, chroma: DEFAULT_CHROMA })}
              className="size-4 rounded-full ring-1 ring-black/30"
              style={{ backgroundColor: dotCss({ hue: h, chroma: DEFAULT_CHROMA }) }}
            />
          ))}
          <button
            type="button"
            aria-label="Gris"
            onClick={() => onChange({ hue: value.hue, chroma: 0 })}
            className="size-4 rounded-full ring-1 ring-black/30"
            style={{ backgroundColor: dotCss({ hue: 0, chroma: 0 }) }}
          />
          <button
            type="button"
            aria-label="Color al azar"
            title="Color al azar"
            onClick={() => onChange(randomColor())}
            className="ml-0.5 grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Dices className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={hexDraft ?? colorHex(value)}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={applyHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyHex();
              }
            }}
            aria-label="Color en hex"
            spellCheck={false}
            className={
              "w-24 rounded-md border bg-card px-2 py-1 font-mono text-[11px] text-foreground uppercase outline-none focus:border-primary " +
              (hexError ? "border-destructive" : "border-border")
            }
          />
          <span
            className="truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={chipCss(value)}
          >
            {previewLabel.trim() || "Vista previa"}
          </span>
        </div>
        {hexError && <p className="text-[11px] text-destructive">Escribe un hex como #E05A3C.</p>}
      </div>
    </div>
  );
}
