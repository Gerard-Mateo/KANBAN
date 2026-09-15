import { useEffect, useRef, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";

export type Shortcut = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export const DEFAULT_SHORTCUT: Shortcut = {
  key: "a",
  ctrl: true,
  meta: false,
  shift: true,
  alt: false,
};

const MODIFIER_KEYS = ["Control", "Meta", "Shift", "Alt"];

export function formatShortcut(s: Shortcut) {
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.meta) parts.push("⌘");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join(" + ");
}

export function matchesShortcut(e: KeyboardEvent, s: Shortcut) {
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
  // Ctrl y ⌘ son intercambiables si solo se configuró uno de los dos
  const wantsCmdLike = s.ctrl || s.meta;
  const hasCmdLike = e.ctrlKey || e.metaKey;
  if (wantsCmdLike !== hasCmdLike) return false;
  if (e.shiftKey !== s.shift) return false;
  if (e.altKey !== s.alt) return false;
  return true;
}

export function parseShortcut(raw: string | null): Shortcut | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Shortcut>;
    if (typeof parsed.key !== "string" || !parsed.key) return null;
    return {
      key: parsed.key,
      ctrl: !!parsed.ctrl,
      meta: !!parsed.meta,
      shift: !!parsed.shift,
      alt: !!parsed.alt,
    };
  } catch {
    return null;
  }
}

export function ShortcutSetting({
  enabled,
  onEnabledChange,
  shortcut,
  onShortcutChange,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  shortcut: Shortcut;
  onShortcutChange: (s: Shortcut) => void;
}) {
  const [recording, setRecording] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      if (MODIFIER_KEYS.includes(e.key)) return;
      onShortcutChange({
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      });
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onShortcutChange]);

  return (
    <div className="mr-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        Atajo nueva tarea
      </label>
      <button
        ref={btnRef}
        type="button"
        disabled={!enabled}
        onClick={() => setRecording((v) => !v)}
        title="Pulsa la combinación que quieras"
        className={
          "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-medium transition-colors disabled:opacity-40 " +
          (recording
            ? "animate-pulse bg-primary text-primary-foreground"
            : "bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground")
        }
      >
        <Keyboard className="size-3.5" />
        {recording ? "Pulsa teclas…" : formatShortcut(shortcut)}
      </button>
      {enabled && (
        <button
          type="button"
          aria-label="Restablecer atajo"
          onClick={() => onShortcutChange(DEFAULT_SHORTCUT)}
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </div>
  );
}
