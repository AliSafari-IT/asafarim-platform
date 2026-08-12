import type { Metadata } from "next";
import { PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader kicker="Philosophy" kickerIndex="05" title="About Labs" />
      <section style={{ maxWidth: 640, lineHeight: 1.6 }}>
        <p>
          <strong>Showcase</strong> explains what ASafarIM has built.{" "}
          <strong>Labs</strong> lets visitors interact with what ASafarIM is exploring next.
        </p>
        <h3>Stability disclaimer</h3>
        <p>
          Everything in Labs is a prototype. Experiments can change shape, lose data, or disappear
          entirely between visits — none of them carry the reliability guarantees of a shipped
          ASafarIM product.
        </p>
        <h3>Kill-switch policy</h3>
        <p>
          Any experiment can be paused or archived without notice if it misbehaves, becomes a
          maintenance burden, or is superseded. Paused/archived experiments stay listed in the{" "}
          <a href="/changelog">changelog</a> for traceability, but their canvas may be disabled.
        </p>
        <h3>Privacy notice</h3>
        <p>
          Labs experiments run entirely client-side unless an experiment's own &ldquo;Telemetry &amp;
          privacy&rdquo; accordion says otherwise. No analytics are collected by the workbench shell
          itself.
        </p>
      </section>
    </>
  );
}
