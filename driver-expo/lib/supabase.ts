import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !key) {
  console.warn(
    "Set EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY di driver-expo/.env"
  );
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    // Refresh manual + sync dari WebView — hindari bentrok rotasi token.
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function getDriverBaseUrl() {
  const driverUrl =
    process.env.EXPO_PUBLIC_DRIVER_URL ?? "https://www.wirakuliner.web.id/driver";
  try {
    const u = new URL(driverUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://www.wirakuliner.web.id";
  }
}

/** Langsung ke app-entry — bridge HTML tidak diperlukan di APK native. */
export function getAppEntryUrl() {
  return `${getDriverBaseUrl()}/driver/app-entry`;
}

export async function validateDriverSession(session: Session): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profile?.role !== "driver") {
    return "Akun ini bukan driver. Hubungi admin WIRA Kuliner.";
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  if (!driver) {
    return "Profil driver belum aktif. Minta admin mendaftarkan Anda.";
  }

  return null;
}
