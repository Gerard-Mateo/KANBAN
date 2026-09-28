import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Target, Timer, Trash2, X } from "lucide-react";
import {
  createKeyResult,
  createKrTask,
  createObjective,
  deleteKeyResult,
  deleteKrTask,
  deleteObjective,
  metricProgress,
  objectiveProgress,
  setKrTaskDone,
  taskProgress,
  updateKeyResult,
  useOkrs,
  type KeyResult,
  type KeyResultInput,
} from "@/lib/okrs";

const emptyKr: KeyResultInput = {
  title: "",
  specific: "",
  measurable: "",
  achievable: "",
  relevant: "",
  unit: "",
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  direction: "up",
  dueDate: null,
};

// Los números van como texto mientras se edita para poder dejar un campo vacío.
type KrDraft = Omit<KeyResultInput, "startValue" | "currentValue" | "targetValue"> & {
  startValue: string;
  currentValue: string;
  targetValue: string;
};

const toDraft = (kr: KeyResultInput): KrDraft => ({
  title: kr.title,
  specific: kr.specific,
  measurable: kr.measurable,
  achievable: kr.achievable,
  relevant: kr.relevant,
  unit: kr.unit,
  direction: kr.direction,
  dueDate: kr.dueDate,
  startValue: String(kr.startValue),
  currentValue: String(kr.currentValue),
  targetValue: String(kr.targetValue),
});

// Un KR nuevo arranca donde estás hoy: inicial vacío = el valor actual.
const emptyDraft: KrDraft = { ...toDraft(emptyKr), startValue: "" };

const box =
  "w-full rounded-sm border-2 border-border bg-card px-2 py-1.5 text-sm text-card-foreground outline-none focus:border-accent";
const btn =
  "rounded-sm border-2 border-border bg-secondary px-2.5 py-1 text-[11px] font-bold uppercase text-foreground transition-colors hover:bg-primary/20";
const btnPrimary =
  "rounded-sm border-2 border-border bg-primary px-3 py-1.5 text-[11px] font-bold uppercase text-primary-foreground";
const label = "block text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

function Bar({ value, tone }: { value: number; tone: "accent" | "done" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${tone === "done" ? "bg-done" : "bg-primary"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function OkrPage({
  boardTitles,
  onCreateBoardTask,
  onStartPomodoro,
  onCompleteBoardTask,
}: {
  boardTitles: string[];
  onCreateBoardTask: (title: string) => void;
  onStartPomodoro: (title: string) => void;
  onCompleteBoardTask: (title: string) => void;
}) {
  const objectives = useOkrs();
  const [error, setError] = useState<string | null>(null);
  const [newObj, setNewObj] = useState({ title: "", description: "", period: "" });
  const [krFormFor, setKrFormFor] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      // No todos los errores son `Error` (p. ej. los de Supabase): se busca su
      // mensaje para no esconder la causa real detrás de un texto genérico.
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "";
      setError(msg || "Error al guardar");
    }
  }, []);

  const total = objectives.length;
  const globalProgress = useMemo(
    () =>
      total ? Math.round(objectives.reduce((a, o) => a + objectiveProgress(o), 0) / total) : 0,
    [objectives, total],
  );

  return (
    <div className="space-y-6">
      <div className="retro-shadow rounded-sm border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Target className="size-4 text-primary" />
          <span className="font-display text-sm font-bold uppercase tracking-widest">
            OKRs de empresa
          </span>
          <span className="text-xs text-muted-foreground">
            {total} objetivo(s) · avance global {globalProgress}%
          </span>
          {error && <span className="text-xs font-bold text-destructive">⚠︎ {error}</span>}
        </div>
        <div className="mt-3">
          <Bar value={globalProgress} tone="accent" />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
          <input
            className={box}
            placeholder="Nuevo objetivo (ej. Ser referente en software de RRHH)"
            value={newObj.title}
            onChange={(e) => setNewObj({ ...newObj, title: e.target.value })}
          />
          <input
            className={box}
            placeholder="Descripción / por qué importa"
            value={newObj.description}
            onChange={(e) => setNewObj({ ...newObj, description: e.target.value })}
          />
          <input
            className={box}
            placeholder="Periodo (Q1 2026)"
            value={newObj.period}
            onChange={(e) => setNewObj({ ...newObj, period: e.target.value })}
          />
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              if (!newObj.title.trim()) return;
              const payload = { ...newObj, title: newObj.title.trim() };
              setNewObj({ title: "", description: "", period: "" });
              void run(() => createObjective(payload));
            }}
          >
            <Plus className="mr-1 inline size-3" />
            Objetivo
          </button>
        </div>
      </div>

      {objectives.map((obj) => (
        <section
          key={obj.id}
          className="retro-shadow rounded-sm border-2 border-border bg-card p-4"
        >
          <header className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
                {obj.title}
              </h3>
              {obj.description && (
                <p className="mt-1 text-xs text-muted-foreground">{obj.description}</p>
              )}
            </div>
            {obj.period && (
              <span className="rounded-sm border-2 border-border bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">
                {obj.period}
              </span>
            )}
            <span className="text-xs font-bold text-muted-foreground">
              {objectiveProgress(obj)}%
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              title="Eliminar objetivo"
              onClick={() => {
                if (confirm(`¿Eliminar el objetivo "${obj.title}" y sus KRs?`))
                  void run(() => deleteObjective(obj.id));
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </header>

          <div className="mt-3">
            <Bar value={objectiveProgress(obj)} tone="done" />
          </div>

          <div className="mt-4 space-y-4">
            {obj.keyResults.map((kr) => (
              <KeyResultCard
                key={kr.id}
                kr={kr}
                boardTitles={boardTitles}
                onRun={run}
                onCreateBoardTask={onCreateBoardTask}
                onStartPomodoro={onStartPomodoro}
                onCompleteBoardTask={onCompleteBoardTask}
              />
            ))}
          </div>

          {krFormFor === obj.id ? (
            <div className="mt-4">
              <KrForm
                initial={emptyDraft}
                heading="Nuevo resultado clave (SMART)"
                submitLabel="Guardar KR"
                onCancel={() => setKrFormFor(null)}
                onSubmit={(input) => {
                  setKrFormFor(null);
                  void run(() => createKeyResult(obj.id, input));
                }}
              />
            </div>
          ) : (
            <button type="button" className={`${btn} mt-4`} onClick={() => setKrFormFor(obj.id)}>
              <Plus className="mr-1 inline size-3" />
              Resultado clave
            </button>
          )}
        </section>
      ))}

      {objectives.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aún no hay objetivos. Crea el primero arriba y luego añádele resultados clave SMART.
        </p>
      )}
    </div>
  );
}

