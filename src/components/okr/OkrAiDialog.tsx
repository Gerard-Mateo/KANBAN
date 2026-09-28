import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, FileDown, Sparkles, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import type { Objective } from "@/lib/okrs";
import {
  OKR_MD_TEMPLATE,
  buildOkrPrompt,
  parseOkrMarkdown,
  type PromptBoardTask,
} from "@/lib/okr-markdown";

export type ImportMode = "add" | "replace";

const labelClass = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const areaClass =
  "mt-1.5 w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary";
const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70";

/** Copia al portapapeles; si el navegador lo bloquea, usa el método clásico. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("El navegador no dejó copiar.");
  }
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {n}
        </span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function OkrAiDialog({
  open,
  onClose,
  current,
  boardTasks,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  current: Objective[];
  boardTasks: PromptBoardTask[];
  onImport: (objectives: Objective[], mode: ImportMode, createBoardTasks: boolean) => void;
}) {
  const [goals, setGoals] = useState("");
  const [withCurrent, setWithCurrent] = useState(true);
  const [withBoard, setWithBoard] = useState(true);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<ImportMode>("add");
  const [createTasks, setCreateTasks] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backdrop = useBackdropClose(onClose);

  const refining = withCurrent && current.length > 0;
  // Si la IA recibió los OKRs actuales, devuelve el conjunto completo: por defecto reemplaza.
  useEffect(() => setMode(refining ? "replace" : "add"), [refining]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  const prompt = useMemo(
    () =>
      buildOkrPrompt({
        goals,
        current: refining ? current : [],
        boardTasks: withBoard ? boardTasks : [],
      }),
    [goals, refining, current, withBoard, boardTasks],
  );

  const parsed = useMemo(() => (answer.trim() ? parseOkrMarkdown(answer) : null), [answer]);

  if (!open) return null;

  async function copyPrompt() {
    try {
      await copyText(prompt);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setAnswer(await file.text());
  }

  function doImport() {
    if (!parsed || parsed.counts.objectives === 0) return;
    if (
      mode === "replace" &&
      current.length > 0 &&
      !confirm(
        `Esto reemplaza tus ${current.length} objetivo(s) actuales por los ${parsed.counts.objectives} importados. ¿Seguir?`,
      )
    )
      return;
    onImport(parsed.objectives, mode, createTasks);
    setAnswer("");
    onClose();
  }

  const canImport = !!parsed && parsed.counts.objectives > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="okr-ai-title"
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
      {...backdrop}
    >
      <div className="glass-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl">
        <div className="flex items-start gap-3 border-b border-border p-5 pb-4">
          <div>
            <h2
              id="okr-ai-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <Sparkles className="size-4 text-primary" /> Arma tus OKRs con tu IA
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Copia el prompt, pégalo en ChatGPT, Claude, Gemini o la IA que uses, y pega aquí su
              respuesta. La app no lleva IA propia ni te pide claves: tu IA escribe el .md y aquí se
              importa en un clic.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <Step n={1} title="Cuéntale qué quieres lograr y copia el prompt">
            <label className={labelClass}>
              Tu contexto (opcional, también puedes escribirlo en el chat)
              <textarea
                autoFocus
                rows={3}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="Ej. Soy analista en una empresa de software de RRHH. Este trimestre quiero terminar los videos tutoriales de Nómina, bajar los tickets de soporte y certificarme en Azure SQL. Tengo unas 10 h por semana."
                className={cn(areaClass, "font-normal tracking-normal normal-case")}
              />
            </label>

            <div className="mt-3 flex flex-col gap-1.5 text-xs text-foreground">
              <label
                className={cn(
                  "inline-flex items-center gap-2",
                  current.length === 0 && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={refining}
                  disabled={current.length === 0}
                  onChange={(e) => setWithCurrent(e.target.checked)}
                />
                Incluir mis OKRs actuales ({current.length}) para que los mejore
              </label>
              <label
                className={cn(
                  "inline-flex items-center gap-2",
                  boardTasks.length === 0 && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={withBoard && boardTasks.length > 0}
                  disabled={boardTasks.length === 0}
                  onChange={(e) => setWithBoard(e.target.checked)}
                />
                Incluir mis tareas pendientes del tablero ({boardTasks.length}) para que las
                reutilice
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  copied === "ok"
                    ? "bg-done text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {copied === "ok" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === "ok" ? "¡Prompt copiado!" : "Copiar prompt"}
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => downloadText(OKR_MD_TEMPLATE + "\n", "plantilla-okrs.md")}
                title="El formato que la app sabe importar, por si quieres dárselo a tu IA como archivo"
              >
                <FileDown className="size-3.5" /> Plantilla .md
              </button>
              <span className="text-[11px] text-muted-foreground">
                {prompt.length.toLocaleString("es")} caracteres
              </span>
              {copied === "error" && (
                <span className="text-[11px] text-destructive">
                  No se pudo copiar: selecciónalo abajo y cópialo a mano.
                </span>
              )}
            </div>

            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver el prompt
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {prompt}
              </pre>
            </details>
          </Step>

          <Step n={2} title="Pega la respuesta de tu IA o sube el .md">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void readFile(e.dataTransfer.files[0]);
              }}
            >
              <textarea
                rows={8}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={
                  "Pega aquí todo lo que respondió tu IA (con o sin el bloque ```markdown), o arrastra el archivo .md.\n\n## Objetivo: …\n### KR: …"
                }
                className={cn(
                  areaClass,
                  "font-mono text-xs",
                  dragging && "border-primary bg-primary/5",
                )}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-3.5" /> Subir .md
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {parsed && (
                <span className={cn("text-xs", canImport ? "text-foreground" : "text-destructive")}>
                  {canImport
                    ? `${parsed.counts.objectives} objetivo(s) · ${parsed.counts.keyResults} KR · ${parsed.counts.tasks} tarea(s)`
                    : 'No encontré ningún "## Objetivo". ¿Pegaste la respuesta completa?'}
                </span>
              )}
            </div>

            {parsed && parsed.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-md border border-border bg-card p-2.5 text-[11px] text-muted-foreground">
                {parsed.warnings.slice(0, 6).map((w, i) => (
                  <li key={i} className="flex gap-1.5">
                    <AlertTriangle className="mt-px size-3 shrink-0 text-[oklch(0.78_0.15_80)]" />
                    {w}
                  </li>
                ))}
                {parsed.warnings.length > 6 && (
                  <li>… y {parsed.warnings.length - 6} aviso(s) más.</li>
                )}
              </ul>
            )}

            {canImport && (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
                {parsed.objectives.map((o) => (
                  <li key={o.id}>
                    <p className="font-semibold text-foreground">
                      {o.title}
                      {o.period && (
                        <span className="ml-2 font-normal text-muted-foreground">{o.period}</span>
                      )}
                    </p>
                    <ul className="mt-0.5 space-y-0.5 border-l border-border pl-3">
                      {o.keyResults.map((k) => (
                        <li key={k.id} className="text-muted-foreground">
                          {k.title}{" "}
                          <span className="text-foreground tabular-nums">
                            {k.startValue} {k.direction === "down" ? "↓" : "↑"} {k.targetValue}{" "}
                            {k.unit}
                          </span>
                          {k.dueDate && <span> · {k.dueDate}</span>}
                          {k.tasks.length > 0 && <span> · {k.tasks.length} tarea(s)</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Step>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border p-5 pt-4 text-xs">
          <div
            role="radiogroup"
            aria-label="Cómo importar"
            className="inline-flex overflow-hidden rounded-md border border-border"
          >
            {(
              [
                ["add", "Añadir a mis OKRs"],
                ["replace", `Reemplazar mis OKRs (${current.length})`],
              ] as const
            ).map(([m, text]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={m === "replace" && current.length === 0}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2.5 py-1.5 font-medium transition-colors disabled:opacity-40",
                  mode === m
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-foreground">
            <input
              type="checkbox"
              checked={createTasks}
              onChange={(e) => setCreateTasks(e.target.checked)}
            />
            Crear las tareas nuevas en el tablero (Por Hacer)
          </label>
          <button
            type="button"
            disabled={!canImport}
            onClick={doImport}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            {canImport ? `Importar ${parsed.counts.objectives} objetivo(s)` : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
