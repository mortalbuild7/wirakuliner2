import { Audio } from "expo-av";

/** Notifikasi order masuk — diputar native di APK (lebih andal dari Web Audio di WebView). */
const ORDER_SOUND_URI =
  "https://actions.google.com/sounds/v1/alarms/medium_bell_ringing_near.ogg";

let playing = false;

export async function playNativeIncomingOrderSound(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: ORDER_SOUND_URI },
      { shouldPlay: true, volume: 1 }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
        playing = false;
      }
    });
  } catch {
    playing = false;
  }
}
