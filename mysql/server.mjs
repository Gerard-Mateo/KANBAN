// API mínima entre el navegador y el MySQL local (el navegador no puede
// hablar con MySQL directamente). Solo para desarrollo en tu máquina.
// Arranca con `npm run db:api` (o todo junto con `npm run dev:mysql`).
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const PORT = Number(process.env.MYSQL_API_PORT ?? 8787);
const pool = mysql.createPool({
  uri: process.env.MYSQL_URL ?? "mysql://kanban:kanban@127.0.0.1:3307/kanban",
  timezone: "Z",
  connectionLimit: 5,
});

const COLUMNS = ["todo", "doing", "done"];

// Bases creadas antes de las metas o del calendario: agrega las columnas que falten.
async function migrate() {
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'",
  );
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("goal_target"))
    await pool.query("ALTER TABLE tasks ADD COLUMN goal_target INT NULL");
  if (!have.has("goal_current")) {
    await pool.query("ALTER TABLE tasks ADD COLUMN goal_current INT NOT NULL DEFAULT 0");
  }
  if (!have.has("planned_days"))
    await pool.query("ALTER TABLE tasks ADD COLUMN planned_days JSON NULL");
}
let migrated;
const toDate = (v) => (v ? new Date(v) : null);

// Reemplaza el tablero completo, igual que saveBoard() con Supabase.
async function saveBoard(userId, rows) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM tasks WHERE user_id = ?", [userId]);
    const values = rows
      .filter((r) => COLUMNS.includes(r.column_id))
      .map((r) => [
        randomUUID(),
        userId,
        r.title ?? "",
        r.column_id,
        r.position ?? 0,
        r.type ?? null,
        JSON.stringify(r.history ?? []),
        toDate(r.created_at) ?? new Date(),
        r.goal_target ?? null,
        r.goal_current ?? 0,
        JSON.stringify(r.planned_days ?? []),
      ]);
    if (values.length) {
      await conn.query(
        "INSERT INTO tasks (id, user_id, title, column_id, position, type, history, created_at, goal_target, goal_current, planned_days) VALUES ?",
        [values],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

const routes = {
  "GET /tasks": async () => {
    const [rows] = await pool.query(
      `SELECT id, title, column_id, position, type, history, created_at, goal_target, goal_current,
              planned_days
       FROM tasks ORDER BY position`,
    );
    return rows;
  },
  "PUT /tasks": async (body) => {
    await saveBoard(body.user_id, body.rows ?? []);
    return { ok: true };
  },
  "GET /pomodoro": async () => {
    const [rows] = await pool.query(
      `SELECT id, task_title, duration_minutes, completed, task_done, started_at, ended_at
       FROM pomodoro_sessions ORDER BY started_at DESC LIMIT 500`,
    );
    return rows;
  },
  "POST /pomodoro": async (body) => {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO pomodoro_sessions (id, user_id, task_title, duration_minutes) VALUES (?, ?, ?, ?)",
      [id, body.user_id, body.task_title ?? "", body.duration_minutes ?? 25],
    );
    return { id };
  },
  "PATCH /pomodoro/:id": async (body, id) => {
    const sets = ["completed = TRUE", "ended_at = ?"];
    const args = [new Date()];
    if (body.duration_minutes !== undefined) {
      sets.push("duration_minutes = ?");
      args.push(body.duration_minutes);
    }
    if (body.task_done) sets.push("task_done = TRUE");
    await pool.query(`UPDATE pomodoro_sessions SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
    return { ok: true };
  },
  "DELETE /pomodoro/:id": async (_body, id) => {
    await pool.query("DELETE FROM pomodoro_sessions WHERE id = ?", [id]);
    return { ok: true };
  },
};

function match(method, pathname) {
  const [, base, id] = pathname.split("/");
  if (routes[`${method} /${base}`] && !id) return [routes[`${method} /${base}`], undefined];
  if (routes[`${method} /${base}/:id`] && id) return [routes[`${method} /${base}/:id`], id];
  return [null];
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const { pathname } = new URL(req.url, "http://localhost");
  const [handler, id] = match(req.method, pathname);
  if (!handler) return res.writeHead(404).end();
  try {
    // Reintenta en la siguiente petición si MySQL aún no estaba listo.
    migrated ??= migrate().catch((e) => {
      migrated = undefined;
      throw e;
    });
    await migrated;
    const result = await handler(await readJson(req), id);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
  } catch (e) {
    console.error(e);
    res
      .writeHead(500, { "content-type": "application/json" })
      .end(JSON.stringify({ message: e instanceof Error ? e.message : String(e) }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`API MySQL local en http://localhost:${PORT}`);
});
