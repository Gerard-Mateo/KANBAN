import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagsForTask, type Task, type TaskGoal } from "@/lib/kanban-data";
import { colorOf, typeChipStyle, useCustomTypes, type CustomType } from "@/lib/custom-types";

// Solo los tipos neutros llevan clase fija; el resto (incluidos Video y Guion)
// se pinta con su propio tono para que cada tipo se distinga.
const toneClass: Record<string, string> = {
  module: "bg-secondary text-muted-foreground",
  other: "bg-secondary text-muted-foreground",
};

// Los clics en los botones de la meta no deben seleccionar, arrastrar ni abrir la tarea.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Colores de la barra: el tono del tipo, o el color principal si el tipo es neutro. */
function barColors(tone: string | undefined, customTypes: CustomType[]) {
  if (!tone || toneClass[tone]) {
    return {
      fill: "linear-gradient(90deg, color-mix(in oklch, var(--primary) 55%, transparent), var(--primary))",
      glow: "color-mix(in oklch, var(--primary) 45%, transparent)",
      track: "color-mix(in oklch, var(--primary) 14%, transparent)",
      text: "var(--primary)",
    };
  }
  const { hue, chroma } = colorOf(tone, customTypes);
  return {
    fill: `linear-gradient(90deg, oklch(0.52 ${chroma} ${hue}), oklch(0.76 ${chroma} ${hue}))`,
    glow: `oklch(0.72 ${chroma} ${hue} / 0.45)`,
    track: `oklch(0.32 ${(chroma * 0.45).toFixed(4)} ${hue} / 0.55)`,
    text: `oklch(0.84 ${chroma} ${hue})`,
  };
}

function GoalBar({
  goal,
  tone,
  onStep,
}: {
  goal: TaskGoal;
  tone: string | undefined;
  onStep?: ((delta: 1 | -1) => void) | undefined;
}) {
  const customTypes = useCustomTypes();
  const c = barColors(tone, customTypes);
  const pct = Math.min(100, (goal.current / goal.target) * 100);
  const complete = goal.current >= goal.target;
  const stepButton =
    "grid size-5 place-items-center rounded-full border border-border/60 text-muted-foreground transition-[color,border-color,opacity] hover:border-foreground/40 hover:text-foreground";
  const guard = {
    onPointerDown: stop,
    onKeyDown: stop,
    onDoubleClick: stop,
    onContextMenu: stop,
  };
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <div
        className="relative h-[3px] flex-1 overflow-hidden rounded-full"
        style={{ background: c.track }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: c.fill,
            boxShadow: complete ? `0 0 10px ${c.glow}` : `0 0 6px ${c.glow}`,
          }}
        />
      </div>
      <span
        className="text-[11px] font-semibold tabular-nums tracking-tight"
        style={{ color: c.text }}
      >
        {goal.current}
        <span className="font-medium text-muted-foreground">/{goal.target}</span>
      </span>
      {onStep && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Restar uno"
            disabled={goal.current === 0}
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
            {...guard}
            className={cn(stepButton, "opacity-0 group-hover:opacity-100 disabled:!opacity-0")}
          >
            <Minus className="size-3" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Sumar uno"
            disabled={complete}
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
            {...guard}
            className={cn(stepButton, "disabled:opacity-30")}
          >
            <Plus className="size-3" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

export function TaskCardBody({
  task,
  dragging,
  selected,
  onGoalStep,
}: {
  task: Task;
  dragging?: boolean;
  selected?: boolean;
  onGoalStep?: ((task: Task, delta: 1 | -1) => void) | undefined;
}) {
  const customTypes = useCustomTypes();
  const tags = tagsForTask(task);
  return (
    <div
      className={cn(
        "group relative flex cursor-default select-none gap-2 rounded-lg border border-border bg-card p-3",
        "shadow-[0_1px_2px_oklch(0_0_0_/_0.5)] transition-[box-shadow,border-color] duration-150",
        !dragging && "hover:shadow-[0_2px_10px_oklch(0_0_0_/_0.6)]",
        selected && "border-primary bg-primary/[0.04]",
        dragging && "border-primary shadow-[0_8px_28px_oklch(0_0_0_/_0.75)]",
      )}
    >
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <p className="cursor-default text-sm leading-snug text-card-foreground">{task.title}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.label}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                toneClass[tag.tone],
              )}
              style={toneClass[tag.tone] ? undefined : typeChipStyle(tag.tone, customTypes)}
            >
              {tag.label}
            </span>
          ))}
        </div>
        {task.goal && (
          <GoalBar
            goal={task.goal}
            tone={tags[0]?.tone}
            onStep={onGoalStep && ((delta) => onGoalStep(task, delta))}
          />
        )}
      </div>
    </div>
  );
}

function SortableTaskCardInner({
  task,
  onContextMenu,
  selected,
  onSelect,
  onOpen,
  onGoalStep,
}: {
  task: Task;
  onContextMenu?: ((task: Task, e: React.MouseEvent) => void) | undefined;
  selected?: boolean;
  onSelect?: ((task: Task, e: React.MouseEvent) => void) | undefined;
  onOpen?: ((task: Task) => void) | undefined;
  onGoalStep?: ((task: Task, delta: 1 | -1) => void) | undefined;
}) {
  // No layout-change animation and no CSS transition: the card must track the
  // pointer 1:1 with zero lag while dragging, and siblings must snap to their
  // new slot instantly instead of animating into place.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
    animateLayoutChanges: () => false,
    transition: null,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        willChange: "transform",
      }}
      className={cn("touch-none", isDragging && "opacity-40")}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect(task, e);
      }}
      onDoubleClick={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen(task);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(task, e);
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} selected={selected ?? false} onGoalStep={onGoalStep} />
    </div>
  );
}

export const SortableTaskCard = memo(SortableTaskCardInner);
