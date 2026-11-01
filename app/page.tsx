import TopNews from "@/components/top-news";
import { getTopNewsFeed } from "@/lib/top-news";
import { tinyfishConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export default async function Home() {
  const feed = await getTopNewsFeed();

  return (
    <TopNews
      initialFeed={feed.feed}
      initialCached={feed.cached}
      tinyfishConfigured={tinyfishConfigured()}
    />
  );
}
