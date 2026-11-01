"use client";

import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Quote,
  Search,
  ShieldAlert,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import {
  ActivityEventSchema,
  AnalyzeResultSchema,
  type ActivityEvent,
  type AnalyzeResult,
  type ArticleReport,
  type Group,
} from "@/lib/analysis/types";
import SiteHeader from "@/components/site-header";

type Outlet = {
  id: string;
  name: string;
  domain: string;
  group: Group;
  rating_source: string;
  rating_url: string;
};

type Story = {
  id: string;
  title: string;
  input: string;
  cached_at: string;
  notes: string | null;
};

type Props = {
  initialInput?: string;
  outlets: Outlet[];
  groupLabels: Record<Group, string>;
  stories: Story[];
  tinyfishConfigured: boolean;
  llm: { mode: "live" | "mock"; model: string | null; reason: string | null };
  consensusShare: number;
  searchWindowDays: number;
  slantLabelThreshold: number;
};

type RunState = "idle" | "running" | "complete" | "error";

const phases: Record<string, { label: string; tone: "muted" | "teal" | "amber" | "alert" }> = {
  queued: { label: "Queued", tone: "muted" },
  searching: { label: "Searching", tone: "teal" },
  search_done: { label: "Search returned", tone: "teal" },
  no_results: { label: "No search match", tone: "amber" },
  reading: { label: "Reading", tone: "teal" },
  read_failed: { label: "Not accessible", tone: "amber" },
  analyzing: { label: "Analyzing", tone: "teal" },
  analyzed: { label: "Analyzed", tone: "teal" },
  irrelevant: { label: "Off-event", tone: "amber" },
  unavailable: { label: "Unavailable", tone: "amber" },
  absence_check: { label: "Checking site search", tone: "teal" },
  absent: { label: "Search empty", tone: "amber" },
  absence_inconclusive: { label: "Check inconclusive", tone: "amber" },
};

const groupStyles: Record<Group, { border: string; ink: string; wash: string }> = {
  left: { border: "border-teal/35", ink: "text-teal", wash: "bg-teal/5" },
  center: { border: "border-ink/20", ink: "text-ink-soft", wash: "bg-ink/3" },
  right: { border: "border-amber/45", ink: "text-amber", wash: "bg-amber/6" },
};

const groupOrder: Group[] = ["left", "center", "right"];

