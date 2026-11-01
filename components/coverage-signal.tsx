import type { TopNewsFeed } from "@/lib/top-news-schema";

const groupStyles = {
  left: { label: "Government-critical", bar: "bg-teal" },
  center: { label: "Mixed", bar: "bg-paper/70" },
  right: { label: "Government-aligned", bar: "bg-amber" },
} as const;

const groupOrder = ["left", "center", "right"] as const;

export default function CoverageSignal({
  story,
}: {
  story: TopNewsFeed["stories"][number] | null;
}) {
  const title = story?.title ?? "One event, many frames";
  const sources = story?.sources.slice(0, 3) ?? [];

  return (
    <div className="coverage-signal relative overflow-hidden border border-ink bg-ink text-paper">
      <div className="coverage-signal-grid absolute inset-0 opacity-35" aria-hidden="true" />
      <div className="coverage-signal__scan absolute left-0 top-0 h-px w-full bg-amber" aria-hidden="true" />
      <div className="relative min-h-[360px] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 font-mono text-[9px] tracking-[0.14em] text-paper/60">
          <span>FIELD NOTE / {story ? `${story.outlet_count} SOURCES` : "LIVE MAP"}</span>
          <span className="text-amber">BIASLENS 01</span>
        </div>

        <div className="mt-8 max-w-[18rem]">
          <p className="font-mono text-[9px] tracking-[0.16em] text-teal-bright">THE COVERAGE SIGNAL</p>
          <h2 className="mt-3 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] leading-[0.82] tracking-[-0.045em]">
            Same event.
            <br />
            <span className="text-amber">Different emphasis.</span>
          </h2>
        </div>

        <div className="relative mt-6 h-[98px]">
          <div className="coverage-signal__axis absolute left-1/2 top-1/2 h-px w-[78%] -translate-x-1/2 bg-paper/25" aria-hidden="true" />
          {sources.map((source, index) => (
            <div
              key={`${source.outlet_id}-${source.url}`}
              className={`absolute left-1/2 w-[82%] -translate-x-1/2 border border-paper/30 bg-ink/95 px-3 py-1.5 shadow-[4px_4px_0_rgba(197,138,45,0.22)] ${index === 0 ? "top-0 rotate-[-4deg]" : index === 1 ? "top-7 rotate-[3deg]" : "top-14 rotate-[-2deg]"}`}
            >
              <div className="flex items-center justify-between gap-3 font-mono text-[8px] text-paper/60">
                <span className="truncate">{source.outlet_name}</span>
                <span className="shrink-0 text-teal-bright">SOURCE {index + 1}</span>
              </div>
              <p className="mt-1 truncate font-display text-[15px] leading-none text-paper">{source.title}</p>
            </div>
          ))}
          {sources.length === 0 ? (
            <div className="absolute left-1/2 top-7 w-[82%] -translate-x-1/2 border border-paper/30 bg-ink/95 px-3 py-2 font-display text-lg text-paper">
              {title}
            </div>
          ) : null}
        </div>

        <div className="mt-5 border-t border-paper/20 pt-3">
          <div className="flex items-center justify-between gap-3 font-mono text-[9px] text-paper/60">
            <span>Coverage mix</span>
            <span>not a truth score</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden bg-paper/15">
            {groupOrder.map((group) => (
              <span
                key={group}
                className={groupStyles[group].bar}
                style={{ width: `${story?.orientation[group] ?? (group === "center" ? 34 : 33)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-2 font-mono text-[8px] text-paper/65">
            {groupOrder.map((group) => (
              <span key={group}>
                {story?.orientation[group] ?? (group === "center" ? 34 : 33)}% {groupStyles[group].label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
