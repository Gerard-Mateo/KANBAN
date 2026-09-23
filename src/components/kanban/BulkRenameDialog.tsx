import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { commonWords, replaceWord } from "./CloneRenameDialog";
import type { Task } from "@/lib/kanban-data";

export type RenameMode = "replace" | "prepend" | "append";

const MODES: { id: RenameMode; label: string }[] = [
  { id: "replace", label: "Reemplazar palabra" },
  { id: "prepend", label: "Añadir al inicio" },
  { id: "append", label: "Añadir al final" },
];

export function applyRename(title: string, mode: RenameMode, text: string, replacement: string) {
  if (mode === "replace") return replaceWord(title, text, replacement);
  if (mode === "prepend") return `${text}${title}`;
  return `${title}${text}`;
}

export function BulkRenameDialog({
  tasks,
  onClose,
  onConfirm,
}: {
  tasks: Task[];
  onClose: () => void;
  onConfirm: (mode: RenameMode, text: string, replacement: string) => void;
}) {
  const open = tasks.length > 0;
  const common = useMemo(() => commonWords(tasks), [tasks]);
  const [mode, setMode] = useState<RenameMode>("replace");
  const [target, setTarget] = useState("");
  const [replacement, setReplacement] = useState("");
  const [addText, setAddText] = useState("");

  useEffect(() => {
    if (open) {
      setMode("replace");
      setTarget(common[0] ?? "");
      setReplacement("");
      setAddText("");
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

  const value = mode === "replace" ? target : addText;
  const canConfirm = mode === "replace" ? target.trim().length > 0 : addText.length > 0;

  function confirm() {
    if (!canConfirm) return;
    onConfirm(mode, mode === "replace" ? target : addText, replacement);
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
          <h2 className="text-base font-semibold text-foreground">Renombrar seleccionadas</h2>
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
          {tasks.length} tarea(s) seleccionada(s). Se edita el título de cada una, no se crean
          copias.
        </p>

        <div className="mt-4 flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors " +
                (mode === m.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "replace" ? (
          <>
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
                  onKeyDown={(e) => e.key === "Enter" && confirm()}
                  className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
                />
              </label>
            </div>
          </>
        ) : (
          <label className="mt-4 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {mode === "prepend" ? "Texto a añadir al inicio" : "Texto a añadir al final"}
            <input
              autoFocus
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              placeholder={mode === "prepend" ? 'p. ej. "Guion: "' : 'p. ej. " - asistencia"'}
              className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            />
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              Incluye los espacios o el separador que quieras (p. ej. un espacio al final para
              prefijos, o " - " para sufijos).
            </span>
          </label>
        )}

        <div className="mt-4 max-h-40 overflow-y-auto rounded-md border border-border bg-secondary/50 p-2">
          {tasks.map((t) => (
            <p key={t.id} className="truncate text-xs text-muted-foreground">
              {applyRename(t.title, mode, value, replacement)}
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
            disabled={!canConfirm}
            onClick={confirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Pencil className="size-3.5" /> Renombrar {tasks.length}
          </button>
        </div>
      </div>
    </div>
  );
}
