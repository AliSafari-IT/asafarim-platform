import { EventEmitter } from "node:events";
import { Client } from "pg";
import { RUN_EVENTS_CHANNEL } from "./runStore";

/**
 * One LISTEN connection per process that wakes the SSE streams tailing
 * run_events (#716): `subscribe(runId, wake)` calls `wake` whenever any process
 * appends an event for that run. Only a wake-up signal — streams re-read the
 * table, so no run state lives here. If the connection is down, streams fall
 * back to polling and this reconnects in the background.
 */

interface NotifierState {
  emitter: EventEmitter;
  client?: Client;
  connecting?: Promise<void>;
  connected: boolean;
}

const globalForNotifier = globalThis as unknown as { __testoraRunNotifier?: NotifierState };

function state(): NotifierState {
  if (!globalForNotifier.__testoraRunNotifier) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // one per open stream
    globalForNotifier.__testoraRunNotifier = { emitter, connected: false };
  }
  return globalForNotifier.__testoraRunNotifier;
}

function connect(): Promise<void> {
  const s = state();
  if (s.connected) return Promise.resolve();
  if (s.connecting) return s.connecting;
  s.connecting = (async () => {
    const client = new Client({
      connectionString:
        process.env.TESTORA_DATABASE_URL ?? "postgres://e2e_testora:e2e_testora@127.0.0.1:55434/e2e-testing-db",
    });
    const drop = () => {
      s.connected = false;
      s.client = undefined;
      client.end().catch(() => {});
    };
    client.on("notification", (msg) => {
      if (msg.channel === RUN_EVENTS_CHANNEL && msg.payload) s.emitter.emit(msg.payload);
    });
    client.on("error", drop);
    client.on("end", drop);
    await client.connect();
    await client.query(`LISTEN ${RUN_EVENTS_CHANNEL}`);
    s.client = client;
    s.connected = true;
  })()
    .catch((error) => {
      console.error("[testora] run event LISTEN failed; streams poll instead:", error);
    })
    .finally(() => {
      s.connecting = undefined;
    });
  return s.connecting;
}

/** Wake `wake` on every event appended for `runId`. Returns the unsubscribe. */
export function subscribeRunEvents(runId: string, wake: () => void): () => void {
  void connect();
  const s = state();
  s.emitter.on(runId, wake);
  return () => s.emitter.off(runId, wake);
}

/** Whether LISTEN is live (streams can poll less often). */
export function isRunNotifierConnected(): boolean {
  return state().connected;
}
