export type ColumnId = "todo" | "doing" | "done";

export type MoveEvent = {
  at: number;
  from: ColumnId | null;
  to: ColumnId;
};

export type Task = {
  id: string;
  title: string;
  createdAt?: number | undefined;
  type?: TagTone | undefined;
  history?: MoveEvent[] | undefined;
  goal?: TaskGoal | undefined;
  /** Días del calendario en que se trabajará ("AAAA-MM-DD"), seguidos o no. */
  days?: string[] | undefined;
  /** Definiciones que tuvo antes de redefinirla, de la más vieja a la más nueva. */
  redefinitions?: Redefinition[] | undefined;
  /** Su puesto dentro de cada día del calendario ({ "2026-10-14": 0 }), si se reordenó. */
  dayOrder?: Record<string, number> | undefined;
};

/** Puestos válidos por día ("AAAA-MM-DD" → número), vengan de la base o de un Excel. */
export function normalizeDayOrder(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [day, n] of Object.entries(raw as Record<string, unknown>)) {
    const v = Number(n);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(v)) out[day] = v;
  }
  return out;
}

/** Una definición anterior de la tarea: qué decía, de qué tipo era, cuándo se
 * reemplazó y por qué (p. ej. "Ya no es relevante"). */
export type Redefinition = {
  title: string;
  type?: string | undefined;
  at: number;
  reason?: string | undefined;
};

