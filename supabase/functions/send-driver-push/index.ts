/**
 * WIRA Kuliner — Supabase Edge Function
 * FCM: nego luar radius, order delivery paid, siap diambil
 *
 * Deploy: supabase functions deploy send-driver-push
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";

const FCM_URL = "https://fcm.googleapis.com/v1/projects";

interface OrderPayload {
  id: string;
  order_status?: string;
  is_outside_radius?: boolean;
  negotiation_status?: string;
  delivery_address: string;
  driver_id?: string | null;
  merchants?: { name: string } | { name: string }[] | null;
}

interface WebhookBody {
  type?: "negotiation" | "delivery_paid" | "ready_for_pickup";
  record: OrderPayload;
}

function isOnsite(addr: string) {
  return addr.startsWith("[DI TEMPAT]") || addr.startsWith("[POS]");
}

function normalizePrivateKeyPem(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/^["']|["']$/g, "").trim();
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const pem = normalizePrivateKeyPem(privateKey);
  const key = await importPKCS8(pem, "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`FCM OAuth failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function sendFcm(
  token: string,
  projectId: string,
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>
) {
  const res = await fetch(`${FCM_URL}/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data,
      },
    }),
  });
  return res.json();
}

function merchantName(record: OrderPayload): string {
  const m = record.merchants;
  if (!m) return "Toko";
  if (Array.isArray(m)) return m[0]?.name ?? "Toko";
  return m.name ?? "Toko";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const body = (await req.json()) as WebhookBody | OrderPayload;
    const record: OrderPayload =
      "record" in body && body.record ? body.record : (body as OrderPayload);
    const notifyType =
      "type" in body && body.type ? body.type : undefined;

    const isNego =
      record.is_outside_radius === true &&
      record.negotiation_status === "negotiating";

    const isDeliveryPaid =
      (notifyType === "delivery_paid" || record.order_status === "paid") &&
      !record.is_outside_radius &&
      record.negotiation_status !== "negotiating" &&
      !isOnsite(record.delivery_address);

    const isReadyPickup =
      notifyType === "ready_for_pickup" ||
      record.order_status === "ready_for_pickup";

    if (!isNego && !isDeliveryPaid && !isReadyPickup) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const projectId = Deno.env.get("FCM_PROJECT_ID");
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FCM_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!projectId || !clientEmail || !privateKey) {
      return new Response(
        JSON.stringify({ error: "FCM secrets not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    const results = [];

    if (isReadyPickup && record.driver_id) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("id, fcm_token, name")
        .eq("id", record.driver_id)
        .maybeSingle();

      if (driver?.fcm_token) {
        const r = await sendFcm(
          accessToken,
          projectId,
          driver.fcm_token,
          "Pesanan siap diambil",
          `${merchantName(record)} — ambil pesanan sekarang`,
          { order_id: record.id, type: "ready_for_pickup" }
        );
        results.push({ driver_id: driver.id, result: r });
      }

      return new Response(JSON.stringify({ sent: results.length, results }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, fcm_token, name")
      .eq("status", "idle")
      .not("fcm_token", "is", null);

    for (const d of drivers ?? []) {
      if (!d.fcm_token) continue;

      let title = "Order baru — WIRA Kuliner";
      let bodyMsg = `Pesanan antar: ${record.delivery_address}`;
      let dataType = "delivery_paid";

      if (isNego) {
        title = "Order Nego — WIRA Kuliner";
        bodyMsg = `Pesanan di luar radius 3km: ${record.delivery_address}`;
        dataType = "negotiation";
      }

      const r = await sendFcm(
        accessToken,
        projectId,
        d.fcm_token,
        title,
        bodyMsg,
        { order_id: record.id, type: dataType }
      );
      results.push({ driver_id: d.id, result: r });
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
