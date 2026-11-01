import {
  groupLabels,
  outletsByGroup,
  thresholds,
  type Group,
} from "@/lib/config";
import { runAbsenceCheck, type AbsenceEvidence } from "@/lib/tinyfish";
import type { BlindSpotFinding, OutletReport } from "@/lib/analysis/types";

export const GROUPS: Group[] = ["left", "center", "right"];

export type Coverage = Record<Group, { covered: number; monitored: number }>;

export function computeCoverage(reports: OutletReport[]): Coverage {
  const coverage: Coverage = {
    left: { covered: 0, monitored: 0 },
    center: { covered: 0, monitored: 0 },
    right: { covered: 0, monitored: 0 },
  };

  for (const report of reports) {
    coverage[report.group].monitored += 1;
    if (report.covered) coverage[report.group].covered += 1;
  }

  return coverage;
}

export type GateDecision = {
  group: Group;
  status: "candidate" | "quiet";
  reason: string;
  omission_index: number;
  overall_coverage: number;
  claim_support: number;
  /** Best other group's coverage, used in the descriptive sentence. */
  comparison: { group: Group; covered: number; monitored: number } | null;
};

export function gateBlindSpots(input: {
  coverage: Coverage;
  consensusFacts: number;
  totalClaims: number;
}): GateDecision[] {
  const { coverage, consensusFacts, totalClaims } = input;

  const coveredTotal = GROUPS.reduce(
    (sum, group) => sum + coverage[group].covered,
    0,
  );
  const monitoredTotal = GROUPS.reduce(
    (sum, group) => sum + coverage[group].monitored,
    0,
  );
  const overall = monitoredTotal === 0 ? 0 : coveredTotal / monitoredTotal;
  const claimSupport = totalClaims === 0 ? 0 : consensusFacts / totalClaims;

  return GROUPS.map((group) => {
    const own = coverage[group];
    const others = GROUPS.filter((other) => other !== group);
    const best = others
      .map((other) => ({ group: other, ...coverage[other] }))
      .sort(
        (a, b) =>
          b.covered / Math.max(1, b.monitored) -
          a.covered / Math.max(1, a.monitored),
      )[0];

    const bestRate = best ? best.covered / Math.max(1, best.monitored) : 0;
    const ownRate = own.covered / Math.max(1, own.monitored);
    const omission =
      bestRate === 0 ? 0 : Math.min(1, Math.max(0, 1 - ownRate / bestRate));

    const base = {
      group,
      omission_index: Number(omission.toFixed(3)),
      overall_coverage: Number(overall.toFixed(3)),
      claim_support: Number(claimSupport.toFixed(3)),
      comparison: best ? { group: best.group, covered: best.covered, monitored: best.monitored } : null,
    };

    const quiet = (reason: string): GateDecision => ({
      ...base,
      status: "quiet",
      reason,
    });

    if (own.monitored === 0) {
      return quiet(`No monitored outlets in the ${groupLabels[group]} group.`);
    }
    if (bestRate === 0) {
      return quiet(
        "No other group covered this event, so there is nothing to compare against.",
      );
    }
    if (coveredTotal < 2) {
      return quiet(
        "Fewer than two outlets covered this event; a coverage comparison is not meaningful.",
      );
    }
    if (overall < thresholds.overall_coverage_threshold) {
      return quiet(
        `Overall coverage is ${(overall * 100).toFixed(0)}%, below the ${
          thresholds.overall_coverage_threshold * 100
        }% gate.`,
      );
    }
    if (omission < thresholds.omission_threshold) {
      return quiet(
        `Omission index ${omission.toFixed(2)} is below the ${
          thresholds.omission_threshold
        } gate.`,
      );
    }
    if (claimSupport < thresholds.diversity_threshold) {
      return quiet(
        `Shared-fact ratio ${claimSupport.toFixed(2)} is below the ${
          thresholds.diversity_threshold
        } gate, so coverage is too fragmented for an omission finding.`,
      );
    }

    return {
      ...base,
      status: "candidate",
      reason: "All coverage gates passed. Verification with the outlet's own site search is required.",
    };
  });
}

function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}

function describe(options: {
  group: Group;
  own: { covered: number; monitored: number };
  comparison: { group: Group; covered: number; monitored: number } | null;
  checkedAt: string;
}): string {
  const when = formatCheckedAt(options.checkedAt);
  const own = `${options.own.covered} of ${options.own.monitored} ${groupLabels[
    options.group
  ].toLowerCase()} outlets covered this event`;
  const other = options.comparison
    ? `${options.comparison.covered} of ${options.comparison.monitored} ${groupLabels[
        options.comparison.group
      ].toLowerCase()} outlets did`
    : "no comparison group covered it";

  return `No matching article was found by outlet search and on-site search on ${when}. ${own}; ${other}. This is a searchable-coverage finding for this time window, not a statement about intent.`;
}

/**
 * Run the mandatory TinyFish absence check for every outlet in a candidate
 * group. A notice is raised only when the on-site search came back cleanly
 * empty for all of them; anything else is reported as inconclusive.
 */
export async function verifyBlindSpot(options: {
  decision: GateDecision;
  coverage: Coverage;
  eventQuery: string;
}): Promise<BlindSpotFinding> {
  const { decision, coverage, eventQuery } = options;
  const group = decision.group;
  const groupOutlets = outletsByGroup[group];
  const checkedAt = new Date().toISOString();

  const results = await Promise.all(
    groupOutlets.map((outlet) =>
      runAbsenceCheck({
        outlet,
        eventQuery,
        searchResultsRelevant: 0,
      }).catch((error: unknown) => ({
        status: "inconclusive" as const,
        evidence: {
          outlet: outlet.name,
          group: outlet.group,
          checked_at: checkedAt,
          search_query: eventQuery,
          search_results_relevant: 0,
          onsite_results_found: -1,
          onsite_search_available: false,
          searched_url: null,
          run_id: null,
          screenshot_url: null,
          notes:
            error instanceof Error
              ? `Absence check failed: ${error.message.slice(0, 160)}`
              : "Absence check failed",
        } satisfies AbsenceEvidence,
      })),
    ),
  );

  const evidence = results.map((result) => result.evidence);
  const allAbsent = results.every((result) => result.status === "absent");

  const notes = results
    .filter((result) => result.status !== "absent")
    .map(
      (result) =>
        `${result.evidence.outlet}: ${result.evidence.notes || result.status}`,
    );

  if (!allAbsent) {
    return {
      group,
      status: "inconclusive",
      omission_index: decision.omission_index,
      overall_coverage: decision.overall_coverage,
      claim_support: decision.claim_support,
      coverage: coverage[group],
      description:
        "Coverage check inconclusive: the outlet's own site search did not return a clean empty result for every outlet in this group, so no blind-spot notice is raised.",
      evidence,
      notes,
    };
  }

  return {
    group,
    status: "notice",
    omission_index: decision.omission_index,
    overall_coverage: decision.overall_coverage,
    claim_support: decision.claim_support,
    coverage: coverage[group],
    description: describe({
      group,
      own: coverage[group],
      comparison: decision.comparison,
      checkedAt: evidence[0]?.checked_at ?? checkedAt,
    }),
    evidence,
    notes,
  };
}
