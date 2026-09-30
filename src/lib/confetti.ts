// Confeti al terminar una tarea, como en Canvas al entregar una tarea: dos
// cañones desde las esquinas de abajo. Sin dependencias: un <canvas> fijo que
// se dibuja ~3 s y se quita solo. Respeta "reducir movimiento" del sistema.

const COLORS = [
  "oklch(0.7 0.16 165)", // verde Hecho
  "oklch(0.63 0.21 32)", // rojo principal
  "oklch(0.76 0.15 220)", // cian
  "oklch(0.84 0.16 85)", // ámbar
  "oklch(0.7 0.18 300)", // violeta
  "oklch(0.97 0 0)", // blanco
];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
  wobble: number;
};

const DURATION = 3200;
let active: HTMLCanvasElement | null = null;

function cannon(x: number, y: number, dir: 1 | -1, count: number): Piece[] {
  return Array.from({ length: count }, () => {
    // Hacia arriba y hacia el centro, con algo de dispersión.
    const angle = (-90 + dir * (15 + Math.random() * 40)) * (Math.PI / 180);
    const speed = 13 + Math.random() * 11;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      round: Math.random() < 0.25,
      wobble: Math.random() * Math.PI * 2,
    };
  });
}

export function fireConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  active?.remove();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "100",
  });
  document.body.appendChild(canvas);
  active = canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const pieces = [...cannon(0, height, 1, 90), ...cannon(width, height, -1, 90)];
  const start = performance.now();
  let last = start;

  const frame = (now: number) => {
    if (active !== canvas) return;
    const dt = Math.min(2, (now - last) / 16.67);
    last = now;
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = elapsed > DURATION - 700 ? Math.max(0, (DURATION - elapsed) / 700) : 1;
    for (const p of pieces) {
      p.vx *= 0.985 ** dt;
      p.vy = p.vy * 0.985 ** dt + 0.32 * dt;
      p.wobble += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 0.6) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Aplastar en un eje simula que la pieza gira en el aire.
      ctx.scale(1, Math.cos(p.wobble));
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else {
      canvas.remove();
      if (active === canvas) active = null;
    }
  };
  requestAnimationFrame(frame);
}
