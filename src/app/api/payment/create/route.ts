import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Midtrans Snap token stub — replace with real Snap API using MIDTRANS_SERVER_KEY
 */
export async function POST(req: Request) {
  const { orderId, grossAmount } = await req.json();
  const supabase = await createClient();
  const snapToken = `SNAP_STUB_${orderId}_${grossAmount}`;

  await supabase.from("orders").update({ snap_token: snapToken }).eq("id", orderId);

  return NextResponse.json({ snap_token: snapToken });
}
