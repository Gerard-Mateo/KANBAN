import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

export type KrTask = {
  id: string;
  keyResultId: string;
  title: string;
  boardTaskTitle: string;
  done: boolean;
  position: number;
};

export type KeyResult = {
  id: string;
  objectiveId: string;
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  unit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  dueDate: string | null;
  position: number;
  /** Momento de creación (ms); es el arranque del plazo del KR. */
  createdAt: number;
  tasks: KrTask[];
};

export type Objective = {
  id: string;
  title: string;
  description: string;
  period: string;
  status: string;
  position: number;
  keyResults: KeyResult[];
};

/** Progreso métrico del KR (0-100). */
export function metricProgress(kr: KeyResult): number {
  const span = kr.targetValue - kr.startValue;
  if (span === 0) return kr.currentValue >= kr.targetValue ? 100 : 0;
  const pct = ((kr.currentValue - kr.startValue) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Progreso por mini-tareas completadas (0-100), o null si no hay tareas. */
export function taskProgress(kr: KeyResult): number | null {
  if (kr.tasks.length === 0) return null;
  const done = kr.tasks.filter((t) => t.done).length;
  return Math.round((done / kr.tasks.length) * 100);
}

/** Avance combinado del KR: métrica y mini-tareas a partes iguales (0-100). */
export function krProgress(kr: KeyResult): number {
  const tp = taskProgress(kr);
  const mp = metricProgress(kr);
  return tp === null ? mp : Math.round((mp + tp) / 2);
}

export function objectiveProgress(obj: Objective): number {
  if (obj.keyResults.length === 0) return 0;
  const sum = obj.keyResults.reduce((acc, kr) => acc + krProgress(kr), 0);
  return Math.round(sum / obj.keyResults.length);
}

export async function loadOkrs(): Promise<Objective[]> {
  const [objRes, krRes, taskRes] = await Promise.all([
    supabase.from("objectives").select("*").order("position", { ascending: true }),
    supabase.from("key_results").select("*").order("position", { ascending: true }),
    supabase.from("key_result_tasks").select("*").order("position", { ascending: true }),
  ]);
  if (objRes.error) throw objRes.error;
  if (krRes.error) throw krRes.error;
  if (taskRes.error) throw taskRes.error;

  const tasks: KrTask[] = (taskRes.data ?? []).map((r) => ({
    id: r.id,
    keyResultId: r.key_result_id,
    title: r.title ?? "",
    boardTaskTitle: r.board_task_title ?? "",
    done: !!r.done,
    position: r.position ?? 0,
  }));

  const krs: KeyResult[] = (krRes.data ?? []).map((r) => ({
    id: r.id,
    objectiveId: r.objective_id,
    title: r.title ?? "",
    specific: r.specific ?? "",
    measurable: r.measurable ?? "",
    achievable: r.achievable ?? "",
    relevant: r.relevant ?? "",
    timeBound: r.time_bound ?? "",
    unit: r.unit ?? "",
    startValue: Number(r.start_value ?? 0),
    currentValue: Number(r.current_value ?? 0),
    targetValue: Number(r.target_value ?? 100),
    dueDate: r.due_date ?? null,
    position: r.position ?? 0,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    tasks: tasks.filter((t) => t.keyResultId === r.id),
  }));

  return (objRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    description: r.description ?? "",
    period: r.period ?? "",
    status: r.status ?? "active",
    position: r.position ?? 0,
    keyResults: krs.filter((k) => k.objectiveId === r.id),
  }));
}

export async function createObjective(input: {
  title: string;
  description: string;
  period: string;
  position: number;
}): Promise<void> {
  const { error } = await supabase.from("objectives").insert({
    title: input.title,
    description: input.description,
    period: input.period,
    position: input.position,
  });
  if (error) throw error;
}

export async function updateObjective(
  id: string,
  patch: Partial<{ title: string; description: string; period: string; status: string }>,
): Promise<void> {
  const { error } = await supabase.from("objectives").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteObjective(id: string): Promise<void> {
  const { error } = await supabase.from("objectives").delete().eq("id", id);
  if (error) throw error;
}

export type KeyResultInput = {
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  unit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  dueDate: string | null;
};

export async function createKeyResult(
  objectiveId: string,
  input: KeyResultInput,
  position: number,
): Promise<void> {
  const { error } = await supabase.from("key_results").insert({
    objective_id: objectiveId,
    title: input.title,
    specific: input.specific,
    measurable: input.measurable,
    achievable: input.achievable,
    relevant: input.relevant,
    time_bound: input.timeBound,
    unit: input.unit,
    start_value: input.startValue,
    current_value: input.currentValue,
    target_value: input.targetValue,
    due_date: input.dueDate,
    position,
  });
  if (error) throw error;
}

export async function updateKeyResult(
  id: string,
  input: Partial<KeyResultInput>,
): Promise<void> {
  const patch: TablesUpdate<"key_results"> = {};
  if (input.title !== undefined) patch['title'] = input.title;
  if (input.specific !== undefined) patch['specific'] = input.specific;
  if (input.measurable !== undefined) patch['measurable'] = input.measurable;
  if (input.achievable !== undefined) patch['achievable'] = input.achievable;
  if (input.relevant !== undefined) patch['relevant'] = input.relevant;
  if (input.timeBound !== undefined) patch['time_bound'] = input.timeBound;
  if (input.unit !== undefined) patch['unit'] = input.unit;
  if (input.startValue !== undefined) patch['start_value'] = input.startValue;
  if (input.currentValue !== undefined) patch['current_value'] = input.currentValue;
  if (input.targetValue !== undefined) patch['target_value'] = input.targetValue;
  if (input.dueDate !== undefined) patch['due_date'] = input.dueDate;
  const { error } = await supabase.from("key_results").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteKeyResult(id: string): Promise<void> {
  const { error } = await supabase.from("key_results").delete().eq("id", id);
  if (error) throw error;
}

export async function createKrTask(
  keyResultId: string,
  title: string,
  boardTaskTitle: string,
  position: number,
): Promise<void> {
  const { error } = await supabase.from("key_result_tasks").insert({
    key_result_id: keyResultId,
    title,
    board_task_title: boardTaskTitle,
    position,
  });
  if (error) throw error;
}

export async function setKrTaskDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from("key_result_tasks").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function deleteKrTask(id: string): Promise<void> {
  const { error } = await supabase.from("key_result_tasks").delete().eq("id", id);
  if (error) throw error;
}
