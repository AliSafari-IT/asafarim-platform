"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@asafarim/ui";
import type {
  SeedEnvironment,
  SeedOperationKind,
  SeedPlan,
  SeedStatus,
  ValidationResult,
} from "@asafarim/seed-manager";

import { dryRunOperation, refreshProviderStatus, validateProvider } from "./actions";

export interface ProviderPanelProps {
  providerId: string;
  displayName: string;
  environment: SeedEnvironment;
  /** Operations the server will actually accept. Mirrors, never replaces, the server check. */
  supports: { validate: boolean; status: boolean; seed: boolean; reconcile: boolean; remove: boolean };
  isProtected: boolean;
  availability: "configured" | "not-configured";
  configurationIssue: string | null;
  /** Set while mutations are not yet wired up, so the reason is visible. */
  mutationsUnavailableNote: string;
}

type Outcome =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "validation"; result: ValidationResult }
  | { kind: "status"; result: SeedStatus }
  | { kind: "plan"; result: SeedPlan };

/**
 * Per-provider actions. Every button here is a convenience: the server
 * re-authorizes each request independently, so a disabled state that is
 * bypassed in the browser changes nothing.
 */
export function ProviderPanel(props: ProviderPanelProps) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [runningLabel, setRunningLabel] = useState<string | null>(null);

  const disabled = props.availability !== "configured" || Boolean(props.configurationIssue);

  function run(label: string, fn: () => Promise<Outcome>) {
    setRunningLabel(label);
    startTransition(async () => {
      const next = await fn();
      setOutcome(next);
      setRunningLabel(null);
    });
  }

  const target = { providerId: props.providerId, environment: props.environment };

  return (
    <div className="seed-provider__actions">
      <div className="seed-provider__buttons" role="group" aria-label={`${props.displayName} actions`}>
        <Button
          type="button"
          variant="console"
          size="sm"
          disabled={disabled || pending || !props.supports.validate}
          onClick={() =>
            run("Validate", async () => {
              const result = await validateProvider(target);
              return result.ok
                ? { kind: "validation", result: result.data }
                : { kind: "error", message: result.error };
            })
          }
        >
          Validate
        </Button>

        <Button
          type="button"
          variant="console"
          size="sm"
          disabled={disabled || pending || !props.supports.status}
          onClick={() =>
            run("Refresh status", async () => {
              const result = await refreshProviderStatus(target);
              return result.ok
                ? { kind: "status", result: result.data }
                : { kind: "error", message: result.error };
            })
          }
        >
          Refresh status
        </Button>

        {(["seed", "reconcile", "remove"] as SeedOperationKind[]).map((operation) => {
          const supported = props.supports[operation as "seed" | "reconcile" | "remove"];
          const blockedByProtection = operation === "remove" && props.isProtected;
          return (
            <Button
              key={operation}
              type="button"
              variant="console"
              size="sm"
              disabled={disabled || pending || !supported || blockedByProtection}
              title={
                blockedByProtection
                  ? "Protected foundation — removal is impossible."
                  : !supported
                    ? `${props.displayName} does not support ${operation}.`
                    : `Preview what ${operation} would change. Nothing is written.`
              }
              onClick={() =>
                run(`Dry run: ${operation}`, async () => {
                  const result = await dryRunOperation({ ...target, operation });
                  return result.ok
                    ? { kind: "plan", result: result.data }
                    : { kind: "error", message: result.error };
                })
              }
            >
              Dry run: {operation}
            </Button>
          );
        })}
      </div>

      <p className="seed-provider__note">{props.mutationsUnavailableNote}</p>

      <div aria-live="polite" className="seed-provider__outcome">
        {pending ? <p>Running {runningLabel}…</p> : null}
        {!pending && outcome.kind === "error" ? (
          <p role="alert" className="seed-provider__error">
            <Badge tone="danger">× Failed</Badge> {outcome.message}
          </p>
        ) : null}
        {!pending && outcome.kind === "validation" ? (
          <ValidationOutcome result={outcome.result} />
        ) : null}
        {!pending && outcome.kind === "status" ? <StatusOutcome result={outcome.result} /> : null}
        {!pending && outcome.kind === "plan" ? <PlanOutcome plan={outcome.result} /> : null}
      </div>
    </div>
  );
}

function ValidationOutcome({ result }: { result: ValidationResult }) {
  return (
    <div>
      <p>
        <Badge tone={result.ok ? "success" : "danger"}>
          {result.ok ? "✓ Valid" : "× Invalid"}
        </Badge>{" "}
        Definitions v{result.definitionVersion} · checksum {result.definitionChecksum} · connection{" "}
        {result.connection} · {result.durationMs} ms
      </p>
      {result.issues.length > 0 ? (
        <ul>
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <strong>{issue.severity}</strong> [{issue.code}] {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>No issues found.</p>
      )}
    </div>
  );
}

function StatusOutcome({ result }: { result: SeedStatus }) {
  return (
    <div>
      <p>
        Seed-owned {result.seedOwnedCount} · missing {result.missingCount} · drifted{" "}
        {result.driftedCount} · orphaned {result.orphanedCount} · checked{" "}
        {new Date(result.checkedAt).toLocaleTimeString()}
      </p>
      {result.entities.length > 0 ? (
        <table className="seed-table">
          <caption className="seed-table__caption">Per-entity counts</caption>
          <thead>
            <tr>
              <th scope="col">Entity</th>
              <th scope="col">Present</th>
              <th scope="col">Missing</th>
              <th scope="col">Drifted</th>
              <th scope="col">Orphaned</th>
            </tr>
          </thead>
          <tbody>
            {result.entities.map((entity) => (
              <tr key={entity.seedKey}>
                <th scope="row">{entity.entity}</th>
                <td>{entity.present}</td>
                <td>{entity.missing}</td>
                <td>{entity.drifted}</td>
                <td>{entity.orphaned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {result.issues.map((issue, index) => (
        <p key={`${issue.code}-${index}`}>
          <strong>{issue.severity}</strong> {issue.message}
        </p>
      ))}
    </div>
  );
}

function PlanOutcome({ plan }: { plan: SeedPlan }) {
  return (
    <div>
      <p>
        <Badge tone="info">Dry run — nothing was written</Badge>
      </p>
      <p>
        {plan.inserts} insert(s) · {plan.updates} update(s) · {plan.deletes} delete(s) ·{" "}
        {plan.retained} retained · plan checksum {plan.checksum} · expires{" "}
        {new Date(plan.expiresAt).toLocaleTimeString()}
      </p>
      {plan.changes.length > 0 ? (
        <table className="seed-table">
          <caption className="seed-table__caption">Planned changes</caption>
          <thead>
            <tr>
              <th scope="col">Entity</th>
              <th scope="col">Action</th>
              <th scope="col">Count</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {plan.changes.map((change, index) => (
              <tr key={`${change.seedKey}-${change.action}-${index}`}>
                <th scope="row">{change.entity}</th>
                <td>{change.action}</td>
                <td>{change.count}</td>
                <td>{change.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nothing to do — the database already matches the seed definitions.</p>
      )}
      {plan.warnings.map((warning, index) => (
        <p key={`${warning.code}-${index}`}>⚠ {warning.message}</p>
      ))}
      {plan.blocked.map((blocked, index) => (
        <p key={`${blocked.code}-${index}`}>⛔ {blocked.message}</p>
      ))}
    </div>
  );
}
