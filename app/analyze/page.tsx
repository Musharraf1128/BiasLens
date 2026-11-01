import Workbench from "@/components/workbench";
import { listDemoStories } from "@/lib/analysis/demo";
import { groupLabels, outlets, thresholds } from "@/lib/config";
import { getLlmConfig, tinyfishConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>;
}) {
  const llm = getLlmConfig();
  const stories = await listDemoStories();
  const params = await searchParams;
  const initialInput = typeof params.input === "string" ? params.input : undefined;

  return (
    <Workbench
      initialInput={initialInput}
      outlets={outlets.map((outlet) => ({
        id: outlet.id,
        name: outlet.name,
        domain: outlet.domain,
        group: outlet.group,
        rating_source: outlet.rating_source,
        rating_url: outlet.rating_url,
      }))}
      groupLabels={groupLabels}
      stories={stories}
      tinyfishConfigured={tinyfishConfigured()}
      llm={{ mode: llm.mode, model: llm.model, reason: llm.reason }}
      consensusShare={thresholds.consensus_share}
      searchWindowDays={thresholds.search_window_minutes / 1440}
      slantLabelThreshold={thresholds.slant_label_threshold}
    />
  );
}
