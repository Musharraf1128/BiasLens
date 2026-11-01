"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Rss,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import SiteHeader from "@/components/site-header";
import CoverageSignal from "@/components/coverage-signal";
import { TopNewsFeedSchema, type TopNewsFeed, type TopNewsGroup, type TopNewsSource } from "@/lib/top-news-schema";

const groupStyles: Record<TopNewsGroup, { label: string; bar: string; ink: string }> = {
  left: { label: "Government-critical", bar: "bg-teal", ink: "text-teal" },
  center: { label: "Mixed", bar: "bg-ink/45", ink: "text-ink-soft" },
  right: { label: "Government-aligned", bar: "bg-amber", ink: "text-amber" },
};

const groupOrder: TopNewsGroup[] = ["left", "center", "right"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatPublished(value: string | null) {
  if (!value) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function OrientationBar({ story }: { story: TopNewsFeed["stories"][number] }) {
  return (
    <div className="mt-5 border-y border-rule py-3">
      <div className="flex items-center justify-between gap-3 font-mono text-[9px] text-ink-soft">
        <span>Coverage mix across {story.outlet_count} source{story.outlet_count === 1 ? "" : "s"}</span>
        <span>not a truth score</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden bg-paper-deep" aria-label="Coverage orientation bar">
        {groupOrder.map((group) => (
          <span
            key={group}
            className={groupStyles[group].bar}
            style={{ width: `${story.orientation[group]}%` }}
            title={`${groupStyles[group].label}: ${story.orientation[group]}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px]">
        {groupOrder.map((group) => (
          <span key={group} className={groupStyles[group].ink}>
            {groupStyles[group].label} {story.orientation[group]}%
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceLine({ source }: { source: TopNewsSource }) {
  return (
    <li className="border-t border-ink/10 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${groupStyles[source.group].bar}`} />
        <div className="min-w-0 flex-1">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="font-display text-lg leading-tight text-ink hover:text-teal"
          >
            {source.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-ink-soft">
            <span className={groupStyles[source.group].ink}>{source.outlet_name}</span>
            <span>{formatPublished(source.published_at)}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </div>
          {source.excerpt ? (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
              {source.excerpt_verified ? "“" : "Preview: "}{source.excerpt}{source.excerpt_verified ? "”" : ""}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StoryCard({ story }: { story: TopNewsFeed["stories"][number] }) {
  return (
    <article className="border-b border-rule py-8 first:pt-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.58fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] text-ink-soft">
            <span className="text-teal">{story.outlet_count} outlet{story.outlet_count === 1 ? "" : "s"} found this story</span>
            <span>·</span>
            <span>{story.excerpt_verified ? "Lead read by TinyFish" : "Search preview"}</span>
          </div>
          <h2 className="mt-3 max-w-3xl font-display text-[clamp(2rem,4vw,3.25rem)] leading-[0.95] tracking-[-0.025em]">
            {story.title}
          </h2>
          {story.excerpt ? (
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
              {story.excerpt_verified ? "“" : ""}{story.excerpt}{story.excerpt_verified ? "”" : ""}
            </p>
          ) : null}
          <OrientationBar story={story} />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/analyze?input=${encodeURIComponent(story.title)}`}
              className="inline-flex items-center gap-2 bg-ink px-4 py-3 font-mono text-[10px] text-paper transition-colors hover:bg-teal"
            >
              Check this story <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href={story.representative_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 border border-rule px-4 py-3 font-mono text-[10px] text-ink-soft hover:border-ink hover:text-ink"
            >
              Open representative source <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="border-l border-rule pl-5">
          <div className="font-mono text-[10px] text-ink-soft">Source trail</div>
          <ul className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
            {story.sources.map((source) => <SourceLine key={`${story.id}-${source.outlet_id}-${source.url}`} source={source} />)}
          </ul>
        </div>
      </div>
    </article>
  );
}

export default function TopNews({
  initialFeed,
  initialCached,
  tinyfishConfigured,
}: {
  initialFeed: TopNewsFeed;
  initialCached: boolean;
  tinyfishConfigured: boolean;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [cached, setCached] = useState(initialCached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/top-news", { method: "POST" });
      const body: unknown = await response.json();
      const parsed = TopNewsFeedSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        throw new Error("The latest source search did not return a valid feed.");
      }
      setFeed(parsed.data);
      setCached(Boolean((body as { cached?: unknown }).cached));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feed could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  const statusLabel = feed.status === "unavailable"
    ? "Feed unavailable"
    : cached
      ? "Cached source search"
      : feed.status === "partial"
        ? "Partial live source search"
        : "Live source search";

  return (
    <div className="min-h-screen">
      <SiteHeader tinyfishConfigured={tinyfishConfigured} active="news" outletCount={feed.monitored_outlets} />
      <main className="mx-auto max-w-[1500px] px-5 lg:px-10">
        <section className="border-b border-rule py-9 lg:py-12">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-10">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-teal">
                <Rss className="h-3.5 w-3.5" />
                A wider first read · {feed.monitored_outlets} configured sources
              </div>
              <h1 className="mt-6 max-w-5xl font-display text-[clamp(3.5rem,8vw,8.25rem)] leading-[0.82] tracking-[-0.05em]">
                Top news,
                <br />
                seen sideways.
              </h1>
              <p className="mt-8 max-w-2xl text-[1.04rem] leading-relaxed text-ink-soft">
                Start with the stories appearing across the spectrum, then open one in the Fact Checker to compare its shared facts and framing with evidence.
              </p>
            </div>
            <CoverageSignal story={feed.stories[0] ?? null} />
          </div>
        </section>

        <section className="border-b border-rule py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal" />
                {statusLabel}
              </span>
              <span>{feed.stories.length} story bundles</span>
              <span>Search window: {Math.round(feed.search_window_minutes / 60)} hours</span>
              <span className="hidden xl:inline">Refreshed {formatTime(feed.generated_at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!tinyfishConfigured ? <p className="font-mono text-[9px] leading-relaxed text-amber">Add TINYFISH_API_KEY server-side to refresh.</p> : null}
              {feed.search_failures > 0 ? <p className="font-mono text-[9px] leading-relaxed text-amber">{feed.search_failures} search{feed.search_failures === 1 ? "" : "es"} failed.</p> : null}
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing || !tinyfishConfigured}
                className="inline-flex w-full items-center justify-center gap-2 border border-ink px-4 py-2.5 font-mono text-[10px] text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {refreshing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {refreshing ? "Searching sources" : "Refresh latest sources"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-10 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            {error ? <div className="mb-7 border border-alert/35 bg-alert/5 px-4 py-4 text-sm text-ink">{error}</div> : null}
            {feed.stories.length > 0 ? feed.stories.map((story) => <StoryCard key={story.id} story={story} />) : (
              <div className="grid min-h-[360px] place-items-center border border-dashed border-rule px-8 py-16 text-center">
                <div className="max-w-md">
                  <Search className="mx-auto h-6 w-6 text-ink-soft" />
                  <h2 className="mt-5 font-display text-3xl leading-none">No source trail yet</h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">TinyFish did not return a usable feed. Check the server key, then refresh the source search.</p>
                </div>
              </div>
            )}
          </div>
          <aside className="border-l border-rule pl-5">
            <div className="font-mono text-[10px] text-amber">How to read this page</div>
            <div className="mt-4 space-y-5 text-[12px] leading-relaxed text-ink-soft">
              <p>The bar measures which configured source groups covered the same story bundle. It is a coverage map, not a truth or quality score.</p>
              <p>Search previews come from TinyFish Search. A lead marked “read by TinyFish” was also fetched; every original headline remains linked.</p>
              <p>Use Fact Checker when you want the stricter pass: relevance, claims, consensus, framing, and verified coverage checks.</p>
            </div>
            <Link href="/analyze" className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] text-teal hover:text-ink">
              Open Fact Checker <ArrowUpRight className="h-3 w-3" />
            </Link>
          </aside>
        </section>
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1500px] flex-wrap justify-between gap-4 px-5 py-7 font-mono text-[10px] leading-relaxed text-ink-soft lg:px-10">
          <span>BiasLens compares configured coverage; it does not produce one objective summary.</span>
          <span>{feed.monitored_outlets} sources · {feed.query}</span>
        </div>
      </footer>
    </div>
  );
}
