import { NextResponse } from "next/server";

import {
  groupLabels,
  outletsByGroup,
  thresholds,
} from "@/lib/config";
import { getCacheDir } from "@/lib/cache";
import { getLlmConfig, tinyfishConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const llm = getLlmConfig();

  return NextResponse.json({
    ok: true,
    service: "biaslens",
    timestamp: new Date().toISOString(),
    integrations: {
      tinyfish: tinyfishConfigured() ? "configured" : "missing",
      llm: {
        mode: llm.mode,
        configured: llm.configured,
        model: llm.model,
        reason: llm.reason,
      },
    },
    config: {
      outlets: {
        total: Object.values(outletsByGroup).flat().length,
        groups: {
          left: {
            label: groupLabels.left,
            count: outletsByGroup.left.length,
          },
          center: {
            label: groupLabels.center,
            count: outletsByGroup.center.length,
          },
          right: {
            label: groupLabels.right,
            count: outletsByGroup.right.length,
          },
        },
      },
      thresholds: {
        consensus_share: thresholds.consensus_share,
        search_window_minutes: thresholds.search_window_minutes,
        omission_threshold: thresholds.omission_threshold,
        overall_coverage_threshold: thresholds.overall_coverage_threshold,
        diversity_threshold: thresholds.diversity_threshold,
      },
    },
    cache_dir: getCacheDir(),
  });
}
