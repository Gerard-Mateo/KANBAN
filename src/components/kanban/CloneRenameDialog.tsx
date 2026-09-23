import { useEffect, useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import type { Task } from "@/lib/kanban-data";

function words(title: string): string[] {
  return title.split(/[^\p{L}\p{N}+&]+/u).filter((w) => w.length > 2);
}

export function commonWords(tasks: Task[]): string[] {
  if (tasks.length === 0) return [];
  const sets = tasks.map((t) => new Set(words(t.title).map((w) => w.toLowerCase())));
  const first = words(tasks[0]!.title);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of first) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (sets.every((s) => s.has(key))) out.push(w);
  }
  return out;
}

export function replaceWord(title: string, target: string, replacement: string): string {
  if (!target) return title;
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(esc, "gi"), replacement);
}

export function CloneRenameDialog({
  tasks,
  onClose,
  onConfirm,
}: {
  tasks: Task[];
  onClose: () => void;
  onConfirm: (target: string, replacement: string) => void;
}) {
  const open = tasks.length > 0;
  const common = useMemo(() => commonWords(tasks), [tasks]);
  const [target, setTarget] = useState("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (open) {
      setTarget(common[0] ?? "");
      setReplacement("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tasks.map((t) => t.id).join(",")]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const backdrop = useBackdropClose(onClose);

  if (!open) return null;

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
          <h2 className="text-base font-semibold text-foreground">Clonar con nuevo nombre</h2>
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
          {tasks.length} tarea(s) seleccionada(s). Cambia una palabra en común y se crearán las
          copias.
        </p>

        <div className="mt-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Palabras en común
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {common.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No hay palabras comunes; escribe la palabra a reemplazar abajo.
              </span>
            )}
            {common.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setTarget(w)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  target.toLowerCase() === w.toLowerCase()
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reemplazar
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Por
            <input
              autoFocus
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && target) onConfirm(target, replacement);
              }}
              className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="mt-4 max-h-40 overflow-y-auto rounded-md border border-border bg-secondary/50 p-2">
          {tasks.map((t) => (
            <p key={t.id} className="truncate text-xs text-muted-foreground">
              {replaceWord(t.title, target, replacement)}
            </p>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!target}
            onClick={() => onConfirm(target, replacement)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Copy className="size-3.5" /> Clonar {tasks.length}
          </button>
        </div>
      </div>
    </div>
  );
}
