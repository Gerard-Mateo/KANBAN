// OKRs en Markdown: el formato que tu IA escribe y la app importa de un golpe.
// Un solo formato para tres cosas: el prompt (se lo explica a la IA), la
// importación (lo lee con tolerancia) y la exportación (lo escribe igual).
import { normalizeOkrs, type Direction, type Objective } from "./okrs";

/* --------------------------------- Formato -------------------------------- */

/** Plantilla que va dentro del prompt; también sirve de ejemplo al importar. */
export const OKR_MD_TEMPLATE = `# OKRs

## Objetivo: Ser el referente en software de RRHH de la región
Periodo: Q4 2026
Descripción: Que los clientes nos elijan porque aprenden a usar el sistema solos.

### KR: Publicar 20 videos tutoriales de los módulos clave
- Específico: 20 videos de pantallas de Nómina y RH, de 3 a 5 minutos
- Medible: videos publicados en el canal de ayuda
- Alcanzable: 2 videos por semana con el guion listo antes de grabar
- Relevante: los tutoriales bajan los tickets de soporte repetidos
- Fecha límite: 2026-12-15
- Dirección: subir
- Unidad: videos
- Inicial: 0
- Actual: 0
- Meta: 20

Tareas:
- [ ] Escribir el guion de la pantalla Roles de Pago
- [ ] Grabar y editar el video de Roles de Pago
- [x] Definir la plantilla visual de los videos

### KR: Bajar los tickets de "cómo se hace" de 40 a 15 por mes
- Específico: tickets etiquetados como duda de uso
- Medible: reporte mensual de la mesa de ayuda
- Alcanzable: los videos cubren las 10 dudas más frecuentes
- Relevante: libera horas del equipo de soporte
- Fecha límite: 2026-12-31
- Dirección: bajar
- Unidad: tickets/mes
- Inicial: 40
- Actual: 40
- Meta: 15

Tareas:
- [ ] Sacar el top 10 de dudas del último trimestre
- [ ] Enlazar cada video en la respuesta automática del ticket`;

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** Una línea por valor: saltos de línea y espacios dobles fuera. */
const line = (v: string) => clean(v);

export function okrsToMarkdown(objectives: Objective[]): string {
  const out: string[] = ["# OKRs"];
  for (const obj of objectives) {
    out.push("", `## Objetivo: ${line(obj.title)}`);
    if (obj.period) out.push(`Periodo: ${line(obj.period)}`);
    if (obj.description) out.push(`Descripción: ${line(obj.description)}`);
    for (const kr of obj.keyResults) {
      out.push("", `### KR: ${line(kr.title)}`);
      const fields: [string, string][] = [
        ["Específico", kr.specific],
        ["Medible", kr.measurable],
        ["Alcanzable", kr.achievable],
        ["Relevante", kr.relevant],
        ["Fecha límite", kr.dueDate ?? ""],
        ["Dirección", kr.direction === "down" ? "bajar" : "subir"],
        ["Unidad", kr.unit],
        ["Inicial", String(kr.startValue)],
        ["Actual", String(kr.currentValue)],
        ["Meta", String(kr.targetValue)],
      ];
      for (const [k, v] of fields) if (v.trim()) out.push(`- ${k}: ${line(v)}`);
      if (kr.tasks.length) {
        out.push("", "Tareas:");
        for (const t of kr.tasks) out.push(`- [${t.done ? "x" : " "}] ${line(t.title)}`);
      }
    }
  }
  return out.join("\n") + "\n";
}

