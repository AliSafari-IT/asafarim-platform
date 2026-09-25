import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GithubStateBadge } from "@/components/issues/github-state-badge";
import { LocalDateTime } from "@/components/local-date-time";
import type { RelatedIssueRow } from "@/lib/related-issues";

/**
 * Other issues generated from the same test case — shown on an issue's own
 * page so "has this failed before, and was it fixed?" doesn't require a
 * manual search. Server-rendered (no interactivity needed beyond links).
 */
export function RelatedIssues({ appId, issues }: { appId: string; issues: RelatedIssueRow[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Related issues — same test case ({issues.length})
      </h2>
      <div className="flex flex-col gap-2">
        {issues.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between gap-3 p-3">
              <Link
                href={`/apps/${appId}/issues/${r.id}`}
                className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
              >
                {r.title}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  <LocalDateTime value={r.createdAt.toISOString()} />
                </span>
                {r.status === "published" && r.githubUrl && (
                  <a
                    href={r.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {r.githubNumber ? `#${r.githubNumber}` : "GitHub"}
                  </a>
                )}
                {r.status === "published" && <GithubStateBadge state={r.githubState} />}
                <Badge variant={r.status === "published" ? "success" : "outline"}>{r.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
