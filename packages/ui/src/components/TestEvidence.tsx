import type {
  ArtifactRef,
  RunArtifactBundle,
  TimelineStep,
} from "@asafarim/testora-tasksai-contract";
import { Badge, type BadgeTone } from "./Badge";

export interface TestEvidenceProps {
  /** The run-artifact bundle JSON — already fetched by the caller. */
  bundle: RunArtifactBundle;
  /** Optional link to the full result in Testora's own UI. The bundle only
   *  carries API URLs (for the artifacts), not a browsable page. */
  deepLinkUrl?: string;
  className?: string;
}

const STATUS_TONE: Record<RunArtifactBundle["status"], BadgeTone> = {
  passed: "success",
  failed: "danger",
  flaky: "warning",
};

const STEP_TONE: Record<TimelineStep["status"], BadgeTone> = {
  passed: "success",
  failed: "danger",
  skipped: "neutral",
};

function findArtifact(
  artifacts: ArtifactRef[],
  kind: ArtifactRef["kind"],
): ArtifactRef | undefined {
  return artifacts.find((a) => a.kind === kind);
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Renders a Testora run-artifact bundle (issue #267): failure screenshot,
 * error, the step/assertion timeline with the failing step highlighted, and
 * a fail-vs-pass note when the producer included `context.previousPass`.
 *
 * Pure render from the bundle JSON already in hand — no fetch, no iframe, no
 * cross-app auth (the brainstorm's iframe idea fights the production CSP and
 * the two apps' separate sessions; this is the alternative). Token-themed —
 * works under any `data-app` / light-dark combination without extra CSS from
 * the consumer.
 */
export function TestEvidence({ bundle, deepLinkUrl, className }: TestEvidenceProps) {
  const screenshot = findArtifact(bundle.artifacts, "screenshot");
  const domSnapshot = findArtifact(bundle.artifacts, "dom_snapshot");
  const video = findArtifact(bundle.artifacts, "video");
  const previousPass = bundle.context?.previousPass;
  const flakeScore = bundle.context?.flakeScore;

  return (
    <section
      className={["ui-test-evidence", className].filter(Boolean).join(" ")}
      aria-label={`Test evidence for ${bundle.scenarioTitle}`}
    >
      <header className="ui-test-evidence__head">
        <div className="ui-test-evidence__title">
          <Badge tone={STATUS_TONE[bundle.status]}>{bundle.status}</Badge>
          <h3>{bundle.scenarioTitle}</h3>
          {bundle.context?.quarantined ? <Badge tone="warning">Quarantined</Badge> : null}
        </div>
        <dl className="ui-test-evidence__meta">
          <div>
            <dt>Attempt</dt>
            <dd>{bundle.attempt}</dd>
          </div>
          {bundle.browser ? (
            <div>
              <dt>Browser</dt>
              <dd>{bundle.browser}</dd>
            </div>
          ) : null}
          <div>
            <dt>Finished</dt>
            <dd>{formatTimestamp(bundle.finishedAt)}</dd>
          </div>
        </dl>
      </header>

      {bundle.errorMessage ? (
        <div className="ui-test-evidence__error" role="alert">
          {bundle.errorClass ? (
            <Badge tone="danger">{bundle.errorClass.replace(/_/g, " ")}</Badge>
          ) : null}
          <p>{bundle.errorMessage}</p>
        </div>
      ) : null}

      {screenshot ? (
        <figure className="ui-test-evidence__screenshot">
          {/* eslint-disable-next-line @next/next/no-img-element -- consumer apps vary; a plain <img> keeps this package framework-agnostic */}
          <img
            src={screenshot.url}
            alt={`Screenshot at the point of failure for ${bundle.scenarioTitle}`}
            loading="lazy"
          />
          <figcaption>Screenshot at point of failure</figcaption>
        </figure>
      ) : null}

      {!screenshot && (domSnapshot || video) ? (
        <p className="ui-test-evidence__artifacts-note">
          {domSnapshot ? (
            <a href={domSnapshot.url} target="_blank" rel="noreferrer">
              View DOM snapshot
            </a>
          ) : null}
          {video ? (
            <a href={video.url} target="_blank" rel="noreferrer">
              View video
            </a>
          ) : null}
        </p>
      ) : null}

      {bundle.steps.length > 0 ? (
        <ol className="ui-test-evidence__timeline" aria-label="Step timeline">
          {bundle.steps.map((step) => (
            <li
              key={step.index}
              className={`ui-test-evidence__step ui-test-evidence__step--${step.status}`}
              aria-current={step.status === "failed" ? "step" : undefined}
            >
              <Badge tone={STEP_TONE[step.status]}>{step.status}</Badge>
              <span className="ui-test-evidence__step-label">{step.label}</span>
              {step.durationMs > 0 ? (
                <span className="ui-test-evidence__step-duration">
                  {formatDuration(step.durationMs)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {previousPass ? (
        <p className="ui-test-evidence__diff">
          <strong>Last passing run:</strong> {formatTimestamp(previousPass.createdAt)}
        </p>
      ) : null}

      {typeof flakeScore === "number" ? (
        <p className="ui-test-evidence__flake">
          Pass rate over recent runs: {Math.round(flakeScore * 100)}%
        </p>
      ) : null}

      {deepLinkUrl ? (
        <a className="ui-test-evidence__deep-link" href={deepLinkUrl} target="_blank" rel="noreferrer">
          View full result in Testora →
        </a>
      ) : null}
    </section>
  );
}
