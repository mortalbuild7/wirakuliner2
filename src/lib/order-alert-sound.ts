let audioUnlocked = false;

type OscillatorTypeName = OscillatorType;

/** Buka audio setelah interaksi user (wajib di browser & WebView). */
export async function unlockOrderAlertAudio(): Promise<void> {
  if (audioUnlocked || typeof window === "undefined") return;
  try {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    await ctx.close();
    audioUnlocked = true;
  } catch {
    /* ignore */
  }
}

export function isOrderAlertAudioUnlocked(): boolean {
  return audioUnlocked;
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

function vibrateOrderAlert(): void {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 120, 200, 120, 200, 120, 400]);
    }
  } catch {
    /* ignore */
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startSec: number,
  durationSec: number,
  volume: number,
  wave: OscillatorTypeName = "square"
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime + startSec;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.min(volume, 1), t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/** Satu rangkaian nada peringatan (keras, 4 beep naik). */
function playAlertBurst(ctx: AudioContext, offsetSec: number, peakVolume: number) {
  const v = peakVolume;
  playTone(ctx, 740, offsetSec + 0, 0.2, v, "square");
  playTone(ctx, 920, offsetSec + 0.24, 0.2, v, "square");
  playTone(ctx, 1100, offsetSec + 0.48, 0.22, v, "square");
  playTone(ctx, 1380, offsetSec + 0.74, 0.28, Math.min(v + 0.05, 1), "square");
}

/**
 * Suara peringatan order — volume tinggi, diulang beberapa kali agar terdengar di toko/APK.
 */
export async function playOrderAlertSound(options?: {
  /** Jumlah rangkaian beep */
  repeats?: number;
  /** Volume puncak 0–1 */
  volume?: number;
  /** Kirim ke native APK driver (jika WebView) */
  notifyNative?: boolean;
}): Promise<void> {
  if (typeof window === "undefined") return;

  const repeats = options?.repeats ?? 3;
  const volume = options?.volume ?? 0.95;

  vibrateOrderAlert();

  if (options?.notifyNative !== false) {
    const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
      .ReactNativeWebView;
    if (rn) {
      try {
        rn.postMessage(JSON.stringify({ type: "WIRA_INCOMING_ORDER" }));
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return;

    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const burstGap = 1.15;
    for (let i = 0; i < repeats; i++) {
      playAlertBurst(ctx, i * burstGap, volume);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, repeats * burstGap * 1000 + 600);
  } catch {
    /* WebView kadang blok audio sebelum interaksi user */
  }
}

/** Merchant: pesanan baru masuk (paid / menunggu bayar di tempat). */
export async function playMerchantNewOrderSound(): Promise<void> {
  return playOrderAlertSound({ repeats: 3, volume: 0.98, notifyNative: false });
}

/** Driver: penawaran order masuk (browser — APK memakai notifikasi status bar). */
export async function playDriverIncomingOrderSound(): Promise<void> {
  if (typeof window !== "undefined") {
    const w = window as Window & {
      ReactNativeWebView?: unknown;
      __WIRA_APK_WEBVIEW__?: boolean;
    };
    if (w.ReactNativeWebView || w.__WIRA_APK_WEBVIEW__) return;
  }
  return playOrderAlertSound({ repeats: 3, volume: 0.98, notifyNative: true });
}
