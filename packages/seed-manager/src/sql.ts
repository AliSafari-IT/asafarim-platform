// Minimal read-only SQL access for the Drizzle-backed databases.
//
// Testora and AppBuilder each own a separate Postgres instance, and their
// seed definitions still live inside their apps (see the "read-only" note on
// those providers). Until those definitions are extracted into workspace
// packages, this package inspects those databases directly — with parameters
// only, never interpolated identifiers, and never a statement supplied by a
// caller.

import { Client } from "pg";

export interface SqlRunner {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
}

/** Run `fn` against a short-lived client that is always closed. */
export async function withSql<T>(
  connectionString: string,
  timeoutMs: number,
  fn: (sql: SqlRunner) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: Math.min(timeoutMs, 15_000),
    statement_timeout: timeoutMs,
    // Everything this package does against these databases is read-only.
    options: "-c default_transaction_read_only=on",
  });
  await client.connect();
  try {
    return await fn({
      async query(text, values) {
        const result = await client.query(text, values as never[]);
        return result.rows as never;
      },
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Whether a table exists, so a missing migration reads as a clear issue. */
export async function tableExists(sql: SqlRunner, table: string): Promise<boolean> {
  const rows = await sql.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists",
    [table]
  );
  return rows[0]?.exists === true;
}

export async function countWhere(
  sql: SqlRunner,
  text: string,
  values: unknown[] = []
): Promise<number> {
  const rows = await sql.query<{ count: string }>(text, values);
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}
