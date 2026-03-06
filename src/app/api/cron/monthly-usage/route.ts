import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: S12 — usage calculation + Stripe overage billing
  console.log("[CRON] monthly-usage: placeholder — Stripe billing pending");
  return NextResponse.json({ ok: true, message: "placeholder" });
}
