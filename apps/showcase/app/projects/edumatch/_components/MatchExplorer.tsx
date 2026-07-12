"use client";

import { useMemo, useState } from "react";
import { Badge } from "@asafarim/ui";
import {
  matchTutors,
  DEFAULT_WEIGHTS,
  type Tutor,
  type StudentNeed,
  type Weights,
} from "@asafarim/edumatch-benchmark/engine";
import tutorsFixture from "@asafarim/edumatch-benchmark/fixtures/tutors";
import needsFixture from "@asafarim/edumatch-benchmark/fixtures/needs";
import { FactorBar } from "./FactorBar";
import { fmtRate } from "./format";
import styles from "./edumatch.module.css";

const tutors = tutorsFixture as Tutor[];
const needs = needsFixture as StudentNeed[];

const WEIGHT_KEYS: Array<keyof Weights> = ["distance", "subject", "level", "rating", "verified"];
const WEIGHT_LABELS: Record<keyof Weights, string> = {
  distance: "Distance",
  subject: "Subject",
  level: "Level",
  rating: "Rating",
  verified: "Verified",
};

/**
 * Interactive matching demo. Runs the real engine client-side, entirely
 * against committed synthetic fixtures — no network call, nothing persisted.
 * Lets a visitor inspect the full factor breakdown for every result AND move
 * the weights to see the ranking change live.
 */
export function MatchExplorer() {
  const [needId, setNeedId] = useState(needs[0].id);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });

  const need = needs.find((n) => n.id === needId) ?? needs[0];
  const { ranked, excluded } = useMemo(
    () => matchTutors(tutors, need, weights),
    [need, weights],
  );

  function setWeight(key: keyof Weights, value: number) {
    setWeights((w) => ({ ...w, [key]: value }));
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.controlsRow}>
        <div>
          <label htmlFor="need-select" className={styles.factorLabel}>
            Student need
          </label>
          <br />
          <select
            id="need-select"
            className={styles.select}
            value={needId}
            onChange={(e) => setNeedId(e.target.value)}
          >
            {needs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} — {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.weightPanel}>
          <strong className={styles.factorLabel}>Weights (adjust and re-rank)</strong>
          {WEIGHT_KEYS.map((key) => (
            <div className={styles.weightRow} key={key}>
              <label htmlFor={`weight-${key}`}>{WEIGHT_LABELS[key]}</label>
              <input
                id={`weight-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={(e) => setWeight(key, Number(e.target.value))}
              />
              <span className={styles.factorVal}>{weights[key].toFixed(2)}</span>
            </div>
          ))}
          <button
            type="button"
            className={`ui-btn ui-btn--secondary ui-btn--sm ${styles.resetBtn}`}
            onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div aria-live="polite">
        <h3 style={{ marginBottom: "0.5rem" }}>
          Ranked ({ranked.length}) — {need.label}
        </h3>
        {ranked.length === 0 ? (
          <p className="u-muted">
            No tutor satisfies every requirement for this need — see the excluded list below for why.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {ranked.map((r) => (
              <div key={r.tutorId} className={styles.pane}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <span>
                    <span className={styles.rank}>#{r.rank}</span> {r.name}{" "}
                    {r.verified ? <Badge tone="success">Verified</Badge> : null}
                  </span>
                  <span>
                    <span className={styles.compositeBig}>{r.composite.toFixed(3)}</span>{" "}
                    <span className="u-muted">· {fmtRate(r.hourlyRateCents)}</span>
                  </span>
                </div>
                {r.factors.map((f) => (
                  <FactorBar key={f.key} factor={f} />
                ))}
              </div>
            ))}
          </div>
        )}

        {excluded.length > 0 ? (
          <>
            <h3 style={{ margin: "var(--space-4) 0 0.5rem" }}>
              Excluded ({excluded.length})
            </h3>
            <div className={styles.pane}>
              {excluded.map((e) => (
                <div key={e.tutorId} className={styles.excludedItem}>
                  <strong>{e.name}</strong>
                  <div>
                    {e.reasons.map((r, i) => (
                      <span key={i} className={styles.reasonChip}>
                        {r.detail}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
