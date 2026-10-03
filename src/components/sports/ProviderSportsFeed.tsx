import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Media = { path: string; mime: string };
type Post = {
  id: string;
  content: string;
  posted_at: string;
  edited_at: string | null;
  media: Media[];
  media_notice: string;
};
type Feed = {
  status: {
    enabled: boolean;
    connected: boolean;
    last_seen_at: string | null;
    last_sync_at: string | null;
    last_post_at: string | null;
    last_error_code: string | null;
    timezone: string;
  };
  posts: Post[];
};
export const sportsTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not yet";
function Attachment({ media }: { media: Media }) {
  const result = useQuery({
    queryKey: ["sports-media", media.path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("sports-reader-media")
        .createSignedUrl(media.path, 600);
      if (error || !data?.signedUrl) throw Error("Attachment unavailable");
      return data.signedUrl;
    },
    staleTime: 240000,
    refetchInterval: 300000,
  });
  if (result.isError)
    return (
      <p className="text-sm text-destructive">
        Attachment unavailable.{" "}
        <button className="underline" onClick={() => result.refetch()}>
          Retry
        </button>
      </p>
    );
  if (!result.data)
    return <p className="text-sm text-muted-foreground">Loading attachment…</p>;
  return (
    <a
      href={result.data}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-primary underline"
    >
      {media.mime === "application/pdf" ? (
        "Open schedule PDF"
      ) : (
        <img
          src={result.data}
          alt="Provider sports schedule"
          loading="lazy"
          className="max-h-[700px] max-w-full rounded border object-contain"
        />
      )}
    </a>
  );
}
export function ProviderSportsFeed() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<{ date: string; id: string } | null>(
    null,
  );
  const feed = useQuery({
    queryKey: ["provider-sports", cursor],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_sports_feed" as never,
        {
          p_before: cursor?.date ?? null,
          p_before_id: cursor?.id ?? null,
        } as never,
      );
      if (error) throw Error("Unable to load sports updates");
      return data as unknown as Feed;
    },
    refetchInterval: 60000,
  });
  const status = feed.data?.status;
  const healthy =
    status?.enabled &&
    status.connected &&
    !status.last_error_code &&
    status.last_seen_at &&
    Date.now() - Date.parse(status.last_seen_at) < 180000 &&
    status.last_sync_at &&
    Date.now() - Date.parse(status.last_sync_at) < 300000;
  const posts = feed.data?.posts || [];
  // Reset archive filters when switching between pages.
  useEffect(() => setSearch(""), [cursor]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Provider sports updates</h2>
          <p className="text-sm text-muted-foreground">
            Original schedules and announcements. Event times are preserved as
            posted by the provider.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => feed.refetch()}
          disabled={feed.isFetching}
        >
          Refresh
        </Button>
      </div>
      {status && (
        <div className="rounded-lg border bg-white p-4 space-y-2" role="status">
          <Badge variant={healthy ? "default" : "secondary"}>
            {healthy
              ? "Updating automatically"
              : !status.connected
                ? "Waiting for Telegram connection"
                : !status.enabled
                  ? "Updates paused"
                  : "Connection needs attention"}
          </Badge>
          <p className="text-sm text-muted-foreground">
            Last checked: {sportsTime(status.last_sync_at)} · Latest post:{" "}
            {sportsTime(status.last_post_at)}
          </p>
          {!healthy && posts.length > 0 && (
            <p className="text-sm">
              Saved posts remain available. Check their dates before using a
              schedule.
            </p>
          )}
        </div>
      )}
      <Input
        aria-label="Search displayed sports posts"
        placeholder="Search these posts by team, sport or channel…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {feed.isError && (
        <p role="alert" className="text-destructive">
          Unable to load sports updates. Use Refresh to try again.
        </p>
      )}
      {feed.isLoading && <p>Loading sports updates…</p>}
      {!feed.isLoading && !feed.isError && posts.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium">No provider posts imported yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Posts will appear here after the administrator connects the
              provider channel.
            </p>
          </CardContent>
        </Card>
      )}
      {posts
        .filter((p) => p.content.toLowerCase().includes(search.toLowerCase()))
        .map((post) => (
          <Card key={post.id}>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="text-xs text-muted-foreground">
                Posted {sportsTime(post.posted_at)}
                {post.edited_at && ` · Edited ${sportsTime(post.edited_at)}`}
              </div>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed">
                {post.content}
              </p>
              {post.media.map((m) => (
                <Attachment key={m.path} media={m} />
              ))}
              {post.media_notice && (
                <p className="text-sm text-amber-800">{post.media_notice}</p>
              )}
            </CardContent>
          </Card>
        ))}
      {posts.length > 0 &&
        search &&
        !posts.some((p) =>
          p.content.toLowerCase().includes(search.toLowerCase()),
        ) && (
          <p>
            No matching text on this page. Image and PDF contents are not
            searched.
          </p>
        )}
      <div className="flex gap-3">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(null)}>
            Latest posts
          </Button>
        )}
        {posts.length === 100 && (
          <Button
            variant="outline"
            onClick={() => {
              const p = posts[posts.length - 1];
              setCursor({ date: p.posted_at, id: p.id });
            }}
          >
            Older posts
          </Button>
        )}
      </div>
    </div>
  );
}
