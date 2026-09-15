/** Sonidos y notificaciones del Pomodoro (Web Audio + Notification API). */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain = 0.12, type: OscillatorType = "square") {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

/** Clic mecánico tipo teclado: golpe seco + "thock" grave. */
export function playClick() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;

  // Ruido corto filtrado = el "clack" del switch.
  const len = Math.floor(ac.sampleRate * 0.045);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2600, t);
  bp.Q.value = 1.1;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(bp).connect(ng).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.06);

  // Cuerpo grave: la tecla tocando fondo.
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.09);
}

/** Tic sutil al girar el reloj. */
export function playTick() {
  tone(1200, 0, 0.025, 0.04, "square");
}

/** Alarma de fin de sesión. */
export function playAlarm() {
  [0, 0.22, 0.44].forEach((t) => {
    tone(660, t, 0.16, 0.14, "square");
    tone(990, t + 0.06, 0.16, 0.1, "square");
  });
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function sendNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: "pomodoro" });
  } catch {
    /* ignore */
  }
}
