import { NextResponse } from "next/server";

/** Fonnte / Wablas WhatsApp API stub */
export async function POST(req: Request) {
  const { orderId } = await req.json();
  return NextResponse.json({
    ok: true,
    stub: true,
    message: `WhatsApp receipt for order ${orderId} — configure WA gateway token`,
  });
}
