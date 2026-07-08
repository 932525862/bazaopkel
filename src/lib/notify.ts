import { toast } from "sonner";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioCtx = new Ctx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function playNotificationSound() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;

    const playBell = (freq: number, startTime: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.value = freq;

      osc2.type = "triangle";
      osc2.frequency.value = freq * 2.01;

      // Crisp attack and exponential decay for a "chime" or "bell" feel
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + 0.6);
      osc2.stop(startTime + 0.6);
    };

    // Modern 3-note rising sequence (like iPhone Tri-tone / Note)
    playBell(587.33, now);        // D5
    playBell(739.99, now + 0.12); // F#5
    playBell(880.00, now + 0.24); // A5
  } catch {
    /* ignore */
  }
}

export function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  
  const fire = () => {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  };

  if (Notification.permission === "granted") {
    fire();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        fire();
      }
    });
  }
}

type Opts = Parameters<typeof toast>[1];

export const notify = {
  success: (msg: string, opts?: Opts) => {
    playNotificationSound();
    return toast.success(msg, opts);
  },
  error: (msg: string, opts?: Opts) => {
    playNotificationSound();
    return toast.error(msg, opts);
  },
  warning: (msg: string, opts?: Opts) => {
    playNotificationSound();
    return toast.warning(msg, opts);
  },
  info: (msg: string, opts?: Opts) => {
    playNotificationSound();
    return toast.info(msg, opts);
  },
};

// Unlock audio on first user interaction (browser autoplay policy)
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}
