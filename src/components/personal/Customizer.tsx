import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, ImagePlus, Link2, RotateCcw, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorPicker } from "@/components/kanban/ColorPicker";
import { exportSpace, importSpace, resetTheme, setTheme, type PersonalTheme } from "@/lib/personal";
import { todayIso } from "@/lib/calendar";
import { BACKGROUNDS, FONTS, ICONS, accentOf } from "./personal-theme";

/** Reduce la foto a un tamaño razonable (máx. 1920 px, JPEG) para guardarla. */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/10 px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  accent: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 flex text-xs text-muted-foreground">
        {label}
        <span className="ml-auto text-foreground tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: accent }}
      />
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  accent,
  onChange,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  accent: string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
            value === o.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          style={
            value === o.id
              ? { background: `color-mix(in oklch, ${accent} 24%, transparent)` }
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconPicker({
  value,
  accent,
  onChange,
}: {
  value: string;
  accent: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {Object.entries(ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          title={name}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
          className="grid aspect-square place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          style={
            value === name
              ? { background: `color-mix(in oklch, ${accent} 24%, transparent)`, color: accent }
              : undefined
          }
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

/** Panel lateral para dejar el espacio a tu gusto; los cambios se ven al momento. */
export function Customizer({ theme, onClose }: { theme: PersonalTheme; onClose: () => void }) {
  const accent = accentOf(theme);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  async function uploadImage(file: File) {
    setBusy(true);
    setError(null);
    try {
      setTheme({ background: { kind: "image", src: await compressImage(file) } });
    } catch {
      setError("No se pudo leer esa imagen.");
    } finally {
      setBusy(false);
    }
  }

  function applyImageUrl() {
    const url = imageUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError("Pega un enlace que empiece por http:// o https://");
      return;
    }
    setError(null);
    setTheme({ background: { kind: "image", src: url } });
    setImageUrl("");
  }

  function downloadBackup() {
    const blob = new Blob([exportSpace()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mi-espacio-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restoreBackup(file: File) {
    try {
      const text = await file.text();
      if (
        !confirm(
          "Esto reemplaza tus pendientes, regalos y apariencia por los de la copia. ¿Seguir?",
        )
      )
        return;
      importSpace(text);
      setError(null);
    } catch {
      setError("Ese archivo no es una copia válida de tu espacio.");
    }
  }

  return (
    <aside
      role="dialog"
      aria-label="Personalizar mi espacio"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-background/85 shadow-[-20px_0_60px_oklch(0_0_0_/_0.5)] backdrop-blur-2xl"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Personalizar</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Nombre">
          <input
            value={theme.title}
            maxLength={60}
            onChange={(e) => setTheme({ title: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-white/25"
          />
        </Section>

        <Section title="Color">
          <ColorPicker
            value={theme.accent}
            onChange={(c) => setTheme({ accent: c })}
            previewLabel={theme.title || "Mi espacio"}
          />
        </Section>

        <Section title="Fondo">
          <div className="grid grid-cols-3 gap-2">
            {BACKGROUNDS.map((b) => {
              const on = theme.background.kind === "preset" && theme.background.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setTheme({ background: { kind: "preset", id: b.id } })}
                  className="group overflow-hidden rounded-xl text-left ring-1 ring-white/10 transition-shadow"
                  style={on ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
                >
                  <span className="block h-12" style={{ background: b.css(accent) }} />
                  <span className="block bg-black/40 px-2 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">
                    {b.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10 disabled:opacity-50"
            >
              <ImagePlus className="size-3.5" /> {busy ? "Cargando…" : "Usar una foto"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadImage(file);
              }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyImageUrl()}
                placeholder="o pega el enlace de una imagen"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pr-2 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-white/25"
              />
            </div>
            <button
              type="button"
              onClick={applyImageUrl}
              disabled={!imageUrl.trim()}
              className="rounded-xl px-3 text-xs font-medium text-foreground hover:bg-white/10 disabled:opacity-40"
            >
              Usar
            </button>
          </div>
          {theme.background.kind === "image" && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="h-10 w-16 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-white/10"
                style={{ backgroundImage: `url("${theme.background.src.replace(/"/g, "%22")}")` }}
              />
              <span className="text-xs text-muted-foreground">Tu foto de fondo</span>
              <button
                type="button"
                onClick={() => setTheme({ background: { kind: "preset", id: "aurora" } })}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
              >
                Quitar
              </button>
            </div>
          )}
          <Slider
            label="Oscurecer"
            value={theme.dim}
            min={0}
            max={0.85}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            accent={accent}
            onChange={(dim) => setTheme({ dim })}
          />
          <Slider
            label="Desenfocar"
            value={theme.blur}
            min={0}
            max={24}
            step={1}
            format={(v) => `${v} px`}
            accent={accent}
            onChange={(blur) => setTheme({ blur })}
          />
        </Section>

        <Section title="Tarjetas">
          <Segmented
            value={theme.card}
            accent={accent}
            onChange={(card) => setTheme({ card })}
            options={[
              { id: "glass", label: "Cristal" },
              { id: "solid", label: "Sólidas" },
            ]}
          />
          {theme.card === "glass" && (
            <Slider
              label="Opacidad"
              value={theme.cardOpacity}
              min={0.25}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              accent={accent}
              onChange={(cardOpacity) => setTheme({ cardOpacity })}
            />
          )}
        </Section>

        <Section title="Letra">
          <Segmented
            value={theme.font}
            accent={accent}
            onChange={(font) => setTheme({ font })}
            options={(Object.keys(FONTS) as PersonalTheme["font"][]).map((id) => ({
              id,
              label: (
                <span className="flex flex-col items-center leading-tight">
                  <span className="text-base" style={{ fontFamily: FONTS[id].css }}>
                    Aa
                  </span>
                  <span className="text-[10px]">{FONTS[id].label}</span>
                </span>
              ),
            }))}
          />
        </Section>

        <Section title="Icono de pendientes">
          <IconPicker
            value={theme.todoIcon}
            accent={accent}
            onChange={(todoIcon) => setTheme({ todoIcon })}
          />
        </Section>

        <Section title="Icono de regalos">
          <IconPicker
            value={theme.giftIcon}
            accent={accent}
            onChange={(giftIcon) => setTheme({ giftIcon })}
          />
        </Section>

        <Section title="Copia de seguridad">
          <p className="mb-2 text-xs text-muted-foreground">
            Todo se guarda solo en tu cuenta. Si quieres, descarga una copia de tus pendientes,
            regalos y apariencia.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadBackup}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10"
            >
              <Download className="size-3.5" /> Descargar
            </button>
            <button
              type="button"
              onClick={() => backupRef.current?.click()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/10"
            >
              <Upload className="size-3.5" /> Restaurar
            </button>
            <input
              ref={backupRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void restoreBackup(file);
              }}
            />
          </div>
        </Section>

        <Section title="Apariencia">
          <button
            type="button"
            onClick={() => {
              if (confirm("¿Volver a la apariencia original? Tus pendientes y regalos no cambian."))
                resetTheme();
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Restablecer apariencia
          </button>
        </Section>
      </div>

      {error && (
        <p className="border-t border-white/10 px-5 py-2.5 text-xs text-destructive">{error}</p>
      )}
    </aside>
  );
}
