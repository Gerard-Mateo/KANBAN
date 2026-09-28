// Conversión entre hex sRGB y OKLCH (matrices de Björn Ottosson). La usa el
// color de los tipos personalizados para guardarse en el Excel como un hex
// normal y volver a leerse sin perder el tono.

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055;

export function hexToOklch(hex: string): { l: number; c: number; h: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let v = m[1]!;
  if (v.length === 3) v = [...v].map((ch) => ch + ch).join("");
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(v.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

export function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const [L3, M3, S3] = [l_ ** 3, m_ ** 3, s_ ** 3];

  const rgb = [
    4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3,
    -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3,
    -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3,
  ];
  return (
    "#" +
    rgb
      .map((x) => {
        const v = Math.round(Math.min(1, Math.max(0, linearToSrgb(x))) * 255);
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
}
