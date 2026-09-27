import type { Metadata } from "next";
import { Alert, PageHeader, Panel, Section, StatusBadge } from "@asafarim/ui";
import { FlowDiagram } from "./_components/FlowDiagram";
import { contactUrl, platformEvidence, report, toolUrl, tools, workbenchUrl, type ToolCaseStudy } from "./_data/workbench";
import styles from "./_components/workbench.module.css";

export const metadata: Metadata = {
  title: "AI Workbench — how the public AI tools are built",
  description:
    "Architecture, typed contracts, grounding rules, eval gate, security, and honest status for three narrow public AI tools: requirements to test plan, notes to action plan, and text to cited timeline.",
  alternates: { canonical: "/projects/ai-workbench" },
};

const METRICS: { key: keyof (typeof report.tools)[number]["summary"]; label: string; gate: string }[] = [
  { key: "schemaCompliance", label: "Schema compliance", gate: "= 1" },
  { key: "traceability", label: "Traceability", gate: "= 1" },
  { key: "unsupportedClaims", label: "Unsupported claims", gate: "= 0" },
  { key: "falsePrecision", label: "False precision", gate: "= 0" },
  { key: "injectionResistance", label: "Injection resistance", gate: "= 1" },
  { key: "exportCompatibility", label: "Export compatibility", gate: "= 1" },
  { key: "guardrailAccuracy", label: "Guardrail accuracy", gate: "= 1" },
  { key: "survivingUnsupportedClaims", label: "Surviving unsupported claims", gate: "= 0" },
];

/**
 * The canonical AI Workbench case study (#683), with a stable anchor per
 * tool (#test-plan, #action-plan, #timeline) that the Web tool pages link to.
 * English only, like the tool pages.
 */
export default function AiWorkbenchPage() {
  return (
    <div lang="en">
      <PageHeader
        kicker="Exhibit 09"
        title="AI Workbench"
        description="Three narrow public AI tools, built so every item shows where it came from and the server removes what the input doesn't support. This page shows how, with links to the code."
        actions={<StatusBadge status="experiment" />}
      />

      <Alert tone="info">
        <strong>Experimental, and labelled that way.</strong> The tools run their examples today; live AI generation stays off until each tool passes
        its eval gate and launch checks. Every number below comes from the <em>fixture-mode</em> eval: deterministic outputs and canned model
        responses scored offline. None of it is production telemetry, a user count, or a customer deployment.
      </Alert>

      <Section kicker="How it works" kickerIndex="01" title="One execution boundary, three tools">
        <FlowDiagram />
        <div className="ui-grid">
          <Panel title="Fixture vs live">
            <p>
              Every run goes through the same server boundary. The catalogue example always comes from a deterministic fixture, is labelled as a
              prepared sample, and never costs anything. Live calls need the global switch, the tool&apos;s switch, a priced model, a spend ceiling,
              and a passing eval gate.
            </p>
          </Panel>
          <Panel title="Versioning">
            <p>
              Each result records its tool, schema, and prompt versions; the eval report adds a hash of its dataset and the rubric version. A
              change to any of them is visible in review and in the report below.
            </p>
          </Panel>
          <Panel title="Security and cost">
            <p>
              Anonymous, same-origin JSON only; per-visitor and per-tool rate limits, one live call per visitor, a global concurrency cap, and a
              daily budget that reserves each call&apos;s worst-case cost. No text is stored, logged, or sent to analytics; kill switches work
              without a deploy.
            </p>
          </Panel>
          <Panel title="Handoffs">
            <p>
              Results continue in Testora, TasksAI, or TimelineAI as a versioned file the signed-in user imports there. The destination validates it
              again, previews exactly what it will create, and imports it once. Nothing travels in a URL.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Eval gate" kickerIndex="02" title="What has to pass before a tool may go live">
        <p className={styles.muted}>
          {report.notice} Rubric {report.rubricVersion}. CI fails if any tool misses a threshold, and the committed report can only change through an
          explicit regeneration.
        </p>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Fixture-mode eval results per tool</caption>
            <thead>
              <tr>
                <th scope="col">Dimension</th>
                <th scope="col">Gate</th>
                {report.tools.map((t) => (
                  <th scope="col" key={t.slug}>
                    {tools.find((x) => x.slug === t.slug)?.title ?? t.slug}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  <td className={styles.num}>{m.gate}</td>
                  {report.tools.map((t) => (
                    <td key={t.slug} className={styles.num}>
                      {String(t.summary[m.key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Cases · guardrail checks</th>
                <td>—</td>
                {report.tools.map((t) => (
                  <td key={t.slug} className={styles.num}>
                    {t.cases} · {t.guardrails.length}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {tools.map((tool, i) => (
        <ToolSection key={tool.anchor} tool={tool} index={i + 3} />
      ))}

      <Section kicker="Evidence" kickerIndex={String(tools.length + 3).padStart(2, "0")} title="Read the design and the code">
        <ul className={styles.list}>
          {platformEvidence.map((e) => (
            <li key={e.href}>
              <a href={e.href}>{e.label}</a>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <a href={workbenchUrl}>Try the tools →</a>
          <a href={contactUrl}>Discuss this kind of system →</a>
        </div>
      </Section>
    </div>
  );
}

function ToolSection({ tool, index }: { tool: ToolCaseStudy; index: number }) {
  const r = report.tools.find((t) => t.slug === tool.slug);
  return (
    <div id={tool.anchor} className={styles.anchor}>
      <Section kicker={tool.title} kickerIndex={String(index).padStart(2, "0")} title={tool.problem}>
        <p>{tool.whyNarrow}</p>
        <div className="ui-grid">
          <Panel title={`Contract · ${tool.contract.name}`}>
            <ul className={styles.list}>
              {tool.contract.fields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Grounding and no-fabrication rules">
            <ul className={styles.list}>
              {tool.grounding.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Review model">
            <ul className={styles.list}>
              {tool.review.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Known failure cases">
            <ul className={styles.list}>
              {tool.failureCases.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Panel>
        </div>
        {r ? (
          <p className={styles.muted}>
            Versions: tool {r.toolVersion} · schema {r.schemaVersion} · prompt {r.promptVersion ?? "—"} · dataset {r.datasetVersion}. Fixture eval:{" "}
            {r.cases} cases across {r.kinds.join(", ")}; guardrails {r.guardrails.filter((g) => g.passed).length}/{r.guardrails.length} caught as
            expected.
          </p>
        ) : null}
        <div className={styles.status}>
          <Panel title="What works">
            <ul className={styles.list}>
              {tool.status.works.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="What is fixture">
            <ul className={styles.list}>
              {tool.status.fixture.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="What is deferred">
            <ul className={styles.list}>
              {tool.status.deferred.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className={styles.actions}>
          <a href={toolUrl(tool.slug)}>Try the tool →</a>
          <a href={tool.app.href}>Continue in {tool.app.name} →</a>
          {tool.evidence.map((e) => (
            <a key={e.href} href={e.href}>
              {e.label}
            </a>
          ))}
        </div>
      </Section>
    </div>
  );
}
