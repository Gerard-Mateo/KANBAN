import { supabase } from "@/integrations/supabase/client";
import { USE_LOCAL_MYSQL, localApi } from "./local-db";
import { normalizeDays } from "./calendar";
import {
  COLUMNS,
  type BoardState,
  type ColumnId,
  type MoveEvent,
  type TagTone,
  type Task,
} from "./kanban-data";

const emptyBoard = (): BoardState => ({ todo: [], doing: [], done: [] });

type TaskRow = {
  id: string;
  title: string | null;
  column_id: string;
  position: number;
  type: string | null;
  history: unknown;
  created_at: string | null;
  goal_target?: number | null;
  goal_current?: number | null;
  planned_days?: unknown;
};

async function fetchTaskRows(): Promise<TaskRow[]> {
  if (USE_LOCAL_MYSQL) return localApi<TaskRow[]>("GET", "/tasks");
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function loadBoard(): Promise<BoardState> {
  const board = emptyBoard();
  for (const row of await fetchTaskRows()) {
    const col = row.column_id as ColumnId;
    if (!board[col]) continue;
    const task: Task = {
      id: row.id,
      title: row.title ?? "",
      createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
      type: (row.type as TagTone | null) ?? undefined,
      history: Array.isArray(row.history) ? (row.history as unknown as MoveEvent[]) : [],
      ...(row.goal_target
        ? { goal: { target: row.goal_target, current: row.goal_current ?? 0 } }
        : {}),
    };
    const days = normalizeDays(row.planned_days);
    if (days.length) task.days = days;
    board[col].push(task);
  }
  return board;
}

export async function countTasks(): Promise<number> {
  if (USE_LOCAL_MYSQL) return (await fetchTaskRows()).length;
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

// Columnas que llegaron con migraciones posteriores (metas, días del
// calendario): solo viajan si alguna tarea las usa, y si la nube aún no tiene
// la migración se guarda sin ellas en vez de fallar.
const LATE_COLUMNS = [["goal_target", "goal_current"], ["planned_days"]] as const;

/** Reemplaza el tablero completo del usuario en la nube. */
export async function saveBoard(userId: string, board: BoardState): Promise<void> {
  const tasks = COLUMNS.flatMap((col) => board[col.id]);
  const hasGoals = tasks.some((t) => t.goal);
  const hasDays = tasks.some((t) => t.days?.length);
  let rows = COLUMNS.flatMap((col) =>
    board[col.id].map((task, index) => ({
      user_id: userId,
      title: task.title,
      column_id: col.id,
      position: index,
      type: task.type ?? null,
      history: (task.history ?? []) as unknown as never,
      ...(task.createdAt ? { created_at: new Date(task.createdAt).toISOString() } : {}),
      ...(hasGoals
        ? { goal_target: task.goal?.target ?? null, goal_current: task.goal?.current ?? 0 }
        : {}),
      ...(hasDays ? { planned_days: task.days ?? [] } : {}),
    })),
  );

  if (USE_LOCAL_MYSQL) {
    await localApi("PUT", "/tasks", { user_id: userId, rows });
    return;
  }
  const { error: delError } = await supabase.from("tasks").delete().eq("user_id", userId);
  if (delError) throw delError;
  if (rows.length === 0) return;
  for (let attempt = 0; ; attempt++) {
    const { error } = await supabase.from("tasks").insert(rows);
    if (!error) return;
    // PGRST204: la nube no conoce una columna; se quita su grupo y se reintenta.
    const missing =
      error.code === "PGRST204" && attempt < LATE_COLUMNS.length
        ? LATE_COLUMNS.find((group) => group.some((c) => error.message.includes(`'${c}'`)))
        : undefined;
    if (!missing) throw error;
    const drop = new Set<string>(missing);
    rows = rows.map(
      (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.has(k))) as typeof r,
    );
  }
}
