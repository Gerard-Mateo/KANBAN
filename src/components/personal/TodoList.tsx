import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  PartyPopper,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fireConfetti } from "@/lib/confetti";
import {
  addTodo,
  clearDoneTodos,
  deleteTodo,
  setTodoDone,
  updateTodo,
  type Importance,
  type PersonalTheme,
  type PersonalTodo,
} from "@/lib/personal";
import { accentOf, cardStyle, deadlineInfo, iconOf } from "./personal-theme";

const IMPORTANCE: Record<Importance, { label: string; color: (accent: string) => string }> = {
  3: { label: "Alta", color: (accent) => accent },
  2: { label: "Media", color: () => "oklch(0.8 0.13 80)" },
  1: { label: "Baja", color: () => "oklch(0.72 0.02 264)" },
};
const LATE = "oklch(0.7 0.19 25)";
const STRIKE_MS = 650;

/** Tres barritas, como la señal del celular: cuántas encendidas = importancia. */
function ImportanceBars({ level, color }: { level: Importance; color: string }) {
  return (
    <span aria-hidden className="inline-flex h-3 items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${(i / 3) * 100}%`,
            background: i <= level ? color : "oklch(1 0 0 / 0.16)",
          }}
        />
      ))}
    </span>
  );
}

/** Abre el calendario nativo de un <input type="date"> escondido. */
function openPicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    input.showPicker();
  } catch {
    input.focus();
    input.click();
  }
}

function byPriority(a: PersonalTodo, b: PersonalTodo) {
  return (
    b.importance - a.importance ||
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
    a.createdAt - b.createdAt
  );
}

function byDate(a: PersonalTodo, b: PersonalTodo) {
  return (
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
    b.importance - a.importance ||
    a.createdAt - b.createdAt
  );
}

