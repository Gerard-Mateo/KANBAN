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
};

async function fetchTaskRows(): Promise<TaskRow[]> {
  if (USE_LOCAL_MYSQL) return localApi<TaskRow[]>("GET", "/tasks");
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, column_id, position, type, history, created_at")
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
  const rows = COLUMNS.flatMap((col) =>
    board[col.id].map((task, index) => ({
      user_id: userId,
      title: task.title,
      column_id: col.id,
      position: index,
      type: task.type ?? null,
      history: (task.history ?? []) as unknown as never,
      ...(task.createdAt ? { created_at: new Date(task.createdAt).toISOString() } : {}),
    })),
  );

  if (USE_LOCAL_MYSQL) {
    await localApi("PUT", "/tasks", { user_id: userId, rows });
    return;
  }
  const { error: delError } = await supabase.from("tasks").delete().eq("user_id", userId);
  if (delError) throw delError;
  if (rows.length === 0) return;
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) throw error;
}
