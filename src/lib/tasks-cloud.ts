import { supabase } from "@/integrations/supabase/client";
import { USE_LOCAL_MYSQL, localApi } from "./local-db";
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

/** Reemplaza el tablero completo del usuario en la nube. */
export async function saveBoard(userId: string, board: BoardState): Promise<void> {
  const withGoals = COLUMNS.flatMap((col) =>
    board[col.id].map((task, index) => ({
      user_id: userId,
      title: task.title,
      column_id: col.id,
      position: index,
      type: task.type ?? null,
      history: (task.history ?? []) as unknown as never,
      ...(task.createdAt ? { created_at: new Date(task.createdAt).toISOString() } : {}),
      goal_target: task.goal?.target ?? null,
      goal_current: task.goal?.current ?? 0,
    })),
  );
  const withoutGoals = withGoals.map(({ goal_target: _t, goal_current: _c, ...rest }) => rest);
  // Las columnas de meta solo viajan si alguna tarea tiene meta, así el
  // guardado sigue funcionando en una base sin la migración de metas.
  const hasGoals = COLUMNS.some((col) => board[col.id].some((t) => t.goal));
  const rows = hasGoals ? withGoals : withoutGoals;

  if (USE_LOCAL_MYSQL) {
    await localApi("PUT", "/tasks", { user_id: userId, rows });
    return;
  }
  const { error: delError } = await supabase.from("tasks").delete().eq("user_id", userId);
  if (delError) throw delError;
  if (rows.length === 0) return;
  const { error } = await supabase.from("tasks").insert(rows);
  // PGRST204: la nube aún no tiene la migración de metas; guarda sin ellas.
  if (error?.code === "PGRST204" && hasGoals) {
    const { error: retryError } = await supabase.from("tasks").insert(withoutGoals);
    if (retryError) throw retryError;
    return;
  }
  if (error) throw error;
}
