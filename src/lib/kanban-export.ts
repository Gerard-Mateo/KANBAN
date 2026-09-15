import * as XLSX from "xlsx";
import {
  COLUMNS,
  COLUMN_TITLES,
  TYPE_LABELS,
  tagsForTask,
  type BoardState,
  type ColumnId,
  type MoveEvent,
  type TagTone,
  type Task,
} from "./kanban-data";

type Row = {
  Estado: string;
  Tarea: string;
  Tipo: string;
  Etiquetas: string;
  Creada: string;
};

type MoveRow = {
  Tarea: string;
  Desde: string;
  Hacia: string;
  Fecha: string;
  Hora: string;
};

export function moveRows(board: BoardState): MoveRow[] {
  const rows: MoveRow[] = [];
  for (const col of COLUMNS) {
    for (const task of board[col.id]) {
      for (const ev of task.history ?? []) {
        const d = new Date(ev.at);
        rows.push({
          Tarea: task.title,
          Desde: ev.from ? COLUMN_TITLES[ev.from] : "Creada",
          Hacia: COLUMN_TITLES[ev.to],
          Fecha: d.toLocaleDateString("es-EC"),
          Hora: d.toLocaleTimeString("es-EC"),
        });
      }
    }
  }
  return rows.sort((a, b) => (a.Fecha + a.Hora).localeCompare(b.Fecha + b.Hora));
}

export function boardRows(board: BoardState): Row[] {
  const rows: Row[] = [];
  for (const col of COLUMNS) {
    for (const task of board[col.id]) {
      rows.push({
        Estado: col.title,
        Tarea: task.title,
        Tipo: task.type ? TYPE_LABELS[task.type] : "—",
        Etiquetas: tagsForTask(task)
          .map((t) => t.label)
          .join(", "),
        Creada: task.createdAt ? new Date(task.createdAt).toLocaleString("es-EC") : "",
      });
    }
  }
  return rows;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv(board: BoardState) {
  const rows = boardRows(board);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `tareas-${stamp()}.csv`);
}

export function exportHistoryCsv(board: BoardState) {
  const rows = moveRows(board);
  const sheet = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{ Tarea: "", Desde: "", Hacia: "", Fecha: "", Hora: "" }],
  );
  const csv = XLSX.utils.sheet_to_csv(sheet);
  download(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `movimientos-${stamp()}.csv`,
  );
}

export function exportXlsx(board: BoardState) {
  const rows = boardRows(board);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [{ wch: 14 }, { wch: 70 }, { wch: 12 }, { wch: 24 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Tareas");

  const moves = moveRows(board);
  const moveSheet = XLSX.utils.json_to_sheet(
    moves.length ? moves : [{ Tarea: "", Desde: "", Hacia: "", Fecha: "", Hora: "" }],
  );
  moveSheet["!cols"] = [{ wch: 70 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, moveSheet, "Movimientos");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tareas-${stamp()}.xlsx`,
  );
}

/* ------------------------------- Importación ------------------------------ */

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function columnFromLabel(value: unknown): ColumnId | null {
  const n = norm(value);
  for (const c of COLUMNS) if (norm(c.title) === n || c.id === n) return c.id;
  if (n.includes("progreso") || n.includes("doing")) return "doing";
  if (n.includes("hecho") || n.includes("done")) return "done";
  if (n.includes("hacer") || n.includes("todo") || n.includes("pendiente")) return "todo";
  return null;
}

function typeFromLabel(value: unknown): TagTone | undefined {
  const n = norm(value);
  if (!n || n === "—" || n === "-") return undefined;
  for (const [tone, label] of Object.entries(TYPE_LABELS))
    if (norm(label) === n) return tone as TagTone;
  return undefined;
}

/** Fechas exportadas con toLocaleString("es-EC"): d/m/yyyy, h:mm:ss a. m. */
function parseLocalDate(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S).getTime();
  }
  const str = String(value).trim();
  const m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)?)?/i,
  );
  if (m) {
    let hour = Number(m[4] ?? 0);
    const suffix = norm(m[7]).replace(/[.\s]/g, "");
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      hour,
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    ).getTime();
  }
  const t = Date.parse(str);
  return Number.isNaN(t) ? undefined : t;
}

export type ImportResult = { board: BoardState; taskCount: number; moveCount: number };

function historyByTitle(rows: Record<string, unknown>[]): Map<string, MoveEvent[]> {
  const map = new Map<string, MoveEvent[]>();
  for (const row of rows) {
    const title = String(row["Tarea"] ?? "").trim();
    const to = columnFromLabel(row["Hacia"]);
    if (!title || !to) continue;
    const fromRaw = row["Desde"];
    const from = norm(fromRaw) === "creada" ? null : columnFromLabel(fromRaw);
    const at =
      parseLocalDate(`${String(row["Fecha"] ?? "").trim()} ${String(row["Hora"] ?? "").trim()}`) ??
      Date.now();
    const list = map.get(title) ?? [];
    list.push({ at, from, to });
    map.set(title, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.at - b.at);
  return map;
}

export async function parseBoardFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const taskSheetName =
    wb.SheetNames.find((n) => norm(n) === "tareas") ?? wb.SheetNames[0];
  if (!taskSheetName) throw new Error("El archivo no tiene hojas de datos.");
  const taskRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[taskSheetName]!, {
    defval: "",
  });

  const moveSheetName = wb.SheetNames.find((n) => norm(n) === "movimientos");
  const moveRowsRaw = moveSheetName
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[moveSheetName]!, { defval: "" })
    : [];
  const histories = historyByTitle(moveRowsRaw);

  const board: BoardState = { todo: [], doing: [], done: [] };
  let taskCount = 0;
  let moveCount = 0;

  taskRows.forEach((row, i) => {
    const title = String(row["Tarea"] ?? "").trim();
    if (!title) return;
    const col = columnFromLabel(row["Estado"]);
    if (!col) return;
    const createdAt = parseLocalDate(row["Creada"]);
    const history = histories.get(title);
    const task: Task = {
      id: `${col[0]}${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(typeFromLabel(row["Tipo"]) ? { type: typeFromLabel(row["Tipo"])! } : {}),
      ...(history?.length ? { history: [...history] } : {}),
    };
    moveCount += history?.length ?? 0;
    board[col].push(task);
    taskCount += 1;
  });

  if (taskCount === 0)
    throw new Error(
      'No se encontraron tareas válidas. El archivo debe tener columnas "Estado" y "Tarea".',
    );

  return { board, taskCount, moveCount };
}
