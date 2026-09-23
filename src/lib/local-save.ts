// "Guardar" (Ctrl+G): en vez de disparar una descarga del navegador cada vez,
// escribe la última versión del tablero directamente en una carpeta local que
// el usuario elige una sola vez (File System Access API, Chrome/Edge). El
// handle de esa carpeta se guarda en IndexedDB para no tener que re-elegirla
// en cada sesión -- solo hay que volver a conceder permiso si el navegador lo
// revocó.
import type { BoardState } from "./kanban-data";
import { buildXlsxBuffer, xlsxFileName } from "./kanban-export";

// v2: nombre de base de datos nuevo a propósito. Cualquier carpeta ya
// recordada bajo el nombre viejo queda huérfana (Chrome no la vuelve a leer),
// así que la próxima vez que se guarda vuelve a pedir carpeta -- necesario
// para corregir una elección equivocada sin que el usuario tenga que limpiar
// nada a mano.
const DB_NAME = "kanban-local-save-v2";
const STORE = "handles";
const FOLDER_KEY = "saveFolder";
const TARGET_SUBFOLDER = "KANBAN_VERSIONS";

type FsPermissionMode = { mode: "readwrite" };
interface FsHandleWithPermissions extends FileSystemDirectoryHandle {
  queryPermission(opts: FsPermissionMode): Promise<PermissionState>;
  requestPermission(opts: FsPermissionMode): Promise<PermissionState>;
}

export function fileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as Error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error as Error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error as Error);
  });
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FsHandleWithPermissions;
  const opts: FsPermissionMode = { mode: "readwrite" };
  if ((await h.queryPermission(opts)) === "granted") return true;
  return (await h.requestPermission(opts)) === "granted";
}

/** Abre el selector de carpeta del sistema operativo (arrancando en
 * "Imágenes", como pidió el usuario) y recuerda la elección. Si el usuario
 * elige/crea la carpeta "KANBAN_VERSIONS" directamente se usa tal cual; si
 * elige otra cosa (p.ej. "Imágenes"), se crea/entra en "KANBAN_VERSIONS"
 * dentro de ella -- así siempre se guarda en una subcarpeta con ese nombre
 * en vez de desperdigar archivos en lo primero que se haya seleccionado. */
export async function chooseSaveFolder(): Promise<FileSystemDirectoryHandle> {
  if (!fileSystemAccessSupported()) {
    throw new Error("Este navegador no permite guardar directamente en una carpeta.");
  }
  const picked = await window.showDirectoryPicker({
    id: "kanban-saves",
    mode: "readwrite",
    startIn: "pictures",
  });
  const target =
    picked.name === TARGET_SUBFOLDER
      ? picked
      : await picked.getDirectoryHandle(TARGET_SUBFOLDER, { create: true });
  await idbSet(FOLDER_KEY, target);
  return target;
}

/** Carpeta ya elegida en una sesión anterior (si el permiso sigue vigente). */
export async function getRememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
  const stored = await idbGet<FileSystemDirectoryHandle>(FOLDER_KEY);
  if (!stored) return null;
  return (await ensurePermission(stored)) ? stored : null;
}

/** Carpeta usable ahora mismo: la recordada si el permiso sigue vigente, o
 * pide elegir una (incluida la primera vez). `forcePick` ignora la recordada
 * y vuelve a preguntar -- para cuando el usuario quiere cambiar de carpeta.
 * Debe llamarse desde un gesto del usuario (click / atajo) porque
 * requestPermission/showDirectoryPicker lo exigen. */
async function ensureSaveFolder(forcePick: boolean): Promise<FileSystemDirectoryHandle> {
  if (!forcePick) {
    const remembered = await getRememberedFolder();
    if (remembered) return remembered;
  }
  return chooseSaveFolder();
}

export type SaveResult = { fileName: string; folderName: string };

/** Escribe la versión actual del tablero como .xlsx dentro de la carpeta
 * elegida, con nombre con fecha y hora (no pisa versiones anteriores).
 * Pasa `forcePick: true` para elegir una carpeta distinta a la recordada. */
export async function saveBoardVersion(board: BoardState, forcePick = false): Promise<SaveResult> {
  const folder = await ensureSaveFolder(forcePick);
  const fileName = xlsxFileName();
  const fileHandle = await folder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(buildXlsxBuffer(board));
  await writable.close();
  return { fileName, folderName: folder.name };
}
