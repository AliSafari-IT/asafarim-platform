import { type FeedMapping } from "./feedConnector";

/**
 * The synthetic showcase source's data and configuration (JM-004, issue
 * #208) — the pure half, with no database, no `runSync`, and no
 * `server-only` import, so it can be exercised directly in unit tests.
 *
 * Everything here is fabricated. The postings are demonstration data and
 * must never be presented as live vacancies. Loading it into the database
 * lives in `showcaseSource.ts`, which drives the real ingestion pipeline.
 */

export const SHOWCASE_SOURCE_KEY = "synthetic-belgian-showcase";
export const SHOWCASE_SOURCE_NAME = "Synthetic Belgian showcase (demo data)";
export const SHOWCASE_ATTRIBUTION =
  "Synthetic demonstration data — fabricated for the JobMatch showcase, not a live vacancy.";

/**
 * A syntactically valid public HTTPS URL so `authorizeSource` /
 * `isPublicHttpsUrl` pass unchanged. It is never actually fetched: the
 * loader hands the fixture to `runSync` as an offline body.
 */
export const SHOWCASE_SOURCE_ENDPOINT =
  "https://showcase.jobmatch.asafarim.com/synthetic-belgian-feed.json";

/** A fixed, far-future agreement expiry. The "agreement" is this file. */
export const SHOWCASE_AGREEMENT_EXPIRES_AT = new Date("2099-12-31T00:00:00.000Z");
export const SHOWCASE_AGREEMENT_REFERENCE =
  "JM-004-SYNTHETIC-SHOWCASE (see docs/jm-004-showcase-source-decision.md)";

/** Where the postings sit in the payload, and what each field is called. */
export const SHOWCASE_FIELD_MAPPING: FeedMapping = {
  itemsPath: "jobs",
  fields: {
    externalId: "id",
    url: "url",
    title: "title",
    employer: "employer",
    description: "description",
    language: "language",
    location: "city",
    remote: "remote",
    contractType: "contractType",
    salaryMin: "salaryMin",
    salaryMax: "salaryMax",
    salaryCurrency: "salaryCurrency",
    salaryPeriod: "salaryPeriod",
    skills: "skills",
    requiresSponsorship: "sponsorship",
    languageRequired: "languageRequired",
    requiredCertifications: "requiredCertifications",
    publishedAt: "publishedAt",
    expiresAt: "expiresAt",
  },
};

interface ShowcaseRecord {
  id: string;
  url: string;
  title: string;
  employer: string;
  description: string;
  language: string;
  city: string;
  remote: boolean;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "year" | null;
  skills: string[];
  sponsorship: boolean | null;
  languageRequired: string[];
  requiredCertifications: string[];
  publishedAt: string;
  expiresAt: string;
}

const EXPIRES = "2027-06-30T00:00:00.000Z";

/**
 * The fixture. Fixed strings and dates only, so the serialized feed body is
 * byte-for-byte identical on every call and screenshots / tests are stable.
 *
 * The set exercises the candidate journey: several Belgian cities and
 * languages, a remote role, a spread of salaries, and postings that state a
 * sponsorship / language / certification requirement so deterministic
 * eligibility has something to explain. `dup-antwerpen-fs` repeats
 * `antwerpen-fullstack` under a different id and the same apply URL, so
 * deduplication visibly collapses it to one displayed card.
 */
