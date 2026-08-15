import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/server/auth";

/**
 * Shared gate for every page under /admin/business-plan. The admin layout
 * above this route already requires isAdmin() (admin / superadmin /
 * edumatch_admin) — broader than we want here. This adds a stricter check on
 * top: strictly "superadmin", nothing else. A regular admin who guesses the
 * URL gets a 404, not a "forbidden" page that confirms the route exists.
 */
export async function requireSuperAdmin() {
  const user = await getAuthedUser();
  if (!user || !user.roles.includes("superadmin")) {
    notFound();
  }
  return user;
}

// ---------------------------------------------------------------------------
// Shared "printed report" building blocks — used by the business plan itself
// and its sub-pages (screenshots, architecture review), so the whole
// /admin/business-plan section reads as one document instead of three
// differently-styled pages.
// ---------------------------------------------------------------------------

const badgeTone = {
  live: "bg-emerald-500/15 text-emerald-400",
  partial: "bg-amber-500/15 text-amber-400",
  todo: "bg-red-500/15 text-red-400",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof badgeTone; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTone[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Part({ roman, title, id }: { roman: string; title: string; id: string }) {
  return (
    <div id={id} className="mt-20 scroll-mt-20 border-t border-[var(--color-border)] pt-8 first:mt-10 first:border-0 first:pt-0">
      <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">{`PART ${roman}`}</div>
      <h2 className="mt-1 font-serif text-3xl text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      {title && <h3 className="mb-3 font-serif text-xl text-[var(--color-text)]">{title}</h3>}
      <div className="space-y-4 text-[15px] leading-relaxed text-[var(--color-text-muted)]">{children}</div>
    </section>
  );
}

export function Pull({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-[var(--color-primary)] pl-4 font-serif text-lg italic text-[var(--color-text)]">
      {children}
    </blockquote>
  );
}

/** A horizontal, wrapping flowchart: step chips joined by arrows. */
export function FlowChart({
  steps,
  loop = false,
  onTintedPanel = false,
}: {
  steps: string[];
  /** Adds a closing "↻ back to step 1" chip instead of a trailing arrow. */
  loop?: boolean;
  /**
   * The chips sit on a semi-transparent `bg-[var(--color-primary)]/10` panel
   * rather than the page background — use `bg-[var(--color-bg)]` for the
   * chip fill instead of `bg-[var(--color-surface)]` so they read as cards
   * floating on the tint in both light and dark theme, instead of a
   * hardcoded color that only worked in one.
   */
  onTintedPanel?: boolean;
}) {
  const chip = `border-[var(--color-primary)]/25 text-[var(--color-text)] ${
    onTintedPanel ? "bg-[var(--color-bg)]" : "bg-[var(--color-panel,transparent)] border-[var(--color-border)]"
  }`;
  const arrow = "text-[var(--color-primary)]";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-3 rounded-lg p-4 ${
        onTintedPanel ? "" : "border border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5">
          <span className={`rounded-md border px-3 py-1.5 text-[13px] font-medium leading-tight whitespace-nowrap ${chip}`}>
            {step}
          </span>
          {i < steps.length - 1 && (
            <span className={arrow} aria-hidden="true">
              →
            </span>
          )}
        </div>
      ))}
      {loop && (
        <div className="flex items-center gap-1.5">
          <span className={arrow} aria-hidden="true">
            →
          </span>
          <span className={`rounded-md border px-3 py-1.5 text-[13px] font-medium italic leading-tight whitespace-nowrap ${chip}`}>
            ↻ back to step 01
          </span>
        </div>
      )}
    </div>
  );
}

