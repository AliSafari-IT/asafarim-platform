/**
 * Placeholder showcase entries. Real project content (from the dot-be
 * showcases and asafarim-digital products) is migrated in a later PR;
 * these prove the list/detail routing structure.
 */
export interface ShowcaseProject {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
}

export const projects: ShowcaseProject[] = [
  {
    slug: "task-management",
    title: "Task Management",
    summary:
      "End-to-end task management vertical with API and web client, originally built in the asafarim.be ecosystem.",
    tags: ["React", "TypeScript", "PostgreSQL"],
  },
  {
    slug: "smart-operations",
    title: "Smart Operations Dashboard",
    summary:
      "Operations KPI dashboard showcase with real-time views and reporting.",
    tags: ["React", "Dashboards"],
  },
  {
    slug: "testora",
    title: "Testora",
    summary:
      "E2E test automation console orchestrating TestCafe runs with live results via SignalR.",
    tags: ["Testing", "Automation", "SignalR"],
  },
];

export function getProject(slug: string): ShowcaseProject | undefined {
  return projects.find((project) => project.slug === slug);
}
