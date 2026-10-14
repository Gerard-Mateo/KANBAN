import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnId } from "@/lib/kanban-data";

/** Casilla redonda en el color del tipo, como los estados de Linear: vacía es
 * Por hacer, media llena es En progreso y llena con ✓ es Hecha. Con `onToggle`
 * es un botón: un clic la marca como hecha (o la devuelve). */
export function StatusCheck({
  col,
  accent,
  size = 13,
  onToggle,
}: {
  col: ColumnId;
  accent: string;
  size?: number;
  onToggle?: (() => void) | undefined;
}) {
  const done = col === "done";
  const style: CSSProperties = {
    width: size,
    height: size,
    boxShadow: `inset 0 0 0 ${size >= 16 ? 2 : 1.5}px ${accent}`,
    backgroundColor: done ? accent : "transparent",
  };
  const inner = (
    <>
      {col === "doing" && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            inset: size >= 16 ? 3.5 : 2.5,
            background: `conic-gradient(${accent} 0 50%, transparent 50% 100%)`,
          }}
        />
      )}
      <Check
        aria-hidden
        strokeWidth={3.5}
        className={cn(
          "relative size-[72%] transition-[opacity,transform] duration-150",
          done ? "scale-100 opacity-100" : "scale-50 opacity-0",
          onToggle && !done && "group-hover/check:scale-100 group-hover/check:opacity-70",
        )}
        style={{ color: done ? "var(--background)" : accent }}
      />
    </>
  );
  const base =
    "relative grid shrink-0 place-items-center rounded-full transition-[background-color,transform]";
  if (!onToggle) {
    return (
      <span aria-hidden className={base} style={style}>
        {inner}
      </span>
    );
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
      title={done ? "Hecha · clic para devolverla" : "Marcar como hecha"}
      onPointerDown={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        base,
        // Zona de clic más grande que el círculo.
        "group/check cursor-pointer outline-none before:absolute before:-inset-1.5 before:content-[''] hover:scale-110 focus-visible:ring-1 focus-visible:ring-primary active:scale-95",
      )}
      style={style}
    >
      {inner}
    </button>
  );
}
