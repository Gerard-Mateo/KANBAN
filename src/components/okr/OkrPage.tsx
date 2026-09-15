import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Target, Timer, Trash2, X } from "lucide-react";
import {
  createKeyResult,
  createKrTask,
  createObjective,
  deleteKeyResult,
  deleteKrTask,
  deleteObjective,
  loadOkrs,
  metricProgress,
  objectiveProgress,
  setKrTaskDone,
  taskProgress,
  updateKeyResult,
  type KeyResult,
  type KeyResultInput,
  type Objective,
} from "@/lib/okr-cloud";

const emptyKr: KeyResultInput = {
  title: "",
  specific: "",
  measurable: "",
  achievable: "",
  relevant: "",
  timeBound: "",
  unit: "",
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  dueDate: null,
};

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
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newObj, setNewObj] = useState({ title: "", description: "", period: "" });
  const [krFormFor, setKrFormFor] = useState<string | null>(null);
  const [krDraft, setKrDraft] = useState<KeyResultInput>(emptyKr);

  const refresh = useCallback(async () => {
    try {
      setObjectives(await loadOkrs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los OKRs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    },
    [refresh],
  );

  const total = objectives.length;
  const globalProgress = useMemo(
    () =>
      total
        ? Math.round(objectives.reduce((a, o) => a + objectiveProgress(o), 0) / total)
        : 0,
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
              const payload = { ...newObj, title: newObj.title.trim(), position: total };
              setNewObj({ title: "", description: "", period: "" });
              void run(() => createObjective(payload));
            }}
          >
            <Plus className="mr-1 inline size-3" />
            Objetivo
          </button>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Cargando OKRs…</p>}

      {objectives.map((obj) => (
        <section key={obj.id} className="retro-shadow rounded-sm border-2 border-border bg-card p-4">
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
            <div className="mt-4 rounded-sm border-2 border-dashed border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-display text-xs font-bold uppercase tracking-widest">
                  Nuevo resultado clave (SMART)
                </span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setKrFormFor(null)}
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
                    value={krDraft.title}
                    onChange={(e) => setKrDraft({ ...krDraft, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["specific", "S · Específico", "¿Qué exactamente?"],
                      ["measurable", "M · Medible", "¿Cómo se mide?"],
                      ["achievable", "A · Alcanzable", "¿Con qué recursos?"],
                      ["relevant", "R · Relevante", "¿Por qué importa?"],
                      ["timeBound", "T · Con plazo", "¿Para cuándo?"],
                    ] as const
                  ).map(([key, text, ph]) => (
                    <div key={key}>
                      <span className={label}>{text}</span>
                      <input
                        className={box}
                        placeholder={ph}
                        value={krDraft[key]}
                        onChange={(e) => setKrDraft({ ...krDraft, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  <div>
                    <span className={label}>Inicial</span>
                    <input
                      type="number"
                      className={box}
                      value={krDraft.startValue}
                      onChange={(e) =>
                        setKrDraft({ ...krDraft, startValue: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <span className={label}>Actual</span>
                    <input
                      type="number"
                      className={box}
                      value={krDraft.currentValue}
                      onChange={(e) =>
                        setKrDraft({ ...krDraft, currentValue: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <span className={label}>Meta</span>
                    <input
                      type="number"
                      className={box}
                      value={krDraft.targetValue}
                      onChange={(e) =>
                        setKrDraft({ ...krDraft, targetValue: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <span className={label}>Unidad</span>
                    <input
                      className={box}
                      placeholder="videos, %, USD"
                      value={krDraft.unit}
                      onChange={(e) => setKrDraft({ ...krDraft, unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <span className={label}>Fecha límite</span>
                    <input
                      type="date"
                      className={box}
                      value={krDraft.dueDate ?? ""}
                      onChange={(e) =>
                        setKrDraft({ ...krDraft, dueDate: e.target.value || null })
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className={`${btnPrimary} justify-self-start`}
                  onClick={() => {
                    if (!krDraft.title.trim()) return;
                    const payload = { ...krDraft, title: krDraft.title.trim() };
                    const pos = obj.keyResults.length;
                    setKrDraft(emptyKr);
                    setKrFormFor(null);
                    void run(() => createKeyResult(obj.id, payload, pos));
                  }}
                >
                  Guardar KR
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${btn} mt-4`}
              onClick={() => {
                setKrDraft(emptyKr);
                setKrFormFor(obj.id);
              }}
            >
              <Plus className="mr-1 inline size-3" />
              Resultado clave
            </button>
          )}
        </section>
      ))}

      {!loading && objectives.length === 0 && (
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

  useEffect(() => setValue(String(kr.currentValue)), [kr.currentValue]);

  const mp = metricProgress(kr);
  const tp = taskProgress(kr);

  const smart = (
    [
      ["S", kr.specific],
      ["M", kr.measurable],
      ["A", kr.achievable],
      ["R", kr.relevant],
      ["T", kr.timeBound],
    ] as const
  ).filter(([, v]) => v.trim());

  return (
    <div className="rounded-sm border-2 border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{kr.title}</p>
        {kr.dueDate && (
          <span className="rounded-sm border-2 border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            {kr.dueDate}
          </span>
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          title="Eliminar KR"
          onClick={() => {
            if (confirm("¿Eliminar este resultado clave?")) void onRun(() => deleteKeyResult(kr.id));
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
            <span className="text-foreground">
              {kr.currentValue} / {kr.targetValue} {kr.unit}
            </span>
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
              onClick={() => void onRun(() => updateKeyResult(kr.id, { currentValue: Number(value) }))}
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
                void onRun(() => createKrTask(kr.id, title, title, kr.tasks.length));
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
