// `npm run dev:mysql`: levanta la API de MySQL y la app en modo MySQL local
// (VITE_DB=mysql), sin tocar Supabase. Funciona igual en Windows, macOS y Linux.
// Argumentos extra van a vite: `npm run dev:mysql -- --host 127.0.0.1`.
import { spawn } from "node:child_process";

const opts = { stdio: "inherit", env: { ...process.env, VITE_DB: "mysql" } };
const api = spawn(process.execPath, ["mysql/server.mjs"], opts);
const app = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "dev", ...process.argv.slice(2)],
  opts,
);

const stop = () => {
  api.kill();
  app.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", (code) => code && stop());
app.on("exit", stop);
