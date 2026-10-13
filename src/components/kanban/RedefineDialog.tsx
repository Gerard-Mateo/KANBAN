import { useEffect, useRef, useState } from "react";
import { ArrowDown, History, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { useAllTypes } from "@/lib/custom-types";
import { typeLabel, type Task } from "@/lib/kanban-data";
import { TypeDot } from "./TypeCreator";

export type RedefineInput = { title: string; type: string | undefined; reason: string };

const REASONS = [
  "Ya no es relevante",
  "Cambió el alcance",
  "Se convirtió en otra tarea",
  "Se fusionó con otra",
];

/** Darle a una tarea otro propósito: la definición actual queda tachada en su
 * historial (con el motivo) y la nueva pasa a ser la tarea. Se monta con
 * `key={task.id}` para empezar limpio con cada tarea. */
export function RedefineDialog({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: (input: RedefineInput) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [type, setType] = useState<string | undefined>(task.type);
  const [reason, setReason] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const backdrop = useBackdropClose(onClose);
  const types = useAllTypes();

  // Arranca con la definición actual seleccionada: escribir la reemplaza y
  // las flechas permiten retocarla.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const next = title.trim();
  const changed = next !== task.title.trim() || type !== task.type;
  const submit = () => {
    if (next && changed) onConfirm({ title: next, type, reason: reason.trim() });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Redefinir tarea"
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4"
      {...backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-start gap-3">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground">
            <History className="size-4 text-accent" /> Redefinir tarea
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
          La definición actual queda tachada en los detalles, con el motivo. La tarea conserva su
          estado, sus días del calendario y su historial.
        </p>

        <div className="rounded-xl border border-border/50 bg-card/30 px-3 py-2">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Definición actual
            {task.type && <span className="ml-1.5 normal-case">· {typeLabel(task.type)}</span>}
          </p>
          <p
            className={cn(
              "mt-0.5 text-sm text-muted-foreground transition-[text-decoration-color]",
              changed ? "line-through decoration-muted-foreground/70" : "decoration-transparent",
            )}
          >
            {task.title || "(sin título)"}
          </p>
        </div>

        <ArrowDown className="mx-auto my-1.5 size-4 text-muted-foreground/60" />

        <label
          htmlFor="redefine-title"
          className="mb-1 block text-xs font-medium tracking-wider text-muted-foreground uppercase"
        >
          Nueva definición
        </label>
        <textarea
          id="redefine-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-border/70 bg-card/60 p-3 text-sm text-card-foreground outline-none focus:border-accent/60"
        />

        <p className="mb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Tipo
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType((cur) => (cur === t.id ? undefined : t.id))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                type === t.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/70 text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {t.custom && <TypeDot label={t.label} />}
              {t.label}
            </button>
          ))}
        </div>

        <label
          htmlFor="redefine-reason"
          className="mb-1.5 block text-xs font-medium tracking-wider text-muted-foreground uppercase"
        >
          Motivo <span className="tracking-normal normal-case opacity-70">(opcional)</span>
        </label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason((cur) => (cur === r ? "" : r))}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                reason === r
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          id="redefine-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="O escribe el tuyo…"
          className="w-full rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-sm text-card-foreground outline-none placeholder:text-muted-foreground/60 focus:border-accent/60"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!next || !changed}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <History className="size-3.5" /> Redefinir
          </button>
        </div>
      </div>
    </div>
  );
}
