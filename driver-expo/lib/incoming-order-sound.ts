import { Audio, InterruptionModeAndroid } from "expo-av";

/** Alarm keras — diputar berulang agar driver tidak melewatkan order. */
const ORDER_SOUND_URI =
  "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg";

const REPEAT_COUNT = 3;
const REPEAT_GAP_MS = 900;

let playing = false;

async function playOnce(): Promise<void> {
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: ORDER_SOUND_URI },
    { shouldPlay: true, volume: 1, isLooping: false }
  );

  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync().finally(resolve);
      }
    });
  });
}

/** Notifikasi order masuk — native APK (lebih keras dari Web Audio di WebView). */
export async function playNativeIncomingOrderSound(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    for (let i = 0; i < REPEAT_COUNT; i++) {
      await playOnce();
      if (i < REPEAT_COUNT - 1) {
        await new Promise((r) => setTimeout(r, REPEAT_GAP_MS));
      }
    }
  } catch {
    /* ignore */
  } finally {
    playing = false;
  }
}