/* -------------------------------- Lectura --------------------------------- */

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*_`]/g, "").trim();

type KrField =
  | "specific"
  | "measurable"
  | "achievable"
  | "relevant"
  | "dueDate"
  | "direction"
  | "unit"
  | "startValue"
  | "currentValue"
  | "targetValue";

// Nombres de campo aceptados (en español o inglés, sin tildes ni mayúsculas).
const KR_KEYS: Record<string, KrField> = {
  especifico: "specific",
  specific: "specific",
  s: "specific",
  medible: "measurable",
  measurable: "measurable",
  m: "measurable",
  alcanzable: "achievable",
  achievable: "achievable",
  a: "achievable",
  relevante: "relevant",
  relevant: "relevant",
  r: "relevant",
  "fecha limite": "dueDate",
  fecha: "dueDate",
  plazo: "dueDate",
  "con plazo": "dueDate",
  deadline: "dueDate",
  "due date": "dueDate",
  "time-bound": "dueDate",
  "time bound": "dueDate",
  t: "dueDate",
  direccion: "direction",
  direction: "direction",
  unidad: "unit",
  unit: "unit",
  inicial: "startValue",
  inicio: "startValue",
  "valor inicial": "startValue",
  start: "startValue",
  baseline: "startValue",
  actual: "currentValue",
  "valor actual": "currentValue",
  current: "currentValue",
  meta: "targetValue",
  target: "targetValue",
  objetivo: "targetValue",
};

const OBJ_KEYS: Record<string, "period" | "description"> = {
  periodo: "period",
  period: "period",
  trimestre: "period",
  quarter: "period",
  descripcion: "description",
  description: "description",
  "por que": "description",
  "por que importa": "description",
  why: "description",
};

const TASK_HEADERS = new Set([
  "tareas",
  "tasks",
  "mini-tareas",
  "mini tareas",
  "acciones",
  "actions",
]);

type DraftKr = {
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  unit: string;
  dueDate: string | null;
  direction: Direction | null;
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  tasks: { title: string; done: boolean }[];
  /** Traía una fecha que no se pudo leer (ya se avisó). */
  badDate: boolean;
};
type DraftObjective = { title: string; period: string; description: string; krs: DraftKr[] };

/** "1.500", "1,500", "20 videos", "-3,5 %" → número; null si no hay ninguno. */
export function parseNumber(raw: string): number | null {
  const m = raw.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)*/);
  if (!m) return null;
  let s = m[0];
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** AAAA-MM-DD o D/M/AAAA → AAAA-MM-DD; null si no es una fecha real. */
export function parseDate(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const dmy = raw.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : [0, 0, 0];
  if (!y) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDirection(raw: string): Direction {
  const n = norm(raw);
  return /baj|menos|reduc|dismin|down|lower|less|decreas|↓/.test(n) ? "down" : "up";
}

/** Quita "Objetivo 1:", "O2 -", "KR 1.2:", "Resultado clave:"… del inicio del título. */
const stripPrefix = (text: string, kind: "objective" | "kr") =>
  clean(
    text
      .replace(/\*\*|__/g, "")
      .replace(
        kind === "objective"
          ? /^\s*(?:objetivo|objective|obj|o)\s*[\d.]*\s*[:.)\-–—]\s*/i
          : /^\s*(?:kr|resultado clave|key result|r\.?c\.?)\s*[\d.]*\s*[:.)\-–—]\s*/i,
        "",
      ),
  );

export type ParsedOkrs = {
  objectives: Objective[];
  counts: { objectives: number; keyResults: number; tasks: number };
  warnings: string[];
};

export function parseOkrMarkdown(text: string): ParsedOkrs {
  const objectives: DraftObjective[] = [];
  const warnings: string[] = [];
  let obj: DraftObjective | null = null;
  let kr: DraftKr | null = null;
  let inTasks = false;

  const ensureObjective = () => {
    if (!obj) {
      obj = { title: "Objetivo sin título", period: "", description: "", krs: [] };
      objectives.push(obj);
      warnings.push(
        'Había resultados clave antes del primer "## Objetivo"; se agruparon en uno sin título.',
      );
    }
    return obj;
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const lineText = rawLine.trim();
    if (!lineText || lineText.startsWith("```") || /^-{3,}$/.test(lineText)) continue;

    const heading = lineText.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const body = heading[2]!.trim();
      if (level === 1) continue;
      if (TASK_HEADERS.has(norm(body).replace(/:$/, ""))) {
        inTasks = true;
        continue;
      }
      if (level === 2) {
        obj = { title: stripPrefix(body, "objective"), period: "", description: "", krs: [] };
        objectives.push(obj);
        kr = null;
        inTasks = false;
      } else if (level === 3) {
        kr = {
          title: stripPrefix(body, "kr"),
          specific: "",
          measurable: "",
          achievable: "",
          relevant: "",
          unit: "",
          dueDate: null,
          direction: null,
          startValue: null,
          currentValue: null,
          targetValue: null,
          tasks: [],
          badDate: false,
        };
        ensureObjective().krs.push(kr);
        inTasks = false;
      }
      continue;
    }

    // "Tareas:" suelto (sin #) también abre la lista de tareas del KR.
    if (TASK_HEADERS.has(norm(lineText).replace(/[:*]/g, "").trim())) {
      inTasks = true;
      continue;
    }

    const bullet = lineText.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    const item = bullet ? bullet[1]!.trim() : lineText;

    const box = item.match(/^\[( |x|X)\]\s*(.*)$/);
    if (box) {
      const title = clean(box[2]!);
      if (!title) continue;
      if (!kr) {
        warnings.push(`La tarea "${title}" no está debajo de ningún KR; se omitió.`);
        continue;
      }
      kr.tasks.push({ title, done: box[1] !== " " });
      continue;
    }

    const kv = item.match(/^\**([^:*]{1,30}?)\**\s*:\s*(.*)$/);
    const key = kv ? norm(kv[1]!) : "";
    const value = kv ? kv[2]!.replace(/^\*\*|\*\*$/g, "").trim() : "";

    if (kv && kr && !inTasks && KR_KEYS[key]) {
      const field = KR_KEYS[key]!;
      if (field === "dueDate") {
        kr.dueDate = parseDate(value);
        kr.badDate = !kr.dueDate && !!value;
        if (kr.badDate)
          warnings.push(
            `"${kr.title}": la fecha límite "${value}" no se entendió (usa AAAA-MM-DD).`,
          );
      } else if (field === "direction") {
        kr.direction = parseDirection(value);
      } else if (field === "startValue" || field === "currentValue" || field === "targetValue") {
        const n = parseNumber(value);
        if (n === null && value)
          warnings.push(`"${kr.title}": "${kv[1]}: ${value}" no es un número.`);
        kr[field] = n;
      } else {
        kr[field] = value;
      }
      continue;
    }

    if (kv && obj && !kr && OBJ_KEYS[key]) {
      obj[OBJ_KEYS[key]!] = value;
      continue;
    }

    // Viñeta sin casilla dentro de "Tareas:" = tarea pendiente.
    if (inTasks && kr && bullet) {
      const title = clean(item);
      if (title) kr.tasks.push({ title, done: false });
      continue;
    }

    // Texto suelto bajo el objetivo, antes de su primer KR: su descripción.
    if (obj && !kr && !bullet && !obj.description) obj.description = clean(lineText);
  }

  const raw = objectives
    .filter((o) => o.title || o.krs.length)
    .map((o) => ({
      title: o.title || "Objetivo sin título",
      description: o.description,
      period: o.period,
      keyResults: o.krs.map((k) => {
        const current = k.currentValue ?? k.startValue ?? 0;
        const start = k.startValue ?? current;
        let target = k.targetValue;
        if (target === null) {
          warnings.push(`"${k.title}": no trae Meta; se puso 100.`);
          target = 100;
        }
        const direction: Direction = k.direction ?? (target < start ? "down" : "up");
        if (target === start)
          warnings.push(`"${k.title}": la meta es igual al valor inicial, su avance no se moverá.`);
        else if ((direction === "down") !== target < start)
          warnings.push(
            `"${k.title}": la dirección (${direction === "down" ? "bajar" : "subir"}) no cuadra con inicial ${start} → meta ${target}.`,
          );
        if (!k.dueDate && !k.badDate)
          warnings.push(`"${k.title}": sin fecha límite (la T de SMART).`);
        return {
          title: k.title || "Resultado clave sin título",
          specific: k.specific,
          measurable: k.measurable,
          achievable: k.achievable,
          relevant: k.relevant,
          unit: k.unit,
          startValue: start,
          currentValue: current,
          targetValue: target,
          direction,
          dueDate: k.dueDate,
          createdAt: Date.now(),
          tasks: k.tasks.map((t) => ({ title: t.title, boardTaskTitle: t.title, done: t.done })),
        };
      }),
    }));

  const parsed = normalizeOkrs(raw);
  const keyResults = parsed.reduce((n, o) => n + o.keyResults.length, 0);
  const tasks = parsed.reduce(
    (n, o) => n + o.keyResults.reduce((m, k) => m + k.tasks.length, 0),
    0,
  );
  return {
    objectives: parsed,
    counts: { objectives: parsed.length, keyResults, tasks },
    warnings,
  };
}

