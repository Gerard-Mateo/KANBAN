import { useEffect, useRef } from "react";
import { Copy, Info, Pencil, PencilLine, Plus, Timer, Trash2, X } from "lucide-react";

export type MenuState = { x: number; y: number; taskId: string } | null;

export function TaskContextMenu({
  state,
  onClose,
  onDelete,
  onAddBelow,
  onDetails,
  onPomodoro,
  selectedCount = 0,
  onClone,
  onCloneRename,
  onRename,
  onClearSelection,
}: {
  state: MenuState;
  onClose: () => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onDetails: () => void;
  onPomodoro?: () => void;
  selectedCount?: number;
  onClone?: () => void;
  onCloneRename?: () => void;
  onRename?: () => void;
  onClearSelection?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", key);
    };
  }, [state, onClose]);

  if (!state) return null;

  const multi = selectedCount > 0;
  const items = [
    ...(onPomodoro
      ? [{ label: "Iniciar pomodoro", icon: Timer, action: onPomodoro, danger: false }]
      : []),
    { label: "Ver detalles", icon: Info, action: onDetails, danger: false },
    { label: "Nueva tarea debajo", icon: Plus, action: onAddBelow, danger: false },
    ...(multi && onRename
      ? [
          {
            label: "Renombrar seleccionadas…",
            icon: Pencil,
            action: onRename,
            danger: false,
          },
        ]
      : []),
    ...(multi && onClone
      ? [
          {
            label: `Clonar ${selectedCount} seleccionada(s)`,
            icon: Copy,
            action: onClone,
            danger: false,
          },
        ]
      : []),
    ...(multi && onCloneRename
      ? [
          {
            label: "Clonar con nuevo nombre…",
            icon: PencilLine,
            action: onCloneRename,
            danger: false,
          },
        ]
      : []),
    ...(multi && onClearSelection
      ? [{ label: "Quitar selección", icon: X, action: onClearSelection, danger: false }]
      : []),
    {
      label: multi ? `Eliminar ${selectedCount} seleccionada(s)` : "Eliminar tarea",
      icon: Trash2,
      action: onDelete,
      danger: true,
    },
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
      className="glass-panel fixed z-50 w-60 origin-top-left animate-in fade-in zoom-in-95 rounded-md p-1.5"
    >
      {items.map(({ label, icon: Icon, action, danger }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          onClick={() => {
            action();
            onClose();
          }}
          className={
            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors " +
            (danger
              ? "text-destructive hover:bg-destructive/10"
              : "text-card-foreground hover:bg-secondary")
          }
        >
          <Icon className="size-4 shrink-0 opacity-80" />
          {label}
        </button>
      ))}
    </div>
  );
}
