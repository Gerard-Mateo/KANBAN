import { useEffect } from "react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { useAllTypes } from "@/lib/custom-types";
import {
  COLUMNS,
  COLUMN_TITLES,
  tagsForTask,
  type ColumnId,
  type TagTone,
  type Task,
} from "@/lib/kanban-data";
import { TypeCreator, TypeDot } from "./TypeCreator";

type Item = { task: Task; col: ColumnId };

function chipClass(active: boolean, partial: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : partial
        ? "border-primary/50 bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:text-foreground",
  );
}

export function BulkDetailsDialog({
  items,
  onClose,
  onSetType,
  onMove,
  onRename,
}: {
  items: Item[];
  onClose: () => void;
  onSetType: (type: TagTone | undefined) => void;
  onMove: (to: ColumnId) => void;
  onRename: () => void;
}) {
  const open = items.length > 0;
  const types = useAllTypes();

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  const backdrop = useBackdropClose(onClose);

  if (!open) return null;

  const n = items.length;
  const typeCount = (t: TagTone) => items.filter((i) => i.task.type === t).length;
  const colCount = (c: ColumnId) => items.filter((i) => i.col === c).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4"
      {...backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-full max-w-lg rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-start gap-3">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Detalles de {n} tareas
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Los cambios se aplican a todas las tareas seleccionadas al instante.
        </p>

        <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Tipo de tarea
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {types.map((t) => {
            const count = typeCount(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSetType(count === n ? undefined : t.id)}
                className={chipClass(count === n, count > 0 && count < n)}
              >
                {t.custom && <TypeDot label={t.label} />}
                {t.label}
                {count > 0 && count < n && <span className="opacity-70">{count}</span>}
              </button>
            );
          })}
          <TypeCreator onCreated={(label) => onSetType(label)} />
        </div>

        <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Estado
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {COLUMNS.map((c) => {
            const count = colCount(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onMove(c.id)}
                className={chipClass(count === n, count > 0 && count < n)}
              >
                {c.title}
                {count > 0 && count < n && <span className="opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="max-h-44 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-2">
          {items.map(({ task, col }) => (
            <div key={task.id} className="flex items-center gap-2 py-0.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {task.title || "(sin título)"}
              </span>
              <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {tagsForTask(task)[0]?.label}
              </span>
              <span className="w-20 shrink-0 text-right text-muted-foreground">
                {COLUMN_TITLES[col]}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onRename}
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Renombrar títulos…
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