/* --------------------------------- Prompt --------------------------------- */

export type PromptBoardTask = { title: string; column: "todo" | "doing" | "done"; type: string };

export function buildOkrPrompt({
  goals,
  current,
  boardTasks,
  today = new Date(),
}: {
  goals: string;
  /** OKRs actuales para que la IA los mejore; vacío = empezar de cero. */
  current: Objective[];
  /** Tareas pendientes del tablero, para que la IA las reutilice con su título exacto. */
  boardTasks: PromptBoardTask[];
  today?: Date;
}): string {
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const refine = current.length > 0;
  const parts: string[] = [];

  parts.push(`Eres un coach experto en OKRs y en metas SMART. Vas a ayudarme a ${
    refine ? "mejorar mis OKRs" : "definir mis OKRs"
  } y tu respuesta la voy a importar directamente en mi app de productividad, así que el formato importa tanto como el contenido.

## Mi contexto
${goals.trim() || "[Escribe aquí qué quieres lograr, para qué periodo, tu rol/empresa y con qué recursos cuentas.]"}

Fecha de hoy: ${date}.`);

  parts.push(`## Cómo trabajar
1. Si te falta información clave (qué quiero lograr, el periodo o los recursos), hazme como máximo 3 preguntas cortas y espera mi respuesta. Si ya tienes lo suficiente, responde directo.
2. Propón de 1 a 3 objetivos (máximo 5): cualitativos, ambiciosos e inspiradores, sin números.
3. Cada objetivo lleva de 2 a 4 resultados clave (KR). Un KR mide un resultado, no una actividad: "Bajar los tickets de 40 a 15 por mes", no "Hacer videos".
4. Cada KR es SMART:
   - Específico: qué exactamente se va a lograr.
   - Medible: la métrica y de dónde sale el dato.
   - Alcanzable: con qué recursos o capacidad, y por qué es realista.
   - Relevante: por qué empuja el objetivo.
   - Fecha límite: una fecha real AAAA-MM-DD dentro del periodo (es la T de SMART).
5. Cada KR tiene números: Inicial (dónde estoy hoy), Actual (igual al inicial si recién empieza) y Meta, más la Unidad.
6. Dirección: "subir" si más es mejor (ventas, videos, clientes) o "bajar" si menos es mejor (costos, tiempos, ranking, errores). En "bajar" la Meta es MENOR que el Inicial.
7. Cada KR lleva de 3 a 8 tareas concretas que empiezan con un verbo y se pueden terminar en un día o dos.${
    boardTasks.length
      ? ` Si una tarea ya está en mi tablero (lista de abajo), copia su título EXACTO, letra por letra, para que se vincule.`
      : ""
  }
8. Escribe en español${refine ? ". Mantén lo que ya está bien, corrige lo que no es SMART y conserva los valores Actual y las tareas marcadas [x]" : ""}.`);

  parts.push(`## Formato de la respuesta (obligatorio)
Responde SOLO con un bloque de código \`\`\`markdown que siga exactamente esta plantilla, sin texto antes ni después${
    refine
      ? ", y devuelve el conjunto COMPLETO de OKRs (también los que no cambian), porque reemplazará a los actuales"
      : ""
  }:
- "## Objetivo: …" para cada objetivo, con "Periodo:" y "Descripción:" debajo.
- "### KR: …" para cada resultado clave.
- Los campos del KR con estos nombres exactos: Específico, Medible, Alcanzable, Relevante, Fecha límite, Dirección, Unidad, Inicial, Actual, Meta.
- Inicial, Actual y Meta: solo el número, sin unidad ni separador de miles (1500, no "1.500 USD").
- Fecha límite en formato AAAA-MM-DD.
- Después de los campos, una línea "Tareas:" y cada tarea como casilla "- [ ] …" ("- [x] …" solo si ya está hecha).

Plantilla:

\`\`\`markdown
${OKR_MD_TEMPLATE}
\`\`\``);

  if (refine) {
    parts.push(`## Mis OKRs actuales

\`\`\`markdown
${okrsToMarkdown(current).trim()}
\`\`\``);
  }

  if (boardTasks.length) {
    const byCol = (col: PromptBoardTask["column"]) =>
      boardTasks
        .filter((t) => t.column === col)
        .map((t) => `- ${clean(t.title)}${t.type ? ` [${t.type}]` : ""}`)
        .join("\n");
    const doing = byCol("doing");
    const todo = byCol("todo");
    parts.push(`## Mi tablero de tareas (pendientes)
Úsalas para entender en qué trabajo y reutilízalas como tareas de los KR cuando encajen. Entre corchetes va el tipo de tarea.
${doing ? `\nEn progreso:\n${doing}\n` : ""}${todo ? `\nPor hacer:\n${todo}` : ""}`);
  }

  return parts.join("\n\n") + "\n";
}
