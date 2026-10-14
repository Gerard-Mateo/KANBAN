import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarClock, Hash, Layers, History, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import { useAllTypes } from "@/lib/custom-types";
import {
  COLUMNS,
  typeLabel,
  type ColumnId,
  type Redefinition,
  type Task,
  type TaskGoal,
} from "@/lib/kanban-data";
import { TypeCreator, TypeDot } from "./TypeCreator";

export function TaskDetailsDialog({
  task,
  column,
  onClose,
  onSave,
  onGoalChange,
  onMove,
  onDelete,
  onRedefine,
}: {
  task: Task | null;
  column: ColumnId | undefined;
  onClose: () => void;
  onSave: (patch: Partial<Task>) => void;
  onGoalChange: (goal: TaskGoal | undefined) => void;
  onMove: (to: ColumnId) => void;
  onDelete: () => void;
  /** Abre "Redefinir": la definición actual pasa al historial. */
  onRedefine?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // El título crece con su texto para leerse entero; solo los muy largos
  // (más de ~45% de la pantalla) quedan con barra de desplazamiento.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.45);
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
  }, [title, task?.id]);

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
  const types = useAllTypes();

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
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4"
      {...backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 shadow-2xl"
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

        <div className="mb-1 flex items-center gap-2">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Título
          </label>
          {onRedefine && (
            <button
              type="button"
              onClick={onRedefine}
              title="Darle otro propósito: la definición actual queda en el historial"
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <History className="size-3" /> Redefinir…
            </button>
          )}
        </div>
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
          rows={2}
          className="mb-4 w-full resize-none rounded-xl border border-border/70 bg-card/60 p-3 text-[15px] leading-relaxed text-card-foreground outline-none focus:border-accent/60"
        />

        {task.redefinitions?.length ? <PastDefinitions list={task.redefinitions} /> : null}

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tipo de tarea
        </label>
        <div className="mb-4 flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSave({ type: task.type === t.id ? undefined : t.id })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                task.type === t.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/70 text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {t.custom && <TypeDot label={t.label} />}
              {t.label}
            </button>
          ))}
          <TypeCreator onCreated={(label) => onSave({ type: label })} />
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

        <GoalEditor goal={task.goal} onChange={onGoalChange} />

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

/** Lo que la tarea fue antes de redefinirla, de la más reciente a la más vieja:
 * tachado y en pequeño, para que la definición vigente sea lo que destaca. */
function PastDefinitions({ list }: { list: Redefinition[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Definiciones anteriores
      </p>
      <ol className="space-y-1.5">
        {[...list].reverse().map((r, i) => (
          <li
            key={`${r.at}-${i}`}
            className="rounded-lg border border-border/40 bg-card/30 px-3 py-2"
          >
            <p className="text-xs text-muted-foreground line-through decoration-muted-foreground/60">
              {r.title}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground/80">
              {r.at > 0 && (
                <span>
                  Hasta el{" "}
                  {new Date(r.at).toLocaleDateString("es-EC", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
              {r.type && <span>· {typeLabel(r.type)}</span>}
              {r.reason && <span className="italic">· {r.reason}</span>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Meta medible opcional: cuántas llevas de cuántas. */
function GoalEditor({
  goal,
  onChange,
}: {
  goal: TaskGoal | undefined;
  onChange: (goal: TaskGoal | undefined) => void;
}) {
  const targetRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (adding && goal) {
      targetRef.current?.focus();
      targetRef.current?.select();
      setAdding(false);
    }
  }, [adding, goal]);

  const label = (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
      Meta medible <span className="normal-case tracking-normal opacity-70">(opcional)</span>
    </label>
  );

  if (!goal) {
    return (
      <div className="mb-4">
        {label}
        <button
          type="button"
          onClick={() => {
            onChange({ target: 10, current: 0 });
            setAdding(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Target className="size-3.5" />
          Añadir meta (p. ej. 10 blogs)
        </button>
      </div>
    );
  }

  const input =
    "w-16 rounded-lg border border-border/70 bg-card/60 px-2 py-1 text-center text-sm tabular-nums text-card-foreground outline-none focus:border-accent/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const set = (patch: Partial<TaskGoal>) => {
    const next = { ...goal, ...patch };
    if (Number.isFinite(next.target) && Number.isFinite(next.current)) onChange(next);
  };

  return (
    <div className="mb-4">
      {label}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Llevo</span>
        <input
          type="number"
          min={0}
          max={goal.target}
          value={goal.current}
          onChange={(e) => set({ current: e.target.valueAsNumber })}
          className={input}
          aria-label="Avance actual"
        />
        <span>de</span>
        <input
          ref={targetRef}
          type="number"
          min={1}
          value={goal.target}
          onChange={(e) => set({ target: e.target.valueAsNumber })}
          className={input}
          aria-label="Meta"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
        >
          Quitar meta
        </button>
      </div>
    </div>
  );
}
