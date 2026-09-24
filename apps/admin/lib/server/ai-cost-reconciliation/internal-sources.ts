import "server-only";
import {
  InternalDailyResponseSchema,
  dayStart,
  internalDailyLines,
  internalLineFromWire,
  type CostSource,
  type CredentialSource,
  type EntryType,
  type InternalDailyLine,
} from "@asafarim/ai-cost-ledger";
import { prisma } from "@asafarim/db";

/**
 * Where each app's internal AI cost totals come from (#592).
 *
 * Vionto's events live in the platform database, so they are read
 * directly. ResuMatch and TasksAI run isolated databases and are read
 * through their bearer-gated `/api/internal/ai-cost-daily` routes — the
 * console never holds another app's DB credentials. Every source returns
 * aggregated sums only; nothing here reads a single event's content.
 */

export type InternalSourceResult =
  | { app: string; status: "ok"; lines: InternalDailyLine[]; fetchedAt: Date }
  | { app: string; status: "unavailable"; error: string };

export interface InternalSource {
  app: string;
  fetchDaily(window: { startDay: string; endDay: string }): Promise<InternalSourceResult>;
}

const DAY_MS = 86_400_000;
const REQUEST_TIMEOUT_MS = 15_000;

export function createRemoteInternalSource(
  app: string,
  baseUrl: () => string,
  fetchImpl: (input: URL, init: RequestInit) => Promise<Response> = fetch,
): InternalSource {
  return {
    app,
    async fetchDaily(window) {
      const secret = process.env.INTERNAL_API_SECRET;
      if (!secret) return { app, status: "unavailable", error: "INTERNAL_API_SECRET is not configured" };
      const url = new URL("/api/internal/ai-cost-daily", baseUrl());
      url.searchParams.set("startDay", window.startDay);
      url.searchParams.set("endDay", window.endDay);
      try {
        const response = await fetchImpl(url, {
          headers: { authorization: `Bearer ${secret}` },
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) return { app, status: "unavailable", error: `HTTP ${response.status}` };
        const body = InternalDailyResponseSchema.parse(await response.json());
        return { app, status: "ok", lines: body.lines.map(internalLineFromWire), fetchedAt: new Date() };
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const reason = name === "TimeoutError" || name === "AbortError" ? "timed out" : name === "ZodError" ? "unexpected response shape" : "request failed";
        return { app, status: "unavailable", error: reason };
      }
    },
  };
}

export const viontoInternalSource: InternalSource = {
  app: "vionto",
  async fetchDaily(window) {
    try {
      const events = await prisma.viontoAiCostEvent.findMany({
        where: {
          occurredAt: { gte: dayStart(window.startDay), lt: new Date(dayStart(window.endDay).getTime() + DAY_MS) },
          credentialSource: "platform",
          fixture: false,
        },
        select: {
          provider: true,
          responseModel: true,
          occurredAt: true,
          entryType: true,
          estimatedCostMicros: true,
          actualCostMicros: true,
          adjustmentDeltaMicros: true,
          costSource: true,
          credentialSource: true,
          fixture: true,
        },
      });
      const lines = internalDailyLines(
        "vionto",
        events.map((e) => ({
          ...e,
          entryType: e.entryType as EntryType,
          costSource: e.costSource as CostSource,
          credentialSource: e.credentialSource as CredentialSource,
        })),
      );
      return { app: "vionto", status: "ok", lines, fetchedAt: new Date() };
    } catch {
      return { app: "vionto", status: "unavailable", error: "platform database query failed" };
    }
  },
};

export function getInternalSources(): InternalSource[] {
  return [
    viontoInternalSource,
    createRemoteInternalSource("resumatch", () => process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "http://localhost:3012"),
    createRemoteInternalSource("tasks-ai", () => process.env.NEXT_PUBLIC_TASKSAI_URL ?? "http://localhost:3013"),
  ];
}
