import { useEffect, useRef, useState } from "react";

/** Un dígito estilo marcador de béisbol: una tarjeta cae sobre la anterior. */
function FlipDigit({ value, size }: { value: string; size: "lg" | "sm" }) {
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value === prev) return;
    setFlipping(true);
    const id = setTimeout(() => {
      setPrev(value);
      setFlipping(false);
    }, 260);
    return () => clearTimeout(id);
  }, [value, prev]);

  const box =
    size === "lg"
      ? "h-24 w-16 text-5xl sm:h-32 sm:w-24 sm:text-7xl"
      : "h-16 w-11 text-3xl sm:h-20 sm:w-14 sm:text-4xl";

  return (
    <div className={`flip-digit ${box}`}>
      <div className="flip-static flip-top">
        <span>{value}</span>
      </div>
      <div className="flip-static flip-bottom">
        <span>{prev}</span>
      </div>
      {flipping && (
        <>
          <div className="flip-card flip-card-top">
            <span>{prev}</span>
          </div>
          <div className="flip-card flip-card-bottom">
            <span>{value}</span>
          </div>
        </>
      )}
      <div className="flip-hinge" />
    </div>
  );
}

function Group({
  digits,
  size,
  label,
  onDrag,
  draggable,
}: {
  digits: string;
  size: "lg" | "sm";
  label: string;
  onDrag?: (delta: number) => void;
  draggable?: boolean;
}) {
  const startY = useRef<number | null>(null);
  const acc = useRef(0);

  function down(e: React.PointerEvent) {
    if (!draggable) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startY.current = e.clientY;
    acc.current = 0;
  }
  function move(e: React.PointerEvent) {
    if (!draggable || startY.current === null || !onDrag) return;
    const dy = startY.current - e.clientY;
    const steps = Math.trunc((dy - acc.current) / 12);
    if (steps !== 0) {
      acc.current += steps * 12;
      onDrag(steps);
    }
  }
  function up() {
    startY.current = null;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex gap-1.5 ${draggable ? "cursor-ns-resize touch-none select-none" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => {
          if (draggable && onDrag) onDrag(e.deltaY > 0 ? -1 : 1);
        }}
      >
        {digits.split("").map((d, i) => (
          <FlipDigit key={i} value={d} size={size} />
        ))}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function FlipClock({
  minutes,
  seconds,
  onChangeMinutes,
  onChangeSeconds,
  editable,
}: {
  minutes: number;
  seconds: number;
  onChangeMinutes: (delta: number) => void;
  onChangeSeconds?: (delta: number) => void;
  editable: boolean;
}) {
  const mm = String(Math.min(999, Math.max(0, minutes))).padStart(2, "0");
  const ss = String(Math.min(59, Math.max(0, seconds))).padStart(2, "0");

  return (
    <div className="flex items-start justify-center gap-3 sm:gap-5">
      <Group
        digits={mm}
        size="lg"
        label={editable ? "Min · arrastra" : "Min"}
        draggable={editable}
        onDrag={onChangeMinutes}
      />
      <div className="flex h-24 items-center sm:h-32">
        <div className="flex flex-col gap-2">
          <span className="block size-2 rounded-full bg-border" />
          <span className="block size-2 rounded-full bg-border" />
        </div>
      </div>
      <Group
        digits={ss}
        size="sm"
        label={editable && onChangeSeconds ? "Seg · arrastra" : "Seg"}
        draggable={editable && !!onChangeSeconds}
        onDrag={onChangeSeconds ?? (() => {})}
      />
    </div>
  );
}

