import { NextResponse } from "next/server";

/** Resend API stub — set RESEND_API_KEY in Vercel */
export async function POST(req: Request) {
  const { orderId, to } = await req.json();
  return NextResponse.json({
    ok: true,
    stub: true,
    message: `Email receipt for order ${orderId} to ${to ?? "customer"} — configure Resend`,
  });
}
