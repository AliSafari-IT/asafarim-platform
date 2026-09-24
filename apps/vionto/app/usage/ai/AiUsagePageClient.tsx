"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { formatMicros, type CostTotalsDTO } from "@asafarim/ai-cost-ledger";
import type { ProjectCostGroup, ViontoCostTimeline } from "@/lib/server/ai/cost-read";
import { costStatusBadges, itemAmountLabel, type CostItemView } from "./cost-view";

type Translate = ReturnType<typeof useTranslation>["t"];

const PRESETS = ["7d", "30d", "90d", "month", "prev_month", "year", "custom"] as const;
const PRESET_KEYS: Record<(typeof PRESETS)[number], string> = {
  "7d": "vionto.aiUsage.preset7d",
  "30d": "vionto.aiUsage.preset30d",
  "90d": "vionto.aiUsage.preset90d",
  month: "vionto.aiUsage.presetMonth",
  prev_month: "vionto.aiUsage.presetPrevMonth",
  year: "vionto.aiUsage.presetYear",
  custom: "vionto.aiUsage.presetCustom",
};
const CATEGORIES = ["story", "vision_caption", "tts", "tts_preview", "ai_motion_clip"] as const;
const PROVIDERS = ["openai", "anthropic", "kling", "fal", "elevenlabs", "azure"] as const;
const STATUSES: [string, string][] = [
  ["actual", "vionto.aiUsage.status.actual"],
  ["estimated", "vionto.aiUsage.status.estimated"],
  ["unknown", "vionto.aiUsage.status.notTracked"],
  ["legacy", "vionto.aiUsage.status.partial"],
  ["fixture", "vionto.aiUsage.status.free"],
];
const PAYERS: [string, string][] = [
  ["platform", "vionto.aiUsage.payer.platform"],
  ["user_byok", "vionto.aiUsage.payer.user_byok"],
];
const FILTER_KEYS = ["preset", "from", "to", "projectId", "exportId", "unattached", "category", "provider", "status", "payer"];

function money(micros: string, locale: string) {
  return formatMicros(BigInt(micros), { locale });
}

function subtotalText(totals: CostTotalsDTO, locale: string, t: Translate) {
  if (totals.eventCount > 0 && totals.knownCount === 0) return t("vionto.aiUsage.status.notTracked");
  return money(totals.effectiveKnownMicros, locale);
}

