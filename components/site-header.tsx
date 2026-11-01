import Link from "next/link";
import { Activity } from "lucide-react";

function LensMark() {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="h-10 w-10 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <circle cx="20" cy="20" r="18.4" />
      <path d="M20 1.6v36.8" opacity="0.55" />
      <path d="M20 20 34.8 7.2" opacity="0.4" />
      <path d="M20 20 34.8 32.8" opacity="0.4" />
      <circle cx="20" cy="20" r="3.2" className="fill-amber stroke-none" />
    </svg>
  );
}

function ToneDot({ active }: { active: boolean }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-teal" : "bg-amber"}`} />;
}

export default function SiteHeader({
  tinyfishConfigured,
  active,
  outletCount,
}: {
  tinyfishConfigured: boolean;
  active: "news" | "analyze";
  outletCount: number;
}) {
  return (
    <header className="mx-auto max-w-[1500px] px-5 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-rule py-5">
        <Link href="/" className="flex items-center gap-3" aria-label="BiasLens Top News">
          <LensMark />
          <span>
            <span className="block font-display text-2xl leading-none tracking-tight">BiasLens</span>
            <span className="mt-1 block font-mono text-[9px] tracking-[0.18em] text-ink-soft">
              A reading desk for contested stories
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3 font-mono text-[10px] text-ink-soft sm:gap-5">
          <span className="hidden items-center gap-2 border border-rule px-3 py-1.5 md:inline-flex">
            <ToneDot active={tinyfishConfigured} />
            TinyFish {tinyfishConfigured ? "ready" : "key missing"}
          </span>
          <nav className="flex items-center gap-1 border border-rule p-1" aria-label="Primary navigation">
            <Link
              href="/"
              className={`px-3 py-2 transition-colors hover:bg-paper-deep ${active === "news" ? "bg-ink text-paper" : "text-ink-soft"}`}
            >
              Top News
            </Link>
            <Link
              href="/analyze"
              className={`px-3 py-2 transition-colors hover:bg-paper-deep ${active === "analyze" ? "bg-ink text-paper" : "text-ink-soft"}`}
            >
              Fact Checker
            </Link>
          </nav>
          <span className="hidden items-center gap-1.5 lg:inline-flex">
            <Activity className="h-3.5 w-3.5 text-teal" /> {outletCount} sources
          </span>
        </div>
      </div>
    </header>
  );
}
