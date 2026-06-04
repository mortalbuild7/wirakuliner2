/**
 * WIRA Kuliner — Supabase Edge Function
 * Triggers on order updates: outside radius + negotiating → FCM to idle drivers
 *
 * Deploy: supabase functions deploy send-driver-push
 * Secrets: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (service account)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FCM_URL = "https://fcm.googleapis.com/v1/projects";

interface OrderPayload {
  id: string;
  is_outside_radius: boolean;
  negotiation_status: string;
  delivery_address: string;
}

interface WebhookBody {
  type: "INSERT" | "UPDATE";
  table: string;
  record: OrderPayload;
  old_record?: OrderPayload;
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const payload = btoa(JSON.stringify(claim));
  const toSign = `${header}.${payload}`;

  const pem = privateKey.replace(/\\n/g, "\n");
  const keyData = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v5",
    cryptoKey,
    new TextEncoder().encode(toSign)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${toSign}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("FCM OAuth failed");
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
  const res = await fetch(
    `${FCM_URL}/${projectId}/messages:send`,
    {
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
    }
  );
  return res.json();
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

    const shouldNotify =
      record.is_outside_radius === true &&
      record.negotiation_status === "negotiating";

    if (!shouldNotify) {
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
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, fcm_token, name")
      .eq("status", "idle")
      .not("fcm_token", "is", null);

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    const results = [];

    for (const d of drivers ?? []) {
      if (!d.fcm_token) continue;
      const r = await sendFcm(
        accessToken,
        projectId,
        d.fcm_token,
        "Order Nego — WIRA Kuliner",
        `Pesanan di luar radius 3km: ${record.delivery_address}`,
        { order_id: record.id, type: "negotiation" }
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
