import { NextResponse } from "next/server";

import { getTopNewsFeed } from "@/lib/top-news";
import { TopNewsFeedSchema } from "@/lib/top-news-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function responseFor(feed: Awaited<ReturnType<typeof getTopNewsFeed>>) {
  const parsed = TopNewsFeedSchema.safeParse(feed.feed);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_feed", message: "The Top News feed failed validation." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ...parsed.data, cached: feed.cached });
}

export async function GET() {
  return responseFor(await getTopNewsFeed());
}

export async function POST() {
  return responseFor(await getTopNewsFeed({ forceRefresh: true }));
}
