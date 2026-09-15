import { supabase } from "@/integrations/supabase/client";

export type PomodoroSession = {
  id: string;
  taskTitle: string;
  durationMinutes: number;
  completed: boolean;
  taskDone: boolean;
  startedAt: number;
  endedAt: number | null;
};

export type TaskStat = {
  taskTitle: string;
  completed: number;
  started: number;
  minutes: number;
  lastAt: number;
  taskDone: boolean;
};

export async function listSessions(): Promise<PomodoroSession[]> {
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .select("id, task_title, duration_minutes, completed, task_done, started_at, ended_at")
    .order("started_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    taskTitle: row.task_title ?? "",
    durationMinutes: row.duration_minutes ?? 25,
    completed: !!row.completed,
    taskDone: !!row.task_done,
    startedAt: new Date(row.started_at).getTime(),
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
  }));
}

export async function startSession(
  userId: string,
  taskTitle: string,
  durationMinutes: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .insert({
      user_id: userId,
      task_title: taskTitle,
      duration_minutes: durationMinutes,
      completed: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function completeSession(
  sessionId: string,
  actualMinutes?: number,
  taskDone?: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("pomodoro_sessions")
    .update({
      completed: true,
      ended_at: new Date().toISOString(),
      ...(actualMinutes !== undefined ? { duration_minutes: actualMinutes } : {}),
      ...(taskDone ? { task_done: true } : {}),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function cancelSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from("pomodoro_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

export function statsByTask(sessions: PomodoroSession[]): TaskStat[] {
  const map = new Map<string, TaskStat>();
  for (const s of sessions) {
    const key = s.taskTitle || "(sin título)";
    const cur =
      map.get(key) ?? { taskTitle: key, completed: 0, started: 0, minutes: 0, lastAt: 0, taskDone: false };
    cur.started += 1;
    if (s.completed) {
      cur.completed += 1;
      cur.minutes += s.durationMinutes;
    }
    if (s.taskDone) cur.taskDone = true;
    cur.lastAt = Math.max(cur.lastAt, s.startedAt);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.completed - a.completed || b.lastAt - a.lastAt);
}
