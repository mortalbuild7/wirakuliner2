# WIRA Driver — Test via Expo

WebView ke `https://wirakuliner.web.id/driver` untuk test cepat di **Expo Go**.

## Test di HP (Expo Go) — paling cepat

1. Install **Expo Go** dari Play Store
2. PC & HP satu jaringan WiFi

```powershell
cd driver-expo
npm install
npx expo install react-native-webview react-native-safe-area-context expo-location
copy .env.example .env
npx expo start
```

3. Scan QR code di terminal dengan Expo Go (Android)

## Test dengan tunnel (WiFi beda jaringan)

```powershell
npx expo start --tunnel
```

## Build APK via EAS (Expo cloud)

```powershell
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Download APK dari link EAS setelah build selesai.

## Dev lokal (Next.js di PC)

```powershell
# Terminal 1
cd ..
npm run dev

# Terminal 2 — ganti IP PC di .env
# EXPO_PUBLIC_DRIVER_URL=http://192.168.x.x:3000/driver
cd driver-expo
npx expo start
```

## Catatan FCM

Expo Go **tidak** memakai FCM Android native. Push penuh butuh:
- `driver-app/` (Capacitor), atau
- `eas build --profile development` + expo-notifications

Untuk test UI/login/order, Expo Go + WebView sudah cukup.
