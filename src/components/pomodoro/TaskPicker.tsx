import { useEffect, useMemo, useRef, useState } from "react";

export type PickerTask = { id: string; title: string; col: string };

/**
 * Selector de tarea con búsqueda al escribir:
 * - Escribes directamente en el mismo campo.
 * - Al dejar de escribir (~600ms) busca: si encuentra, SOLO resalta la
 *   coincidencia en el desplegable (no la selecciona); puedes hacer clic.
 *   Si no encuentra, el texto se pone rojo y desaparece para reintentar.
 */
export function TaskPicker({
  tasks,
  value,
  onChange,
  disabled,
  groups,
}: {
  tasks: PickerTask[];
  value: string;
  onChange: (title: string) => void;
  disabled?: boolean;
  groups: { id: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hitId, setHitId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, query]);

  useEffect(() => {
    if (!typing) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = query.trim();
      if (!q) {
        setTyping(false);
        return;
      }
      const hit = matches[0];
      if (hit) {
        // Solo resaltamos en el desplegable; no seleccionamos ni tocamos el texto.
        setHitId(hit.id);
      } else {
        setFailed(true);
        setTimeout(() => {
          setFailed(false);
          setQuery("");
          setTyping(false);
        }, 700);
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, typing, matches]);

  return (
    <div className="relative mt-2">
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={typing || failed ? query : value}
        placeholder="— Selecciona una tarea o escribe para buscar —"
        onFocus={() => {
          setOpen(true);
          // Enfocar el buscador descarta la selección anterior por completo.
          // Si el usuario sale sin elegir, tendrá que buscarla de nuevo.
          if (!typing) {
            onChange("");
            setTyping(true);
            setQuery("");
            setHitId(null);
          }
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            if (typing) {
              setTyping(false);
              setQuery("");
              setHitId(null);
            }
          }, 120)
        }
        onChange={(e) => {
          setFailed(false);
          setTyping(true);
          setOpen(true);
          setHitId(null);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setTyping(false);
            setFailed(false);
            setHitId(null);
            setOpen(false);
          }
          if (e.key === "Enter" && typing) {
            e.preventDefault();
            const hit = matches[0];
            if (hit) {
              // Enter confirma la coincidencia resaltada (acción explícita).
              onChange(hit.title);
              setQuery("");
              setTyping(false);
              setHitId(null);
              setOpen(false);
            } else {
              setFailed(true);
              setTimeout(() => {
                setFailed(false);
                setQuery("");
                setTyping(false);
              }, 700);
            }
          }
        }}
        className={
          "w-full rounded-sm border-2 border-border bg-background px-3 py-2 text-sm outline-none " +
          (failed ? "text-destructive" : "text-foreground")
        }
      />

      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-sm border-2 border-border bg-card shadow-md">
          {matches.length === 0 && (
            <p className="px-3 py-2 text-[11px] uppercase text-muted-foreground">Sin resultados</p>
          )}
          {groups.map((g) => {
            const items = matches.filter((t) => t.col === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id}>
                <p className="bg-secondary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {items.map((t) => {
                  const isHit = t.id === hitId;
                  const isValue = t.title === value;
                  return (
                    <div
                      key={t.id}
                      className={
                        "flex items-center gap-1 px-3 py-1 text-left text-xs leading-tight hover:bg-secondary " +
                        (isHit ? "bg-secondary" : "")
                      }
                    >
                      {isHit && (
                        <span className="text-primary">▸</span>
                      )}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onChange(t.title);
                          setQuery("");
                          setTyping(false);
                          setHitId(null);
                          setOpen(false);
                        }}
                        className={
                          "block flex-1 truncate text-left " +
                          (isValue ? "font-bold text-primary" : "text-foreground")
                        }
                      >
                        {t.title}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