function ToneDot({ tone }: { tone: "muted" | "teal" | "amber" | "alert" }) {
  const colors = {
    muted: "bg-ink/25",
    teal: "bg-teal",
    amber: "bg-amber",
    alert: "bg-alert",
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${colors[tone]}`} />;
}

function EvidenceQuote({
  excerpt,
  url,
  label = "Source evidence",
}: {
  excerpt: string;
  url?: string;
  label?: string;
}) {
  return (
    <div className="mt-3 border-l-2 border-amber/60 pl-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] text-ink-soft">
        <Quote className="h-3 w-3 text-amber" />
        <span>{label}</span>
        {url ? (
          <a
            className="ml-auto inline-flex items-center gap-1 text-teal hover:text-ink"
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open source article"
          >
            Open source <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <p className="mt-1 font-display text-[15px] leading-snug text-ink">“{excerpt}”</p>
    </div>
  );
}

function scoreLabel(score: number, threshold: number) {
  if (score <= -threshold) return "Government-critical";
  if (score >= threshold) return "Government-aligned";
  return "Mixed or neutral";
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function latestOutletEvents(activity: ActivityEvent[]) {
  const latest = new Map<string, Extract<ActivityEvent, { type: "outlet" }>>();
  for (const event of activity) {
    if (event.type === "outlet") latest.set(event.outletId, event);
  }
  return latest;
}

function streamEvent(raw: unknown):
  | { type: "activity"; event: ActivityEvent }
  | { type: "done"; result: AnalyzeResult }
  | { type: "error"; message: string }
  | { type: "invalid" } {
  if (typeof raw !== "object" || raw === null) return { type: "invalid" };
  const record = raw as Record<string, unknown>;

  if (record.type === "done") {
    const result = AnalyzeResultSchema.safeParse(record.result);
    return result.success
      ? { type: "done", result: result.data }
      : { type: "invalid" };
  }
  if (record.type === "error" && typeof record.message === "string") {
    return { type: "error", message: record.message };
  }

  const event = ActivityEventSchema.safeParse(raw);
  return event.success ? { type: "activity", event: event.data } : { type: "invalid" };
}

export default function Workbench({
  initialInput,
  outlets,
  groupLabels,
  stories,
  tinyfishConfigured,
  llm,
  consensusShare,
  searchWindowDays,
  slantLabelThreshold,
}: Props) {
  const [input, setInput] = useState(initialInput ?? stories[0]?.input ?? "");
  const [runState, setRunState] = useState<RunState>("idle");
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<string | null>(null);

  const stages = useMemo(
    () => activity.filter((event): event is Extract<ActivityEvent, { type: "stage" }> => event.type === "stage"),
    [activity],
  );

  async function analyze(event: FormEvent<HTMLFormElement>, storyId?: string) {
    event.preventDefault();
    const value = input.trim();
    if (value.length < 3 || runState === "running") return;

    setRunState("running");
    setActivity([]);
    setResult(null);
    setError(null);
    setActiveStory(storyId ?? null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value, ...(storyId ? { storyId } : {}) }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error === "unknown_story" ? "That cached story is no longer available." : "The analysis request was rejected.");
      }

      if (!response.body) throw new Error("The analysis stream was empty.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let streamError: string | null = null;

      const consume = (chunk: string) => {
        buffer += chunk;
        const records = buffer.split("\n\n");
        buffer = records.pop() ?? "";
        for (const record of records) {
          const line = record.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(line.slice(6));
          } catch {
            streamError = "The server sent malformed activity data.";
            continue;
          }
          const event = streamEvent(parsed);
          if (event.type === "activity") setActivity((current) => [...current, event.event]);
          if (event.type === "error") streamError = event.message;
          if (event.type === "invalid") streamError = "The server returned an invalid analysis payload.";
          if (event.type === "done") {
            setResult(event.result);
            completed = true;
          }
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        consume(decoder.decode(chunk, { stream: true }));
      }
      consume(decoder.decode());

      if (streamError) throw new Error(streamError);
      if (!completed) throw new Error("The analysis ended before a result was returned.");
      setRunState("complete");
    } catch (caught) {
      setRunState("error");
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    }
  }

  function chooseStory(story: Story) {
    setInput(story.input);
    setActiveStory(story.id);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader tinyfishConfigured={tinyfishConfigured} active="analyze" outletCount={outlets.length} />

      <main className="mx-auto max-w-[1500px] px-5 lg:px-10">
        <section className="grid gap-10 border-b border-rule py-10 lg:grid-cols-[minmax(0,1fr)_310px] lg:py-14">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-teal">
              <Activity className="h-3.5 w-3.5" />
              Compare the same event across {outlets.length} fixed outlets
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,7vw,6.8rem)] leading-[0.86] tracking-[-0.035em]">
              One story.
              <br />
              Several readings.
            </h1>
            <p className="mt-7 max-w-2xl text-[1.02rem] leading-relaxed text-ink-soft">
              BiasLens separates the shared fact core from the way each outlet frames it. TinyFish finds and reads the coverage; every extracted label stays tied to a source and a short quote.
            </p>

            <form onSubmit={(event) => analyze(event, activeStory ?? undefined)} className="mt-8 max-w-3xl">
              <label htmlFor="story-input" className="sr-only">Story topic or news URL</label>
              <div className="flex items-center gap-2 border-2 border-ink bg-paper p-1.5 shadow-[5px_5px_0_var(--color-amber)]">
                <Search className="ml-2 h-5 w-5 shrink-0 text-ink-soft" />
                <input
                  id="story-input"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setActiveStory(null);
                  }}
                  placeholder="Paste a news URL or type a story topic"
                  className="min-w-0 flex-1 bg-transparent px-1 py-3 text-[15px] text-ink outline-none placeholder:text-ink-soft/65"
                  disabled={runState === "running"}
                />
                <button
                  type="submit"
                  disabled={runState === "running" || input.trim().length < 3}
                  className="inline-flex shrink-0 items-center gap-2 bg-ink px-4 py-3 font-mono text-[10px] text-paper transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {runState === "running" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  {runState === "running" ? "Reading" : "Analyze"}
                </button>
              </div>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-soft">
                {tinyfishConfigured
                  ? "Live mode searches each domain separately. Results can fall back to the filesystem cache."
                  : "TinyFish is not configured here. Use a prepared replay, or add TINYFISH_API_KEY server-side for live discovery."}
              </p>
            </form>
          </div>

          <aside className="border-l border-rule pl-5 lg:pt-3">
            <div className="font-mono text-[10px] text-ink-soft">Prepared stories</div>
            {stories.length > 0 ? (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {stories.map((story) => (
                  <li key={story.id}>
                    <button
                      type="button"
                      onClick={() => chooseStory(story)}
                      className={`w-full py-3 text-left transition-colors hover:text-teal ${activeStory === story.id ? "text-teal" : "text-ink"}`}
                    >
                      <span className="block font-display text-lg leading-tight">{story.title}</span>
                      <span className="mt-1 block font-mono text-[9px] text-ink-soft">Cached {formatTime(story.cached_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 border-y border-dashed border-rule py-4 text-[13px] leading-relaxed text-ink-soft">
                No cached replay is prepared yet. A live run can be captured with the demo script after the TinyFish key is configured.
              </p>
            )}
            <div className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              <span>{Math.round(consensusShare * 100)}% support threshold · {searchWindowDays}-day search window</span>
            </div>
          </aside>
        </section>

        <section className="grid gap-8 py-9 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <ActivityPanel
            outlets={outlets}
            groupLabels={groupLabels}
            activity={activity}
            stages={stages}
            runState={runState}
            input={input}
          />
          <div id="results" className="min-w-0">
            {error ? <ErrorBanner message={error} /> : null}
            {result ? (
              <ResultsView
                result={result}
                groupLabels={groupLabels}
                slantLabelThreshold={slantLabelThreshold}
              />
            ) : (
              <EmptyResults runState={runState} />
            )}
          </div>
        </section>
      </main>

      <footer id="limits" className="border-t border-rule">
        <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 text-[11px] leading-relaxed text-ink-soft lg:grid-cols-[1fr_auto] lg:px-10">
          <p>Framing and slant are model estimates, not ground truth. Results hold only for these events, these outlets, and the configured time window.</p>
          <p className="font-mono text-[10px]">LLM: {llm.mode === "live" ? llm.model ?? "live" : "mock / deterministic"}</p>
        </div>
      </footer>
    </div>
  );
}

function ActivityPanel({
  outlets,
  groupLabels,
  activity,
  stages,
  runState,
  input,
}: {
  outlets: Outlet[];
  groupLabels: Record<Group, string>;
  activity: ActivityEvent[];
  stages: Extract<ActivityEvent, { type: "stage" }>[];
  runState: RunState;
  input: string;
}) {
  const latest = latestOutletEvents(activity);
  return (
    <section className="border border-ink/20 bg-paper-deep/35">
      <div className="flex items-start justify-between gap-4 border-b border-ink/15 px-4 py-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-teal">
            <span className={`h-2 w-2 rounded-full ${runState === "running" ? "animate-pulse bg-teal" : "bg-ink/25"}`} />
            TinyFish: live web
          </div>
          <h2 className="mt-2 font-display text-2xl leading-none">The reading trail</h2>
        </div>
        <span className="font-mono text-[9px] text-ink-soft">{outlets.length} domains</span>
      </div>

      <div className="px-4 py-3 font-mono text-[10px] leading-relaxed text-ink-soft">
        <span className="text-ink">Query:</span> {input.trim() || "Waiting for a story"}
      </div>

      <div className="border-y border-ink/15">
        {outlets.map((outlet) => {
          const event = latest.get(outlet.id);
          const phase = event ? phases[event.phase] : { label: "Queued", tone: "muted" as const };
          return (
            <div key={outlet.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ink/10 px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] text-ink">{outlet.name}</span>
                  <span className={`hidden font-mono text-[9px] sm:inline ${groupStyles[outlet.group].ink}`}>{groupLabels[outlet.group]}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[9px] text-ink-soft">{outlet.domain}{event?.count !== undefined ? ` · ${event.count} result${event.count === 1 ? "" : "s"}` : ""}</div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[9px] text-ink-soft">
                <ToneDot tone={phase.tone} />
                <span>{phase.label}</span>
                {event?.source === "cached" ? <span className="text-amber">cached</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-4">
        <div className="font-mono text-[9px] text-ink-soft">Pipeline</div>
        <ol className="mt-3 space-y-2">
          {["anchor", "search", "fetch", "analysis", "consensus", "blindspot"].map((name) => {
            const done = stages.some((stage) => stage.stage === name && stage.status === "done");
            const started = stages.some((stage) => stage.stage === name && stage.status === "start");
            return (
              <li key={name} className="flex items-center gap-2 font-mono text-[10px] text-ink-soft">
                {done ? <Check className="h-3 w-3 text-teal" /> : started && runState === "running" ? <LoaderCircle className="h-3 w-3 animate-spin text-amber" /> : <span className="h-3 w-3 rounded-full border border-ink/25" />}
                <span className={done ? "text-ink" : ""}>{name === "blindspot" ? "coverage check" : name}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function EmptyResults({ runState }: { runState: RunState }) {
  return (
    <div className="grid min-h-[420px] place-items-center border border-dashed border-rule px-8 py-16 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-12 w-12 place-items-center border border-rule bg-paper-deep/45">
          {runState === "running" ? <LoaderCircle className="h-5 w-5 animate-spin text-teal" /> : <Search className="h-5 w-5 text-ink-soft" />}
        </div>
        <h2 className="mt-5 font-display text-3xl leading-none">{runState === "running" ? "Building the comparison" : "The evidence will land here"}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{runState === "running" ? "Watch the outlet rows as TinyFish searches and reads. Results appear after the evidence checks finish." : "Start with a topic or a public news URL. BiasLens will show shared facts first, then each outlet's framing."}</p>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 border border-alert/35 bg-alert/5 px-4 py-4 text-sm leading-relaxed text-ink">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" />
      <div>
        <div className="font-display text-lg leading-none">Analysis stopped</div>
        <p className="mt-1 text-ink-soft">{message}</p>
      </div>
    </div>
  );
}

function ResultsView({
  result,
  groupLabels,
  slantLabelThreshold,
}: {
  result: AnalyzeResult;
  groupLabels: Record<Group, string>;
  slantLabelThreshold: number;
}) {
  const notices = result.blind_spots.filter((finding) => finding.status === "notice");
  const inconclusive = result.blind_spots.filter((finding) => finding.status === "inconclusive");
  return (
    <div className="space-y-8">
      <div className="border-b border-rule pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] text-ink-soft">
          <span className="inline-flex items-center gap-2 text-teal"><CheckCircle2 className="h-3.5 w-3.5" /> Analysis complete</span>
          <span>{result.mode.replay ? "cached replay" : result.mode.tinyfish === "live" ? "live TinyFish run" : "cached retrieval"}</span>
          <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
        </div>
        <h2 className="mt-3 max-w-4xl font-display text-4xl leading-[0.95] tracking-[-0.02em]">{result.event.canonical_title}</h2>
        <p className="mt-3 max-w-3xl font-mono text-[10px] leading-relaxed text-ink-soft">Event query: {result.event.query}</p>
      </div>

      {notices.map((finding) => (
        <div key={finding.group} className="border border-amber/50 bg-amber/7 px-4 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
            <div>
              <div className="font-mono text-[10px] text-amber">Verified coverage notice · {groupLabels[finding.group]}</div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">{finding.description}</p>
              <div className="mt-3 font-mono text-[9px] text-ink-soft">Absence evidence: {finding.evidence.length} outlet site search checks · run ids and timestamps stored below</div>
            </div>
          </div>
        </div>
      ))}

      {inconclusive.map((finding) => (
        <div key={finding.group} className="border border-ink/15 bg-paper-deep/30 px-4 py-4">
          <div className="font-mono text-[10px] text-ink-soft">Coverage check inconclusive · {groupLabels[finding.group]}</div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{finding.description}</p>
        </div>
      ))}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/20 pb-3">
          <div>
            <div className="font-mono text-[10px] text-teal">Shared fact core</div>
            <h3 className="mt-2 font-display text-3xl leading-none">What the coverage agrees on</h3>
          </div>
          <div className="font-mono text-[10px] text-ink-soft">{result.consensus.covering_outlets} of {result.consensus.monitored_outlets} outlets covered · {result.facts.length} shared facts</div>
        </div>
        {result.facts.length > 0 ? (
          <ol className="divide-y divide-rule">
            {result.facts.map((fact, index) => (
              <li key={fact.fact_id} className="grid gap-4 py-5 sm:grid-cols-[36px_1fr]">
                <div className="font-mono text-[10px] text-ink-soft">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="max-w-2xl text-[15px] leading-relaxed text-ink">{fact.text}</p>
                    <span className="font-mono text-[10px] text-teal">{fact.support} of {fact.covering_outlets} outlets</span>
                  </div>
                  <EvidenceQuote excerpt={fact.excerpt} url={fact.source_urls[0]} label="Representative source excerpt" />
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-ink-soft">
                    {fact.evidence.map((evidence) => <a key={`${fact.fact_id}-${evidence.outlet}`} href={evidence.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal">{evidence.outlet}<ExternalLink className="h-2.5 w-2.5" /></a>)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-b border-rule py-6 text-sm leading-relaxed text-ink-soft">No verified cross-outlet fact reached the configured support threshold for this run.</p>
        )}
      </section>

      <section>
        <div className="border-b border-ink/20 pb-3">
          <div className="font-mono text-[10px] text-amber">Model estimates, with evidence</div>
          <h3 className="mt-2 font-display text-3xl leading-none">How each group framed it</h3>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {groupOrder.map((group) => (
            <GroupColumn key={group} group={group} label={groupLabels[group]} reports={result.outlets.filter((outlet) => outlet.group === group)} slantLabelThreshold={slantLabelThreshold} />
          ))}
        </div>
      </section>

      <section className="border-t border-rule pt-6">
        <div className="font-mono text-[10px] text-ink-soft">Run notes</div>
        <ul className="mt-3 grid gap-2 text-[12px] leading-relaxed text-ink-soft md:grid-cols-2">
          {result.caveats.map((caveat) => <li key={caveat} className="flex items-start gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber" />{caveat}</li>)}
        </ul>
      </section>
    </div>
  );
}

function GroupColumn({
  group,
  label,
  reports,
  slantLabelThreshold,
}: {
  group: Group;
  label: string;
  reports: AnalyzeResult["outlets"];
  slantLabelThreshold: number;
}) {
  const style = groupStyles[group];
  const relevant = reports.flatMap((report) => report.articles.filter((article) => article.status === "relevant").map((article) => ({ report, article })));
  return (
    <div className={`min-w-0 border ${style.border} ${style.wash}`}>
      <div className="border-b border-inherit px-4 py-4">
        <div className={`font-mono text-[10px] ${style.ink}`}>{label}</div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h4 className="font-display text-2xl leading-none">{reports.length ? `${relevant.length} reading${relevant.length === 1 ? "" : "s"}` : "No outlets"}</h4>
          <span className="font-mono text-[9px] text-ink-soft">{reports.length} monitored</span>
        </div>
      </div>
      {reports.length === 0 ? (
        <p className="px-4 py-5 text-sm leading-relaxed text-ink-soft">No verified centre outlet is in the seed registry. This group stays in the payload as an empty comparison column.</p>
      ) : relevant.length === 0 ? (
        <p className="px-4 py-5 text-sm leading-relaxed text-ink-soft">No relevant article reached framing analysis in this run.</p>
      ) : (
        <div className="divide-y divide-ink/10">
          {relevant.map(({ report, article }) => <ArticleReading key={article.url} reportName={report.name} reportRating={report.rating_source} reportRatingUrl={report.rating_url} article={article} slantLabelThreshold={slantLabelThreshold} />)}
        </div>
      )}
    </div>
  );
}

function ArticleReading({
  reportName,
  reportRating,
  reportRatingUrl,
  article,
  slantLabelThreshold,
}: {
  reportName: string;
  reportRating: string;
  reportRatingUrl: string;
  article: ArticleReport;
  slantLabelThreshold: number;
}) {
  return (
    <details className="group px-4 py-4" open>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h5 className="font-display text-xl leading-tight">{reportName}</h5>
            <p className="mt-1 truncate text-[12px] leading-relaxed text-ink-soft">{article.title ?? article.url}</p>
          </div>
          <span className="font-mono text-[10px] text-ink-soft group-open:text-teal">{article.framing ? scoreLabel(article.framing.slant_score, slantLabelThreshold) : "Analysis unavailable"}</span>
        </div>
      </summary>
      <div className="mt-4 text-[12px] leading-relaxed text-ink-soft">
        <a href={reportRatingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[9px] text-teal hover:text-ink">Rating source: {reportRating}<ExternalLink className="h-2.5 w-2.5" /></a>
        {article.framing ? (
          <>
            <div className="mt-4 grid gap-3 border-y border-ink/10 py-3 sm:grid-cols-2">
              <div><span className="font-mono text-[9px] text-ink-soft">Dominant frame</span><div className="mt-1 text-ink">{article.framing.dominant_frame ?? "Other"}</div></div>
              <div><span className="font-mono text-[9px] text-ink-soft">Slant estimate</span><div className="mt-1 text-ink">{article.framing.slant_score.toFixed(2)} · {scoreLabel(article.framing.slant_score, slantLabelThreshold)}</div></div>
            </div>
            {article.framing.frame_evidence ? <EvidenceQuote excerpt={article.framing.frame_evidence} url={article.url} label="Frame estimate" /> : null}
            {article.framing.persuasion.length > 0 ? <div className="mt-5"><div className="font-mono text-[9px] text-ink-soft">Persuasion signals</div><ul className="mt-2 space-y-3">{article.framing.persuasion.map((hit) => <li key={`${hit.technique}-${hit.excerpt}`}><div className="text-ink">{hit.technique}</div><p className="mt-0.5 text-ink-soft">{hit.explanation}</p><EvidenceQuote excerpt={hit.excerpt} url={article.url} label="Quoted span" /></li>)}</ul></div> : null}
            {article.framing.entity_roles.length > 0 ? <div className="mt-5"><div className="font-mono text-[9px] text-ink-soft">Entity roles</div><ul className="mt-2 space-y-2">{article.framing.entity_roles.map((role) => <li key={`${role.entity_name}-${role.assigned_role}`} className="border-t border-ink/10 pt-2"><span className="text-ink">{role.entity_name}</span> · {role.assigned_role}<EvidenceQuote excerpt={role.excerpt} url={article.url} label="Role evidence" /></li>)}</ul></div> : null}
          </>
        ) : (
          <p className="mt-4">The analysis stage was unavailable after its validation attempts. The article remains linked as not fully analyzed.</p>
        )}
      </div>
    </details>
  );
}
