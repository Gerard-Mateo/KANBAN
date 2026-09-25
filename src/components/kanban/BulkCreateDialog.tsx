import { useEffect, useMemo, useState } from "react";
import { ListPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { useAllTypes } from "@/lib/custom-types";
import { COLUMN_TITLES, type ColumnId, type TagTone } from "@/lib/kanban-data";
import { TypeCreator, TypeDot } from "./TypeCreator";

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary";
const labelClass = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

export function BulkCreateDialog({
  column,
  onClose,
  onConfirm,
}: {
  column: ColumnId | null;
  onClose: () => void;
  onConfirm: (column: ColumnId, titles: string[], type: TagTone | undefined) => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [lines, setLines] = useState("");
  const [type, setType] = useState<TagTone | null>(null);
  const types = useAllTypes();

  useEffect(() => {
    if (column) {
      setPrefix("");
      setSuffix("");
      setLines("");
      setType(null);
    }
  }, [column]);

  useEffect(() => {
    if (!column) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [column, onClose]);

  const backdrop = useBackdropClose(onClose);

  const titles = useMemo(
    () =>
      lines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((part) => `${prefix}${part}${suffix}`),
    [lines, prefix, suffix],
  );

  if (!column) return null;
  const col = column;

  function confirm() {
    if (titles.length === 0) return;
    onConfirm(col, titles, type ?? undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
      {...backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-full max-w-lg rounded-xl p-5"
      >
        <div className="flex items-start gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Crear varias tareas en {COLUMN_TITLES[col]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Escribe el texto común una sola vez y, abajo, una línea por tarea con la parte que cambia.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Texto antes
            <input
              autoFocus
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder='p. ej. "Video: pantalla "'
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Texto después
            <input
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder='p. ej. " (Módulo RH)"'
              className={inputClass}
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Incluye los espacios o separadores que quieras (p. ej. un espacio al final del texto
          antes).
        </p>

        <label className={cn("mt-4 block", labelClass)}>
          Una tarea por línea
          <textarea
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                confirm();
              }
            }}
            rows={5}
            placeholder={"Personas\nContratos\nAusentismo"}
            className={cn(inputClass, "resize-none")}
          />
        </label>

        <p className={cn("mt-4", labelClass)}>Tipo de tarea (para todas)</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setType(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              type === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Automático
          </button>
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                type === t.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.custom && <TypeDot label={t.label} />}
              {t.label}
            </button>
          ))}
          <TypeCreator onCreated={(label) => setType(label)} />
        </div>

        <div className="mt-4 max-h-40 min-h-10 overflow-y-auto rounded-md border border-border bg-secondary/50 p-2">
          {titles.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Vista previa: escribe al menos una línea para ver las tareas.
            </p>
          ) : (
            titles.map((t, i) => (
              <p key={i} className="truncate text-xs text-muted-foreground">
                {t}
              </p>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-muted-foreground">Ctrl+Enter para crear</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={titles.length === 0}
            onClick={confirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <ListPlus className="size-3.5" /> Crear {titles.length}
          </button>
        </div>
      </div>
    </div>
  );
}
