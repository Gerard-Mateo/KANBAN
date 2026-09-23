import { useEffect, useRef, useState } from "react";
import { CalendarClock, Hash, Layers, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { COLUMNS, TYPE_LABELS, type ColumnId, type TagTone, type Task } from "@/lib/kanban-data";

const TYPES: TagTone[] = ["video", "guion", "module", "other"];

export function TaskDetailsDialog({
  task,
  column,
  onClose,
  onSave,
  onMove,
  onDelete,
}: {
  task: Task | null;
  column: ColumnId | undefined;
  onClose: () => void;
  onSave: (patch: Partial<Task>) => void;
  onMove: (to: ColumnId) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTitle(task?.title ?? ""), [task?.id]);

  useEffect(() => {
    if (!task?.id) return;
    const id = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [task?.id]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const backdrop = useBackdropClose(onClose);

  if (!task) return null;

  const created = task.createdAt
    ? new Date(task.createdAt).toLocaleString("es-EC", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "Sin registro (tarea inicial)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      {...backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-full max-w-lg rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
            Detalles de la tarea
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

        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Título
        </label>
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && onSave({ title: title.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (title.trim()) onSave({ title: title.trim() });
              onClose();
            }
          }}
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-border/70 bg-card/60 p-3 text-sm text-card-foreground outline-none focus:border-accent/60"
        />

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tipo de tarea
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onSave({ type: task.type === t ? undefined : t })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                task.type === t
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/70 text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Estado
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {COLUMNS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onMove(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                column === c.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/70 text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {c.title}
            </button>
          ))}
        </div>

        <dl className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-3.5" />
            <dt className="font-medium">Creada:</dt>
            <dd className="text-foreground">{created}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="size-3.5" />
            <dt className="font-medium">Columna:</dt>
            <dd className="text-foreground">
              {COLUMNS.find((c) => c.id === column)?.title ?? "—"}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <Hash className="size-3.5" />
            <dt className="font-medium">ID:</dt>
            <dd className="font-mono text-foreground">{task.id}</dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => {
              if (title.trim()) onSave({ title: title.trim() });
              onClose();
            }}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
