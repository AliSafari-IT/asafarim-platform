"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type Project } from "../../lib/client/api";
import { track } from "../../lib/client/telemetry";
import { captureDestinationMessage } from "../../lib/capture/inbox";

/**
 * Universal capture (issue #366).
 *
 * One dialog behind one global action, reachable from every workspace page
 * and from ⌘K. The minimum path is a title and Enter. Everything else —
 * project, owner, date, notes — is optional now and available during triage
 * later.
 *
 * Two rules this dialog exists to keep:
 *   1. It never silently picks a project. The default destination is the
 *      workspace Inbox, and the chosen destination is always on screen.
 *   2. It always says where the task went, by name, after saving.
 */

interface CaptureApi {
  /** Open the dialog, optionally pre-filled with a title. */
  open: (prefillTitle?: string, from?: string) => void;
  /** False for roles that may not create work (guests). */
  canCapture: boolean;
  /**
   * Called after every successful capture. Client lists that hold their own
   * rows (the Inbox triage list) reload here — `router.refresh()` re-renders
   * the server tree but does not touch their state.
   */
  onCaptured: (listener: () => void) => () => void;
}

const CaptureCtx = createContext<CaptureApi | null>(null);

export function useCapture(): CaptureApi {
  const v = useContext(CaptureCtx);
  if (!v) throw new Error("useCapture outside CaptureProvider");
  return v;
}

/**
 * The title field is refocused after each capture so a burst of items can be
 * typed one after another. Looked up by id rather than held in a ref: the
 * shared `Input` primitive is a plain function component, not a ref
 * forwarder.
 */
function focusTitle() {
  const el = document.getElementById("cap-title");
  if (el instanceof HTMLInputElement) el.focus();
}

/** Remember the last destination per workspace so repeat capture is one key. */
function lastProjectKey(slug: string) {
  return `tasksai:capture:lastProject:${slug}`;
}

function readLastProject(slug: string): string {
  try {
    return window.localStorage.getItem(lastProjectKey(slug)) ?? "";
  } catch {
    return "";
  }
}

function writeLastProject(slug: string, value: string) {
  try {
    window.localStorage.setItem(lastProjectKey(slug), value);
  } catch {
    /* private mode / storage disabled — capture still works, it just forgets */
  }
}

