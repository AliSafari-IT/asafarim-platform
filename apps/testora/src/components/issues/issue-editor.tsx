"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  ExternalLink,
  Eye,
  Github,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markdownToHtml } from "@/lib/markdown";
import { saveTextFile } from "@/lib/save-file";
import { GithubStateBadge } from "@/components/issues/github-state-badge";

export interface IssueData {
  id: string;
  projectId: string;
  title: string;
  body: string;
  status: "draft" | "published";
  githubUrl: string | null;
  githubNumber: number | null;
  githubState: "open" | "closed" | null;
  createdAt: string;
  updatedAt: string;
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "issue";
}

export function IssueEditor({
  issue,
  githubConfigured,
}: {
  issue: IssueData;
  githubConfigured: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(issue.title);
  const [body, setBody] = useState(issue.body);
  const [status, setStatus] = useState(issue.status);
  const [githubUrl, setGithubUrl] = useState(issue.githubUrl);
  const [githubState, setGithubState] = useState(issue.githubState);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<null | "save" | "publish" | "delete" | "refresh">(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const previewHtml = useMemo(() => markdownToHtml(body), [body]);
  const dirty = title !== issue.title || body !== issue.body;

  async function save() {
    setBusy("save");
    setError(null);
    setSavedNote(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError((data?.error as string) ?? "Could not save.");
        return;
      }
      setSavedNote("Saved.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);
    try {
      // Persist edits first so GitHub gets the current text.
      if (dirty) {
        await fetch(`/api/issues/${issue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
      }
      const res = await fetch(`/api/issues/${issue.id}/publish`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data?.error as string) ?? "Could not publish to GitHub.");
        return;
      }
      setStatus("published");
      setGithubUrl(data.issue.githubUrl ?? null);
      setGithubState(data.issue.githubState ?? null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    await saveTextFile(`# ${title}\n\n${body}\n`, {
      suggestedName: `issue-${slug(title)}.md`,
      mimeType: "text/markdown",
      extension: "md",
      description: "Markdown issue",
    });
  }

  async function refreshGithubState() {
    setBusy("refresh");
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/github-state`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data?.error as string) ?? "Could not refresh GitHub state.");
        return;
      }
      setGithubState(data.state ?? null);
      setSavedNote("State refreshed.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this issue? This cannot be undone.")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/issues/${issue.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete.");
        return;
      }
      router.push(`/apps/${issue.projectId}/issues`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "published" ? "success" : "outline"}>{status}</Badge>
        {status === "published" && githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {issue.githubNumber ? `#${issue.githubNumber} on GitHub` : "View on GitHub"}
          </a>
        )}
        {status === "published" && (
          <>
            <GithubStateBadge state={githubState} />
            <button
              type="button"
              onClick={() => void refreshGithubState()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              title="Refresh open/closed state from GitHub"
            >
              {busy === "refresh" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Refresh
            </button>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Updated {new Date(issue.updatedAt).toLocaleString()}
        </span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-11 rounded-md border border-border bg-muted px-3 text-base font-medium text-foreground"
        disabled={busy !== null}
      />

      <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`flex items-center gap-1 rounded px-3 py-1 ${tab === "edit" ? "bg-background font-medium" : "text-muted-foreground"}`}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`flex items-center gap-1 rounded px-3 py-1 ${tab === "preview" ? "bg-background font-medium" : "text-muted-foreground"}`}
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>

      {tab === "edit" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          className="min-h-[20rem] w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
          disabled={busy !== null}
        />
      ) : (
        <div
          className="min-h-[20rem] w-full overflow-y-auto rounded-md border border-border bg-background px-4 py-3 text-sm"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {savedNote && <p className="text-sm text-emerald-400">{savedNote}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button onClick={() => void save()} disabled={busy !== null || !dirty || !title.trim()}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() => void publish()}
          disabled={busy !== null || !title.trim() || !githubConfigured}
          title={githubConfigured ? undefined : "Connect a GitHub repo for this app in Apps"}
        >
          {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          {status === "published" ? "Re-send to GitHub" : "Publish to GitHub"}
        </Button>
        <Button variant="outline" onClick={() => void download()} disabled={busy !== null}>
          <Download className="h-4 w-4" /> Download .md
        </Button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy !== null}
          className="ml-auto inline-flex items-center gap-1 rounded p-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
        >
          {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete
        </button>
      </div>
    </div>
  );
}
