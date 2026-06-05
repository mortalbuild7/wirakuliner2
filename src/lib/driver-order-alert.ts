/** Notifikasi suara + getar saat pesanan masuk ke driver. */
export async function playDriverIncomingOrderSound(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([120, 80, 120, 80, 200]);
    }
  } catch {
    /* ignore */
  }

  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (rn) {
    try {
      rn.postMessage(JSON.stringify({ type: "WIRA_INCOMING_ORDER" }));
    } catch {
      /* ignore */
    }
  }

  try {
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const playTone = (freq: number, startSec: number, durationSec: number, volume = 0.4) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime + startSec;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.start(t0);
      osc.stop(t0 + durationSec + 0.02);
    };

    // Pola ding-ding-ding (seperti notifikasi order)
    playTone(880, 0, 0.14, 0.45);
    playTone(988, 0.2, 0.14, 0.45);
    playTone(1175, 0.4, 0.22, 0.5);

    window.setTimeout(() => {
      void ctx.close();
    }, 900);
  } catch {
    /* WebView kadang blok audio sebelum interaksi user */
  }
}