/** A vertical funnel: stacked stages joined by down-arrows, for pipelines where each step narrows the previous one. */
export function FlowDown({
  stages,
}: {
  stages: { label: string; note?: string; tone?: "default" | "gate" | "result" }[];
}) {
  const toneClass: Record<NonNullable<(typeof stages)[number]["tone"]>, string> = {
    default: "border-[var(--color-border)] bg-[var(--color-surface)]",
    gate: "border-amber-500/40 bg-amber-500/10",
    result: "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10",
  };

  return (
    <div className="flex flex-col items-center">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex w-full flex-col items-center">
          <div className={`w-full max-w-lg rounded-lg border px-4 py-3 text-center ${toneClass[stage.tone ?? "default"]}`}>
            <div className="text-sm font-semibold text-[var(--color-text)]">{stage.label}</div>
            {stage.note && <div className="mt-1 text-xs leading-snug text-[var(--color-text-muted)]">{stage.note}</div>}
          </div>
          {i < stages.length - 1 && (
            <span className="my-1 text-[var(--color-primary)]" aria-hidden="true">
              ↓
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * An inline external citation link (market-research sources, etc). Uses an
 * inline `color` style rather than a Tailwind text-color utility class — see
 * the comment on the "View captured screens" / "View architecture review"
 * Links in page.tsx: @asafarim/ui's base.css ships an unlayered
 * `a { color: var(--accent) }` reset that EduMatch never satisfies (it
 * doesn't define --accent), and because that rule is unlayered it always
 * beats a layered Tailwind utility class regardless of specificity. Inline
 * style is the one thing nothing in that cascade can override.
 */
export function RefLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--color-primary)" }}
      className="underline decoration-[var(--color-primary)]/40 underline-offset-2 transition hover:decoration-[var(--color-primary)]"
    >
      {children}
    </a>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <code className="whitespace-nowrap rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-[0.86em] text-[var(--color-primary)]">
      {children}
    </code>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2.5 align-top ${j === 0 ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One labelled box inside a Boundary — a module/domain, or a deployable unit.
 * `emphasis` marks the box this diagram is arguing for/against.
 */
export function DomainBox({
  label,
  note,
  emphasis,
}: {
  label: string;
  note?: string;
  emphasis?: "positive" | "negative";
}) {
  const toneClass =
    emphasis === "positive"
      ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10"
      : emphasis === "negative"
        ? "border-red-500/40 bg-red-500/10"
        : "border-[var(--color-border)] bg-[var(--color-bg)]";
  return (
    <div className={`rounded-md border px-3 py-2 text-center ${toneClass}`}>
      <div className="text-[12.5px] font-semibold leading-tight text-[var(--color-text)]">{label}</div>
      {note && <div className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-muted)]">{note}</div>}
    </div>
  );
}

/**
 * A dashed outer boundary containing a grid of DomainBoxes — used to show
 * "these things deploy together" (a monolith's process boundary) or "these
 * things deploy separately" (service boundaries), so the reader sees the
 * boundary, not just a list of names.
 */
export function Boundary({
  label,
  sublabel,
  tone = "neutral",
  children,
}: {
  label: string;
  sublabel?: string;
  tone?: "neutral" | "positive" | "negative";
  children: React.ReactNode;
}) {
  const borderClass =
    tone === "positive" ? "border-[var(--color-primary)]/60" : tone === "negative" ? "border-red-500/50" : "border-[var(--color-border)]";
  const labelClass = tone === "positive" ? "text-[var(--color-primary)]" : tone === "negative" ? "text-red-400" : "text-[var(--color-text-muted)]";
  return (
    <div className={`rounded-xl border-2 border-dashed p-4 ${borderClass}`}>
      <div className={`text-xs font-semibold tracking-wide ${labelClass}`}>{label}</div>
      {sublabel && <div className="mb-3 mt-0.5 text-[11px] text-[var(--color-text-muted)]">{sublabel}</div>}
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${sublabel ? "" : "mt-3"}`}>{children}</div>
    </div>
  );
}

/** A single glanceable number-plus-label tile, for dashboard-style summary pages. */
export function Stat({ value, label, tone = "neutral" }: { value: string; label: string; tone?: "neutral" | "positive" }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className={`font-serif text-2xl ${tone === "positive" ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

/**
 * A single-row proportional bar (e.g. live / partial / not-built module
 * counts) — the "at a glance" version of a status table, for pages that
 * need the shape of the data before any of its detail.
 */
export function StatusBar({
  segments,
}: {
  segments: { value: number; label: string; className: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-[var(--color-border)]">
        {segments.map((s) => (
          <div key={s.label} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.className}`} />
            {s.label} — {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}
