import { NextRequest, NextResponse } from "next/server";
import { autoGenerateForAllTenants } from "@/modules/cashflows/actions";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoGenerateForAllTenants();

    console.log(
      `[cron/generate-cf] Processed ${result.tenantsProcessed} tenants, ` +
      `generated ${result.totalGenerated} cashflows`
    );

    return NextResponse.json({
      ok: true,
      tenantsProcessed: result.tenantsProcessed,
      totalGenerated: result.totalGenerated,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[cron/generate-cf] Error:", err);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
