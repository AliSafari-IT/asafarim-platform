import Link from "next/link";
import { Button, Card, PageHeader } from "@asafarim/ui";

export default function ShowcaseHomePage() {
  return (
    <>
      <PageHeader
        title="ASafarIM Showcase"
        description="Demos, apps, case studies, and experiments from the ASafarIM ecosystem"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1rem",
        }}
      >
        <Card title="Projects">
          <p>Browse showcased projects with tech stacks and case studies.</p>
          <Link href="/projects">
            <Button>View projects</Button>
          </Link>
        </Card>
        <Card title="Labs">
          <p>Experimental apps and works in progress.</p>
          <Link href="/labs">
            <Button style={{ backgroundColor: "#1e293b" }}>Enter the lab</Button>
          </Link>
        </Card>
      </div>
    </>
  );
}
