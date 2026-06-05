import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Detail pesanan untuk customer (pelacakan). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-get", RATE_LIMITS.api);
  if (rl) return rl;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "Pesanan tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (order.customer_id !== session.user.id) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  let driverPos: { lat: number; lng: number } | null = null;
  let driverInfo: {
    id: string;
    name: string;
    phone: string;
    vehicle_plate: string | null;
    photo_url: string | null;
    lat: number | null;
    lng: number | null;
  } | null = null;

  if (order.driver_id) {
    const { data: driver } = await admin
      .from("drivers")
      .select("id, name, phone, vehicle_plate, photo_url, current_lat, current_lng")
      .eq("id", order.driver_id)
      .single();
    if (driver) {
      driverInfo = {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicle_plate: driver.vehicle_plate,
        photo_url: driver.photo_url,
        lat: driver.current_lat,
        lng: driver.current_lng,
      };
      if (driver.current_lat != null && driver.current_lng != null) {
        driverPos = { lat: driver.current_lat, lng: driver.current_lng };
      }
    }
  }

  return secureJsonResponse({ order, driverPos, driverInfo });
}
