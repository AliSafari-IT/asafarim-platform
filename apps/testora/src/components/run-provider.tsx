"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PROJECT_ID } from "@/data/projects";

// A client-safe view of an app, as returned by /api/projects. URLs + branding are
// only present when the app is viewable (public, or unlocked by this browser).
export interface ClientProject {
  id: string;
  name: string;
  visibility: "public" | "private";
  locked: boolean;
  seeded: boolean;
  baseUrl?: string;
  apiUrl?: string;
  productName?: string | null;
  companyName?: string | null;
  // Configured GitHub repo ("owner/name") and whether a token is stored. The
  // token itself never reaches the client.
  githubRepo?: string | null;
  githubConfigured?: boolean;
}

// Kept in sync with ACTIVE_PROJECT_COOKIE in @/lib/active-project (that module
// imports next/headers and can't be pulled into this client component). The
// initial value is passed in from the server (read from the cookie) so the app
// badge renders the right app immediately, with no hydration flash.
const PROJECT_COOKIE = "e2e_active_project";

export interface ReportEntry {
  suite: string;
  fixture: string;
  fixtureId: string;
  caseId: string;
  case: string;
  status: string;
  details: Record<string, unknown>;
}

// A run can be scoped to a single fixture, a whole suite, a whole functional
// requirement (every fixture beneath it runs in turn), every requirement at
// once, or only fixtures tagged as UI smokes or heavy live fixtures.
export type RunScope = "fixture" | "suite" | "requirement" | "all" | "ui" | "heavy";

export interface RunTarget {
  scope: RunScope;
  id: string;
  /** For the "all" scope: also include heavy live fixtures (default off). */
  includeHeavy?: boolean;
  /** For the "all" scope: also include browser/UI smoke fixtures (default off). */
  includeUi?: boolean;
}

// The "base scope" for a run: which deployment the tests target. Empty fields
// fall back to whatever the seed data hardcodes (local dev).
export interface RunEnvironment {
  baseUrl?: string;
  apiUrl?: string;
}

interface RunContextValue {
  selectedFixtureId: string;
  setSelectedFixtureId: (id: string) => void;
  // The active app/project; scopes the Run pickers + an "all" run to one app.
  projectId: string;
  setProjectId: (id: string) => void;
  // The DB-backed app registry (client-safe views) + a refresher for after
  // adding/editing/unlocking apps.
  projects: ClientProject[];
  refreshProjects: () => Promise<void>;
  // The active app's view, and whether it's locked for this browser.
  activeProject: ClientProject | null;
  activeProjectLocked: boolean;
  environment: RunEnvironment;
  setEnvironment: (env: RunEnvironment) => void;
  // The environment the currently displayed run was launched with (may differ
  // from `environment` if the user changed the selector after starting).
  runEnvironment: RunEnvironment | null;
  running: boolean;
  logs: string[];
  reports: ReportEntry[] | null;
  error: string | null;
  runId: string | null;
  // Metadata about the active run: total number of TestCafe runs and a human label.
  runMeta: { totalRuns: number; label: string } | null;
  // Unix timestamp when the active run started, exposed so the timer survives
  // navigation (the provider lives in the root layout). Null when no run is active.
  runStartTime: number | null;
  startRun: (target: RunTarget) => Promise<void>;
  rerunFailed: () => Promise<void>;
  // Re-execute an explicit set of (fixture, case) pairs — the basis for
  // re-running specific results selected on the Results page.
  rerunCases: (cases: { fixtureId: string; caseId: string }[]) => Promise<void>;
  failedCaseCount: number;
  cancelRun: () => Promise<void>;
}

// Maps an id-based run scope to the request-body key the /api/run endpoint
// expects. ("all" is handled separately — it carries no id.)
const SCOPE_BODY_KEY: Record<
  "fixture" | "suite" | "requirement",
  "fixtureId" | "suiteId" | "frId"
> = {
  fixture: "fixtureId",
  suite: "suiteId",
  requirement: "frId",
};

/**
 * The unique (fixture, case) pairs that did not pass in a result set. Deduped
 * across multi-run cases (one entry per result) so a case is rerun once even if
 * several of its runs failed. Entries missing ids (e.g. an older run) are
 * skipped so they never produce an unrunnable request.
 */