export function TodoList({ todos, theme }: { todos: PersonalTodo[]; theme: PersonalTheme }) {
  const accent = accentOf(theme);
  const Icon = iconOf(theme.todoIcon);
  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState<Importance>(2);
  const [deadline, setDeadline] = useState("");
  const [sort, setSort] = useState<"priority" | "date">("priority");
  const [showDone, setShowDone] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // El atajo de "nueva tarea" (Ctrl+Mayús+A) en esta pestaña escribe aquí.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("personal:add", focus);
    return () => window.removeEventListener("personal:add", focus);
  }, []);

  const open = useMemo(
    () => todos.filter((t) => !t.doneAt).sort(sort === "priority" ? byPriority : byDate),
    [todos, sort],
  );
  const done = useMemo(
    () => todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt! - a.doneAt!),
    [todos],
  );

  function submit() {
    if (!title.trim()) return;
    addTodo(title, importance, deadline || null);
    setTitle("");
    setDeadline("");
    inputRef.current?.focus();
  }

  // Tachar: la línea se dibuja sobre el texto y luego la tarea se va a "Hechas".
  function complete(todo: PersonalTodo) {
    if (leaving.has(todo.id)) return;
    setLeaving((prev) => new Set(prev).add(todo.id));
    const last = open.every((t) => t.id === todo.id || leaving.has(t.id));
    setTimeout(() => {
      setTodoDone(todo.id, true);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(todo.id);
        return next;
      });
      if (last) fireConfetti();
    }, STRIKE_MS);
  }

  const deadlineLabel = deadline ? deadlineInfo(deadline).text : null;

  return (
    <section className="rounded-3xl p-5" style={cardStyle(theme)}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span
          className="grid size-10 place-items-center rounded-2xl"
          style={{
            background: `color-mix(in oklch, ${accent} 18%, transparent)`,
            color: accent,
            boxShadow: `0 0 24px color-mix(in oklch, ${accent} 25%, transparent)`,
          }}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Pendientes</h3>
          <p className="text-xs text-muted-foreground">
            {open.length === 0
              ? "Nada por hacer"
              : `${open.length} por hacer${done.length ? ` · ${done.length} hechas` : ""}`}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Ordenar pendientes"
          className="ml-auto flex items-center gap-0.5 rounded-full bg-white/5 p-0.5 text-[11px]"
        >
          {(
            [
              ["priority", "Prioridad"],
              ["date", "Fecha"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={sort === key}
              onClick={() => setSort(key)}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium transition-colors",
                sort === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              style={
                sort === key
                  ? { background: `color-mix(in oklch, ${accent} 22%, transparent)` }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Añadir */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-2 transition-colors focus-within:border-white/20">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="¿Qué quieres hacer?"
          className="w-full bg-transparent px-2 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <div role="radiogroup" aria-label="Importancia" className="flex items-center gap-0.5">
            {([3, 2, 1] as const).map((lvl) => {
              const color = IMPORTANCE[lvl].color(accent);
              const on = importance === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={`Importancia ${IMPORTANCE[lvl].label.toLowerCase()}`}
                  onClick={() => setImportance(lvl)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                    on ? "" : "text-muted-foreground hover:bg-white/5",
                  )}
                  style={
                    on
                      ? { color, background: `color-mix(in oklch, ${color} 16%, transparent)` }
                      : undefined
                  }
                >
                  <ImportanceBars level={lvl} color={on ? color : "oklch(0.72 0.02 264)"} />
                  {IMPORTANCE[lvl].label}
                </button>
              );
            })}
          </div>
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={() => openPicker(dateRef.current)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/5",
                deadline ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3.5" />
              {deadlineLabel ?? "Fecha límite"}
            </button>
            <input
              ref={dateRef}
              type="date"
              tabIndex={-1}
              aria-hidden
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="pointer-events-none absolute inset-0 opacity-0"
            />
          </span>
          {deadline && (
            <button
              type="button"
              aria-label="Quitar fecha límite"
              onClick={() => setDeadline("")}
              className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-background transition-[opacity,transform] hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
            style={{ background: accent }}
          >
            <Plus className="size-3.5" /> Añadir
          </button>
        </div>
      </div>

      {/* Lista */}
      {open.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {open.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              accent={accent}
              leaving={leaving.has(t.id)}
              onComplete={() => complete(t)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid place-items-center py-8 text-center">
          {done.length > 0 ? (
            <PartyPopper className="size-8" style={{ color: accent }} />
          ) : (
            <Icon className="size-8 text-muted-foreground/50" />
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {done.length > 0 ? "¡Todo listo! No queda nada pendiente." : "Tu lista está vacía."}
          </p>
        </div>
      )}

      {/* Hechas */}
      {done.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showDone ? "" : "-rotate-90")}
            />
            Hechas · {done.length}
          </button>
          {showDone && (
            <>
              <ul className="-mx-2 mt-2 space-y-0.5">
                {done.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]"
                  >
                    <span
                      className="grid size-4 shrink-0 place-items-center rounded-full"
                      style={{ background: "oklch(1 0 0 / 0.2)" }}
                    >
                      <Check className="size-2.5 text-background" strokeWidth={3.5} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through decoration-muted-foreground/50">
                      {t.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/70">
                      {new Date(t.doneAt!).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <button
                      type="button"
                      title="Devolver a pendientes"
                      onClick={() => setTodoDone(t.id, false)}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Borrar"
                      onClick={() => deleteTodo(t.id)}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Borrar las ${done.length} tareas hechas?`)) clearDoneTodos();
                }}
                className="mt-2 text-[11px] text-muted-foreground hover:text-destructive"
              >
                Borrar hechas
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TodoRow({
  todo,
  accent,
  leaving,
  onComplete,
}: {
  todo: PersonalTodo;
  accent: string;
  leaving: boolean;
  onComplete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const dateRef = useRef<HTMLInputElement>(null);
  const color = IMPORTANCE[todo.importance].color(accent);
  const dl = todo.deadline ? deadlineInfo(todo.deadline) : null;
  const strike: CSSProperties = {
    backgroundImage: "linear-gradient(currentColor, currentColor)",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "0 55%",
    backgroundSize: leaving ? "100% 2px" : "0% 2px",
    transition: "background-size 420ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };

  function saveTitle() {
    const next = draft.trim();
    if (next && next !== todo.title) updateTodo(todo.id, { title: next });
    else setDraft(todo.title);
    setEditing(false);
  }

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-[opacity,transform,background-color] duration-300 hover:bg-white/[0.04]",
        leaving && "translate-x-2 opacity-0 delay-300",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={leaving}
        aria-label="Marcar como hecha"
        onClick={onComplete}
        className="group/check mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95"
        style={{
          boxShadow: `inset 0 0 0 2px ${color}`,
          background: leaving ? color : "transparent",
        }}
      >
        <Check
          strokeWidth={3.5}
          className={cn(
            "size-3 transition-opacity",
            leaving ? "opacity-100" : "opacity-0 group-hover/check:opacity-60",
          )}
          style={{ color: leaving ? "var(--background)" : color }}
        />
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setDraft(todo.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[15px] text-foreground outline-none"
          />
        ) : (
          <p
            onDoubleClick={() => setEditing(true)}
            className="text-[15px] leading-snug text-foreground"
            title="Doble clic para editar"
          >
            <span style={strike}>{todo.title}</span>
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <button
            type="button"
            title="Cambiar importancia"
            onClick={() =>
              updateTodo(todo.id, {
                importance: (todo.importance === 1 ? 3 : todo.importance - 1) as Importance,
              })
            }
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium transition-colors hover:bg-white/10"
            style={{ color }}
          >
            <ImportanceBars level={todo.importance} color={color} />
            {IMPORTANCE[todo.importance].label}
          </button>
          <span className="relative inline-flex">
            <button
              type="button"
              title={dl ? "Cambiar fecha límite" : "Poner fecha límite"}
              onClick={() => openPicker(dateRef.current)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium transition-[opacity,background-color] hover:bg-white/10",
                !dl && "text-muted-foreground opacity-0 group-hover:opacity-100",
              )}
              style={
                dl
                  ? { color: dl.tone === "late" ? LATE : dl.tone === "soon" ? accent : undefined }
                  : undefined
              }
            >
              <CalendarClock className="size-3" />
              {dl ? dl.text : "Fecha"}
            </button>
            <input
              ref={dateRef}
              type="date"
              tabIndex={-1}
              aria-hidden
              value={todo.deadline ?? ""}
              onChange={(e) => updateTodo(todo.id, { deadline: e.target.value || null })}
              className="pointer-events-none absolute inset-0 opacity-0"
            />
          </span>
          {dl && (
            <button
              type="button"
              aria-label="Quitar fecha límite"
              onClick={() => updateTodo(todo.id, { deadline: null })}
              className="grid size-4 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          title="Editar"
          onClick={() => setEditing(true)}
          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          title="Borrar"
          onClick={() => deleteTodo(todo.id)}
          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
