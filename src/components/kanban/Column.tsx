import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnId, Task } from "@/lib/kanban-data";
import { SortableTaskCard } from "./TaskCard";

const accent: Record<ColumnId, string> = {
  todo: "bg-todo",
  doing: "bg-doing",
  done: "bg-done",
};

export function Column({
  id,
  title,
  hint,
  tasks,
  onAdd,
  onTaskContextMenu,
  selectedIds,
  onTaskSelect,
}: {
  id: ColumnId;
  title: string;
  hint: string;
  tasks: Task[];
  onAdd: (title: string) => void;
  onTaskContextMenu?: ((task: Task, e: React.MouseEvent) => void) | undefined;
  selectedIds?: Set<string> | undefined;
  onTaskSelect?: ((task: Task, e: React.MouseEvent) => void) | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "column" } });
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (composing) inputRef.current?.focus();
  }, [composing]);

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue("");
    setComposing(false);
  }

  function openComposer(e: React.MouseEvent) {
    // Ignore modifier-driven context menus (e.g. Ctrl/Cmd + click or Ctrl+A on macOS)
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    setComposing(true);
  }

  return (
    <section onContextMenu={openComposer} className="flex min-h-[60vh] flex-col">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", accent[id])} />
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
        <button
          type="button"
          aria-label={`Nueva tarea en ${title}`}
          onClick={() => setComposing((v) => !v)}
          className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </header>
      <p className="mb-3 px-1 text-xs text-muted-foreground">{hint}</p>

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl bg-secondary/50 p-2 transition-colors duration-150",
          isOver && "bg-primary/[0.06]",
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <div key={task.id} data-task-id={task.id}>
              <SortableTaskCard
                task={task}
                onContextMenu={onTaskContextMenu}
                selected={selectedIds?.has(task.id) ?? false}
                onSelect={onTaskSelect}
              />
            </div>
          ))}
        </SortableContext>
        {composing && (
          <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl/Cmd+A selecciona texto, no crea tarea
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  setValue("");
                  setComposing(false);
                }
              }}
              rows={2}
              placeholder="Escribe la nueva tarea… (Enter para guardar, Esc para cancelar)"
              className="w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm text-card-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  setComposing(false);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3.5" /> Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-3.5" /> Añadir
              </button>
            </div>
          </div>
        )}
        {tasks.length === 0 && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Arrastra una tarea aquí o haz clic para añadir
          </button>
        )}
      </div>
    </section>
  );
}
