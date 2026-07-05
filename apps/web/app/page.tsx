import { Button, Card, getPlatformLinks } from "@asafarim/ui";

export default function HomePage() {
  const links = getPlatformLinks();

  return (
    <>
      <section style={{ padding: "3rem 0 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.4rem", margin: 0, color: "#f1f5f9" }}>
          ASafarIM Digital
        </h1>
        <p style={{ fontSize: "1.15rem", color: "#94a3b8", maxWidth: "40rem", margin: "1rem auto" }}>
          Software engineering, web platforms, and digital products — from idea
          to production.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <a href={links.hub}>
            <Button>Open the Hub</Button>
          </a>
          <a href={links.showcase}>
            <Button style={{ backgroundColor: "#1e293b" }}>View Showcase</Button>
          </a>
        </div>
      </section>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "1rem",
          paddingTop: "1rem",
        }}
      >
        <Card title="Services">
          Web platforms, APIs, and cloud deployments — see what we can build
          together.
        </Card>
        <Card title="Projects">
          A selection of client work and products from the ASafarIM ecosystem.
        </Card>
        <Card title="Contact">
          Have a project in mind? Get in touch and we will get back to you.
        </Card>
      </section>
    </>
  );
}
