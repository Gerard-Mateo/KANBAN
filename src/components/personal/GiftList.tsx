import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Heart, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addGift,
  deleteGift,
  setGiftGiven,
  updateGift,
  type Gift,
  type PersonalTheme,
} from "@/lib/personal";
import { accentOf, cardStyle, iconOf, linkInfo } from "./personal-theme";

type Draft = { idea: string; person: string; link: string; note: string };
const EMPTY: Draft = { idea: "", person: "", link: "", note: "" };

const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });

/** Ideas de regalo: se apuntan cuando se te ocurren y se quedan para siempre
 * (al regalarlas pasan a "Regalados", nunca se borran solas). */
export function GiftList({ gifts, theme }: { gifts: Gift[]; theme: PersonalTheme }) {
  const accent = accentOf(theme);
  const Icon = iconOf(theme.giftIcon);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [showGiven, setShowGiven] = useState(false);
  const ideaRef = useRef<HTMLInputElement>(null);

  const pending = gifts.filter((g) => !g.givenAt);
  const given = useMemo(
    () => gifts.filter((g) => g.givenAt).sort((a, b) => b.givenAt! - a.givenAt!),
    [gifts],
  );
  // Personas con ideas pendientes, de la que más tiene a la que menos.
  const people = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of pending) if (g.person) counts.set(g.person, (counts.get(g.person) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [pending]);
  const allPeople = useMemo(
    () => [...new Set(gifts.map((g) => g.person).filter(Boolean))].sort(),
    [gifts],
  );
  const shown = pending
    .filter((g) => !person || g.person === person)
    .sort((a, b) => b.createdAt - a.createdAt);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    if (!draft.idea.trim()) return;
    if (editing)
      updateGift(editing, {
        idea: draft.idea.trim(),
        person: draft.person.trim(),
        link: draft.link.trim(),
        note: draft.note.trim(),
      });
    else addGift(draft);
    setDraft(EMPTY);
    setEditing(null);
  }

  function edit(g: Gift) {
    setEditing(g.id);
    setDraft({ idea: g.idea, person: g.person, link: g.link, note: g.note });
    ideaRef.current?.focus();
  }

  const field =
    "min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-white/25";

  return (
    <section className="rounded-3xl p-5" style={cardStyle(theme)}>
      <header className="mb-4 flex items-center gap-3">
        <span
          className="grid size-10 place-items-center rounded-2xl"
          style={{
            background: `color-mix(in oklch, ${accent} 18%, transparent)`,
            color: accent,
            boxShadow: `0 0 24px color-mix(in oklch, ${accent} 25%, transparent)`,
          }}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Ideas de regalo</h3>
          <p className="text-xs text-muted-foreground">
            {pending.length === 0
              ? "Apunta una idea apenas se te ocurra"
              : `${pending.length} idea${pending.length === 1 ? "" : "s"}${given.length ? ` · ${given.length} regalada${given.length === 1 ? "" : "s"}` : ""}`}
          </p>
        </div>
      </header>

      {/* Nueva idea (o editar una) */}
      <div
        className={cn(
          "mb-4 grid gap-2 rounded-2xl border p-2.5 transition-colors",
          editing ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-white/[0.03]",
        )}
      >
        <input
          ref={ideaRef}
          value={draft.idea}
          onChange={(e) => set({ idea: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Una idea de regalo…"
          className={cn(field, "text-[15px]")}
        />
        <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <input
            value={draft.person}
            onChange={(e) => set({ person: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="¿Para quién?"
            list="gift-people"
            className={field}
          />
          <datalist id="gift-people">
            {allPeople.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            value={draft.link}
            onChange={(e) => set({ link: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Enlace del producto o del reel (opcional)"
            inputMode="url"
            className={field}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Nota: talla, color, por qué le encantaría… (opcional)"
            className={cn(field, "flex-1")}
          />
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(EMPTY);
              }}
              className="rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!draft.idea.trim()}
            className="shrink-0 rounded-xl px-4 text-xs font-semibold text-background transition-[opacity,transform] hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
            style={{ background: accent }}
          >
            {editing ? "Guardar" : "Guardar idea"}
          </button>
        </div>
      </div>

      {/* Filtro por persona */}
      {people.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[null, ...people.map(([p]) => p)].map((p) => {
            const on = person === p;
            const count = p ? people.find(([x]) => x === p)![1] : pending.length;
            return (
              <button
                key={p ?? "__all"}
                type="button"
                onClick={() => setPerson(p)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  on
                    ? "border-transparent"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
                style={
                  on
                    ? {
                        background: `color-mix(in oklch, ${accent} 22%, transparent)`,
                        color: accent,
                      }
                    : undefined
                }
              >
                {p ?? "Todos"} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((g) => (
            <GiftCard key={g.id} gift={g} accent={accent} onEdit={() => edit(g)} />
          ))}
        </div>
      ) : (
        <div className="grid place-items-center py-8 text-center">
          <Icon className="size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            {pending.length === 0
              ? "Cuando se te ocurra un regalo para alguien, apúntalo aquí y no se te olvida."
              : "No hay ideas para esa persona."}
          </p>
        </div>
      )}

      {given.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowGiven((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showGiven ? "" : "-rotate-90")}
            />
            Regalados · {given.length}
          </button>
          {showGiven && (
            <ul className="-mx-2 mt-2 space-y-0.5">
              {given.map((g) => (
                <li
                  key={g.id}
                  className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]"
                >
                  <span
                    className="grid size-4 shrink-0 place-items-center rounded-full"
                    style={{ background: accent }}
                  >
                    <Check className="size-2.5 text-background" strokeWidth={3.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {g.idea}
                    {g.person && <span className="text-muted-foreground/70"> · {g.person}</span>}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                    {shortDate(g.givenAt!)}
                  </span>
                  <button
                    type="button"
                    title="Devolver a ideas"
                    onClick={() => setGiftGiven(g.id, false)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-foreground"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function GiftCard({ gift, accent, onEdit }: { gift: Gift; accent: string; onEdit: () => void }) {
  const link = linkInfo(gift.link);
  return (
    <article className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition-colors hover:bg-white/[0.07]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {gift.person && (
            <span
              className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: `color-mix(in oklch, ${accent} 18%, transparent)`,
                color: accent,
              }}
            >
              <Heart className="size-2.5 shrink-0 fill-current" />
              <span className="truncate">{gift.person}</span>
            </span>
          )}
          <p className="text-[15px] leading-snug font-medium text-foreground">{gift.idea}</p>
          {gift.note && <p className="mt-1 text-xs text-muted-foreground">{gift.note}</p>}
        </div>
        <div className="-mt-1 -mr-1 flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            title="Editar"
            onClick={onEdit}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Borrar idea"
            onClick={() => {
              if (confirm(`¿Borrar la idea "${gift.idea}"? No se puede deshacer.`))
                deleteGift(gift.id);
            }}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={link.href}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-white/10"
          >
            <link.icon className="size-3.5 shrink-0" style={{ color: accent }} />
            <span className="truncate">{link.label}</span>
            <ExternalLink className="size-3 shrink-0 opacity-50" />
          </a>
        )}
        <button
          type="button"
          onClick={() => setGiftGiven(gift.id, true)}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <Check className="size-3.5" /> Ya lo regalé
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground/60">
        Idea del {shortDate(gift.createdAt)}
      </p>
    </article>
  );
}
