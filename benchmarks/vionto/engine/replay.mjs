/*
 * Replays a fixed sequence of pipeline events against a fresh job for a
 * brief. Shared by the test suite and the fixture generator so both exercise
 * exactly the same event-sequencing logic — "start" | "approve" | "reject"
 * advance the current job; "retry" replaces it with a new job via
 * engine/pipeline.mjs's retry().
 */
import { createJob, advance, retry } from "./pipeline.mjs";

/**
 * @param {object} brief
 * @param {Array<"start"|"approve"|"reject"|"retry">} events
 * @param {object} provider
 * @returns {{ job: object, history: object[] }} the final job and every
 *   intermediate job produced along the way (for building a run's full log).
 */
export function runEvents(brief, events, provider) {
  let job = createJob(brief);
  const history = [job];
  const ctx = { brief, provider };

  for (const event of events) {
    job = event === "retry" ? retry(job, ctx) : advance(job, event, ctx);
    history.push(job);
  }

  return { job, history };
}
