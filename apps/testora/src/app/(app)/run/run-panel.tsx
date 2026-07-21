"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Combobox } from "@/components/ui/combobox";
import {
  Camera,
  Check,
  Copy,
  Database,
  Globe,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  StopCircle,
  Terminal,
  Trash2,
} from "lucide-react";
import { ScreenshotLightbox } from "@/components/results/screenshot-lightbox";
import {
  useRun,
  type RunScope,
  type RunEnvironment,
} from "@/components/run-provider";
import { DomainBrandControl } from "@/components/run/domain-brand-control";
import { LockedApp } from "@/components/locked-app";
import { hostFromUrl, setDomainBrand, getDomainBrand, type DomainBrand } from "@/lib/domain-logos";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface FixtureSummary {
  fixtureId: string;
  title: string;
  caseCount: number;
  metadata?: Record<string, unknown>;
}

interface SuiteSummary {
  suiteId: string;
  title: string;
  fixtureCount: number;
  caseCount: number;
}

interface RequirementSummary {
  id: string;
  title: string;
  suiteCount: number;
  fixtureCount: number;
  caseCount: number;
}

const SCOPE_TABS: { scope: RunScope; label: string }[] = [
  { scope: "fixture", label: "Fixture" },
  { scope: "suite", label: "Test suite" },
  { scope: "requirement", label: "Functional requirement" },
  { scope: "all", label: "All requirements" },
  { scope: "ui", label: "UI smokes" },
  { scope: "heavy", label: "Heavy live" },
];

// A target environment — which deployment a run is pointed at. Built-in entries
// (Local / Remote, seeded per app) and user-added ones both come from the DB via
// /api/targets; picking one fills the run's base URLs without touching any test
// content. See src/data/projects.ts (seed definitions) and the targets API route.
interface TargetEnv {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  apiUrl: string;
  seeded: boolean;
}

// Sentinel <option> value for the "add a new target" choice in the dropdown.
const ADD_TARGET = "__add__";
// Remembers which target was picked across reloads (selection is by id, since
// several targets can share the same URLs — e.g. a custom clone of Remote).
const SELECTED_TARGET_KEY = "e2e_selected_target";

