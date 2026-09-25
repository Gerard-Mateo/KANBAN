import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AlertTriangle, Check, LogOut, Loader2, Save } from "lucide-react";
import {
  COLUMNS,
  initialBoard,
  tagsForTask,
  type BoardState,
  type ColumnId,
  type Task,
} from "@/lib/kanban-data";
import { Column } from "./Column";
import { TaskCardBody } from "./TaskCard";
import { FilterBar, type TagTone } from "./FilterBar";
import { TaskContextMenu, type MenuState } from "./TaskContextMenu";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { FileMenu } from "./FileMenu";
import { CloneRenameDialog, replaceWord } from "./CloneRenameDialog";
import { BulkRenameDialog, applyRename, type RenameMode } from "./BulkRenameDialog";
import { BulkCreateDialog } from "./BulkCreateDialog";
import { BulkDetailsDialog } from "./BulkDetailsDialog";
import {
  DEFAULT_SHORTCUT,
  ShortcutSetting,
  matchesShortcut,
  parseShortcut,
  type Shortcut,
} from "./ShortcutSetting";
import { loadBoard, saveBoard } from "@/lib/tasks-cloud";
import { saveBoardVersion } from "@/lib/local-save";
import { ensureCustomType, upsertCustomType, useCustomTypes } from "@/lib/custom-types";
import { supabase } from "@/integrations/supabase/client";
import { PomodoroPage } from "@/components/pomodoro/PomodoroPage";
import { OkrPage } from "@/components/okr/OkrPage";

const STORAGE_KEY = "kanban-board-v1";
const SHORTCUT_KEY = "kanban-ctrl-a-new-task";
const SHORTCUT_COMBO_KEY = "kanban-new-task-combo";
const FLIP_DURATION_MS = 220;

// El ancla se guarda en coordenadas de página (incluye el scroll) para que el
// rectángulo siga apuntando al mismo sitio mientras la página se desplaza sola.
type Marquee = { pageX0: number; pageY0: number; x1: number; y1: number };

const EDGE = 60; // px desde el borde donde empieza el auto-scroll
const MAX_SCROLL_SPEED = 18; // px por frame

function logMove(task: Task, from: ColumnId | null, to: ColumnId): Task {
  return { ...task, history: [...(task.history ?? []), { at: Date.now(), from, to }] };
}

function findColumn(board: BoardState, id: string): ColumnId | undefined {
  if (id in board) return id as ColumnId;
  return COLUMNS.find((c) => board[c.id].some((t) => t.id === id))?.id;
}

/** ¿El bloque seleccionado ya está junto y cubriendo esa posición? (no hay nada que mover) */
function isBlockContiguousAt(list: Task[], movingIds: Set<string>, overIndex: number) {
  const indexes = list.map((t, i) => (movingIds.has(t.id) ? i : -1)).filter((i) => i >= 0);
  const first = indexes[0] ?? -1;
  const last = indexes[indexes.length - 1] ?? -1;
  return last - first + 1 === indexes.length && overIndex >= first && overIndex <= last;
}

