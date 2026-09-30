"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Github, Loader2, Save, ExternalLink, Eye, Pencil, Sparkles } from "lucide-react";
import { GithubStateBadge } from "@/components/issues/github-state-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/run-provider";
import type { ReportResultRow } from "@/lib/queries";
import { buildIssueDraft } from "@/lib/issue-template";
import { markdownToHtml } from "@/lib/markdown";
import { TESTER_ROLE_HINT, useCanManage, useCanRunTests } from "@/components/viewer-role";

/**
 * Preview + edit a GitHub-style issue generated from a failed result, then either
 * save it as a local markdown draft or save and push it to the app's GitHub repo.
 */
export function GenerateIssueDialog({
  row,
  onClose,
}: {
  row: ReportResultRow;
  onClose: () => void;
}) {
  const { projects } = useRun();
  const project = projects.find((p) => p.id === row.projectId);
  const githubConfigured = Boolean(project?.githubConfigured);
  const canManage = useCanManage();
  // Drafting, saving and sending need the Tester role (or admin).
  const canRunTests = useCanRunTests();

  const initial = useMemo(() => buildIssueDraft({ ...row, projectName: project?.name }), [row, project?.name]);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<null | "draft" | "github">(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    id: string;
    githubUrl: string | null;
    githubNumber?: number | null;
    githubState: "open" | "closed" | null;
    /** Set when publishing found this bug already open on GitHub. */
    duplicateOf?: { url: string; number: number } | null;
  } | null>(null);

  const previewHtml = useMemo(() => markdownToHtml(body), [body]);
  const issuesHref = `/apps/${row.projectId}/issues`;

  // Tracks the last text we set programmatically, so an AI result only replaces
  // the editor when the user hasn't started editing it themselves.
  const lastAuto = useRef<{ title: string; body: string }>({ title: initial.title, body: initial.body });

  async function generate(force: boolean) {
    setAiBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/issues/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: row.projectId,
          projectName: project?.name ?? null,
          caseTitle: row.caseTitle,
          fixtureTitle: row.fixtureTitle,
          suiteTitle: row.suiteTitle,
          frTitle: row.frTitle,
          status: row.status,
          errorMessage: row.errorMessage,
          targetBaseUrl: row.targetBaseUrl,
          durationMs: row.durationMs,
          createdAt: row.createdAt,
          hasScreenshot: Boolean(row.screenshot),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title: string; body: string; ai: boolean };
      // Don't clobber edits the user already made (unless they asked to regenerate).
      const untouched = title === lastAuto.current.title && body === lastAuto.current.body;
      if (force || untouched) {
        setTitle(data.title);
        setBody(data.body);
        lastAuto.current = { title: data.title, body: data.body };
      }
      setAiUsed(data.ai);
    } catch {
      /* keep the template seed on any failure */
    } finally {
      setAiBusy(false);
    }
  }

  // Try an AI draft once when the dialog opens; falls back silently to the template.
  useEffect(() => {
    void generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createIssue(): Promise<string | null> {
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: row.projectId,
        title,
        body,
        resultId: row.id,
        caseId: row.caseId,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError((data?.error && typeof data.error === "string" ? data.error : null) ?? "Could not save the issue.");
      return null;
    }
    return data.issue.id as string;
  }

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    try {
      const id = await createIssue();
      if (id) setSaved({ id, githubUrl: null, githubState: null });
    } finally {
      setBusy(null);
    }
  }

  async function saveAndPublish() {
    setBusy("github");
    setError(null);
    try {
      const id = await createIssue();
      if (!id) return;
      const res = await fetch(`/api/issues/${id}/publish`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The draft was saved; surface the publish error but still let the user
        // open the saved draft.
        setError((data?.error as string) ?? "Saved as draft, but publishing to GitHub failed.");
        setSaved({ id, githubUrl: null, githubState: null });
        return;
      }
      setSaved({
        id,
        githubUrl: data.issue.githubUrl ?? null,
        githubNumber: data.issue.githubNumber ?? null,
        githubState: data.issue.githubState ?? null,
        duplicateOf: data.duplicateOf ?? null,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Generate issue</DialogTitle>
          <DialogDescription>
            Review and edit before sending.{" "}
            {githubConfigured
              ? project?.githubRepo
                ? `Reports go to ${project.githubRepo}; if this bug is already open there, you’ll be linked to it instead.`
                : "Reports go to the ASafarIM platform repo; if this bug is already open there, you’ll be linked to it instead."
              : "GitHub reporting isn’t set up for this app yet, so it can only be saved as a draft."}
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col gap-4 py-4">
            {saved.duplicateOf ? (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm">
                <p className="font-medium text-amber-300">
                  We already know about this bug — it’s tracked as #{saved.duplicateOf.number}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Thanks for reporting it. Your report was linked to the open issue instead of filing a
                  duplicate, and we’re working on a fix.
                </p>
              </div>
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-400">
                {saved.githubUrl
                  ? `Thanks — filed on GitHub${saved.githubNumber ? ` as #${saved.githubNumber}` : ""}.`
                  : "Issue saved as a draft."}
                {saved.githubUrl && <GithubStateBadge state={saved.githubState} />}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`${issuesHref}/${saved.id}`}>
                  <Pencil className="h-4 w-4" /> Open issue
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={issuesHref}>View all issues</Link>
              </Button>
              {saved.githubUrl && (
                <Button variant="outline" asChild>
                  <a href={saved.githubUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> View on GitHub
                  </a>
                </Button>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 overflow-y-auto py-1">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                  disabled={busy !== null}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
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

                {aiBusy ? (
                  <span className="inline-flex items-center gap-1 text-xs text-violet-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting with AI…
                  </span>
                ) : aiUsed ? (
                  <span className="inline-flex items-center gap-1 text-xs text-violet-400">
                    <Sparkles className="h-3.5 w-3.5" /> AI-drafted
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => void generate(true)}
                  disabled={aiBusy || busy !== null}
                  title="Re-draft the issue with AI (replaces the current text)"
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Regenerate
                </button>
              </div>

              {tab === "edit" ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="min-h-[16rem] w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
                  disabled={busy !== null}
                />
              ) : (
                <div
                  className="min-h-[16rem] w-full overflow-y-auto rounded-md border border-border bg-background px-4 py-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}

              {row.screenshot && (
                <figure className="rounded-md border border-border p-2">
                  <figcaption className="mb-1 text-xs text-muted-foreground">
                    Failure screenshot (kept with the result)
                  </figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.screenshot} alt="Failure screenshot" className="max-h-48 rounded object-contain" />
                </figure>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              {!githubConfigured && (
                <p className="mr-auto text-xs text-muted-foreground">
                  {canManage ? (
                    <>
                      Connect a repo in{" "}
                      <Link href="/apps" className="text-primary underline-offset-2 hover:underline">
                        Apps
                      </Link>{" "}
                      or set the platform default to enable sending.
                    </>
                  ) : (
                    "Sending to GitHub isn’t available for this app yet — an admin needs to connect it."
                  )}
                </p>
              )}
              <Button variant="outline" onClick={onClose} disabled={busy !== null}>
                Cancel
              </Button>
              {!canRunTests && <p className="mr-auto text-xs text-muted-foreground">{TESTER_ROLE_HINT}</p>}
              <Button
                variant="outline"
                onClick={() => void saveDraft()}
                disabled={busy !== null || !title.trim() || !canRunTests}
                title={canRunTests ? undefined : TESTER_ROLE_HINT}
              >
                {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft
              </Button>
              <Button
                onClick={() => void saveAndPublish()}
                disabled={busy !== null || !title.trim() || !githubConfigured || !canRunTests}
                title={canRunTests ? undefined : TESTER_ROLE_HINT}
              >
                {busy === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                Save &amp; send to GitHub
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
