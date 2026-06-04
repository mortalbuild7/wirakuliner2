import { NextResponse } from "next/server";

/**
 * Optional webhook bridge: Supabase Database Webhook → this route → Edge Function
 * Or invoke Edge Function directly from Supabase dashboard on orders UPDATE.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-driver-push`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