const SHOWCASE_RECORDS: ShowcaseRecord[] = [
  {
    id: "brussels-frontend",
    url: "https://jobs.example.test/synthetic/brussels-frontend",
    title: "Frontend Engineer (React / TypeScript)",
    employer: "Meridian Web Studio",
    description:
      "We build accessible public-sector web applications for Brussels institutions. You will own the component library, pair on tricky UI state, and help keep our Lighthouse scores green. Hybrid, two days a week in the Brussels office.",
    language: "en",
    city: "Brussels",
    remote: false,
    contractType: "permanent",
    salaryMin: 52000,
    salaryMax: 68000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["TypeScript", "React", "CSS", "Accessibility", "Testing Library"],
    sponsorship: true,
    languageRequired: ["en"],
    requiredCertifications: [],
    publishedAt: "2026-08-24T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "antwerpen-fullstack",
    url: "https://jobs.example.test/synthetic/antwerpen-fullstack",
    title: "Fullstack Developer (Node.js + React)",
    employer: "Havenlicht BV",
    description:
      "Logistiek platform voor de haven van Antwerpen. Je werkt aan API's in Node.js, een React-frontend en de integraties met externe vervoerders. Nederlands is de voertaal binnen het team.",
    language: "nl",
    city: "Antwerpen",
    remote: false,
    contractType: "permanent",
    salaryMin: 48000,
    salaryMax: 62000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Node.js", "React", "PostgreSQL", "Docker"],
    sponsorship: false,
    languageRequired: ["nl"],
    requiredCertifications: [],
    publishedAt: "2026-08-19T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "dup-antwerpen-fs",
    url: "https://jobs.example.test/synthetic/antwerpen-fullstack",
    title: "Fullstack Developer (Node.js + React)",
    employer: "Havenlicht BV",
    description:
      "Fullstack rol bij Havenlicht — dezelfde vacature, opnieuw gepubliceerd via een aggregator om deduplicatie te tonen.",
    language: "nl",
    city: "Antwerpen",
    remote: false,
    contractType: "permanent",
    salaryMin: 48000,
    salaryMax: 62000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Node.js", "React", "PostgreSQL", "Docker"],
    sponsorship: false,
    languageRequired: ["nl"],
    requiredCertifications: [],
    publishedAt: "2026-08-20T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "gent-platform",
    url: "https://jobs.example.test/synthetic/gent-platform",
    title: "Platform Engineer (Kubernetes)",
    employer: "Coudscale NV",
    description:
      "Join our platform team in Ghent operating multi-tenant Kubernetes clusters. You will improve CI/CD, own observability, and reduce toil for product teams. English-speaking team, relocation supported.",
    language: "en",
    city: "Gent",
    remote: false,
    contractType: "permanent",
    salaryMin: 60000,
    salaryMax: 80000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Kubernetes", "Terraform", "AWS", "Prometheus", "Go"],
    sponsorship: true,
    languageRequired: ["en"],
    requiredCertifications: ["CKA"],
    publishedAt: "2026-08-28T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "liege-data",
    url: "https://jobs.example.test/synthetic/liege-data",
    title: "Ingénieur Données (Python)",
    employer: "Fleuve Analytique SA",
    description:
      "Nous construisons des pipelines de données pour le secteur industriel wallon. Vous concevrez des traitements batch en Python, modéliserez un entrepôt et outillerez la qualité des données. Équipe francophone à Liège.",
    language: "fr",
    city: "Liège",
    remote: false,
    contractType: "permanent",
    salaryMin: 46000,
    salaryMax: 58000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Python", "SQL", "Airflow", "dbt"],
    sponsorship: false,
    languageRequired: ["fr"],
    requiredCertifications: [],
    publishedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "remote-backend",
    url: "https://jobs.example.test/synthetic/remote-backend",
    title: "Backend Engineer (Go) — Remote (Belgium)",
    employer: "Kestrel Systems",
    description:
      "Fully remote within Belgium. You will design and run Go services that back our payments product, care about correctness, and take part in a light on-call rotation. Quarterly team meetups in Leuven.",
    language: "en",
    city: "Remote",
    remote: true,
    contractType: "permanent",
    salaryMin: 65000,
    salaryMax: 85000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Go", "gRPC", "PostgreSQL", "Kafka"],
    sponsorship: true,
    languageRequired: ["en"],
    requiredCertifications: [],
    publishedAt: "2026-08-30T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "hasselt-qa",
    url: "https://jobs.example.test/synthetic/hasselt-qa",
    title: "QA Automation Engineer",
    employer: "Limburg Software Works BV",
    description:
      "Testautomatisering voor een groeiend SaaS-product in Hasselt. Je bouwt end-to-end tests met Playwright, bewaakt de pijplijn en werkt nauw samen met ontwikkelaars. Tweetalig team (NL/EN).",
    language: "nl",
    city: "Hasselt",
    remote: false,
    contractType: "fixed_term",
    salaryMin: 40000,
    salaryMax: 50000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Playwright", "TypeScript", "CI/CD"],
    sponsorship: false,
    languageRequired: ["nl", "en"],
    requiredCertifications: ["ISTQB Foundation"],
    publishedAt: "2026-08-12T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "leuven-ml",
    url: "https://jobs.example.test/synthetic/leuven-ml",
    title: "Machine Learning Engineer",
    employer: "Arclight Research NV",
    description:
      "Applied ML for document understanding. You will take models from notebook to production service, own evaluation, and work with a research team spun out of KU Leuven. English-speaking, hybrid in Leuven.",
    language: "en",
    city: "Leuven",
    remote: false,
    contractType: "permanent",
    salaryMin: 58000,
    salaryMax: 78000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Python", "PyTorch", "MLOps", "Docker"],
    sponsorship: true,
    languageRequired: ["en"],
    requiredCertifications: [],
    publishedAt: "2026-08-26T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "brugge-support",
    url: "https://jobs.example.test/synthetic/brugge-support",
    title: "Developer Support Engineer",
    employer: "Tidewater API BV",
    description:
      "Help developers integrate our API. You will answer technical questions, reproduce issues, write sample code, and feed recurring problems back to engineering. Based in Bruges, hybrid.",
    language: "en",
    city: "Brugge",
    remote: false,
    contractType: "permanent",
    salaryMin: 38000,
    salaryMax: 48000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["JavaScript", "REST", "Support", "Technical writing"],
    sponsorship: false,
    languageRequired: ["en"],
    requiredCertifications: [],
    publishedAt: "2026-08-14T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
  {
    id: "namur-devops",
    url: "https://jobs.example.test/synthetic/namur-devops",
    title: "DevOps Engineer (Azure)",
    employer: "Sambre Cloud SA",
    description:
      "Vous industrialiserez le déploiement de nos applications sur Azure, automatiserez l'infrastructure avec Bicep et améliorerez la supervision. Équipe francophone à Namur, télétravail partiel.",
    language: "fr",
    city: "Namur",
    remote: false,
    contractType: "permanent",
    salaryMin: 50000,
    salaryMax: 66000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    skills: ["Azure", "Bicep", "GitHub Actions", "Bash"],
    sponsorship: false,
    languageRequired: ["fr"],
    requiredCertifications: [],
    publishedAt: "2026-08-22T00:00:00.000Z",
    expiresAt: EXPIRES,
  },
];

/**
 * The feed body exactly as the loader hands it to `runSync`. Pure and
 * deterministic: same output on every call, which is what makes the demo
 * reproducible.
 */
export function showcaseFeedBody(): string {
  return JSON.stringify({ jobs: SHOWCASE_RECORDS }, null, 2);
}

/** How many records the fixture carries, and how many survive deduplication. */
export const SHOWCASE_RECORD_COUNT = SHOWCASE_RECORDS.length;
export const SHOWCASE_ACTIVE_COUNT = new Set(SHOWCASE_RECORDS.map((record) => record.url)).size;
