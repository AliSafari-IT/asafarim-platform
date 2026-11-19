import { describe, expect, it, vi } from "vitest";
import { createFieldSaver, patchApplication, saveErrorKind, type SaveOutcome } from "./fieldSaver";

/** A send() whose responses the test settles by hand, in any order. */
function controlledSend() {
  const calls: { value: string; settle: (o: SaveOutcome) => void }[] = [];
  const send = vi.fn(
    (value: string) => new Promise<SaveOutcome>((resolve) => calls.push({ value, settle: resolve })),
  );
  return { send, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(initial = "old") {
  const { send, calls } = controlledSend();
  const onSaved = vi.fn();
  const saver = createFieldSaver<string>({ initial, send, onChange: () => {}, onSaved });
  return { saver, send, calls, onSaved };
}

describe("createFieldSaver", () => {
  it("sends nothing when the value is unchanged (blur without an edit)", () => {
    const { saver, send } = setup("same");
    saver.save("same");
    expect(send).not.toHaveBeenCalled();
    expect(saver.getState().phase).toBe("idle");
  });

  it("reports saved only after the server confirms", async () => {
    const { saver, calls, onSaved } = setup();
    saver.save("new");
    expect(saver.getState().phase).toBe("saving");
    calls[0].settle({ ok: true });
    await flush();
    expect(saver.getState()).toMatchObject({ phase: "saved", persisted: "new", error: null });
    expect(onSaved).toHaveBeenCalledWith("new");
  });

  it("on failure keeps the persisted value and the failed value for retry", async () => {
    const { saver, calls, onSaved } = setup();
    saver.save("draft text");
    calls[0].settle({ ok: false, kind: "server" });
    await flush();
    expect(saver.getState()).toMatchObject({
      phase: "error",
      error: "server",
      persisted: "old",
      failedValue: "draft text",
    });
    expect(onSaved).not.toHaveBeenCalled();

    saver.retry();
    expect(calls[1].value).toBe("draft text");
    calls[1].settle({ ok: true });
    await flush();
    expect(saver.getState()).toMatchObject({ phase: "saved", persisted: "draft text", error: null });
  });

  it("does not resend the failed value on another blur; only an explicit retry does", async () => {
    const { saver, calls } = setup();
    saver.save("draft");
    calls[0].settle({ ok: false, kind: "server" });
    await flush();
    saver.save("draft");
    expect(calls).toHaveLength(1);
    expect(saver.getState().phase).toBe("error");
    saver.save("draft, edited");
    expect(calls.map((c) => c.value)).toEqual(["draft", "draft, edited"]);
  });

  it("retries with a newer draft when one is given", async () => {
    const { saver, calls } = setup();
    saver.save("v1");
    calls[0].settle({ ok: false, kind: "network" });
    await flush();
    saver.retry("v1 and more");
    expect(calls[1].value).toBe("v1 and more");
  });

  it("serialises rapid edits and sends only the newest queued value", async () => {
    const { saver, calls } = setup();
    saver.save("a");
    saver.save("ab");
    saver.save("abc");
    expect(calls).toHaveLength(1);
    calls[0].settle({ ok: true });
    await flush();
    expect(calls.map((c) => c.value)).toEqual(["a", "abc"]);
    expect(saver.getState().phase).toBe("saving");
    calls[1].settle({ ok: true });
    await flush();
    expect(saver.getState()).toMatchObject({ phase: "saved", persisted: "abc" });
  });

  it("does not report a stale failure when a newer value is queued", async () => {
    const { saver, calls } = setup();
    saver.save("a");
    saver.save("ab");
    calls[0].settle({ ok: false, kind: "server" });
    await flush();
    expect(calls.map((c) => c.value)).toEqual(["a", "ab"]);
    calls[1].settle({ ok: true });
    await flush();
    expect(saver.getState()).toMatchObject({ phase: "saved", persisted: "ab" });
  });

  it("ignores a server sync while a save is in flight", async () => {
    const { saver, calls } = setup();
    saver.save("newest");
    saver.syncPersisted("old-from-refresh");
    expect(saver.getState().persisted).toBe("old");
    calls[0].settle({ ok: true });
    await flush();
    saver.syncPersisted("newest");
    expect(saver.getState().persisted).toBe("newest");
  });

  it("clears an error when the draft is reverted to the saved value", async () => {
    const { saver, calls, send } = setup();
    saver.save("x");
    calls[0].settle({ ok: false, kind: "invalid" });
    await flush();
    saver.save("old");
    expect(send).toHaveBeenCalledTimes(1);
    expect(saver.getState()).toMatchObject({ phase: "idle", error: null });
  });
});

describe("patchApplication", () => {
  it.each([
    [400, "invalid"],
    [401, "unauthorized"],
    [404, "notFound"],
    [500, "server"],
    [502, "server"],
  ] as const)("treats HTTP %i as a failed save (%s)", async (status, kind) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status }));
    await expect(patchApplication("app-1", { notes: "x" }, fetchImpl as typeof fetch)).resolves.toEqual({ ok: false, kind });
  });

  it("treats a network failure as a failed save", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(patchApplication("app-1", { notes: "x" }, fetchImpl as typeof fetch)).resolves.toEqual({
      ok: false,
      kind: "network",
    });
  });

  it("sends a JSON PATCH to the application's own URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(patchApplication("app/1", { status: "APPLIED" }, fetchImpl as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/applications/app%2F1", expect.objectContaining({ method: "PATCH", body: '{"status":"APPLIED"}' }));
  });

  it("maps statuses", () => {
    expect(saveErrorKind(403)).toBe("unauthorized");
    expect(saveErrorKind(422)).toBe("invalid");
  });
});