async function fetchTimeline(query: string): Promise<ViontoCostTimeline> {
  const res = await fetch(`/api/usage/ai${query ? `?${query}` : ""}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as ViontoCostTimeline;
}

function Badge({ tone, children, title }: { tone: "neutral" | "info" | "success" | "warning"; children: string; title?: string }) {
  const tones = {
    neutral: "border-[var(--color-border-strong)] text-[var(--color-text-muted)]",
    info: "border-sky-500/40 text-sky-700 dark:text-sky-300",
    success: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/50 text-amber-800 dark:text-amber-300",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LocalTime({ iso, locale }: { iso: string; locale: string }) {
  const [text, setText] = useState(`${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
  useEffect(() => {
    setText(new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
  }, [iso, locale]);
  return <time dateTime={iso}>{text}</time>;
}

function CostItemRow({ item, locale, t }: { item: CostItemView; locale: string; t: Translate }) {
  const amount = itemAmountLabel(item, locale, t);
  const numberFmt = new Intl.NumberFormat(locale);
  const units = item.usage
    .map((u) =>
      u.unit === "tokens"
        ? `${numberFmt.format(u.quantity)} ${u.bucket.replace(/_/g, " ")}`
        : u.unit === "characters"
          ? t("vionto.aiUsage.unitsChars", { n: numberFmt.format(u.quantity) })
          : u.unit === "seconds"
            ? t("vionto.aiUsage.unitsSeconds", { n: numberFmt.format(u.quantity) })
            : `${numberFmt.format(u.quantity)} ${u.unit}`,
    )
    .join(" · ");
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-[var(--color-border-strong)]/40 py-3 last:border-b-0 sm:grid-cols-[11rem_1fr_auto_7rem]">
      <div className="text-xs text-[var(--color-text-muted)]">
        <LocalTime iso={item.occurredAt} locale={locale} />
      </div>
      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {t(`vionto.aiUsage.op.${item.operation}`)}
          {item.outcome === "failed" ? (
            <span className="font-normal text-[var(--color-text-muted)]"> · {t("vionto.aiUsage.failed")}</span>
          ) : null}
        </p>
        <p className="mt-0.5 break-words text-xs text-[var(--color-text-muted)]">
          {item.provider} / {item.model}
          {units ? ` · ${units}` : ""} · {t(`vionto.aiUsage.payer.${item.credentialSource}`)}
        </p>
      </div>
      <div className="col-span-2 row-start-3 flex flex-wrap gap-1 sm:col-span-1 sm:row-start-auto">
        {costStatusBadges(item).map((b) => (
          <Badge key={b.key} tone={b.tone}>
            {t(b.labelKey)}
          </Badge>
        ))}
      </div>
      <div
        className={`col-start-2 row-start-1 text-right text-sm tabular-nums sm:col-start-auto sm:row-start-auto ${amount.unknown ? "italic text-[var(--color-text-muted)]" : "font-semibold text-[var(--color-text)]"}`}
        aria-label={amount.aria}
      >
        {amount.text}
      </div>
    </li>
  );
}

function ItemList({ query, locale, t, initial }: { query: string; locale: string; t: Translate; initial?: ViontoCostTimeline }) {
  const [items, setItems] = useState<CostItemView[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">(initial ? "idle" : "loading");

  useEffect(() => {
    if (initial) {
      setItems(initial.items);
      setCursor(initial.nextCursor);
      setState("idle");
      return;
    }
    let alive = true;
    setState("loading");
    fetchTimeline(query)
      .then((page) => {
        if (!alive) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setState("idle");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [query, initial]);

  async function more() {
    if (!cursor) return;
    setState("loading");
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      const page = await fetchTimeline(params.toString());
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <ol className="list-none p-0">
        {items.map((item) => (
          <CostItemRow key={item.id} item={item} locale={locale} t={t} />
        ))}
      </ol>
      {state === "loading" ? (
        <p className="py-2 text-sm text-[var(--color-text-muted)]" aria-live="polite">
          {t("vionto.aiUsage.loading")}
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="py-2 text-sm font-medium text-[var(--color-text)]">
          {t("vionto.aiUsage.error")}
        </p>
      ) : null}
      {cursor && state === "idle" ? (
        <button
          type="button"
          onClick={more}
          className="mt-2 rounded-xl border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
        >
          {t("vionto.aiUsage.loadMore")}
        </button>
      ) : null}
    </div>
  );
}

/** A lazily-loaded drill-down: the calls behind one subtotal. */
function Drilldown({ label, query, locale, t }: { label: string; query: string; locale: string; t: Translate }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
        {label}
      </summary>
      {open ? (
        <div className="mt-2">
          <ItemList query={query} locale={locale} t={t} />
        </div>
      ) : null}
    </details>
  );
}

function ProjectGroup({ group, baseQuery, locale, t }: { group: ProjectCostGroup; baseQuery: string; locale: string; t: Translate }) {
  const withParam = (extra: Record<string, string>) => {
    const params = new URLSearchParams(baseQuery);
    for (const k of ["projectId", "exportId", "unattached", "cursor"]) params.delete(k);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    params.set("limit", "25");
    return params.toString();
  };
  const linkedDistinct = BigInt(group.totals.effectiveKnownMicros) - BigInt(group.unattached.effectiveKnownMicros);
  const exportsSum = group.exports.reduce((n, e) => n + BigInt(e.totals.effectiveKnownMicros), BigInt(0));
  const reused = exportsSum > linkedDistinct;
  const partial = group.totals.coverage === "partial" || group.totals.coverage === "unknown" || group.exports.some((e) => !e.tracked);

  return (
    <li className="mb-3 list-none rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
      <details>
        <summary className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:grid-cols-[1fr_auto_auto]">
          <span className="min-w-0">
            <span className="font-semibold text-[var(--color-text)]">
              {group.deleted ? t("vionto.aiUsage.deletedProject") : group.projectId ? group.label : t("vionto.aiUsage.noProject")}
            </span>
            {partial ? (
              <span className="ml-2 align-middle">
                <Badge tone="warning">{t("vionto.aiUsage.status.partial")}</Badge>
              </span>
            ) : null}
          </span>
          <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">
            {t("vionto.aiUsage.calls", { n: group.totals.eventCount })}
          </span>
          <span
            className="text-right font-semibold tabular-nums text-[var(--color-text)]"
            aria-label={`${t("vionto.aiUsage.projectTotal")}: ${subtotalText(group.totals, locale, t)}`}
          >
            {subtotalText(group.totals, locale, t)}
          </span>
        </summary>
        <div className="border-t border-[var(--color-border-strong)]/40 px-4 py-3">
          {partial ? <p className="mb-2 text-xs text-[var(--color-text-muted)]">{t("vionto.aiUsage.projectPartial")}</p> : null}
          <ul className="list-none space-y-3 p-0">
            {group.exports.map((exp) => (
              <li key={exp.exportId} className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm text-[var(--color-text)]">
                    <span className="font-medium">{t("vionto.aiUsage.finalVideo")}:</span> {exp.label}
                    {exp.createdAt ? (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {" "}
                        · <LocalTime iso={exp.createdAt} locale={locale} />
                      </span>
                    ) : null}
                  </span>
                  {exp.tracked ? (
                    <span className="font-semibold tabular-nums">{subtotalText(exp.totals, locale, t)}</span>
                  ) : (
                    <Badge tone="warning" title={t("vionto.aiUsage.finalVideoUntracked")}>
                      {t("vionto.aiUsage.status.notTracked")}
                    </Badge>
                  )}
                </div>
                {exp.tracked ? (
                  exp.totals.eventCount > 0 ? (
                    <Drilldown label={t("vionto.aiUsage.viewCalls")} query={withParam({ exportId: exp.exportId })} locale={locale} t={t} />
                  ) : null
                ) : (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("vionto.aiUsage.finalVideoUntracked")}</p>
                )}
              </li>
            ))}
            {group.unattached.eventCount > 0 ? (
              <li className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{t("vionto.aiUsage.unattached")}</span>
                  <span className="font-semibold tabular-nums">{subtotalText(group.unattached, locale, t)}</span>
                </div>
                <Drilldown
                  label={t("vionto.aiUsage.viewCalls")}
                  query={withParam({ ...(group.projectId ? { projectId: group.projectId } : {}), unattached: "1" })}
                  locale={locale}
                  t={t}
                />
              </li>
            ) : null}
          </ul>
          {reused ? <p className="mt-3 text-xs text-[var(--color-text-muted)]">{t("vionto.aiUsage.reuseNote")}</p> : null}
        </div>
      </details>
    </li>
  );
}

function RangeNote({ from, to, t, locale }: { from: string; to: string; t: Translate; locale: string }) {
  const [local, setLocal] = useState<{ zone: string; text: string } | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    setLocal({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      text: `${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}`,
    });
  }, [from, to, locale]);
  return (
    <p className="mb-4 text-xs text-[var(--color-text-muted)]">
      {t("vionto.aiUsage.rangeNote", { from: `${from.slice(0, 10)} ${from.slice(11, 16)}`, to: `${to.slice(0, 10)} ${to.slice(11, 16)}` })}{" "}
      {local ? t("vionto.aiUsage.rangeLocal", { zone: local.zone, local: local.text }) : null}
    </p>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  );
}

/** `initialTimeline` lets a caller (tests, a future server render) skip the first fetch. */
export function AiUsagePageClient({ initialTimeline }: { initialTimeline?: ViontoCostTimeline } = {}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) q.set(key, v);
    }
    return q.toString();
  }, [params]);

  const [timeline, setTimeline] = useState<ViontoCostTimeline | null>(initialTimeline ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unauthorized">(initialTimeline ? "ready" : "loading");

  useEffect(() => {
    if (initialTimeline) return;
    let alive = true;
    setState("loading");
    fetch(`/api/usage/ai${query ? `?${query}` : ""}`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        setTimeline((await res.json()) as ViontoCostTimeline);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [query, initialTimeline]);

  const applyFilters = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);
      const next = new URLSearchParams();
      for (const [k, v] of data.entries()) if (typeof v === "string" && v) next.set(k, v);
      if (next.get("preset") !== "custom") {
        next.delete("from");
        next.delete("to");
      }
      // Keep a video/unattached drill-down only if the user didn't change project.
      for (const k of ["exportId", "unattached"]) {
        const v = params.get(k);
        if (v && next.get("projectId") === (params.get("projectId") ?? "")) next.set(k, v);
      }
      router.replace(`/usage/ai${next.toString() ? `?${next}` : ""}`);
    },
    [params, router],
  );

  const preset = params.get("preset") ?? "30d";
  const s = timeline?.summary;
  const fmt = new Intl.NumberFormat(locale);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("vionto.aiUsage.title")}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("vionto.aiUsage.description")}</p>
      </div>
      <p className="mb-5 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-[var(--color-text)]">
        {t("vionto.aiUsage.notInvoice")}
      </p>

      <form
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8"
        aria-label={t("vionto.aiUsage.title")}
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(e.currentTarget);
        }}
        key={query}
      >
        <Field label={t("vionto.aiUsage.filterPeriod")}>
          <select name="preset" defaultValue={preset} className={inputCls}>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {t(PRESET_KEYS[p])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("vionto.aiUsage.filterFrom")}>
          <input type="date" name="from" defaultValue={params.get("from") ?? ""} className={inputCls} />
        </Field>
        <Field label={t("vionto.aiUsage.filterTo")}>
          <input type="date" name="to" defaultValue={params.get("to") ?? ""} className={inputCls} />
        </Field>
        <Field label={t("vionto.aiUsage.filterProject")}>
          <select name="projectId" defaultValue={params.get("projectId") ?? ""} className={inputCls}>
            <option value="">{t("vionto.aiUsage.filterAllProjects")}</option>
            {(timeline?.projects ?? [])
              .filter((p) => p.projectId)
              .map((p) => (
                <option key={p.projectId} value={p.projectId!}>
                  {p.deleted ? t("vionto.aiUsage.deletedProject") : p.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t("vionto.aiUsage.filterCategory")}>
          <select name="category" defaultValue={params.get("category") ?? ""} className={inputCls}>
            <option value="">{t("vionto.aiUsage.filterAllCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`vionto.aiUsage.op.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("vionto.aiUsage.filterProvider")}>
          <select name="provider" defaultValue={params.get("provider") ?? ""} className={inputCls}>
            <option value="">{t("vionto.aiUsage.filterAllProviders")}</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("vionto.aiUsage.filterStatus")}>
          <select name="status" defaultValue={params.get("status") ?? ""} className={inputCls}>
            <option value="">{t("vionto.aiUsage.filterAnyStatus")}</option>
            {STATUSES.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("vionto.aiUsage.filterPayer")}>
          <select name="payer" defaultValue={params.get("payer") ?? ""} className={inputCls}>
            <option value="">{t("vionto.aiUsage.filterAnyPayer")}</option>
            {PAYERS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-4 lg:col-span-8">
          <button type="submit" className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {t("vionto.aiUsage.apply")}
          </button>
          <a href="/usage/ai" className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:underline">
            {t("vionto.aiUsage.reset")}
          </a>
          {params.get("exportId") ? <Badge tone="info">{t("vionto.aiUsage.filterVideo")}</Badge> : null}
          {params.get("unattached") === "1" ? <Badge tone="info">{t("vionto.aiUsage.filterUnattached")}</Badge> : null}
        </div>
      </form>

      {state === "unauthorized" ? <p className="text-sm">{t("vionto.aiUsage.signIn")}</p> : null}
      {state === "error" ? (
        <p role="alert" className="text-sm font-medium">
          {t("vionto.aiUsage.error")}
        </p>
      ) : null}
      {state === "loading" && !timeline ? (
        <p className="text-sm text-[var(--color-text-muted)]" aria-live="polite">
          {t("vionto.aiUsage.loading")}
        </p>
      ) : null}

      {timeline && s ? (
        <div aria-busy={state === "loading"}>
          <RangeNote from={timeline.range.from} to={timeline.range.to} t={t} locale={locale} />
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card
              label={t("vionto.aiUsage.cardEffective")}
              value={s.eventCount > 0 && s.knownCount === 0 ? t("vionto.aiUsage.status.notTracked") : money(s.effectiveKnownMicros, locale)}
              hint={BigInt(s.byokMicros) > BigInt(0) ? `${t("vionto.aiUsage.cardByok")}: ${money(s.byokMicros, locale)}` : undefined}
            />
            <Card label={t("vionto.aiUsage.cardActual")} value={money(s.actualMicros, locale)} />
            <Card label={t("vionto.aiUsage.cardEstimated")} value={money(s.estimatedMicros, locale)} />
            <Card
              label={t("vionto.aiUsage.cardNotTracked")}
              value={t("vionto.aiUsage.calls", { n: fmt.format(s.unknownCount) })}
              hint={
                s.coverageBasisPoints === null
                  ? t("vionto.aiUsage.noData")
                  : t("vionto.aiUsage.coverage", { pct: Math.floor(s.coverageBasisPoints / 100) })
              }
            />
            <Card
              label={t("vionto.aiUsage.cardUnits")}
              value={t("vionto.aiUsage.calls", { n: fmt.format(s.eventCount) })}
              hint={[
                timeline.units.inputTokens || timeline.units.outputTokens
                  ? t("vionto.aiUsage.unitsTokens", { input: fmt.format(timeline.units.inputTokens), output: fmt.format(timeline.units.outputTokens) })
                  : null,
                timeline.units.ttsCharacters ? t("vionto.aiUsage.unitsChars", { n: fmt.format(timeline.units.ttsCharacters) }) : null,
                timeline.units.videoSeconds ? t("vionto.aiUsage.unitsSeconds", { n: fmt.format(timeline.units.videoSeconds) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>

          {s.eventCount > 0 && s.knownCount === 0 ? (
            <p className="mb-4 rounded-xl border border-amber-500/40 px-4 py-3 text-sm">{t("vionto.aiUsage.allUnknown")}</p>
          ) : s.coverage === "partial" ? (
            <p className="mb-4 rounded-xl border border-amber-500/40 px-4 py-3 text-sm">
              {t("vionto.aiUsage.partialNote", { n: s.unknownCount + s.legacyCount })}
            </p>
          ) : null}

          {s.eventCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-8 text-center">
              <p className="font-semibold text-[var(--color-text)]">{t("vionto.aiUsage.empty")}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("vionto.aiUsage.emptyHint")}</p>
            </div>
          ) : (
            <>
              <section aria-labelledby="ai-usage-projects" className="mb-8">
                <h2 id="ai-usage-projects" className="mb-3 text-lg font-semibold">
                  {t("vionto.aiUsage.byProject")}
                </h2>
                <ul className="p-0">
                  {timeline.projects.map((group) => (
                    <ProjectGroup key={group.projectId ?? "none"} group={group} baseQuery={query} locale={locale} t={t} />
                  ))}
                </ul>
              </section>
              <section aria-labelledby="ai-usage-timeline">
                <h2 id="ai-usage-timeline" className="mb-3 text-lg font-semibold">
                  {t("vionto.aiUsage.timeline")}
                </h2>
                <ItemList query={query} locale={locale} t={t} initial={timeline} />
              </section>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

const inputCls =
  "w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}
