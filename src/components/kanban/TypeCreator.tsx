import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  addCustomType,
  colorOf,
  removeCustomType,
  typeDotColor,
  upsertCustomType,
  useCustomTypes,
  type TypeColor,
} from "@/lib/custom-types";
import { ColorPicker, randomColor } from "./ColorPicker";

export function TypeDot({ label }: { label: string }) {
  const custom = useCustomTypes();
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: typeDotColor(label, custom) }}
    />
  );
}

/** Chip "+ Nuevo tipo" que se abre en un mini formulario para crear (y borrar) tipos. */
export function TypeCreator({ onCreated }: { onCreated: (label: string) => void }) {
  const custom = useCustomTypes();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TypeColor>(randomColor);
  const [error, setError] = useState<string | null>(null);
  const [recoloring, setRecoloring] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setLabel("");
    setError(null);
    setRecoloring(null);
  }

  function create() {
    const res = addCustomType(label, color);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated(res.label);
    close();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setColor(randomColor());
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-3" /> Nuevo tipo
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-secondary/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              create();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          maxLength={24}
          placeholder="Nombre del tipo (p. ej. Reunión)"
          className="min-w-40 flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />
        <button
          type="button"
          onClick={create}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Crear
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] font-medium text-destructive">{error}</p>}
      {!recoloring && (
        <div className="mt-2.5">
          <ColorPicker value={color} onChange={setColor} previewLabel={label} />
        </div>
      )}
      {custom.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Tus tipos:</span>
            {custom.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] text-foreground"
              >
                <button
                  type="button"
                  aria-label={`Cambiar color de ${c.label}`}
                  title="Cambiar color"
                  onClick={() => setRecoloring(recoloring === c.label ? null : c.label)}
                  className="grid size-3.5 place-items-center rounded-full ring-1 ring-border"
                  style={{ backgroundColor: typeDotColor(c.label, custom) }}
                />
                {c.label}
                <button
                  type="button"
                  aria-label={`Borrar tipo ${c.label}`}
                  title="Borrar tipo (se quita de las tareas que lo usan)"
                  onClick={() => removeCustomType(c.label)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {recoloring && (
            <div className="mt-2.5 rounded-lg border border-border bg-card/60 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Color de <span className="font-medium text-foreground">{recoloring}</span> (se
                  aplica al instante)
                </span>
                <button
                  type="button"
                  onClick={() => setRecoloring(null)}
                  className="ml-auto rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Listo
                </button>
              </div>
              <ColorPicker
                value={colorOf(recoloring, custom)}
                onChange={(c) => upsertCustomType(recoloring, c)}
                previewLabel={recoloring}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
