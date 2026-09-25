import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagsForTask, type Task } from "@/lib/kanban-data";
import { typeChipStyle, useCustomTypes } from "@/lib/custom-types";

const toneClass: Record<string, string> = {
  video: "bg-primary/10 text-primary",
  guion: "bg-accent/10 text-accent",
  module: "bg-secondary text-muted-foreground",
  other: "bg-secondary text-muted-foreground",
};

export function TaskCardBody({
  task,
  dragging,
  selected,
}: {
  task: Task;
  dragging?: boolean;
  selected?: boolean;
}) {
  const customTypes = useCustomTypes();
  return (
    <div
      className={cn(
        "group relative flex cursor-default select-none gap-2 rounded-lg border border-border bg-card p-3",
        "shadow-[0_1px_2px_oklch(0_0_0_/_0.04)] transition-[box-shadow,border-color] duration-150",
        !dragging && "hover:shadow-[0_2px_8px_oklch(0_0_0_/_0.08)]",
        selected && "border-primary bg-primary/[0.04]",
        dragging && "border-primary shadow-[0_8px_24px_oklch(0_0_0_/_0.14)]",
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
          {tagsForTask(task).map((tag) => (
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
      </div>
    </div>
  );
}

function SortableTaskCardInner({
  task,
  onContextMenu,
  selected,
  onSelect,
}: {
  task: Task;
  onContextMenu?: ((task: Task, e: React.MouseEvent) => void) | undefined;
  selected?: boolean;
  onSelect?: ((task: Task, e: React.MouseEvent) => void) | undefined;
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
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(task, e);
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} selected={selected ?? false} />
    </div>
  );
}

export const SortableTaskCard = memo(SortableTaskCardInner);