function KeyResultCard({
  kr,
  boardTitles,
  onRun,
  onCreateBoardTask,
  onStartPomodoro,
  onCompleteBoardTask,
}: {
  kr: KeyResult;
  boardTitles: string[];
  onRun: (fn: () => Promise<void>) => Promise<void>;
  onCreateBoardTask: (title: string) => void;
  onStartPomodoro: (title: string) => void;
  onCompleteBoardTask: (title: string) => void;
}) {
  const [value, setValue] = useState(String(kr.currentValue));
  const [taskTitle, setTaskTitle] = useState("");
  const [linkExisting, setLinkExisting] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => setValue(String(kr.currentValue)), [kr.currentValue]);

  if (editing)
    return (
      <KrForm
        initial={toDraft(kr)}
        heading="Editar resultado clave"
        submitLabel="Guardar cambios"
        onCancel={() => setEditing(false)}
        onSubmit={(input) => {
          setEditing(false);
          void onRun(() => updateKeyResult(kr.id, input));
        }}
      />
    );

  const mp = metricProgress(kr);
  const tp = taskProgress(kr);
  const down = kr.direction === "down";

  const smart = (
    [
      ["S", kr.specific],
      ["M", kr.measurable],
      ["A", kr.achievable],
      ["R", kr.relevant],
      ["T", kr.dueDate ? deadlineText(kr.dueDate) : ""],
    ] as const
  ).filter(([, v]) => v.trim());

  return (
    <div className="rounded-sm border-2 border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{kr.title}</p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          title="Editar KR"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          title="Eliminar KR"
          onClick={() => {
            if (confirm("¿Eliminar este resultado clave?"))
              void onRun(() => deleteKeyResult(kr.id));
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {smart.length > 0 && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {smart.map(([k, v]) => (
            <li key={k} className="text-[11px] text-muted-foreground">
              <span className="mr-1 font-bold text-primary">{k}</span>
              {v}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Métrica
            <span
              className="inline-flex items-center gap-1 text-foreground"
              title={down ? "Menos es mejor: el avance crece al bajar" : "Más es mejor"}
            >
              {down ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
              {kr.currentValue} {down ? "→" : "/"} {kr.targetValue} {kr.unit}
            </span>
            <span>desde {kr.startValue}</span>
            <span className="ml-auto">{mp}%</span>
          </div>
          <Bar value={mp} tone="accent" />
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              className={box}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="button"
              className={btn}
              onClick={() =>
                void onRun(() => updateKeyResult(kr.id, { currentValue: Number(value) }))
              }
            >
              Actualizar
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Mini-tareas
            <span className="ml-auto">{tp === null ? "—" : `${tp}%`}</span>
          </div>
          <Bar value={tp ?? 0} tone="done" />
          <ul className="mt-2 space-y-1">
            {kr.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => {
                    const done = e.target.checked;
                    if (done && t.boardTaskTitle) onCompleteBoardTask(t.boardTaskTitle);
                    void onRun(() => setKrTaskDone(t.id, done));
                  }}
                />
                <span className={t.done ? "line-through text-muted-foreground" : "text-foreground"}>
                  {t.title}
                </span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-primary"
                  title="Iniciar pomodoro"
                  onClick={() => onStartPomodoro(t.boardTaskTitle || t.title)}
                >
                  <Timer className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title="Quitar"
                  onClick={() => void onRun(() => deleteKrTask(t.id))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex gap-2">
            <input
              className={box}
              list={linkExisting ? `board-tasks-${kr.id}` : undefined}
              placeholder={linkExisting ? "Elige una tarea del tablero" : "Nueva mini-tarea"}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            {linkExisting && (
              <datalist id={`board-tasks-${kr.id}`}>
                {boardTitles.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
            <button
              type="button"
              className={btn}
              onClick={() => {
                const title = taskTitle.trim();
                if (!title) return;
                setTaskTitle("");
                if (!linkExisting && !boardTitles.includes(title)) onCreateBoardTask(title);
                void onRun(() => createKrTask(kr.id, title, title));
              }}
            >
              Añadir
            </button>
          </div>
          <button
            type="button"
            className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            onClick={() => setLinkExisting((v) => !v)}
          >
            {linkExisting ? "→ Crear tarea nueva" : "→ Vincular tarea existente"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "15 ene 2027 · quedan 109 día(s)": la T del KR en la tarjeta. */
function deadlineText(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const date = due.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  const left =
    days < 0 ? `venció hace ${-days} día(s)` : days === 0 ? "vence hoy" : `quedan ${days} día(s)`;
  return `${date} · ${left}`;
}

const DIRECTIONS = [
  { dir: "up", Icon: ArrowUp, text: "Más es mejor", hint: "ventas, videos, clientes" },
  { dir: "down", Icon: ArrowDown, text: "Menos es mejor", hint: "ranking, costos, tiempos" },
] as const;

function KrForm({
  initial,
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: KrDraft;
  heading: string;
  submitLabel: string;
  onSubmit: (input: KeyResultInput) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<KrDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? fallback : n;
  };
  const current = num(draft.currentValue, 0);
  const start = num(draft.startValue, current);
  const target = num(draft.targetValue, 100);
  const down = draft.direction === "down";

  // La meta tiene que quedar del lado correcto del inicio; si no, el avance no tiene sentido.
  const wrongSide = down ? target > start : target < start;
  const problem =
    target === start
      ? "La meta tiene que ser distinta del valor inicial."
      : wrongSide
        ? down
          ? `Para bajar, la meta (${target}) debe quedar por debajo del inicio (${start}).`
          : `La meta (${target}) está por debajo del inicio (${start}): eso es bajar.`
        : null;

  return (
    <div className="rounded-sm border-2 border-dashed border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-display text-xs font-bold uppercase tracking-widest">{heading}</span>
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-foreground"
          title="Cancelar"
          onClick={onCancel}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-2">
        <div>
          <span className={label}>Resultado clave</span>
          <input
            className={box}
            placeholder="Ej. Publicar 20 videos de módulos antes de junio"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["specific", "S · Específico", "¿Qué exactamente?"],
              ["measurable", "M · Medible", "¿Cómo se mide?"],
              ["achievable", "A · Alcanzable", "¿Con qué recursos?"],
              ["relevant", "R · Relevante", "¿Por qué importa?"],
            ] as const
          ).map(([key, text, ph]) => (
            <div key={key}>
              <span className={label}>{text}</span>
              <input
                className={box}
                placeholder={ph}
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <span className={label}>T · Con plazo (fecha límite)</span>
            <input
              type="date"
              className={box}
              value={draft.dueDate ?? ""}
              onChange={(e) => set({ dueDate: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <span className={label}>Dirección de la métrica</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Dirección de la métrica"
              className="inline-flex overflow-hidden rounded-sm border-2 border-border"
            >
              {DIRECTIONS.map(({ dir, Icon, text }) => (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={draft.direction === dir}
                  onClick={() => set({ direction: dir })}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                    draft.direction === dir
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" /> {text}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Ej. {DIRECTIONS.find((d) => d.dir === draft.direction)?.hint}
              {down ? ": el avance crece mientras el número baja." : "."}
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <span className={label}>Inicial</span>
            <input
              type="number"
              className={box}
              placeholder={`= actual (${current})`}
              value={draft.startValue}
              onChange={(e) => set({ startValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Actual</span>
            <input
              type="number"
              className={box}
              value={draft.currentValue}
              onChange={(e) => set({ currentValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Meta</span>
            <input
              type="number"
              className={box}
              value={draft.targetValue}
              onChange={(e) => set({ targetValue: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Unidad</span>
            <input
              className={box}
              placeholder="videos, %, USD"
              value={draft.unit}
              onChange={(e) => set({ unit: e.target.value })}
            />
          </div>
        </div>

        {problem && (
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-destructive">
            ⚠︎ {problem}
            {wrongSide && (
              <button
                type="button"
                className={btn}
                onClick={() => set({ direction: down ? "up" : "down" })}
              >
                {down ? "Usar ↑ Más es mejor" : "Usar ↓ Menos es mejor"}
              </button>
            )}
          </p>
        )}

        <button
          type="button"
          disabled={!!problem}
          className={`${btnPrimary} justify-self-start disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => {
            const title = draft.title.trim();
            if (!title) return;
            onSubmit({
              ...draft,
              title,
              startValue: start,
              currentValue: current,
              targetValue: target,
            });
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
