import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  CheckCircle2,
  FlagTriangleRight,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { COLUMN_TITLES, COLUMNS, type BoardState, type ColumnId } from "@/lib/kanban-data";
import { loadBoard, saveBoard } from "@/lib/tasks-cloud";
import { cn } from "@/lib/utils";
import { TaskPicker } from "./TaskPicker";
import { FlipClock } from "./FlipClock";
import {
  notificationsSupported,
  playAlarm,
  playClick,
  playTick,
  requestNotificationPermission,
  sendNotification,
} from "@/lib/pomodoro-fx";

import {
  cancelSession,
  completeSession,
  listSessions,
  startSession,
  statsByTask,
  type PomodoroSession,
} from "@/lib/pomodoro-cloud";

const PRESETS = [15, 25, 45, 50];

const emptyBoard = (): BoardState => ({ todo: [], doing: [], done: [] });

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function PomodoroPage({
  userId,
  embedded = false,
  active = true,
  initialTask,
  nav,
}: {
  userId: string;
  embedded?: boolean;
  active?: boolean;
  initialTask?: string | undefined;
  nav?: React.ReactNode;
}) {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [selected, setSelected] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [notifyOn, setNotifyOn] = useState(false);
  const endsAtRef = useRef<number>(0);
  const soundRef = useRef(true);
  const notifyRef = useRef(false);
  soundRef.current = soundOn;
  notifyRef.current = notifyOn;

  // Preferencias de sonido / notificaciones.
  useEffect(() => {
    setSoundOn(localStorage.getItem("pomodoro:sound") !== "off");
    setNotifyOn(
      localStorage.getItem("pomodoro:notify") === "on" &&
        notificationsSupported() &&
        Notification.permission === "granted",
    );
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("pomodoro:sound", next ? "on" : "off");
    if (next) playClick();
  }

  async function toggleNotify() {
    if (notifyOn) {
      setNotifyOn(false);
      localStorage.setItem("pomodoro:notify", "off");
      return;
    }
    const perm = await requestNotificationPermission();
    const ok = perm === "granted";
    setNotifyOn(ok);
    localStorage.setItem("pomodoro:notify", ok ? "on" : "off");
    if (!ok) setError("El navegador bloqueó las notificaciones.");
  }

  // Recarga el tablero y las sesiones cada vez que la pestaña se activa.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const [b, s] = await Promise.all([loadBoard(), listSessions()]);
        if (cancelled) return;
        setBoard(b);
        setSessions(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (initialTask) {
      setSelected(initialTask);
      return;
    }
    if (embedded) return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("task");
    if (t) setSelected(t);
  }, [initialTask, embedded]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = (endsAtRef.current - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        void finish();
      } else {
        setRemaining(left);
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const tasks = useMemo(
    () =>
      COLUMNS.flatMap((c) =>
        board[c.id].map((t) => ({ id: t.id, title: t.title, col: c.id as ColumnId })),
      ).filter((t) => t.title.trim().length > 0),
    [board],
  );

  const stats = useMemo(() => statsByTask(sessions), [sessions]);
  const totalPomodoros = sessions.filter((s) => s.completed).length;

  async function moveToDoingIfNeeded(title: string) {
    const found = tasks.find((t) => t.title === title);
    if (!found || found.col !== "todo") return;
    const next = { ...board } as BoardState;
    const task = board.todo.find((t) => t.id === found.id);
    if (!task) return;
    const now = Date.now();
    next.todo = board.todo.filter((t) => t.id !== found.id);
    next.doing = [
      ...board.doing,
      { ...task, history: [...(task.history ?? []), { at: now, from: "todo", to: "doing" }] },
    ];
    setBoard(next);
    await saveBoard(userId, next);
  }

  async function start() {
    if (!selected) {
      setError("Selecciona una tarea antes de empezar.");
      return;
    }
    setError(null);
    try {
      if (sessionId && remaining > 0 && remaining < totalSeconds) {
        endsAtRef.current = Date.now() + remaining * 1000;
        setRunning(true);
        return;
      }
      await moveToDoingIfNeeded(selected);
      const id = await startSession(userId, selected, minutes);
      setSessionId(id);
      endsAtRef.current = Date.now() + totalSeconds * 1000;
      setRemaining(totalSeconds);
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar la sesión");
    }
  }

  async function finish() {
    const id = sessionId;
    setSessionId(null);
    setRemaining(totalSeconds);
    if (soundRef.current) playAlarm();
    if (notifyRef.current)
      sendNotification("¡Pomodoro terminado! 🍅", `${minutes} min en "${selected || "tu tarea"}"`);
    if (!id) return;
    try {
      await completeSession(id);
      setSessions(await listSessions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la sesión");
    }
  }

  async function moveToDone(title: string) {
    const found = tasks.find((t) => t.title === title);
    if (!found || found.col === "done") return;
    const from = found.col;
    const task = board[from].find((t) => t.id === found.id);
    if (!task) return;
    const now = Date.now();
    const next = { ...board } as BoardState;
    next[from] = board[from].filter((t) => t.id !== found.id);
    next.done = [
      ...board.done,
      { ...task, history: [...(task.history ?? []), { at: now, from, to: "done" as ColumnId }] },
    ];
    setBoard(next);
    await saveBoard(userId, next);
  }

  /** Cierra la sesión actual contándola como pomodoro completado. */
  async function stopSession(markTaskDone: boolean) {
    if (soundOn) playClick();
    setRunning(false);
    const id = sessionId;
    const workedMinutes = Math.max(1, Math.round((totalSeconds - remaining) / 60));
    setSessionId(null);
    setRemaining(totalSeconds);
    try {
      if (id) {
        await completeSession(id, workedMinutes, markTaskDone);
        setSessions(await listSessions());
      }
      if (markTaskDone && selected) await moveToDone(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la sesión");
    }
  }

  async function reset() {
    if (soundOn) playClick();
    setRunning(false);
    setRemaining(totalSeconds);
    const id = sessionId;
    setSessionId(null);
    if (id) {
      try {
        await cancelSession(id);
      } catch {
        /* ignore */
      }
    }
  }

  function changeMinutes(value: number) {
    const m = Math.min(180, Math.max(0, Math.round(value)));
    setMinutes(m);
    if (!running && !sessionId) setRemaining(Math.max(1, m * 60 + secs));
  }

  function dragMinutes(delta: number) {
    if (running || sessionId) return;
    changeMinutes(minutes + delta);
    if (soundOn) playTick();
  }

  function dragSeconds(delta: number) {
    if (running || sessionId) return;
    const total = Math.min(180 * 60, Math.max(5, minutes * 60 + secs + delta));
    const m = Math.floor(total / 60);
    const s2 = total % 60;
    setMinutes(m);
    setSecs(s2);
    setRemaining(total);
    if (soundOn) playTick();
  }

  const totalSeconds = Math.max(1, minutes * 60 + secs);
  const workedSeconds = totalSeconds - remaining;
  const progress = 1 - remaining / totalSeconds;

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-5xl px-4 py-10"}>
      {!embedded && (
        <header className="mb-8">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">Enfoque</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pomodoro
          </h1>
          {nav ?? (
            <nav className="mt-4 flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
              <Link
                to="/"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Tablero
              </Link>
              <span className="rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                Pomodoro
              </span>
            </nav>
          )}
        </header>
      )}

      <section className="glass-panel rounded-xl p-6">
        <label className="block text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Tarea en la que trabajas
        </label>
        <TaskPicker
          tasks={tasks}
          value={selected}
          onChange={setSelected}
          disabled={running}
          groups={COLUMNS.map((c) => ({ id: c.id, label: COLUMN_TITLES[c.id] }))}
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Duración</span>
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={running}
              onClick={() => {
                if (soundOn) playClick();
                changeMinutes(m);
              }}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (minutes === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/70")
              }
            >
              {m} min
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              title={soundOn ? "Sonido activado" : "Sonido desactivado"}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors " +
                (soundOn
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/70")
              }
            >
              {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              Sonido
            </button>
            <button
              type="button"
              onClick={() => void toggleNotify()}
              title={notifyOn ? "Notificaciones activadas" : "Notificaciones desactivadas"}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors " +
                (notifyOn
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/70")
              }
            >
              {notifyOn ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
              Avisos
            </button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <FlipClock
            minutes={Math.floor(Math.max(0, Math.ceil(remaining)) / 60)}
            seconds={Math.max(0, Math.ceil(remaining)) % 60}
            onChangeMinutes={dragMinutes}
            onChangeSeconds={dragSeconds}
            editable={!running && !sessionId}
          />
          <p className="sr-only">{fmt(remaining)}</p>
          <div className="relative mx-auto mt-8 w-full max-w-md">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-300"
              style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              aria-hidden="true"
            >
              <span
                className={cn(
                  "block size-3 rounded-full bg-primary shadow-[0_0_0_3px_var(--background)]",
                  running && "animate-pulse",
                )}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            {running ? (
              <button
                type="button"
                onClick={() => {
                  if (soundOn) playClick();
                  setRunning(false);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                <Pause className="size-4" /> Pausar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (soundOn) playClick();
                  void start();
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Play className="size-4" /> {sessionId ? "Reanudar" : "Iniciar"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void reset()}
              className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
            >
              <RotateCcw className="size-4" /> Reiniciar
            </button>
          </div>

          {sessionId && !running && workedSeconds >= 240 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => void stopSession(true)}
                className="inline-flex items-center gap-2 rounded-md bg-done px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-done/90"
              >
                <CheckCircle2 className="size-4" /> Tarea terminada
              </button>
              <button
                type="button"
                onClick={() => void stopSession(false)}
                className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                <FlagTriangleRight className="size-4" /> Terminar por ahora
              </button>
            </div>
          )}
          {error && <p className="mt-4 text-xs font-medium text-destructive">⚠︎ {error}</p>}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-foreground">Historial</h2>
          <span className="text-xs font-medium text-muted-foreground">
            {totalPomodoros} pomodoro(s) completados · {stats.length} tarea(s)
          </span>
        </div>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no has corrido ningún pomodoro. ¡Empieza uno arriba!
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.map((s) => (
              <li
                key={s.taskTitle}
                className="glass-panel flex flex-wrap items-center gap-3 rounded-lg p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm text-card-foreground">
                    {s.taskDone && (
                      <CheckCircle2
                        className="size-4 shrink-0 text-done"
                        aria-label="Tarea terminada"
                      />
                    )}
                    <span className="truncate">{s.taskTitle}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {s.completed} completados · {s.minutes} min enfocados
                  </p>
                </div>
                <div className="flex max-w-[220px] flex-wrap items-center gap-0.5 text-base leading-none">
                  {Array.from({ length: Math.min(s.completed, 12) }).map((_, i) => (
                    <span key={i} title="Pomodoro completado">
                      🍅
                    </span>
                  ))}
                  {s.completed > 12 && (
                    <span className="ml-1 text-xs font-medium text-muted-foreground">
                      +{s.completed - 12}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(s.taskTitle);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  <Timer className="size-3.5" /> Otra sesión
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
