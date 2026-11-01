import { NextResponse } from "next/server";
import { z } from "zod";

import { getOutlet, thresholds } from "@/lib/config";
import { TinyFishError, searchOutletCoverage } from "@/lib/tinyfish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  outletId: z.string().min(1),
  query: z.string().min(2).max(200),
  recencyMinutes: z.number().int().min(1).max(5_256_000).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const outlet = getOutlet(parsed.data.outletId);
  if (!outlet) {
    return NextResponse.json({ error: "unknown_outlet" }, { status: 404 });
  }

  try {
    const result = await searchOutletCoverage({
      outlet,
      query: parsed.data.query,
      recencyMinutes:
        parsed.data.recencyMinutes ?? thresholds.search_window_minutes,
    });

    return NextResponse.json({
      outlet: {
        id: outlet.id,
        name: outlet.name,
        domain: outlet.domain,
        group: outlet.group,
      },
      ...result,
    });
  } catch (error) {
    if (error instanceof TinyFishError) {
      const status = error.status === 401 ? 503 : 502;
      return NextResponse.json(
        {
          error: "tinyfish_error",
          upstream_status: error.status,
          message:
            error.status === 401
              ? "TINYFISH_API_KEY is missing or invalid"
              : error.message,
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        error: "tinyfish_unavailable",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