function rectsOverlap(a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function Board({ userId, email }: { userId: string; email?: string | undefined }) {
  const [board, setBoard] = useState<BoardState>({ todo: [], doing: [], done: [] });
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [tones, setTones] = useState<Set<TagTone>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [shortcutOn, setShortcutOn] = useState(true);
  const [shortcut, setShortcut] = useState<Shortcut>(DEFAULT_SHORTCUT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cloneOpen, setCloneOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [bulkCreateCol, setBulkCreateCol] = useState<ColumnId | null>(null);
  const [bulkDetailsOpen, setBulkDetailsOpen] = useState(false);
  const [tab, setTab] = useState<"board" | "pomodoro" | "okr">("board");
  const [pomodoroTask, setPomodoroTask] = useState<string | undefined>(undefined);
  const [typeahead, setTypeahead] = useState("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClear = useRef(false);

  useEffect(() => {
    setShortcutOn(localStorage.getItem(SHORTCUT_KEY) !== "off");
    const saved = parseShortcut(localStorage.getItem(SHORTCUT_COMBO_KEY));
    if (saved) setShortcut(saved);
  }, []);

  // Carga inicial desde la nube; si la nube está vacía, migra lo guardado en este navegador.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cloud = await loadBoard();
        const cloudEmpty = COLUMNS.every((c) => cloud[c.id].length === 0);
        if (cloudEmpty) {
          const raw = localStorage.getItem(STORAGE_KEY);
          let local: BoardState | null = null;
          try {
            local = raw ? (JSON.parse(raw) as BoardState) : null;
          } catch {
            local = null;
          }
          const seed = local ?? initialBoard;
          if (cancelled) return;
          setBoard(seed);
          await saveBoard(userId, seed);
        } else if (!cancelled) {
          setBoard(cloud);
        }
      } catch (e) {
        if (!cancelled) setSyncError(e instanceof Error ? e.message : "Error de sincronización");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Guardado automático en la nube (con debounce).
  useEffect(() => {
    if (!loaded) return;
    setSyncing(true);
    const timer = setTimeout(() => {
      saveBoard(userId, board)
        .then(() => setSyncError(null))
        .catch((e: unknown) =>
          setSyncError(e instanceof Error ? e.message : "No se pudo guardar en la nube"),
        )
        .finally(() => setSyncing(false));
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, loaded, userId]);

  useEffect(() => {
    localStorage.setItem(SHORTCUT_KEY, shortcutOn ? "on" : "off");
  }, [shortcutOn]);

  useEffect(() => {
    localStorage.setItem(SHORTCUT_COMBO_KEY, JSON.stringify(shortcut));
  }, [shortcut]);

  useEffect(() => {
    if (!shortcutOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, shortcut)) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      const id = handleAddTask("todo", "");
      setDetailsId(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutOn, shortcut]);

  // Búsqueda "al vuelo": escribe en cualquier parte del tablero, se filtra al instante
  // y el texto desaparece solo un momento después de dejar de escribir.
  useEffect(() => {
    if (tab !== "board") return;
    const scheduleClear = () => {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => {
        setTypeahead("");
        setQuery("");
      }, 1400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable)
        return;

      if (e.key === "Escape") {
        if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
        setTypeahead("");
        setQuery("");
        return;
      }
      if (e.key === "Backspace") {
        setTypeahead((prev) => {
          const next = prev.slice(0, -1);
          setQuery(next);
          return next;
        });
        scheduleClear();
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      setTypeahead((prev) => {
        const next = prev + e.key;
        setQuery(next);
        return next;
      });
      scheduleClear();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
    };
  }, [tab]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const boardRef = useRef<BoardState>(board);
  boardRef.current = board;

  // Tipos personalizados: al borrar uno se quita de las tareas y del filtro; los tipos
  // que ya traen las tareas (nube / importación) se registran para poder elegirlos.
  const customTypes = useCustomTypes();
  const prevCustomTypes = useRef(customTypes);
  useEffect(() => {
    const gone = new Set(
      prevCustomTypes.current
        .filter((p) => !customTypes.some((c) => c.label === p.label))
        .map((p) => p.label),
    );
    prevCustomTypes.current = customTypes;
    if (gone.size === 0) return;
    setTones((prev) => new Set([...prev].filter((t) => !gone.has(t))));
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      for (const c of COLUMNS) {
        next[c.id] = prev[c.id].map((t) => {
          if (!t.type || !gone.has(t.type)) return t;
          const updated: Task = { ...t };
          delete updated.type;
          return updated;
        });
      }
      return next;
    });
  }, [customTypes]);

  function registerBoardTypes(b: BoardState) {
    for (const c of COLUMNS) for (const t of b[c.id]) if (t.type) ensureCustomType(t.type);
  }

  useEffect(() => {
    if (loaded) registerBoardTypes(boardRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Guardar (Ctrl+G): escribe la versión actual como .xlsx en una carpeta
  // local elegida una sola vez, en vez de disparar una descarga cada vez.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(
    async (forcePick = false) => {
      if (saveState === "saving") return;
      setSaveState("saving");
      setSaveMessage(null);
      try {
        const { fileName, folderName } = await saveBoardVersion(boardRef.current, forcePick);
        setSaveState("saved");
        setSaveMessage(`Guardado como ${fileName} en "${folderName}"`);
      } catch (e) {
        // Cancelar el selector de carpeta no es un error real.
        if (e instanceof DOMException && e.name === "AbortError") {
          setSaveState("idle");
          return;
        }
        setSaveState("error");
        setSaveMessage(e instanceof Error ? e.message : "No se pudo guardar.");
      } finally {
        if (saveResetTimer.current) clearTimeout(saveResetTimer.current);
        saveResetTimer.current = setTimeout(() => {
          setSaveState("idle");
          setSaveMessage(null);
        }, 3500);
      }
    },
    [saveState],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        void handleSave(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  // Detección de colisiones: primero la columna bajo el puntero, luego la tarjeta más cercana
  // dentro de esa columna. Así un drop rápido y lejano siempre acierta la columna correcta.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const columnHit = hits.find((h) => COLUMNS.some((c) => c.id === h.id));
    if (!columnHit) return hits;

    const columnId = String(columnHit.id) as ColumnId;
    const cardIds = new Set((boardRef.current[columnId] ?? []).map((t) => t.id));
    const cardHits = closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => cardIds.has(String(c.id))),
    });
    return cardHits.length > 0 ? cardHits : [columnHit];
  }, []);

  // Callbacks estables para que las tarjetas memoizadas no se re-rendericen al arrastrar.
  // Click normal: selecciona solo esa tarea (reemplaza la selección previa; si ya era
  // la única seleccionada, la deselecciona). Ctrl/Cmd+click: selección múltiple aditiva.
  const handleTaskSelect = useCallback((task: Task, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    setSelected((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        return next;
      }
      if (prev.size === 1 && prev.has(task.id)) return new Set();
      return new Set([task.id]);
    });
  }, []);

  const handleTaskContextMenu = useCallback((task: Task, e: React.MouseEvent) => {
    setMenu({ x: e.clientX, y: e.clientY, taskId: task.id });
  }, []);

  // --- Selección por arrastre (marquee), como en un explorador de archivos ---
  // Click+arrastre desde un área vacía dibuja un rectángulo; las tarjetas que toca
  // quedan seleccionadas. Con Ctrl/Cmd se suma a la selección existente. Escucha
  // desde la raíz de la página (no solo la grilla de columnas) para que también
  // funcione arrastrando desde los márgenes laterales en pantallas anchas.
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeBase = useRef<Set<string>>(new Set());

  const marqueeRect = (box: Marquee) => {
    // El ancla vuelve a coordenadas de viewport para comparar con getBoundingClientRect.
    const y0 = box.pageY0 - window.scrollY;
    const x0 = box.pageX0 - window.scrollX;
    return {
      left: Math.min(x0, box.x1),
      right: Math.max(x0, box.x1),
      top: Math.min(y0, box.y1),
      bottom: Math.max(y0, box.y1),
    };
  };

  const updateMarqueeSelection = useCallback((box: Marquee) => {
    const rect = marqueeRect(box);
    const hit = new Set(marqueeBase.current);
    document.querySelectorAll<HTMLElement>("[data-task-id]").forEach((el) => {
      if (rectsOverlap(rect, el.getBoundingClientRect())) {
        const id = el.dataset["taskId"];
        if (id) hit.add(id);
      }
    });
    setSelected(hit);
  }, []);

  const hasMarquee = marquee !== null;
  useEffect(() => {
    if (!marquee) return;
    // Último punto del cursor: lo usa tanto el mousemove como el auto-scroll,
    // que sigue seleccionando aunque el ratón esté quieto en el borde.
    const pointer = { x: marquee.x1, y: marquee.y1 };
    let frame = 0;

    const apply = () => {
      const next = {
        pageX0: marquee!.pageX0,
        pageY0: marquee!.pageY0,
        x1: pointer.x,
        y1: pointer.y,
      };
      setMarquee(next);
      updateMarqueeSelection(next);
    };

    function onMove(e: MouseEvent) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      apply();
    }
    function onUp() {
      suppressNextClear.current = true;
      setMarquee(null);
    }

    // Auto-scroll al arrastrar cerca del borde superior/inferior, como en un
    // explorador de archivos: la página sigue mientras tú sigues seleccionando.
    const tick = () => {
      const top = pointer.y - EDGE;
      const bottom = pointer.y - (window.innerHeight - EDGE);
      let dy = 0;
      if (top < 0) dy = Math.max(-1, top / EDGE) * MAX_SCROLL_SPEED;
      else if (bottom > 0) dy = Math.min(1, bottom / EDGE) * MAX_SCROLL_SPEED;
      if (dy !== 0) {
        const before = window.scrollY;
        window.scrollBy(0, dy);
        if (window.scrollY !== before) apply();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // Only resubscribe when a marquee drag starts/ends, not on every position
    // update -- `marquee` itself is read fresh from the closure each time
    // this effect re-runs, which is exactly when we want new listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMarquee, updateMarqueeSelection]);

  function handleMarqueeMouseDown(e: React.MouseEvent) {
    if (tab !== "board" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-task-id], button, input, textarea, a, [role='dialog'], [role='menu']")
    )
      return;
    e.preventDefault();
    marqueeBase.current = e.ctrlKey || e.metaKey ? new Set(selected) : new Set();
    const start = {
      pageX0: e.clientX + window.scrollX,
      pageY0: e.clientY + window.scrollY,
      x1: e.clientX,
      y1: e.clientY,
    };
    setMarquee(start);
    updateMarqueeSelection(start);
  }

  const total = useMemo(() => COLUMNS.reduce((sum, c) => sum + board[c.id].length, 0), [board]);

  // Usa tagsForTask (no tagsFor) para que el filtro respete un tipo asignado a
  // mano desde el diálogo de detalles, igual que las etiquetas de la tarjeta.
  const taskTones = (t: Task): TagTone[] => tagsForTask(t).map((tag) => tag.tone);

  const matches = (t: Task) => {
    const q = query.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (tones.size === 0) return true;
    return taskTones(t).some((tone) => tones.has(tone));
  };

  const filteredBoard = useMemo(() => {
    const next = {} as BoardState;
    for (const c of COLUMNS) next[c.id] = board[c.id].filter(matches);
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, query, tones]);

  const resultCount = useMemo(
    () => COLUMNS.reduce((sum, c) => sum + filteredBoard[c.id].length, 0),
    [filteredBoard],
  );

  // La barra de progreso refleja el filtro activo (texto + categoría): sin
  // filtro, filteredBoard/resultCount coinciden con el tablero completo.
  const filteredDone = filteredBoard.done.length;
  const filteredProgress = resultCount ? Math.round((filteredDone / resultCount) * 100) : 0;

  function toggleTone(tone: TagTone) {
    setTones((prev) => {
      const next = new Set(prev);
      if (next.has(tone)) next.delete(tone);
      else next.add(tone);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setTones(new Set());
  }

  function handleDragStart(event: DragStartEvent) {
    const col = findColumn(board, String(event.active.id));
    if (!col) return;
    setActiveTask(board[col].find((t) => t.id === event.active.id) ?? null);
  }

  // --- Animación de grupo (FLIP) para las tarjetas seleccionadas que no son la
  // que se arrastra activamente: sin esto, solo la tarjeta bajo el cursor se ve
  // moverse y las demás "teletransportan" a la nueva columna sin transición.
  const pendingFlip = useRef<{ ids: string[]; rects: Map<string, DOMRect> } | null>(null);

  function captureFlip(ids: string[]) {
    if (ids.length === 0) return;
    const rects = new Map<string, DOMRect>();
    ids.forEach((id) => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
      if (el) rects.set(id, el.getBoundingClientRect());
    });
    pendingFlip.current = { ids, rects };
  }

  useLayoutEffect(() => {
    const pending = pendingFlip.current;
    if (!pending) return;
    pendingFlip.current = null;
    pending.ids.forEach((id) => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
      const oldRect = pending.rects.get(id);
      if (!el || !oldRect) return;
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (dx === 0 && dy === 0) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.zIndex = "10";
      // Fuerza reflow para que el estado "en la posición vieja" se aplique antes
      // de animar, en vez de saltar directo al destino.
      void el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_DURATION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        el.style.transform = "";
        const clear = () => {
          el.style.transition = "";
          el.style.zIndex = "";
          el.removeEventListener("transitionend", clear);
        };
        el.addEventListener("transitionend", clear);
        setTimeout(clear, FLIP_DURATION_MS + 80);
      });
    });
  }, [board]);

  // Mueve la tarea (y su selección) a otra columna, insertando en la posición del `over`.
  // Si hay más de una tarea seleccionada, anima el resto del grupo con FLIP.
  function moveToColumn(activeId: string, to: ColumnId, overId: string | null) {
    const from = findColumn(board, activeId);
    if (from && from !== to && selected.has(activeId) && selected.size > 1) {
      const companions = board[from]
        .filter((t) => selected.has(t.id) && t.id !== activeId)
        .map((t) => t.id);
      captureFlip(companions);
    }
    setBoard((prev) => {
      const prevFrom = findColumn(prev, activeId);
      if (!prevFrom || prevFrom === to) return prev;
      const task = prev[prevFrom].find((t) => t.id === activeId);
      if (!task) return prev;
      const moving = selected.has(task.id)
        ? prev[prevFrom].filter((t) => selected.has(t.id))
        : [task];
      const movingIds = new Set(moving.map((t) => t.id));
      const overIndex = overId ? prev[to].findIndex((t) => t.id === overId) : -1;
      const target = [...prev[to]];
      target.splice(
        overIndex >= 0 ? overIndex : target.length,
        0,
        ...moving.map((t) => logMove(t, prevFrom, to)),
      );
      return {
        ...prev,
        [prevFrom]: prev[prevFrom].filter((t) => !movingIds.has(t.id)),
        [to]: target,
      };
    });
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const from = findColumn(board, String(active.id));
    const to = findColumn(board, String(over.id));
    if (!from || !to || from === to) return;
    moveToColumn(String(active.id), to, String(over.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const from = findColumn(board, activeId);
    const to = findColumn(board, String(over.id));
    if (!from || !to) return;
    // Drop muy rápido: puede que `onDragOver` no haya alcanzado a mover la tarjeta.
    if (from !== to) {
      moveToColumn(activeId, to, String(over.id));
      return;
    }
    reorderWithinColumn(from, activeId, String(over.id));
  }

  // Reordenar dentro de la misma columna. Con varias tareas seleccionadas se
  // mueve el grupo entero como un bloque, no solo la tarjeta bajo el cursor.
  function reorderWithinColumn(col: ColumnId, activeId: string, overId: string) {
    const list = board[col];
    const activeIndex = list.findIndex((t) => t.id === activeId);
    const overIndex = list.findIndex((t) => t.id === overId);
    if (activeIndex === -1 || overIndex === -1) return;

    const group = selected.has(activeId) && selected.size > 1;
    if (!group) {
      if (activeIndex === overIndex) return;
      setBoard((prev) => ({ ...prev, [col]: arrayMove(prev[col], activeIndex, overIndex) }));
      return;
    }

    const movingIds = new Set(list.filter((t) => selected.has(t.id)).map((t) => t.id));
    if (movingIds.has(overId) && isBlockContiguousAt(list, movingIds, overIndex)) return;

    captureFlip([...movingIds].filter((id) => id !== activeId));
    setBoard((prev) => {
      const cur = prev[col];
      const moving = cur.filter((t) => movingIds.has(t.id));
      const rest = cur.filter((t) => !movingIds.has(t.id));
      const curOverIndex = cur.findIndex((t) => t.id === overId);
      // Cuántas tarjetas que no se mueven quedan por encima del punto de destino.
      let at = cur.slice(0, curOverIndex).filter((t) => !movingIds.has(t.id)).length;
      // Soltando por debajo del bloque: el grupo va después de la tarjeta destino.
      if (!movingIds.has(overId) && activeIndex < curOverIndex) at += 1;
      rest.splice(at, 0, ...moving);
      return { ...prev, [col]: rest };
    });
  }

  function handleAddTask(col: ColumnId, title: string) {
    const id = `${col[0]}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    setBoard((prev) => ({
      ...prev,
      [col]: [
        ...prev[col],
        { id, title, createdAt: now, history: [{ at: now, from: null, to: col }] },
      ],
    }));
    return id;
  }

  // Detalles en grupo: tipo y estado de todas las tareas seleccionadas a la vez.
  function bulkSetType(type: TagTone | undefined) {
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      for (const c of COLUMNS) {
        next[c.id] = prev[c.id].map((t) => {
          if (!selected.has(t.id)) return t;
          const updated: Task = { ...t };
          delete updated.type;
          return type ? { ...updated, type } : updated;
        });
      }
      return next;
    });
  }

  function bulkMove(to: ColumnId) {
    const moving = selectedTasks.filter((s) => s.col !== to);
    if (moving.length === 0) return;
    captureFlip(moving.map((m) => m.task.id));
    const ids = new Set(moving.map((m) => m.task.id));
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      const moved: Task[] = [];
      for (const c of COLUMNS) {
        if (c.id === to) continue;
        next[c.id] = prev[c.id].filter((t) => {
          if (!ids.has(t.id)) return true;
          moved.push(logMove(t, c.id, to));
          return false;
        });
      }
      next[to] = [...prev[to], ...moved];
      return next;
    });
  }

  function handleDetailsFromMenu(taskId: string) {
    if (selected.size > 1 && selected.has(taskId)) setBulkDetailsOpen(true);
    else setDetailsId(taskId);
  }

  // Crea varias tareas de golpe en una columna, todas con el mismo tipo (si se eligió).
  function handleAddMany(col: ColumnId, titles: string[], type: TagTone | undefined) {
    const now = Date.now();
    setBoard((prev) => ({
      ...prev,
      [col]: [
        ...prev[col],
        ...titles.map((title, i) => ({
          id: `${col[0]}${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          createdAt: now,
          ...(type ? { type } : {}),
          history: [{ at: now, from: null, to: col }],
        })),
      ],
    }));
    setBulkCreateCol(null);
  }

  function findTask(id: string | null): { task: Task; col: ColumnId } | undefined {
    if (!id) return undefined;
    for (const c of COLUMNS) {
      const task = board[c.id].find((t) => t.id === id);
      if (task) return { task, col: c.id };
    }
    return undefined;
  }

  function handleDelete(id: string) {
    const found = findTask(id);
    if (!found) return;
    setBoard((prev) => ({
      ...prev,
      [found.col]: prev[found.col].filter((t) => t.id !== id),
    }));
    setDetailsId((cur) => (cur === id ? null : cur));
  }

  function handleAddBelow(id: string) {
    const found = findTask(id);
    if (!found) return;
    const newId = `${found.col[0]}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setBoard((prev) => {
      const list = [...prev[found.col]];
      const index = list.findIndex((t) => t.id === id);
      const now = Date.now();
      list.splice(index + 1, 0, {
        id: newId,
        title: "",
        createdAt: now,
        history: [{ at: now, from: null, to: found.col }],
      });
      return { ...prev, [found.col]: list };
    });
    setDetailsId(newId);
  }

  function handleUpdate(id: string, patch: Partial<Task>) {
    const found = findTask(id);
    if (!found) return;
    setBoard((prev) => ({
      ...prev,
      [found.col]: prev[found.col].map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function handleMove(id: string, to: ColumnId) {
    const found = findTask(id);
    if (!found || found.col === to) return;
    setBoard((prev) => ({
      ...prev,
      [found.col]: prev[found.col].filter((t) => t.id !== id),
      [to]: [...prev[to], logMove(found.task, found.col, to)],
    }));
  }

  // Inicia un pomodoro para la tarea: si está en "Por Hacer" pasa a "En Progreso".
  async function startPomodoro(id: string) {
    const found = findTask(id);
    if (!found) return;
    const title = found.task.title;
    if (found.col === "todo") {
      const now = Date.now();
      const next: BoardState = {
        ...board,
        todo: board.todo.filter((t) => t.id !== id),
        doing: [
          ...board.doing,
          {
            ...found.task,
            history: [...(found.task.history ?? []), { at: now, from: "todo", to: "doing" }],
          },
        ],
      };
      setBoard(next);
      try {
        await saveBoard(userId, next);
      } catch {
        /* el autoguardado reintenta */
      }
    }
    setPomodoroTask(title);
    setTab("pomodoro");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const selectedTasks = useMemo(() => {
    const list: { task: Task; col: ColumnId }[] = [];
    for (const c of COLUMNS)
      for (const t of board[c.id]) if (selected.has(t.id)) list.push({ task: t, col: c.id });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, selected]);

  function cloneSelected(target?: string, replacement?: string) {
    if (selectedTasks.length === 0) return;
    const now = Date.now();
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      for (const c of COLUMNS) next[c.id] = [...prev[c.id]];
      selectedTasks.forEach(({ task, col }, i) => {
        const title =
          target !== undefined
            ? replaceWord(task.title, target, replacement ?? "")
            : `${task.title} (copia)`;
        next[col].push({
          ...task,
          id: `${col[0]}${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          createdAt: now,
          history: [{ at: now, from: null, to: col }],
        });
      });
      return next;
    });
    setSelected(new Set());
    setCloneOpen(false);
  }

  // Edita el título de cada tarea seleccionada en el sitio (no crea copias).
  function renameSelected(mode: RenameMode, text: string, replacement: string) {
    if (selectedTasks.length === 0) return;
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      for (const c of COLUMNS) next[c.id] = [...prev[c.id]];
      selectedTasks.forEach(({ task, col }) => {
        const idx = next[col].findIndex((t) => t.id === task.id);
        if (idx === -1) return;
        next[col][idx] = {
          ...next[col][idx]!,
          title: applyRename(task.title, mode, text, replacement),
        };
      });
      return next;
    });
    setRenameOpen(false);
  }

  const boardTitles = useMemo(
    () => COLUMNS.flatMap((c) => board[c.id].map((t) => t.title)).filter(Boolean),
    [board],
  );

  // Inicia un pomodoro desde OKRs: si la tarea existe en el tablero, aplica la misma
  // lógica (Por Hacer -> En Progreso); si no, solo abre el pomodoro con ese título.
  function startPomodoroByTitle(title: string) {
    const found = COLUMNS.flatMap((c) => board[c.id].map((t) => ({ t, col: c.id }))).find(
      (x) => x.t.title === title,
    );
    if (found) {
      void startPomodoro(found.t.id);
      return;
    }
    setPomodoroTask(title);
    setTab("pomodoro");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Marca como hecha en el tablero la tarea con ese título (si existe).
  function completeBoardTaskByTitle(title: string) {
    const found = COLUMNS.flatMap((c) => board[c.id].map((t) => ({ t, col: c.id }))).find(
      (x) => x.t.title === title,
    );
    if (found && found.col !== "done") handleMove(found.t.id, "done");
  }

  function deleteSelected() {
    if (selectedTasks.length === 0) return;
    setBoard((prev) => {
      const next = { ...prev } as BoardState;
      for (const c of COLUMNS) next[c.id] = prev[c.id].filter((t) => !selected.has(t.id));
      return next;
    });
    setSelected(new Set());
  }

  const tabLabels = { board: "Tablero", pomodoro: "Pomodoro", okr: "OKRs" } as const;

  return (
    <div
      className="min-h-screen bg-background"
      onMouseDown={handleMarqueeMouseDown}
      onClick={() => {
        if (suppressNextClear.current) {
          suppressNextClear.current = false;
          return;
        }
        if (selected.size > 0) setSelected(new Set());
      }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Mis Tareas</h1>

            <nav
              className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {(["board", "pomodoro", "okr"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                    (tab === t
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {tabLabels[t]}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {saveMessage
                  ? saveMessage
                  : syncError
                    ? `⚠ ${syncError}`
                    : syncing
                      ? "Guardando…"
                      : "Guardado en la nube"}
              </span>
              {selected.size > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {selected.size} seleccionada(s)
                </span>
              )}
              <ShortcutSetting
                enabled={shortcutOn}
                onEnabledChange={setShortcutOn}
                shortcut={shortcut}
                onShortcutChange={setShortcut}
              />
              <button
                type="button"
                onClick={(e) => void handleSave(e.shiftKey)}
                disabled={saveState === "saving"}
                title="Guardar versión en carpeta local (Ctrl+G · Shift+clic para cambiar de carpeta)"
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 " +
                  (saveState === "saved"
                    ? "bg-done text-white"
                    : saveState === "error"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary text-foreground hover:bg-secondary/70")
                }
              >
                {saveState === "saving" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : saveState === "saved" ? (
                  <Check className="size-3.5" />
                ) : saveState === "error" ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Guardar
              </button>
              <FileMenu
                board={board}
                onImport={(next, types) => {
                  for (const t of types) upsertCustomType(t.label, t.hue);
                  registerBoardTypes(next);
                  setBoard(next);
                  setSelected(new Set());
                  setDetailsId(null);
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
                title={email ? `Salir (${email})` : "Salir"}
                aria-label="Salir"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-done transition-[width] duration-300"
                style={{ width: `${filteredProgress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredDone} de {resultCount} completadas ({filteredProgress}%)
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className={tab === "pomodoro" ? "hidden" : undefined}>
          <FilterBar
            query={query}
            onQuery={setQuery}
            tones={tones}
            onToggleTone={toggleTone}
            onClear={clearFilters}
            resultCount={resultCount}
            totalCount={total}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            autoScroll={{ threshold: { x: 0.15, y: 0.2 }, acceleration: 12 }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveTask(null)}
          >
            <div className="grid select-none gap-6 md:grid-cols-3 md:gap-8">
              {COLUMNS.map((col) => (
                <Column
                  key={col.id}
                  id={col.id}
                  title={col.title}
                  hint={col.hint}
                  tasks={filteredBoard[col.id]}
                  onAdd={(title) => handleAddTask(col.id, title)}
                  onBulkCreate={() => setBulkCreateCol(col.id)}
                  onCreateWithDetails={() => setDetailsId(handleAddTask(col.id, ""))}
                  selectedIds={selected}
                  onTaskSelect={handleTaskSelect}
                  onTaskContextMenu={handleTaskContextMenu}
                />
              ))}
            </div>

            {/* No drop animation: the card should disappear from the overlay the
            instant it's released instead of easing into the slot. */}
            <DragOverlay dropAnimation={null} style={{ willChange: "transform" }}>
              {activeTask
                ? (() => {
                    const groupSize =
                      selected.has(activeTask.id) && selected.size > 1 ? selected.size : 1;
                    // Las demás tarjetas del grupo viajan apiladas debajo de la de arriba.
                    const layers = Math.min(groupSize - 1, 3);
                    return (
                      <div className="relative w-[320px] cursor-grabbing">
                        {Array.from({ length: layers }, (_, i) => layers - i).map((depth) => (
                          <div
                            key={depth}
                            aria-hidden
                            className="absolute inset-0 rounded-lg border border-primary/40 bg-card shadow-sm"
                            style={{
                              transform: `translate(${depth * 4}px, ${depth * 4}px) rotate(${depth * 0.6}deg)`,
                              opacity: 1 - depth * 0.18,
                            }}
                          />
                        ))}
                        <div className="relative">
                          <TaskCardBody task={activeTask} dragging />
                        </div>
                        {groupSize > 1 && (
                          <div className="absolute -top-2 -left-2 z-10 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground shadow-sm">
                            {groupSize}
                          </div>
                        )}
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>
          </DndContext>

          {marquee && (
            <div
              className="pointer-events-none fixed z-40 rounded-sm border border-primary/50 bg-primary/10"
              style={{
                left: marqueeRect(marquee).left,
                top: marqueeRect(marquee).top,
                width: marqueeRect(marquee).right - marqueeRect(marquee).left,
                height: marqueeRect(marquee).bottom - marqueeRect(marquee).top,
              }}
            />
          )}
        </div>

        <div className={tab === "pomodoro" ? undefined : "hidden"}>
          <PomodoroPage
            userId={userId}
            embedded
            active={tab === "pomodoro"}
            initialTask={pomodoroTask}
          />
        </div>

        <div className={tab === "okr" ? undefined : "hidden"} onClick={(e) => e.stopPropagation()}>
          <OkrPage
            boardTitles={boardTitles}
            onCreateBoardTask={(title) => handleAddTask("todo", title)}
            onStartPomodoro={(title) => startPomodoroByTitle(title)}
            onCompleteBoardTask={(title) => completeBoardTaskByTitle(title)}
          />
        </div>
      </main>

      <TaskContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        selectedCount={selected.size}
        onDelete={() => (selected.size > 0 ? deleteSelected() : menu && handleDelete(menu.taskId))}
        onClone={() => cloneSelected()}
        onCloneRename={() => setCloneOpen(true)}
        onRename={() => setRenameOpen(true)}
        onClearSelection={() => setSelected(new Set())}
        onAddBelow={() => menu && handleAddBelow(menu.taskId)}
        onDetails={() => menu && handleDetailsFromMenu(menu.taskId)}
        onPomodoro={() => menu && void startPomodoro(menu.taskId)}
      />

      <CloneRenameDialog
        tasks={cloneOpen ? selectedTasks.map((s) => s.task) : []}
        onClose={() => setCloneOpen(false)}
        onConfirm={(target, replacement) => cloneSelected(target, replacement)}
      />

      <BulkCreateDialog
        column={bulkCreateCol}
        onClose={() => setBulkCreateCol(null)}
        onConfirm={handleAddMany}
      />

      <BulkDetailsDialog
        items={bulkDetailsOpen ? selectedTasks : []}
        onClose={() => setBulkDetailsOpen(false)}
        onSetType={bulkSetType}
        onMove={bulkMove}
        onRename={() => {
          setBulkDetailsOpen(false);
          setRenameOpen(true);
        }}
      />

      <BulkRenameDialog
        tasks={renameOpen ? selectedTasks.map((s) => s.task) : []}
        onClose={() => setRenameOpen(false)}
        onConfirm={(mode, text, replacement) => renameSelected(mode, text, replacement)}
      />

      <TaskDetailsDialog
        task={findTask(detailsId)?.task ?? null}
        column={findTask(detailsId)?.col}
        onClose={() => setDetailsId(null)}
        onSave={(patch) => detailsId && handleUpdate(detailsId, patch)}
        onMove={(to) => detailsId && handleMove(detailsId, to)}
        onDelete={() => detailsId && handleDelete(detailsId)}
      />

      {typeahead && tab === "board" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div className="glass-panel flex items-center gap-3 rounded-lg px-4 py-2">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Buscando
            </span>
            <span className="text-lg font-semibold text-foreground">
              {typeahead}
              <span className="ml-0.5 animate-pulse">▌</span>
            </span>
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {resultCount > 0 ? `${resultCount} resultado(s)` : "sin resultados"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