/** Redefiniciones válidas y en orden, vengan de la base o de un Excel. */
export function normalizeRedefinitions(raw: unknown): Redefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: Redefinition[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const title = typeof o["title"] === "string" ? o["title"].trim() : "";
    if (!title) continue;
    const at = Number(o["at"]);
    const type = typeof o["type"] === "string" ? o["type"].trim() : "";
    const reason = typeof o["reason"] === "string" ? o["reason"].trim() : "";
    out.push({
      title,
      at: Number.isFinite(at) ? at : 0,
      ...(type ? { type } : {}),
      ...(reason ? { reason } : {}),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Meta medible opcional: "3 de 10 blogs". */
export type TaskGoal = { target: number; current: number };

export function clampGoal(goal: TaskGoal): TaskGoal {
  const target = Math.max(1, Math.round(goal.target) || 1);
  return { target, current: Math.min(target, Math.max(0, Math.round(goal.current) || 0)) };
}

/** Columna que le toca a una tarea según su avance: al empezar pasa a En
 * Progreso, al cumplir la meta a Hecho, y si baja de la meta sale de Hecho. */
export function columnForGoal(goal: TaskGoal, col: ColumnId): ColumnId {
  if (goal.current >= goal.target) return "done";
  if (goal.current > 0) return "doing";
  return col === "done" ? "todo" : col;
}

export type BuiltinTone = "video" | "guion" | "module" | "other";

// Un tipo personalizado se guarda como su propia etiqueta (p. ej. "Reunión"),
// así sigue mostrándose bien aunque falte la lista de tipos del navegador.
export type TagTone = string;

export const BUILTIN_TONES: BuiltinTone[] = ["video", "guion", "module", "other"];

export const TYPE_LABELS: Record<string, string> = {
  video: "Video",
  guion: "Guion",
  module: "Módulo",
  other: "General",
};

export const isBuiltinTone = (t: string) => Object.hasOwn(TYPE_LABELS, t);
export const typeLabel = (t: string) => (isBuiltinTone(t) ? TYPE_LABELS[t]! : t);

export type BoardState = Record<ColumnId, Task[]>;

export const COLUMNS: { id: ColumnId; title: string; hint: string }[] = [
  { id: "todo", title: "Por Hacer", hint: "Pendientes" },
  { id: "doing", title: "En Progreso", hint: "Trabajando ahora" },
  { id: "done", title: "Hecho", hint: "Completadas" },
];

export const COLUMN_TITLES: Record<ColumnId, string> = {
  todo: "Por Hacer",
  doing: "En Progreso",
  done: "Hecho",
};

const todo = [
  "Research: software centrado en evaluaciones -> planificar approach 'smart grid' para nuevo módulo de KPIs, mixeado con el módulo de evaluaciones actual. Evaluar posible rework del módulo de evaluaciones.",
  "Modernizar el website de la compañía (rediseño visual) + SEO",
  "Chatbot - Planning (Gantt chart y approach del proyecto)",
  "Chatbot - Documentación (prioridad alta, la tarea que más tiempo tomará)",
  "Video: pantalla Roles de Pago (Módulo Nómina)",
  "CRNTL + PRINT function en editor de vistas, para testing",
  "Guion: pantallas de acceso",
  "Video: pantallas de acceso",
  "Video: pantalla Cuotas (Módulo Nómina)",
  "Video: pantalla Décimos (Módulo Nómina)",
  "Video: pantalla Utilidades (Módulo Nómina)",
  "Video: pantalla Gastos Personales (Módulo Nómina)",
  "Video: pantalla Capacitación (Módulo RH)",
  "Video: pantalla Proyectos de Cambio (Módulo RH)",
  "Video: pantalla Proyectos de Salida (Módulo RH)",
  "Video: pantalla Resumen por Horario (Módulo Asistencia)",
  "Ver para hacer permisos predeterminados para perfiles y usuarios, READ permissions para tablas o campos",
  "Hacer un canal anónimo de quejas, remarcas y noticia de acosos desde el AUTOSERVICIO",
  "Pasar el DP-300 (focuses strictly on Azure SQL Database, Azure SQL Managed Instance, and SQL Server)",
  "En hora de auditoría, que se digan también los datos de las tablas madres en la columna de valores anterior/posterior",
];

const doing = [
  "Video: pantalla Personas (Módulo RH)",
  "Video: pantalla Contratos (Módulo RH)",
  "Guion: pantalla Décimos (Módulo Nómina)",
  "Guion: pantalla Roles de Pago (Módulo Nómina)",
  "Video: Módulo Evaluaciones",
  "Guion: pantalla Personas (Módulo RH)",
  "Guion: pantalla Contratos (Módulo RH)",
  "Guion: pantalla Capacitación (Módulo RH)",
  "Guion: pantalla Ausentismo (Módulo RH)",
  "Video: pantalla Ausentismo (Módulo RH)",
  "Guion: pantalla Resumen por Horario (Módulo Asistencia)",
];

const done = [
  "Guion: pantalla Usuarios (Módulo Sistema)",
  "Video: pantalla Usuarios (Módulo Sistema)",
  "Guion: pantalla Sistema&Permisos (Módulo Sistema)",
  "Video: pantalla Sistema&Permisos (Módulo Sistema)",
  "Guion: pantalla Rubros Fijos (Módulo Nómina)",
  "Video: pantalla Rubros Fijos (Módulo Nómina)",
  "Guion: pantalla Autoservicio (Autoservicio)",
  "Video: pantalla Autoservicio (Autoservicio)",
  "Guion: pantalla Proyectos de Cambio (Módulo RH)",
  "Guion: pantalla Gastos Personales (Módulo Nómina)",
  "Guion: pantalla Utilidades (Módulo Nómina)",
  "Guion: pantalla Cuotas (Módulo Nómina)",
  "Guion: pantalla Proyectos de Salida (Módulo RH)",
  "dpo SEND EMAIL",
  "Poner un 2FA para login - multicines",
];

const build = (prefix: string, titles: string[]): Task[] =>
  titles.map((title, i) => ({ id: `${prefix}-${i}`, title }));

export const initialBoard: BoardState = {
  todo: build("t", todo),
  doing: build("p", doing),
  done: build("d", done),
};

export type Tag = { label: string; tone: TagTone };

export function tagsFor(title: string): Tag[] {
  const tags: Tag[] = [];
  const lower = title.toLowerCase();
  if (lower.startsWith("video")) tags.push({ label: "Video", tone: "video" });
  else if (lower.startsWith("guion")) tags.push({ label: "Guion", tone: "guion" });
  const module = title.match(/\(([^)]+)\)\s*$/);
  const moduleName = module?.[1];
  if (moduleName && /Módulo|Autoservicio/.test(moduleName)) {
    tags.push({ label: moduleName.replace("Módulo ", ""), tone: "module" });
  }
  if (tags.length === 0) tags.push({ label: "General", tone: "other" });
  return tags;
}

export function tagsForTask(task: Task): Tag[] {
  if (task.type) {
    const auto = tagsFor(task.title).filter((t) => t.tone === "module");
    return [{ label: typeLabel(task.type), tone: task.type }, ...auto];
  }
  return tagsFor(task.title);
}
