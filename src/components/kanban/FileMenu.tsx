import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, History, Upload, FolderOpen } from "lucide-react";
import { useBackdropClose } from "@/hooks/use-backdrop-close";
import type { BoardState } from "@/lib/kanban-data";
import {
  exportCsv,
  exportHistoryCsv,
  exportXlsx,
  parseBoardFile,
  type ImportResult,
} from "@/lib/kanban-export";

export function FileMenu({
  board,
  onImport,
}: {
  board: BoardState;
  onImport: (board: BoardState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ result: ImportResult; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closePendingModal = useBackdropClose(() => {
    setPending(null);
    setError(null);
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    setOpen(false);
    try {
      const result = await parseBoardFile(file);
      setPending({ result, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
        >
          <FolderOpen className="size-4" /> Archivo
        </button>
        {open && (
          <div className="glass-panel absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg p-1">
            <p className="px-3 pt-1 pb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Exportar
            </p>
            <button
              type="button"
              onClick={() => {
                exportXlsx(board);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <FileSpreadsheet className="size-4 text-done" /> Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => {
                exportCsv(board);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <FileText className="size-4 text-doing" /> CSV (.csv)
            </button>
            <button
              type="button"
              onClick={() => {
                exportHistoryCsv(board);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <History className="size-4 text-todo" /> Movimientos (.csv)
            </button>
            <div className="my-1 h-px bg-border" />
            <p className="px-3 pt-0.5 pb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Importar
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                inputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <Upload className="size-4 text-accent" /> Importar archivo…
            </button>
          </div>
        )}
      </div>

      {(pending || error) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4"
          {...closePendingModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-md rounded-xl p-5"
          >
            {error ? (
              <>
                <h2 className="flex items-center gap-2 text-base font-semibold text-destructive">
                  <Download className="size-5" /> Error al importar
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              pending && (
                <>
                  <h2 className="text-base font-semibold text-foreground">Reemplazar tablero</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{pending.name}</span> contiene{" "}
                    {pending.result.taskCount} tarea(s) y {pending.result.moveCount} movimiento(s).
                    El tablero actual se reemplazará por completo.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onImport(pending.result.board);
                        setPending(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Upload className="size-3.5" /> Importar
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