function collectFailedCases(
  reports: ReportEntry[] | null,
): { fixtureId: string; caseId: string }[] {
  if (!reports) return [];
  const seen = new Set<string>();
  const out: { fixtureId: string; caseId: string }[] = [];
  for (const report of reports) {
    if (report.status === "passed") continue;
    if (!report.fixtureId || !report.caseId) continue;
    const key = `${report.fixtureId}::${report.caseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fixtureId: report.fixtureId, caseId: report.caseId });
  }
  return out;
}

const RunContext = createContext<RunContextValue | null>(null);

// Persist the active run id so a full page reload can re-attach to the same
// server-side run (the stream replays its full log + final result on connect).
const STORAGE_KEY = "e2e_active_run";
// Persist the chosen target environment across reloads.
const ENV_STORAGE_KEY = "e2e_run_environment";
// Persist the environment a run was launched with, so a resumed run still shows
// the correct target badge after a reload.
const RUN_ENV_STORAGE_KEY = "e2e_active_run_environment";
// Persist the active run start timestamp so the timer survives navigation and reloads.
const RUN_START_TIME_KEY = "e2e_active_run_start_time";

/**
 * Holds the run state and the live SSE connection. It lives in the root layout,
 * so it survives client-side navigation between routes — start a run on /run,
 * then browse /results or /fixtures while it keeps streaming in the background.
 * The run itself executes server-side regardless; this just keeps the client
 * attached to it instead of tearing the stream down when /run unmounts.
 */
export function RunProvider({
  children,
  initialProject,
}: {
  children: React.ReactNode;
  initialProject?: string;
}) {
  const router = useRouter();
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [projectId, setProjectIdState] = useState<string>(
    initialProject ?? DEFAULT_PROJECT_ID,
  );
  const [projects, setProjects] = useState<ClientProject[]>([]);
  // Mirror of `projects` for use inside setProjectId without making it a dep.
  const projectsRef = useRef<ClientProject[]>([]);
  const [environment, setEnvironmentState] = useState<RunEnvironment>({});
  const [runEnvironment, setRunEnvironment] = useState<RunEnvironment | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [reports, setReports] = useState<ReportEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<{
    totalRuns: number;
    label: string;
  } | null>(null);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // Guards the generic "connection closed" error that browsers fire right after
  // a normal stream completion, so it isn't mistaken for a stale/unknown run.
  const finishedRef = useRef(false);

  const attach = useCallback((id: string, opts?: { resuming?: boolean }) => {
    esRef.current?.close();
    finishedRef.current = false;
    setRunId(id);
    setRunning(true);
    setLogs([]);
    setReports(null);
    setError(null);
    setRunMeta(null);

    // Restore the run start timestamp from storage, or initialize it now so the
    // timer keeps running across navigation and even page reloads.
    const storedStart = (() => {
      try {
        return localStorage.getItem(RUN_START_TIME_KEY);
      } catch {
        return null;
      }
    })();
    if (storedStart) {
      setRunStartTime(Number(storedStart));
    } else {
      const start = Date.now();
      setRunStartTime(start);
      try {
        localStorage.setItem(RUN_START_TIME_KEY, String(start));
      } catch {
        /* ignore */
      }
    }

    const es = new EventSource(`/api/run/stream/${id}`);
    esRef.current = es;

    es.addEventListener("log", (event) => {
      setLogs((prev) => [
        ...prev,
        JSON.parse((event as MessageEvent<string>).data),
      ]);
    });
    es.addEventListener("meta", (event) => {
      setRunMeta(JSON.parse((event as MessageEvent<string>).data));
    });
    es.addEventListener("done", (event) => {
      finishedRef.current = true;
      setReports(JSON.parse((event as MessageEvent<string>).data));
      setRunning(false);
      setRunStartTime(null);
      es.close();
      // The run is over — drop the resume marker so a later reload doesn't try to
      // re-attach to (and replay) a finished run.
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(RUN_START_TIME_KEY);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", (event) => {
      const message = (event as MessageEvent<string>).data;
      if (message) {
        finishedRef.current = true;
        try {
          setError(JSON.parse(message));
        } catch {
          setError("Run failed");
        }
        setRunning(false);
        setRunStartTime(null);
        es.close();
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(RUN_START_TIME_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      // No payload + closed connection that never delivered a result means the
      // run id is unknown to the server (e.g. it restarted). Drop it quietly.
      if (es.readyState === EventSource.CLOSED && !finishedRef.current) {
        setRunning(false);
        es.close();
        if (opts?.resuming) {
          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(RUN_START_TIME_KEY);
          } catch {
            /* ignore */
          }
          setRunId(null);
          setRunStartTime(null);
        }
      }
    });
  }, []);

  // On first mount, resume any in-progress run. The server is the source of
  // truth: ask it which run (if any) is active and re-attach to that. This
  // recovers even when this client's localStorage is empty/stale (e.g. it was
  // cleared, or the run was started from another tab/browser). localStorage is
  // only a fast-path fallback when the server has no record (e.g. it restarted).
  useEffect(() => {
    let cancelled = false;

    function restoreEnv() {
      try {
        const envRaw = localStorage.getItem(RUN_ENV_STORAGE_KEY);
        if (envRaw) setRunEnvironment(JSON.parse(envRaw));
      } catch {
        /* ignore */
      }
    }

    (async () => {
      let activeId: string | null = null;
      try {
        const res = await fetch("/api/run");
        if (res.ok) {
          const data = await res.json();
          activeId = data?.active?.runId ?? null;
        }
      } catch {
        /* ignore network errors and fall back to localStorage */
      }
      if (cancelled) return;

      if (activeId) {
        try {
          localStorage.setItem(STORAGE_KEY, activeId);
        } catch {
          /* ignore */
        }
        restoreEnv();
        attach(activeId);
        return;
      }

      // No server-side run. Try the locally recorded id (handles a server that
      // restarted mid-run); attach() clears it if the server doesn't know it.
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (stored) {
        restoreEnv();
        attach(stored, { resuming: true });
      }
    })();

    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [attach]);

  // Restore the chosen target environment + active project.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ENV_STORAGE_KEY);
      if (raw) setEnvironmentState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const setProjectId = useCallback(
    (id: string) => {
      setProjectIdState(id);
      // Cookie (not localStorage) so server components — Cases/Requirements/
      // Results — read the same active app. Refresh re-renders them with it.
      try {
        document.cookie = `${PROJECT_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        /* ignore */
      }
      // Pre-fill the target with the app's own origin, so a run hits the right
      // deployment (apps live on different domains — portal vs edumatch). The
      // user can still override the URLs afterwards for a dev/custom target.
      // A locked private app exposes no URLs, so prefill is skipped for it.
      const proj = projectsRef.current.find((p) => p.id === id);
      if (proj && !proj.locked && (proj.baseUrl || proj.apiUrl)) {
        const env: RunEnvironment = { baseUrl: proj.baseUrl, apiUrl: proj.apiUrl };
        setEnvironmentState(env);
        try {
          localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(env));
        } catch {
          /* ignore */
        }
      }
      router.refresh();
    },
    [router],
  );

  const setEnvironment = useCallback((env: RunEnvironment) => {
    setEnvironmentState(env);
    try {
      localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(env));
    } catch {
      /* ignore */
    }
  }, []);

  // Load the DB-backed app registry (client-safe views). Re-run after adding,
  // editing, unlocking or locking an app so lock state + URLs stay current.
  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const list = (await res.json()) as ClientProject[];
      const arr = Array.isArray(list) ? list : [];
      setProjects(arr);
      projectsRef.current = arr;
    } catch {
      /* ignore — keep whatever we had */
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const cancelRun = useCallback(async () => {
    if (!runId) return;
    esRef.current?.close();
    try {
      await fetch(`/api/run/${runId}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setRunning(false);
    setError("Run cancelled");
    setRunId(null);
    setRunStartTime(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RUN_START_TIME_KEY);
    } catch {
      /* ignore */
    }
  }, [runId]);

  // Cancel whatever run the server currently has active, regardless of whether
  // this client knows its id (it may not, right after a reload). Used to make
  // room for a new run the user just requested. Unlike cancelRun, it stays
  // quiet — no "Run cancelled" message — because a fresh run is about to start.
  const cancelActiveRun = useCallback(async () => {
    esRef.current?.close();
    let id = runId;
    if (!id) {
      try {
        const res = await fetch("/api/run");
        if (res.ok) id = (await res.json())?.active?.runId ?? null;
      } catch {
        /* ignore */
      }
    }
    if (!id) return;
    try {
      await fetch(`/api/run/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }, [runId]);

  // Shared launcher: POST a run request body, then attach to its stream.
  const beginRun = useCallback(
    async (body: Record<string, unknown>) => {
      setRunning(true);
      setError(null);
      setReports(null);
      setLogs([]);
      // Record the start timestamp in the provider so it survives navigation,
      // and persist it for page reloads as well.
      const start = Date.now();
      setRunStartTime(start);
      try {
        localStorage.setItem(RUN_START_TIME_KEY, String(start));
      } catch {
        /* ignore */
      }
      // Attach the selected base scope so the same run can target local or
      // production without any change to the test content.
      const envUsed: RunEnvironment = {
        baseUrl: environment.baseUrl,
        apiUrl: environment.apiUrl,
      };
      setRunEnvironment(envUsed);
      try {
        localStorage.setItem(RUN_ENV_STORAGE_KEY, JSON.stringify(envUsed));
      } catch {
        /* ignore */
      }
      const payload = {
        ...body,
        ...(environment.baseUrl ? { baseUrl: environment.baseUrl } : {}),
        ...(environment.apiUrl ? { apiUrl: environment.apiUrl } : {}),
        ...(projectId ? { projectId } : {}),
      };
      const post = () =>
        fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      try {
        let res = await post();
        // A run is already in progress. Since the user explicitly asked to run
        // something new, cancel the in-flight run and start theirs. (Only one
        // TestCafe run can launch a browser at a time.)
        if (res.status === 409) {
          await cancelActiveRun();
          // Give the previous run's browser a moment to tear down before the
          // next one launches, then retry once.
          await new Promise((resolve) => setTimeout(resolve, 1500));
          res = await post();
        }
        const data = await res.json();
        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : JSON.stringify(data.error),
          );
          setRunning(false);
          setRunStartTime(null);
          try {
            localStorage.removeItem(RUN_START_TIME_KEY);
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          localStorage.setItem(STORAGE_KEY, data.runId);
        } catch {
          /* ignore */
        }
        attach(data.runId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed");
        setRunning(false);
        setRunStartTime(null);
        try {
          localStorage.removeItem(RUN_START_TIME_KEY);
        } catch {
          /* ignore */
        }
      }
    },
    [attach, environment, projectId, cancelActiveRun],
  );

  const startRun = useCallback(
    async (target: RunTarget) => {
      if (target.scope === "all") {
        await beginRun({
          all: true,
          ...(target.includeHeavy ? { includeHeavy: true } : {}),
          ...(target.includeUi ? { includeUi: true } : {}),
        });
        return;
      }
      if (target.scope === "ui") {
        await beginRun({ ui: true });
        return;
      }
      if (target.scope === "heavy") {
        await beginRun({ heavy: true });
        return;
      }
      if (!target.id) return;
      await beginRun({ [SCOPE_BODY_KEY[target.scope]]: target.id });
    },
    [beginRun],
  );

  // Re-execute just the cases that didn't pass in the current result set —
  // works for any prior scope, since it re-targets the cases by id.
  const rerunFailed = useCallback(async () => {
    const cases = collectFailedCases(reports);
    if (cases.length === 0) return;
    await beginRun({ cases });
  }, [reports, beginRun]);

  // Re-execute an explicit set of (fixture, case) pairs. Deduped so a case that
  // appears several times (e.g. multiple runs) is only requested once.
  const rerunCases = useCallback(
    async (cases: { fixtureId: string; caseId: string }[]) => {
      const seen = new Set<string>();
      const deduped: { fixtureId: string; caseId: string }[] = [];
      for (const { fixtureId: fid, caseId: cid } of cases) {
        if (!fid || !cid) continue;
        const key = `${fid}::${cid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ fixtureId: fid, caseId: cid });
      }
      if (deduped.length === 0) return;
      await beginRun({ cases: deduped });
    },
    [beginRun],
  );

  const failedCaseCount = collectFailedCases(reports).length;
  const activeProject = projects.find((p) => p.id === projectId) ?? null;
  const activeProjectLocked = activeProject?.locked ?? false;

  return (
    <RunContext.Provider
      value={{
        selectedFixtureId,
        setSelectedFixtureId,
        projectId,
        setProjectId,
        projects,
        refreshProjects,
        activeProject,
        activeProjectLocked,
        environment,
        setEnvironment,
        runEnvironment,
        running,
        logs,
        reports,
        error,
        runId,
        runMeta,
        runStartTime,
        startRun,
        rerunFailed,
        rerunCases,
        failedCaseCount,
        cancelRun,
      }}
    >
      {children}
    </RunContext.Provider>
  );
}

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within a RunProvider");
  return ctx;
}
