// Piezas de la apariencia del espacio personal: fondos, letras, iconos y la
// forma de las tarjetas. Todo lo elige cada persona en "Personalizar".
import type { CSSProperties } from "react";
import {
  Baby,
  BookOpen,
  Cake,
  Camera,
  Cat,
  Coffee,
  Crown,
  Dog,
  Dumbbell,
  Film,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  Headphones,
  Heart,
  House,
  Instagram,
  Leaf,
  Link2,
  ListTodo,
  Moon,
  Mountain,
  Music,
  PartyPopper,
  PawPrint,
  Pizza,
  Plane,
  Rocket,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Target,
  Waves,
  Youtube,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PersonalTheme } from "@/lib/personal";
import { diffDays, fromIso, todayIso } from "@/lib/calendar";

/** Iconos que se pueden elegir para cada sección. */
export const ICONS: Record<string, LucideIcon> = {
  ListTodo,
  Sparkles,
  Star,
  Heart,
  Flame,
  Rocket,
  Target,
  Zap,
  Sun,
  Moon,
  Coffee,
  Leaf,
  Flower2,
  Mountain,
  Waves,
  Music,
  Headphones,
  Gamepad2,
  BookOpen,
  Dumbbell,
  Plane,
  House,
  PawPrint,
  Cat,
  Dog,
  Gift,
  Gem,
  Crown,
  Cake,
  PartyPopper,
  ShoppingBag,
  Shirt,
  Camera,
  Pizza,
  Baby,
};

export const iconOf = (name: string): LucideIcon => ICONS[name] ?? Sparkles;

/** Fondos listos para usar; "accent" se pinta con el color elegido. */
export const BACKGROUNDS: { id: string; label: string; css: (accent: string) => string }[] = [
  {
    id: "aurora",
    label: "Aurora",
    css: () =>
      "radial-gradient(55% 45% at 12% 8%, oklch(0.58 0.15 195 / 0.55), transparent 70%), radial-gradient(50% 45% at 88% 15%, oklch(0.5 0.2 300 / 0.55), transparent 70%), radial-gradient(65% 55% at 50% 105%, oklch(0.5 0.15 160 / 0.45), transparent 70%), oklch(0.15 0.02 264)",
  },
  {
    id: "sunset",
    label: "Atardecer",
    css: () =>
      "radial-gradient(70% 55% at 80% 100%, oklch(0.62 0.17 45 / 0.55), transparent 70%), linear-gradient(165deg, oklch(0.33 0.12 15), oklch(0.3 0.14 330) 50%, oklch(0.18 0.07 280))",
  },
  {
    id: "ocean",
    label: "Océano",
    css: () =>
      "radial-gradient(75% 55% at 25% 0%, oklch(0.5 0.13 225 / 0.7), transparent 70%), radial-gradient(60% 50% at 90% 90%, oklch(0.45 0.1 190 / 0.45), transparent 70%), linear-gradient(180deg, oklch(0.22 0.06 240), oklch(0.12 0.03 250))",
  },
  {
    id: "forest",
    label: "Bosque",
    css: () =>
      "radial-gradient(65% 55% at 82% 8%, oklch(0.5 0.13 145 / 0.6), transparent 70%), radial-gradient(55% 45% at 10% 95%, oklch(0.45 0.1 100 / 0.35), transparent 70%), linear-gradient(170deg, oklch(0.21 0.05 160), oklch(0.12 0.02 180))",
  },
  {
    id: "night",
    label: "Estrellas",
    css: () =>
      "radial-gradient(1.5px 1.5px at 20px 30px, oklch(1 0 0 / 0.8), transparent) 0 0 / 160px 160px, radial-gradient(1px 1px at 90px 110px, oklch(1 0 0 / 0.6), transparent) 0 0 / 160px 160px, radial-gradient(1px 1px at 130px 50px, oklch(1 0 0 / 0.5), transparent) 0 0 / 160px 160px, radial-gradient(60% 50% at 70% 0%, oklch(0.4 0.12 280 / 0.6), transparent 70%), linear-gradient(180deg, oklch(0.17 0.05 270), oklch(0.09 0.02 270))",
  },
  {
    id: "grid",
    label: "Cuadrícula",
    css: (accent) =>
      `linear-gradient(oklch(1 0 0 / 0.05) 1px, transparent 1px) 0 0 / 44px 44px, linear-gradient(90deg, oklch(1 0 0 / 0.05) 1px, transparent 1px) 0 0 / 44px 44px, radial-gradient(60% 45% at 50% 0%, color-mix(in oklch, ${accent} 40%, transparent), transparent 70%), oklch(0.13 0.01 264)`,
  },
  {
    id: "peach",
    label: "Durazno",
    css: () =>
      "radial-gradient(60% 50% at 20% 10%, oklch(0.7 0.12 50 / 0.45), transparent 70%), linear-gradient(140deg, oklch(0.4 0.1 35), oklch(0.29 0.09 5) 55%, oklch(0.19 0.05 330))",
  },
  {
    id: "accent",
    label: "Mi color",
    css: (accent) =>
      `radial-gradient(70% 60% at 15% 0%, color-mix(in oklch, ${accent} 55%, transparent), transparent 70%), radial-gradient(60% 55% at 95% 100%, color-mix(in oklch, ${accent} 35%, transparent), transparent 70%), oklch(0.14 0.015 264)`,
  },
  { id: "plain", label: "Liso", css: () => "var(--background)" },
];