export function CaptureProvider({
  slug,
  role,
  membershipId,
  children,
}: {
  slug: string;
  role: string;
  membershipId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const canCapture = role !== "guest";
  const listeners = useRef(new Set<() => void>());

  const value = useMemo<CaptureApi>(
    () => ({
      canCapture,
      open: (prefillTitle?: string, from = "unknown") => {
        if (!canCapture) return;
        setPrefill(prefillTitle ?? "");
        setOpen(true);
        track({ name: "capture.opened", from });
      },
      onCaptured: (listener: () => void) => {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [canCapture],
  );

  const announce = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);

  return (
    <CaptureCtx.Provider value={value}>
      {children}
      {open && (
        <CaptureDialog
          slug={slug}
          membershipId={membershipId}
          initialTitle={prefill}
          onCaptured={announce}
          onClose={() => setOpen(false)}
        />
      )}
    </CaptureCtx.Provider>
  );
}

/** The compact global action that lives in the workspace shell. */
export function CaptureButton() {
  const { open, canCapture } = useCapture();
  if (!canCapture) return null;
  return (
    <button type="button" className="ta-capture__btn" onClick={() => open("", "shell")}>
      <span aria-hidden="true">+</span> Capture
    </button>
  );
}

function CaptureDialog({
  slug,
  membershipId,
  initialTitle,
  onCaptured,
  onClose,
}: {
  slug: string;
  membershipId: string;
  initialTitle: string;
  onCaptured: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [review, setReview] = useState(false);
  const [assignToMe, setAssignToMe] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; href: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listProjects(slug)
      .then((rows) => {
        if (!alive) return;
        const real = rows.filter((p) => !p.isInbox && !p.archivedAt);
        setProjects(real);
        const remembered = readLastProject(slug);
        // Only restore a destination that still exists — otherwise fall back
        // to the Inbox rather than to "some project".
        setProjectId(real.some((p) => p.id === remembered) ? remembered : "");
      })
      .catch(() => alive && setProjects([]));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = projects?.find((p) => p.id === projectId) ?? null;

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const value = title.trim();
      if (!value || busy) return;
      setBusy(true);
      setError(null);
      try {
        const created = await api.createTask(slug, {
          title: value,
          // Omitted on purpose when no project is chosen: the server puts it
          // in the workspace Inbox container. It never guesses.
          ...(projectId ? { projectId } : {}),
          ...(projectId && review ? { captureToInbox: true } : {}),
          ...(assignToMe ? { assigneeId: membershipId } : {}),
          ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          source: "quick_capture",
        });
        writeLastProject(slug, projectId);
        const landedInInbox = created.triagedAt === null;
        track({
          name: "capture.completed",
          source: "quick_capture",
          destination: landedInInbox ? "inbox" : "project",
        });
        track({ name: "task.created", source: "quick_capture" });
        setResult({
          message: captureDestinationMessage({
            projectName: chosen?.name ?? "Inbox",
            isInbox: !projectId,
            triaged: !landedInInbox,
          }),
          href: landedInInbox
            ? `/w/${slug}/inbox`
            : chosen
              ? `/w/${slug}/projects/${chosen.key}`
              : `/w/${slug}/inbox`,
        });
        // Cleared, focused, ready for the next one — capture is a burst
        // activity after a call, not a single form submission.
        setTitle("");
        setDescription("");
        focusTitle();
        router.refresh();
        // …and tell the client-side lists that hold their own rows, which a
        // server re-render does not reach.
        onCaptured();
      } catch (err) {
        setError(
          err instanceof ClientApiError && err.code === "forbidden"
            ? "Your role cannot create work in this workspace."
            : err instanceof Error
              ? err.message
              : "Could not capture that.",
        );
      } finally {
        setBusy(false);
      }
    },
    [assignToMe, busy, chosen, description, dueDate, membershipId, onCaptured, projectId, review, router, slug, title],
  );

  const projectOptions = [
    { value: "", label: "Inbox — decide later" },
    ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
  ];

  return (
    <div className="ta-capture" role="dialog" aria-modal="true" aria-label="Capture work">
      <div className="ta-capture__backdrop" onClick={onClose} />
      <form className="ta-capture__panel" onSubmit={submit}>
        <header className="ta-capture__head">
          <h2>Capture</h2>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </header>

        <Label htmlFor="cap-title">What needs to happen?</Label>
        <Input
          id="cap-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Send the revised quote to Dana"
          aria-describedby="cap-dest"
          autoComplete="off"
        />

        <Label htmlFor="cap-project">Where should it go?</Label>
        <Select
          id="cap-project"
          value={projectId}
          options={projectOptions}
          onChange={(e) => {
            setProjectId(e.target.value);
            setResult(null);
          }}
        />
        <p className="ta-hint" id="cap-dest">
          {projectId
            ? `Goes straight into ${chosen?.name ?? "the selected project"}.`
            : "Waits in your Inbox until you decide where it belongs. Nothing is guessed for you."}
        </p>

        {projectId && (
          <label className="ta-toggle">
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
            />
            Still review it in the Inbox
          </label>
        )}

        <button
          type="button"
          className="ta-linkbtn ta-capture__more"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {more ? "Hide details" : "Add details (optional)"}
        </button>

        {more && (
          <div className="ta-capture__details">
            <Label htmlFor="cap-due">Due date</Label>
            <Input
              id="cap-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <label className="ta-toggle">
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e) => setAssignToMe(e.target.checked)}
              />
              Assign it to me
            </label>
            <Label htmlFor="cap-desc">Notes</Label>
            <Textarea
              id="cap-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p className="ta-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="ta-capture__result" role="status">
            {result.message}{" "}
            <a className="ta-link" href={result.href}>
              Open it
            </a>
          </p>
        )}

        <div className="ta-capture__actions">
          <Button type="submit" size="sm" disabled={busy || !title.trim()}>
            {busy ? "Capturing…" : "Capture"}
          </Button>
          <span className="ta-hint">
            <kbd>Enter</kbd> to capture, <kbd>Esc</kbd> to close. Capture again without
            reopening.
          </span>
        </div>
      </form>
    </div>
  );
}
