import { useEffect, useRef } from "react";
import { ListPlus, Plus } from "lucide-react";

export type ColumnMenuState = { x: number; y: number } | null;

export function ColumnContextMenu({
  state,
  onClose,
  onNewTask,
  onBulkCreate,
}: {
  state: ColumnMenuState;
  onClose: () => void;
  onNewTask: () => void;
  onBulkCreate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    // mousedown (no click) para que un clic derecho en otro lado también lo cierre.
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", key);
    };
  }, [state, onClose]);

  if (!state) return null;

  const items = [
    { label: "Nueva tarea", icon: Plus, action: onNewTask },
    { label: "Crear varias tareas…", icon: ListPlus, action: onBulkCreate },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        left: Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 0) - 230),
        top: state.y,
      }}
      className="glass-panel fixed z-50 w-56 origin-top-left animate-in fade-in zoom-in-95 rounded-md p-1.5"
    >
      {items.map(({ label, icon: Icon, action }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          onClick={() => {
            action();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-card-foreground transition-colors hover:bg-secondary"
        >
          <Icon className="size-4 shrink-0 opacity-80" />
          {label}
        </button>
      ))}
    </div>
  );
}
