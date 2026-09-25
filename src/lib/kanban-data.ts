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
};

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
