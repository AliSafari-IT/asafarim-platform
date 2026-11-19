/**
 * Client-side save behaviour for the inline application edits (issue #895).
 * Framework-free so the sequencing rules can be unit tested in Node; the
 * React component only renders the state this produces.
 *
 * The rules:
 * - A save that would not change the persisted value sends nothing.
 * - One request per field at a time. A value saved while one is in flight
 *   is queued, and only the newest queued value is sent once the current
 *   request settles, so an older response can never land after a newer
 *   one and overwrite it on the server.
 * - A failure never reports "saved" and never touches the persisted value;
 *   it records the value that failed so it can be retried. Saving that same
 *   value again (another blur) waits for an explicit retry.
 */

export type SaveErrorKind = "invalid" | "unauthorized" | "notFound" | "server" | "network";

export type SaveOutcome = { ok: true } | { ok: false; kind: SaveErrorKind };

export function saveErrorKind(httpStatus: number): SaveErrorKind {
  if (httpStatus === 400 || httpStatus === 422) return "invalid";
  if (httpStatus === 401 || httpStatus === 403) return "unauthorized";
  if (httpStatus === 404) return "notFound";
  return "server";
}

/** PATCH one application. Resolves (never rejects) with what happened:
 *  a non-2xx status or a network failure is a failed save. */
export async function patchApplication(
  id: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<SaveOutcome> {
  try {
    const res = await fetchImpl(`/api/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? { ok: true } : { ok: false, kind: saveErrorKind(res.status) };
  } catch {
    return { ok: false, kind: "network" };
  }
}

export type SavePhase = "idle" | "saving" | "saved" | "error";

export interface FieldSaveState<T> {
  /** The last value the server confirmed. */
  persisted: T;
  phase: SavePhase;
  /** Set when `phase` is "error". */
  error: SaveErrorKind | null;
  /** The value whose save failed, for retry. */
  failedValue: T | null;
}

export interface FieldSaver<T> {
  getState(): FieldSaveState<T>;
  /** Save `value` if it differs from what is persisted. */
  save(value: T): void;
  /** Re-send the value that failed last (or `value`, when given). */
  retry(value?: T): void;
  /** Adopt a value the server reported (e.g. after a page refresh). Ignored
   *  while a save is in flight, so a refresh can't undo a newer edit. */
  syncPersisted(value: T): void;
  isBusy(): boolean;
}

export function createFieldSaver<T>(options: {
  initial: T;
  send: (value: T) => Promise<SaveOutcome>;
  onChange: (state: FieldSaveState<T>) => void;
  /** Called after each successful save. */
  onSaved?: (value: T) => void;
  equals?: (a: T, b: T) => boolean;
}): FieldSaver<T> {
  const equals = options.equals ?? Object.is;
  let state: FieldSaveState<T> = { persisted: options.initial, phase: "idle", error: null, failedValue: null };
  let inFlight = false;
  let queued: { value: T } | null = null;

  const set = (next: Partial<FieldSaveState<T>>) => {
    state = { ...state, ...next };
    options.onChange(state);
  };

  async function send(value: T) {
    inFlight = true;
    set({ phase: "saving", error: null, failedValue: null });
    const outcome = await options.send(value);
    inFlight = false;

    if (outcome.ok) {
      set({ persisted: value });
      options.onSaved?.(value);
      const next = queued;
      queued = null;
      if (next && !equals(next.value, value)) {
        void send(next.value);
      } else {
        set({ phase: "saved" });
      }
      return;
    }

    // A newer value typed while this one was failing is what the person
    // wants now: try that one instead of reporting the stale failure.
    const next = queued;
    queued = null;
    if (next && !equals(next.value, value) && !equals(next.value, state.persisted)) {
      void send(next.value);
      return;
    }
    set({ phase: "error", error: outcome.kind, failedValue: value });
  }

  function save(value: T, explicitRetry = false) {
    if (inFlight) {
      queued = { value };
      return;
    }
    // Re-saving the exact value that just failed waits for an explicit
    // retry. Otherwise tabbing out of the textarea towards the Retry button
    // would resend on blur and pull the button away from under the focus.
    if (!explicitRetry && state.phase === "error" && state.failedValue !== null && equals(value, state.failedValue)) {
      return;
    }
    if (equals(value, state.persisted)) {
      // Reverting a failed draft back to the saved value resolves the error.
      if (state.phase === "error") set({ phase: "idle", error: null, failedValue: null });
      return;
    }
    void send(value);
  }

  return {
    getState: () => state,
    save,
    retry(value?: T) {
      const target = value !== undefined ? value : state.failedValue;
      if (target === null || target === undefined) return;
      save(target as T, true);
    },
    syncPersisted(value: T) {
      if (inFlight || equals(value, state.persisted)) return;
      set({ persisted: value });
    },
    isBusy: () => inFlight,
  };
}
