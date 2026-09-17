import Link from "next/link";
import { Alert, Badge, Card } from "@asafarim/ui";

/**
 * The post-confirmation next step.
 *
 * Before this, confirming a profile led nowhere: the candidate saw a
 * confirmation message and had to guess what came next. This panel names
 * the next action — tailor the confirmed profile to a specific job.
 */
export function NextStepPanel() {
  return (
    <Card title="Your profile is confirmed — here is what to do next">
      <ol className="jm-list">
        <li>
          <Badge tone="success">done</Badge> Profile confirmed. Tailoring reads from this version.
        </li>
        <li>
          <Badge tone="neutral">next</Badge> Paste the URL of a job you want to apply to and let AI
          tailor your CV to it.
        </li>
        <li>
          <Badge tone="neutral">then</Badge> Review the rewritten content, pick a layout, and
          download it.
        </li>
      </ol>

      <Alert tone="info">
        Nothing is rewritten until you ask for it. The AI only reorders and rewords what is
        already in your confirmed profile — it never invents an employer, a date, a degree, or a
        skill you did not list.
      </Alert>

      <div style={{ marginTop: "1rem" }}>
        <Link href="/tailor" className="ui-btn ui-btn--primary ui-btn--sm">
          Tailor your CV →
        </Link>
      </div>
    </Card>
  );
}
