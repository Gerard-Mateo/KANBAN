import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TagTone = "video" | "guion" | "module" | "other";

export const FILTER_OPTIONS: { tone: TagTone; label: string }[] = [
  { tone: "video", label: "Video" },
  { tone: "guion", label: "Guion" },
  { tone: "module", label: "Módulo" },
  { tone: "other", label: "General" },
];

export function FilterBar({
  query,
  onQuery,
  tones,
  onToggleTone,
  onClear,
  resultCount,
  totalCount,
}: {
  query: string;
  onQuery: (v: string) => void;
  tones: Set<TagTone>;
  onToggleTone: (t: TagTone) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const active = query.trim().length > 0 || tones.size > 0;

  return (
    <div className="glass-panel mb-6 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar tareas por texto…"
          className="w-full rounded-xl border border-border/60 bg-card/60 py-2 pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent/60 focus:bg-card"
        />
        {query && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => onQuery("")}
            className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const selected = tones.has(opt.tone);
          return (
            <button
              key={opt.tone}
              type="button"
              onClick={() => onToggleTone(opt.tone)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                selected
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-accent/40 hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" /> Limpiar
          </button>
        )}
      </div>

      <span className="whitespace-nowrap px-1 text-xs font-medium text-muted-foreground">
        {active ? `${resultCount} de ${totalCount}` : `${totalCount} tareas`}
      </span>
    </div>
  );
}
