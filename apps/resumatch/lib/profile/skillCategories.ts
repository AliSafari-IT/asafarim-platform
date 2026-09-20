/**
 * Grouping skills by function (issue: smart/modern skills display) —
 * "Frontend Development", "Databases", "Version Control" instead of one
 * flat list — is a presentation choice, not a fact about the candidate, so
 * it is done here with a deterministic keyword lookup rather than an AI
 * call: no provider cost, no variance between renders of the same profile,
 * and nothing for `mergeTailoringSuggestions`'s no-fabrication contract to
 * worry about (see lib/tailoring/ai/schema.ts) — a skill's *name* is still
 * the only thing ever carried over from the candidate's own profile data;
 * this module only decides which heading it prints under.
 *
 * `categorizeSkill` is intentionally simple and inspectable: an ordered list
 * of (category, keyword[]) pairs, first match wins, "Other" is the fallback.
 * A candidate can always override a specific skill's category from the
 * profile editor (stored as `SkillEntry.category`); this function is only
 * ever the *default* a new or uncategorized skill starts from.
 */

export const SKILL_CATEGORIES = [
  "Languages & Frameworks",
  "Frontend Development",
  "Backend & APIs",
  "Databases",
  "Cloud & DevOps",
  "Version Control",
  "Testing & QA",
  "Tools & IDEs",
  "Data & Analytics",
  "Project & Process",
  "Other",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Ordered so a more specific category (e.g. "Testing & QA") is checked
 *  before a more general one (e.g. "Languages & Frameworks") could also
 *  match the same keyword — order here doubles as priority. */
const CATEGORY_KEYWORDS: [SkillCategory, string[]][] = [
  [
    "Version Control",
    ["git", "github", "gitlab", "bitbucket", "azure devops", "svn", "mercurial", "version control"],
  ],
  [
    "Testing & QA",
    [
      "testcafe",
      "jest",
      "vitest",
      "cypress",
      "selenium",
      "playwright",
      "mocha",
      "chai",
      "junit",
      "nunit",
      "xunit",
      "e2e",
      "end-to-end",
      "unit test",
      "test automation",
      "qa ",
      "quality assurance",
    ],
  ],
  [
    "Tools & IDEs",
    [
      "visual studio",
      "vs code",
      "intellij",
      "eclipse",
      "rider",
      "webstorm",
      "postman",
      "figma",
      "jira",
      "confluence",
      "docker desktop",
    ],
  ],
  [
    "Cloud & DevOps",
    [
      "azure",
      "aws",
      "amazon web services",
      "gcp",
      "google cloud",
      "docker",
      "kubernetes",
      "k8s",
      "terraform",
      "ansible",
      "jenkins",
      "ci/cd",
      "cicd",
      "helm",
      "devops",
      "nginx",
      "linux",
      "bash",
      "shell script",
    ],
  ],
  [
    "Databases",
    [
      "sql server",
      "mysql",
      "postgres",
      "postgresql",
      "mongodb",
      "nosql",
      "redis",
      "oracle db",
      "oracle database",
      "sqlite",
      "dynamodb",
      "cosmos db",
      "elasticsearch",
      "database",
    ],
  ],
  [
    "Frontend Development",
    [
      "react",
      "angular",
      "vue",
      "svelte",
      "next.js",
      "nuxt",
      "html",
      "css",
      "sass",
      "scss",
      "tailwind",
      "bootstrap",
      "syncfusion",
      "material ui",
      "mui",
      "ui/ux",
      "ui design",
      "web design",
      "responsive design",
    ],
  ],
  [
    "Backend & APIs",
    [
      "asp.net",
      ".net",
      "entity framework",
      "web api",
      "webapi",
      "node.js",
      "nodejs",
      "express",
      "django",
      "flask",
      "fastapi",
      "spring boot",
      "jsf",
      "java server faces",
      "struts",
      "vaadin",
      "laravel",
      "rest api",
      "restful",
      "graphql",
      "microservices",
      "grpc",
    ],
  ],
  [
    "Data & Analytics",
    [
      "excel",
      "power bi",
      "powerbi",
      "tableau",
      "data analysis",
      "data analytics",
      "pandas",
      "numpy",
      "etl",
      "data engineering",
      "machine learning",
      "ml ",
    ],
  ],
  [
    "Languages & Frameworks",
    [
      "c#",
      "typescript",
      "javascript",
      "php",
      "python",
      "java",
      "kotlin",
      "swift",
      "go ",
      "golang",
      "rust",
      "ruby",
      "c++",
      "scala",
    ],
  ],
  [
    "Project & Process",
    [
      "project management",
      "agile",
      "scrum",
      "kanban",
      "stakeholder management",
      "budget tracking",
      "vendor coordination",
      "team leadership",
      "process improvement",
      "product management",
      "requirements gathering",
      "change management",
    ],
  ],
];

/** Deterministic default category for a skill name. Same input always
 *  produces the same output — safe to call on every render, never cached
 *  against drift if the taxonomy above changes. */
export function categorizeSkill(name: string): SkillCategory {
  const normalized = ` ${name.toLowerCase()} `;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }
  return "Other";
}

export interface SkillGroup {
  category: SkillCategory;
  skills: string[];
}

/**
 * Group skill names by category, in `SKILL_CATEGORIES` order, dropping any
 * category with nothing in it. `resolveCategory` lets a caller supply a
 * candidate's own manual override (`SkillEntry.category`) ahead of the
 * keyword default — see lib/profile/contract.ts's `skillSchema.category`.
 */
export function groupSkillsByCategory(
  names: string[],
  resolveCategory?: (name: string) => string | null | undefined,
): SkillGroup[] {
  const byCategory = new Map<SkillCategory, string[]>();
  for (const name of names) {
    const override = resolveCategory?.(name);
    const category = (SKILL_CATEGORIES as readonly string[]).includes(override ?? "")
      ? (override as SkillCategory)
      : categorizeSkill(name);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(name);
    byCategory.set(category, bucket);
  }
  return SKILL_CATEGORIES.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    skills: byCategory.get(category)!,
  }));
}
