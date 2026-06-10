/** Notifikasi browser + suara pendek saat pesan chat baru masuk. */

async function requestNotificationPermission(): Promise<void> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

function getAudioContextCtor():
  | (typeof AudioContext)
  | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/** Satu nada pendek — tidak sekeras alert order. */
export async function playChatMessageSound(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.start(t0);
    osc.stop(t0 + 0.2);

    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

export function showChatBrowserNotification(opts: {
  orderId: string;
  title: string;
  body: string;
}): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(opts.title, {
      body: opts.body,
      icon: "/icon.png",
      tag: `wira-chat-${opts.orderId}`,
    });
  } catch {
    /* ignore */
  }
}

export async function notifyIncomingChatMessage(opts: {
  orderId: string;
  peerLabel: string;
  preview: string;
  onChatPage: boolean;
}): Promise<void> {
  if (opts.onChatPage) return;

  void playChatMessageSound();

  if (typeof document !== "undefined" && document.hidden) {
    await requestNotificationPermission();
    showChatBrowserNotification({
      orderId: opts.orderId,
      title: `Pesan baru dari ${opts.peerLabel}`,
      body: opts.preview.slice(0, 120) || "Buka chat untuk membaca",
    });
  }
}