function isWebEnv(env: RunEnvironment | null): boolean {
  if (!env?.baseUrl) return false;
  try {
    const host = new URL(env.baseUrl).hostname;
    return !(
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}

function environmentLabel(env: RunEnvironment | null, targets: TargetEnv[]): string {
  if (!env || (!env.baseUrl && !env.apiUrl)) return "Default (seed)";
  const match = targets.find(
    (t) => t.baseUrl === (env.baseUrl ?? "") && t.apiUrl === (env.apiUrl ?? ""),
  );
  if (match) return match.name;
  try {
    return new URL(env.baseUrl ?? "").host || "Custom";
  } catch {
    return "Custom";
  }
}

/** A small pill showing which deployment a run targeted. */
function EnvBadge({ env, targets }: { env: RunEnvironment | null; targets: TargetEnv[] }) {
  const web = isWebEnv(env);
  return (
    <span
      title={
        env?.baseUrl
          ? `Site ${env.baseUrl}${env.apiUrl ? ` · API ${env.apiUrl}` : ""}`
          : "Seed-data URLs"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        web
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Globe className="h-3 w-3" />
      {environmentLabel(env, targets)}
    </span>
  );
}

// TestCafe's per-test result markers differ by platform: Windows prints √ / ×,
// Linux/macOS print ✓ / ✖ (or ✔ / ✗). Match the whole family so the progress
// bar and log colouring work the same in dev (Windows) and prod (Linux).
const PASS_MARK = /^\s*[√✓✔]/;
const FAIL_MARK = /^\s*[×✗✖]/;
const DONE_MARK = /^\s*[√✓✔×✗✖]/;

// Colour a TestCafe console line by severity so failures stand out.
function logLineClassName(line: string): string {
  const l = line.trim();
  if (
    FAIL_MARK.test(l) || // failed test marker
    /^\d+\)/.test(l) || // error detail, e.g. "1) AssertionError: ..."
    /assertionerror|error[:\s]|exception|unhandled/i.test(l) ||
    /\b\d+\/\d+\s+failed\b/.test(l) || // "1/2 failed"
    /\bfailed\b/i.test(l)
  ) {
    return "text-red-400";
  }
  if (/^warning/i.test(l) || /warnings?\s*\(/i.test(l)) {
    return "text-yellow-300";
  }
  if (PASS_MARK.test(l) || /\bpassed\b/i.test(l)) {
    return "text-emerald-300";
  }
  return "text-green-300/90";
}

/** Extract the test title from the most recent TestCafe completion marker. */
function lastTestTitle(logs: string[]): string | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const trimmed = logs[i]!.trim();
    if (DONE_MARK.test(trimmed)) {
      return trimmed.slice(1).trim();
    }
  }
  return null;
}

/** Format a millisecond duration as "Xm Ys" or "Xh Ym Zs". */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function RunPanel() {
  const searchParams = useSearchParams();
  // Run state lives in RunProvider (mounted in the layout) so it survives
  // navigating to other routes while a run is in progress.
  const {
    selectedFixtureId,
    setSelectedFixtureId,
    projectId,
    setProjectId,
    projects,
    activeProject,
    activeProjectLocked,
    environment,
    setEnvironment,
    runEnvironment,
    running,
    logs,
    reports,
    error,
    runMeta,
    runStartTime,
    startRun,
    rerunFailed,
    failedCaseCount,
    cancelRun,
  } = useRun();
  const [scope, setScope] = useState<RunScope>("fixture");
  const [shotZoom, setShotZoom] = useState<string | null>(null);
  const [includeHeavy, setIncludeHeavy] = useState(false);
  const [includeUi, setIncludeUi] = useState(false);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [copied, setCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Re-fetch the three catalog lists (after mount, and after a re-seed) while
  // preserving the current selections.
  const refreshCatalog = useCallback(async () => {
    const q = `?project=${encodeURIComponent(projectId)}`;
    // A locked private app returns 403 here; coerce any non-array (error) body to
    // an empty list so the pickers stay well-formed until it's unlocked.
    const asList = async <T,>(res: Response): Promise<T[]> => {
      if (!res.ok) return [];
      const body = await res.json().catch(() => []);
      return Array.isArray(body) ? (body as T[]) : [];
    };
    const [f, s, r] = await Promise.all([
      fetch(`/api/fixtures${q}`).then((res) => asList<FixtureSummary>(res)),
      fetch(`/api/suites${q}`).then((res) => asList<SuiteSummary>(res)),
      fetch(`/api/requirements${q}`).then((res) => asList<RequirementSummary>(res)),
    ]);
    setFixtures(f);
    setSuites(s);
    setRequirements(r);
    // The selections belong to the previous project's catalog, so re-anchor them
    // to this project's first entries.
    setSelectedSuiteId(s[0]?.suiteId || "");
    setSelectedRequirementId(r[0]?.id || "");
    setSelectedFixtureId(f[0]?.fixtureId || "");
    return { f, s, r };
  }, [projectId, setSelectedFixtureId]);

  async function reseed() {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSeedMessage({
          type: "error",
          text: typeof data.error === "string" ? data.error : "Re-seed failed",
        });
        return;
      }
      const { f } = await refreshCatalog();
      if (!selectedFixtureId && f[0]) setSelectedFixtureId(f[0].fixtureId);
      setSeedMessage({
        type: "success",
        text: `Tests updated — ${data.requirements} requirements, ${data.suites} suites, ${data.fixtures} fixtures, ${data.cases} cases${
          data.prunedFixtures || data.prunedCases
            ? ` · pruned ${data.prunedFixtures} stale fixture(s), ${data.prunedCases} case(s)`
            : ""
        }.`,
      });
    } catch (err) {
      setSeedMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Re-seed failed",
      });
    } finally {
      setSeeding(false);
    }
  }

  // Target environments for the active app (built-in Local/Remote + user-added),
  // loaded from the DB. The dropdown selection is reconciled with the persisted
  // environment (restored asynchronously by the provider) so a reload reflects
  // the last choice.
  const [targets, setTargets] = useState<TargetEnv[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  // Form mode: null = none, "add" = new target, or the id of the target being edited.
  const [targetForm, setTargetForm] = useState<null | "add" | { editId: string }>(null);
  const [targetDraft, setTargetDraft] = useState({ name: "", baseUrl: "", apiUrl: "" });
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const loadTargets = useCallback(async (project: string) => {
    const res = await fetch(`/api/targets?project=${encodeURIComponent(project)}`);
    const list = (await res.json()) as TargetEnv[];
    setTargets(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }, []);

  // Select a target by id: remember it (so a reload restores the exact one even
  // when several share URLs) and apply its URLs as the run environment.
  const chooseTarget = useCallback(
    (target: TargetEnv) => {
      setSelectedTargetId(target.id);
      try {
        localStorage.setItem(SELECTED_TARGET_KEY, target.id);
      } catch {
        /* ignore */
      }
      setEnvironment({ baseUrl: target.baseUrl, apiUrl: target.apiUrl });
    },
    [setEnvironment],
  );

  // Load this app's targets on mount and whenever the active app changes.
  useEffect(() => {
    void loadTargets(projectId);
  }, [projectId, loadTargets]);

  // Pick an initial selection only when the current one is missing/invalid (e.g.
  // first load, or after switching apps). Selection is tracked by id and never
  // re-derived from URLs once valid — otherwise a custom target that clones
  // Remote's URLs would snap back to Remote. Preference: the remembered id, then
  // a URL match for the restored environment, then the first target.
  useEffect(() => {
    if (targetForm || targets.length === 0) return;
    if (selectedTargetId && targets.some((t) => t.id === selectedTargetId)) return;
    let storedId = "";
    try {
      storedId = localStorage.getItem(SELECTED_TARGET_KEY) ?? "";
    } catch {
      /* ignore */
    }
    const chosen =
      targets.find((t) => t.id === storedId) ??
      targets.find(
        (t) => t.baseUrl === (environment.baseUrl ?? "") && t.apiUrl === (environment.apiUrl ?? ""),
      ) ??
      targets[0]!;
    chooseTarget(chosen);
  }, [targets, environment, selectedTargetId, targetForm, chooseTarget]);

  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null;

  function selectTarget(value: string) {
    if (value === ADD_TARGET) {
      setTargetForm("add");
      setTargetError(null);
      setTargetDraft({
        name: "",
        baseUrl: environment.baseUrl ?? "",
        apiUrl: environment.apiUrl ?? "",
      });
      return;
    }
    setTargetForm(null);
    const target = targets.find((t) => t.id === value);
    if (target) chooseTarget(target);
  }

  function startEditTarget(target: TargetEnv) {
    setTargetForm({ editId: target.id });
    setTargetError(null);
    setTargetDraft({ name: target.name, baseUrl: target.baseUrl, apiUrl: target.apiUrl });
  }

  async function saveTarget() {
    setSavingTarget(true);
    setTargetError(null);
    const editId = targetForm && targetForm !== "add" ? targetForm.editId : null;
    const isAdding = targetForm === "add";
    try {
      const res = await fetch(
        editId ? `/api/targets?id=${encodeURIComponent(editId)}` : "/api/targets",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editId ? targetDraft : { projectId, ...targetDraft }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setTargetError(
          typeof data.error === "string"
            ? data.error
            : "Could not save target — check the name and that both URLs are absolute (http:// or https://).",
        );
        return;
      }
      await loadTargets(projectId);
      setTargetForm(null);
      const saved = data.target as TargetEnv | undefined;
      if (saved) chooseTarget(saved);
      // Seed the new target's host with the app's branding if it has none yet.
      const host = hostFromUrl(targetDraft.baseUrl);
      if (isAdding && host && activeProject) {
        const existing = getDomainBrand(host);
        const hasNoBrand =
          !existing.productName &&
          !existing.companyName &&
          !existing.productLogo &&
          !existing.companyLogo;
        if (hasNoBrand) {
          const productName = activeProject.productName?.trim() || undefined;
          const companyName = activeProject.companyName?.trim() || undefined;
          if (productName || companyName) {
            setDomainBrand(host, { productName, companyName });
          }
        }
      }
    } catch {
      setTargetError("Could not save target.");
    } finally {
      setSavingTarget(false);
    }
  }

  async function deleteTarget(id: string) {
    try {
      await fetch(`/api/targets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore — the reload below reflects the real state */
    }
    setTargetForm(null);
    const list = await loadTargets(projectId);
    // The deleted id is gone, so the reconcile effect would normally re-pick, but
    // do it here too for immediacy (falling back to the first remaining target).
    if (id === selectedTargetId && list[0]) chooseTarget(list[0]);
  }

  // Populate the dropdowns on mount AND whenever the active project changes
  // (refreshCatalog is keyed on projectId). A `?fixtureId=` deep-link is honoured
  // only on the very first load, not when switching apps.
  const didInitCatalog = useRef(false);
  useEffect(() => {
    void refreshCatalog().then(() => {
      if (!didInitCatalog.current) {
        didInitCatalog.current = true;
        const deep = searchParams.get("fixtureId");
        if (deep) setSelectedFixtureId(deep);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCatalog]);

  // The currently selected id and a human label for the active scope, so the
  // single Run button and disabled-state logic don't branch every way. "all"
  // needs no id.
  const selectedId =
    scope === "fixture"
      ? selectedFixtureId
      : scope === "suite"
        ? selectedSuiteId
        : scope === "requirement"
          ? selectedRequirementId
          : "";
  const scopeLabel =
    scope === "fixture"
      ? "fixture"
      : scope === "suite"
        ? "suite"
        : scope === "requirement"
          ? "requirement"
          : scope === "ui"
            ? "UI smokes"
            : scope === "heavy"
              ? "heavy live fixtures"
              : "all requirements";
  // Totals shown for the "all" scope.
  const allTotals = requirements.reduce(
    (acc, r) => ({
      fixtures: acc.fixtures + r.fixtureCount,
      cases: acc.cases + r.caseCount,
    }),
    { fixtures: 0, cases: 0 },
  );

  const totalCases = useMemo(() => {
    if (scope === "fixture")
      return (
        fixtures.find((f) => f.fixtureId === selectedFixtureId)?.caseCount ?? 0
      );
    if (scope === "suite")
      return suites.find((s) => s.suiteId === selectedSuiteId)?.caseCount ?? 0;
    if (scope === "requirement")
      return (
        requirements.find((r) => r.id === selectedRequirementId)?.caseCount ?? 0
      );
    if (scope === "ui")
      return fixtures
        .filter((f) => f.metadata?.ui === true)
        .reduce((sum, f) => sum + f.caseCount, 0);
    if (scope === "heavy")
      return fixtures
        .filter((f) => f.metadata?.heavy === true)
        .reduce((sum, f) => sum + f.caseCount, 0);
    return allTotals.cases;
  }, [
    scope,
    selectedFixtureId,
    selectedSuiteId,
    selectedRequirementId,
    fixtures,
    suites,
    requirements,
    allTotals.cases,
  ]);

  const canRun =
    scope === "fixture" || scope === "suite" || scope === "requirement"
      ? Boolean(selectedId)
      : totalCases > 0;

  const progressTotal = runMeta?.totalRuns ?? totalCases;

  const completedCases = useMemo(() => {
    // TestCafe marks completed tests with a leading pass/fail glyph (√/✓ or ×/✖,
    // platform-dependent). A retried fixture can re-print lines, so never report
    // more than the planned total.
    const counted = logs.filter((line) => DONE_MARK.test(line)).length;
    return progressTotal > 0 ? Math.min(counted, progressTotal) : counted;
  }, [logs, progressTotal]);

  const currentTestTitle = useMemo(() => lastTestTitle(logs), [logs]);

  const progressPercent =
    progressTotal > 0
      ? Math.min(100, (completedCases / progressTotal) * 100)
      : 0;

  // Track elapsed wall time while a run is active so the progress card can
  // show how long the current run has been running. The start timestamp is
  // stored in the provider (which survives navigation) so the timer resumes
  // from the correct value when the user returns to this page.
  useEffect(() => {
    if (runStartTime == null) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - runStartTime);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runStartTime]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  async function copyLogs() {
    await navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Default product/company branding for the active app. Used to pre-fill the
  // domain-brand control when a target host has no stored branding yet.
  const defaultBrand = useMemo<DomainBrand | undefined>(() => {
    if (!activeProject || activeProject.locked) return undefined;
    const productName = activeProject.productName?.trim() || undefined;
    const companyName = activeProject.companyName?.trim() || undefined;
    return productName || companyName ? { productName, companyName } : undefined;
  }, [activeProject?.productName, activeProject?.companyName, activeProject?.locked]);

  // Switching apps re-points the catalog (handled by refreshCatalog, keyed on
  // projectId) AND re-loads that app's target environments. The reconcile effect
  // then selects the matching/first target for the new app.
  function applyProject(id: string) {
    setProjectId(id);
    setTargetForm(null);
    const proj = projects.find((p) => p.id === id);
    if (proj && !proj.locked && (proj.productName || proj.companyName)) {
      const host = hostFromUrl(proj.baseUrl) ?? "localhost";
      setDomainBrand(host, {
        productName: proj.productName ?? undefined,
        companyName: proj.companyName ?? undefined,
      });
    }
    // setProjectId (in the provider) pre-fills the environment with the app's
    // defaults; loading its targets lets the reconcile effect snap to a target.
    void loadTargets(id);
  }

  const appSelector = (
    <Card data-tour="app">
      <CardHeader>
        <CardTitle>App</CardTitle>
        <CardDescription>
          Which application&apos;s test catalog to run. Each app has its own
          requirements, suites and fixtures; switching here re-points the lists
          below and pre-fills the target with that app&apos;s defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 min-w-56 rounded-md border border-border bg-muted px-3 text-sm"
            value={projectId}
            onChange={(event) => applyProject(event.target.value)}
            disabled={running}
          >
            {projects.length === 0 && <option value={projectId}>{projectId}</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.visibility === "private" ? (p.locked ? " 🔒" : " 🔓") : ""}
              </option>
            ))}
          </select>
          {activeProject?.locked ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
              <Lock className="h-3.5 w-3.5" /> Private — unlock to run
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {requirements.length} requirement(s) · {suites.length} suite(s) ·{" "}
              {fixtures.length} fixture(s)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // A locked private app exposes no catalog/target — offer only the app switcher
  // and the unlock prompt until its key is provided.
  if (activeProjectLocked) {
    return (
      <div className="flex flex-col gap-6">
        {appSelector}
        <LockedApp projectId={projectId} name={activeProject?.name ?? projectId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {appSelector}

      <Card data-tour="target">
        <CardHeader>
          <CardTitle>Target environment</CardTitle>
          <CardDescription>
            Point the run at a deployment — the same tests run against local or
            remote with no change to their content. APIs use this base; UI
            smokes open it in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
              value={targetForm === "add" ? ADD_TARGET : selectedTargetId}
              onChange={(event) => selectTarget(event.target.value)}
              disabled={running}
            >
              {targets.length === 0 && targetForm !== "add" && (
                <option value="">No targets — add one</option>
              )}
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                  {target.seeded ? "" : " (custom)"}
                </option>
              ))}
              <option value={ADD_TARGET}>＋ Add new…</option>
            </select>
            {!targetForm && selectedTarget && (
              <span className="text-xs text-muted-foreground">
                Site {selectedTarget.baseUrl} · API {selectedTarget.apiUrl}
              </span>
            )}
            {!targetForm && selectedTarget && !selectedTarget.seeded && (
              <>
                <button
                  type="button"
                  onClick={() => startEditTarget(selectedTarget)}
                  disabled={running}
                  title="Edit this custom target"
                  className="inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTarget(selectedTarget.id)}
                  disabled={running}
                  title="Forget this custom target"
                  className="inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {!targetForm && selectedTarget?.seeded && (
              <span className="text-[11px] text-muted-foreground/70">
                Built-in — add a new target to customize.
              </span>
            )}
          </div>

          {targetForm && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
              <span className="text-xs font-medium text-foreground">
                {targetForm === "add" ? "New target" : "Edit target"}
              </span>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Name
                  <input
                    className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                    placeholder="Staging"
                    value={targetDraft.name}
                    onChange={(event) =>
                      setTargetDraft({ ...targetDraft, name: event.target.value })
                    }
                    disabled={savingTarget}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Site base URL
                  <input
                    className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                    placeholder="https://app.example.com"
                    value={targetDraft.baseUrl}
                    onChange={(event) =>
                      setTargetDraft({ ...targetDraft, baseUrl: event.target.value })
                    }
                    disabled={savingTarget}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  API base URL
                  <input
                    className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                    placeholder="https://api.example.com/api/v1"
                    value={targetDraft.apiUrl}
                    onChange={(event) =>
                      setTargetDraft({ ...targetDraft, apiUrl: event.target.value })
                    }
                    disabled={savingTarget}
                  />
                </label>
              </div>
              {targetError && <p className="text-xs text-destructive">{targetError}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void saveTarget()} disabled={savingTarget}>
                  {savingTarget ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {targetForm === "add" ? "Save target" : "Save changes"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetForm(null);
                    setTargetError(null);
                  }}
                  disabled={savingTarget}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <DomainBrandControl
              host={hostFromUrl(environment.baseUrl) ?? "localhost"}
              defaultBrand={defaultBrand}
              disabled={running}
            />
          </div>
        </CardContent>
      </Card>

      <Card data-tour="select">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Select what to run</CardTitle>
              <CardDescription>
                Run a single fixture, or a whole suite / functional requirement
                to execute every fixture beneath it with TestCafe.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void reseed()}
              disabled={running || seeding}
              title="Re-seed the catalog from the test definitions (adds new tests, updates changed ones)"
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {seeding ? "Updating..." : "Update tests"}
            </Button>
          </div>
          {seedMessage && (
            <p
              className={cn(
                "text-xs",
                seedMessage.type === "error"
                  ? "text-destructive"
                  : "text-emerald-400",
              )}
            >
              {seedMessage.text}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1">
            {SCOPE_TABS.map((tab) => (
              <button
                key={tab.scope}
                type="button"
                onClick={() => setScope(tab.scope)}
                disabled={running}
                className={cn(
                  "rounded px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
                  scope === tab.scope
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {scope === "fixture" && (
              <Combobox
                triggerClassName="min-w-72"
                disabled={running}
                value={selectedFixtureId}
                onChange={setSelectedFixtureId}
                placeholder="No fixtures available"
                searchPlaceholder="Search fixtures…"
                emptyText="No matching fixtures"
                options={fixtures.map((fixture) => ({
                  value: fixture.fixtureId,
                  label: fixture.title,
                  hint: `(${fixture.caseCount} cases)`,
                }))}
              />
            )}

            {scope === "suite" && (
              <Combobox
                triggerClassName="min-w-72"
                disabled={running}
                value={selectedSuiteId}
                onChange={setSelectedSuiteId}
                placeholder="No suites available"
                searchPlaceholder="Search suites…"
                emptyText="No matching suites"
                options={suites.map((suite) => ({
                  value: suite.suiteId,
                  label: suite.title,
                  hint: `(${suite.fixtureCount} fixtures, ${suite.caseCount} cases)`,
                }))}
              />
            )}

            {scope === "requirement" && (
              <Combobox
                triggerClassName="min-w-72"
                disabled={running}
                value={selectedRequirementId}
                onChange={setSelectedRequirementId}
                placeholder="No requirements available"
                searchPlaceholder="Search requirements…"
                emptyText="No matching requirements"
                options={requirements.map((requirement) => ({
                  value: requirement.id,
                  label: requirement.title,
                  hint: `(${requirement.suiteCount} suites, ${requirement.fixtureCount} fixtures, ${requirement.caseCount} cases)`,
                }))}
              />
            )}

            {scope === "all" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">
                  Runs every functional requirement — {requirements.length}{" "}
                  requirement(s), {allTotals.fixtures} fixtures, {allTotals.cases}{" "}
                  cases. By default this is an API-only health check (browser & heavy
                  fixtures skipped).
                </span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={includeUi}
                    onChange={(event) => setIncludeUi(event.target.checked)}
                    disabled={running}
                  />
                  Include UI smokes (browser page checks) — launches Chrome + logs in per fixture.
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={includeHeavy}
                    onChange={(event) => setIncludeHeavy(event.target.checked)}
                    disabled={running}
                  />
                  Include heavy live fixtures (video generation, live scrapes) — much slower, may
                  overload a local backend.
                </label>
              </div>
            )}

            {scope === "ui" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">
                  Runs only browser/UI smoke fixtures across all requirements — launches Chrome + logs in per fixture.
                </span>
                <span className="text-xs text-muted-foreground">
                  {fixtures.filter((f) => f.metadata?.ui === true).length} fixture(s) · {totalCases} case(s).
                </span>
              </div>
            )}

            {scope === "heavy" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">
                  Runs only heavy live fixtures (video generation, live scrapes) across all requirements — much slower, may overload a local backend.
                </span>
                <span className="text-xs text-muted-foreground">
                  {fixtures.filter((f) => f.metadata?.heavy === true).length} fixture(s) · {totalCases} case(s).
                </span>
              </div>
            )}

            <Button
              data-tour="run"
              onClick={() => startRun({ scope, id: selectedId, includeHeavy, includeUi })}
              disabled={running || !canRun}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              {running ? "Running..." : `Run ${scopeLabel}`}
            </Button>
            {running && (
              <Button variant="destructive" onClick={() => void cancelRun()}>
                <StopCircle className="h-4 w-4" />
                Cancel
              </Button>
            )}
            {running && (
              <span className="text-xs text-muted-foreground">
                The run keeps streaming if you switch pages.
              </span>
            )}
          </div>
          {error && running && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {running && progressTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              Run progress
            </CardTitle>
            <CardDescription>
              {completedCases} of {progressTotal} test runs completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress
              value={completedCases}
              max={progressTotal}
              showLabel
              variant="accent"
              size="lg"
            />
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Running {runMeta?.label ?? scopeLabel}
                {elapsedMs > 0 && ` · ${formatDuration(elapsedMs)}`}
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            {currentTestTitle && (
              <div className="mt-2 truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Current:</span>{" "}
                {currentTestTitle}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(running || logs.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Live console
                  <EnvBadge env={runEnvironment} targets={targets} />
                </CardTitle>
                <CardDescription>
                  {running
                    ? "TestCafe is running..."
                    : "Output from the last run."}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={copyLogs}
                disabled={logs.length === 0}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy log"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto rounded-md bg-black/60 p-3 font-mono text-xs leading-relaxed">
              {logs.length === 0 && (
                <p className="text-muted-foreground">Waiting for output...</p>
              )}
              {logs.map((line, index) => (
                <div
                  key={index}
                  className={cn("whitespace-pre-wrap", logLineClassName(line))}
                >
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {error && !running && (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {reports && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Run results
                  <EnvBadge env={runEnvironment} targets={targets} />
                </CardTitle>
                <CardDescription>
                  {reports.length} result(s) ·{" "}
                  {reports.filter((r) => r.status === "passed").length} passed
                  {failedCaseCount > 0 && (
                    <span className="text-destructive">
                      {" "}
                      · {failedCaseCount} failed
                    </span>
                  )}
                </CardDescription>
              </div>
              {failedCaseCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void rerunFailed()}
                  disabled={running}
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Rerun failed ({failedCaseCount})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {reports.map((report, index) => {
              const failed = report.status !== "passed";
              const shot =
                typeof report.details?.screenshot === "string"
                  ? report.details.screenshot
                  : null;
              return (
                <div
                  key={`${report.fixtureId}-${report.caseId}-${index}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-4 py-2",
                    failed
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border",
                  )}
                >
                  <span className="min-w-0 truncate text-sm">{report.case}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {shot && (
                      <button
                        type="button"
                        onClick={() => setShotZoom(shot)}
                        title="View failure screenshot"
                        className="rounded p-0.5 text-amber-500 transition-colors hover:bg-amber-500/10"
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Badge variant={failed ? "destructive" : "success"}>
                      {report.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {shotZoom && (
        <ScreenshotLightbox src={shotZoom} onClose={() => setShotZoom(null)} />
      )}
    </div>
  );
}
