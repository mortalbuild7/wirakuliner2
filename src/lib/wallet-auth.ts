import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { createClient } from "@/lib/supabase/server";
import type { WalletOwnerType } from "@/lib/wallet";

export type WalletOwnerContext = {
  ownerType: WalletOwnerType;
  ownerId: string;
  role: "customer" | "driver" | "merchant";
};

export async function resolveWalletOwner(
  req?: Request
): Promise<WalletOwnerContext | { error: string; status: number }> {
  const driverAuth = await getAuthDriverFromRequest(req);
  if (!("error" in driverAuth)) {
    return {
      ownerType: "driver",
      ownerId: driverAuth.driver.id,
      role: "driver",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum login", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "merchant") {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!merchant) {
      return { error: "Merchant tidak ditemukan", status: 404 };
    }

    return {
      ownerType: "merchant",
      ownerId: merchant.id,
      role: "merchant",
    };
  }

  return {
    ownerType: "customer",
    ownerId: user.id,
    role: "customer",
  };
}