export const FONTS: Record<PersonalTheme["font"], { label: string; css: string }> = {
  sans: { label: "Moderna", css: "inherit" },
  serif: {
    label: "Elegante",
    css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  },
  mono: { label: "Técnica", css: 'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace' },
  rounded: {
    label: "Suave",
    css: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif',
  },
};

export const ACCENT_PRESETS = [300, 330, 15, 45, 85, 150, 195, 250];

export const accentOf = (t: PersonalTheme) => `oklch(0.72 ${t.accent.chroma} ${t.accent.hue})`;

/** Tarjeta de cristal (deja ver el fondo, desenfocado) o sólida. */
export function cardStyle(t: PersonalTheme): CSSProperties {
  return t.card === "glass"
    ? {
        background: `color-mix(in oklch, var(--card) ${Math.round(t.cardOpacity * 100)}%, transparent)`,
        backdropFilter: "blur(18px) saturate(1.25)",
        WebkitBackdropFilter: "blur(18px) saturate(1.25)",
        border: "1px solid oklch(1 0 0 / 0.09)",
        boxShadow: "0 10px 40px oklch(0 0 0 / 0.35)",
      }
    : { background: "var(--card)", border: "1px solid var(--border)" };
}

/** Qué es un enlace de regalo, para mostrarlo bonito: "Reel de Instagram". */
export function linkInfo(raw: string): { href: string; label: string; icon: LucideIcon } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host = "";
  let path = "";
  try {
    const u = new URL(href);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return null;
  }
  const is = (name: string) => host === name || host.endsWith(`.${name}`);
  if (is("instagram.com"))
    return {
      href,
      label: /\/(reel|reels)\//.test(path) ? "Reel de Instagram" : "Instagram",
      icon: Instagram,
    };
  if (is("tiktok.com")) return { href, label: "TikTok", icon: Film };
  if (is("youtube.com") || is("youtu.be")) return { href, label: "YouTube", icon: Youtube };
  const shops: [string, string][] = [
    ["amazon", "Amazon"],
    ["mercadolibre", "Mercado Libre"],
    ["aliexpress", "AliExpress"],
    ["shein", "Shein"],
    ["temu", "Temu"],
    ["etsy", "Etsy"],
    ["ebay", "eBay"],
  ];
  const shop = shops.find(([key]) => host.includes(key));
  if (shop) return { href, label: shop[1], icon: ShoppingBag };
  return { href, label: host, icon: Link2 };
}

/** "Hoy", "Mañana", "Vie 24 oct" o "Vencida · hace 2 días". */
export function deadlineInfo(day: string): { text: string; tone: "late" | "soon" | "later" } {
  const n = diffDays(day, todayIso());
  if (n < 0) return { text: `Vencida · hace ${-n} día${n === -1 ? "" : "s"}`, tone: "late" };
  if (n === 0) return { text: "Hoy", tone: "soon" };
  if (n === 1) return { text: "Mañana", tone: "soon" };
  const text = fromIso(day)
    .toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })
    .replace(/[.,]/g, "");
  return { text: text.charAt(0).toUpperCase() + text.slice(1), tone: n <= 3 ? "soon" : "later" };
}
