# WIRA Driver — APK Android (Capacitor)

Shell native Android yang memuat `https://wirakuliner.web.id/driver` + FCM + GPS.

## Prasyarat

- Node.js 20+
- Android Studio + JDK 17
- `google-services.json` dari Firebase (package: `id.web.wirakuliner.driver`)

## Setup

```powershell
cd driver-app
npm install
copy "%USERPROFILE%\Downloads\google-services (1).json" google-services.json
npx cap add android
npm run copy:firebase
npm run sync
npm run open
```

Di Android Studio: **Build → Build APK(s)**.

APK debug: `android/app/build/outputs/apk/debug/app-debug.apk`

## Dev lokal (opsional)

```powershell
$env:WIRA_DRIVER_SERVER_URL="http://10.0.2.2:3000/driver"
npm run sync
```

## Deploy web dulu

Fitur FCM/GPS native ada di bundle Next.js — deploy ke Vercel sebelum test APK:

```powershell
cd ..
npx vercel --prod
```
