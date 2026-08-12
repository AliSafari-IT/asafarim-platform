import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { requireSuperAdmin } from "../_shared";

export const metadata: Metadata = { title: "Screenshots · Business Plan · EduMatch Admin" };

// Where the actual PNGs live once someone drops them in — see the note at
// the bottom of this file for the exact filenames this page expects.
const SHOT_DIR = "business-plan-screenshots";

type Shot = {
  file: string;
  title: string;
  route: string;
  caption: string;
};

type Part = {
  label: string;
  title: string;
  shots: Shot[];
};

// Ordered as a story, not as a feature list: walk in the front door, follow
// a student from their first question through to a booked, ongoing lesson,
// then follow a tutor from "phone buzzes" through to getting paid.
const parts: Part[] = [
  {
    label: "Part I",
    title: "Meet EduMatch",
    shots: [
      {
        file: "01-landing-page.png",
        title: "Landing page",
        route: "/",
        caption:
          "“Meet the right help. Make learning click.” — the hero, with a live top-match card and the smart study companion example doing the pitch instead of a marketing paragraph.",
      },
    ],
  },
  {
    label: "Part II",
    title: "A student's path",
    shots: [
      {
        file: "02-learn-intake-empty.png",
        title: "Get help — the open question",
        route: "/student/learn",
        caption:
          "No twenty-field form. One box: “What would you like help with?” — type it, or drop in a photo of the exercise.",
      },
      {
        file: "03-learn-intake-brief.png",
        title: "Confirmed brief, five tutors ready",
        route: "/student/learn",
        caption:
          "A fully assembled Learning Brief next to the five tutors it's about to reach — each with its own match reasons and rate, before a single message is sent.",
      },
      {
        file: "04-student-inquiries.png",
        title: "My Inquiries",
        route: "/student",
        caption:
          "Every request a student has made, with its status — tutor requested, booked, or closed — at a glance.",
      },
      {
        file: "05-student-notifications.png",
        title: "Notifications — a quote lands",
        route: "/student (notification bell)",
        caption: "“Amira Vandenberg submitted a quote for your Mathematics inquiry at €45/hr.” The loop closing on the student's side.",
      },
      {
        file: "06-student-profile.png",
        title: "Learning profile",
        route: "/student/profile",
        caption:
          "Grade level, subjects of interest, date of birth, and an optional home address — used for matching, never required to get started.",
      },
      {
        file: "07-student-bookings.png",
        title: "My Bookings",
        route: "/student/bookings",
        caption: "Scheduled and completed sessions, with a dispute option built in rather than bolted on as an afterthought.",
      },
      {
        file: "08-student-learning-journey.png",
        title: "My learning",
        route: "/student/journey",
        caption:
          "Completed sessions, goal progress, and what a tutor is still noticing — the record that outlives any single booking.",
      },
    ],
  },
  {
    label: "Part III",
    title: "A tutor's path",
    shots: [
      {
        file: "09-tutor-notifications.png",
        title: "Notifications — a request lands",
        route: "/ (notification bell)",
        caption: "New Quote Request alerts, the nudge that gets a tutor from “matched” to “sent” quickly.",
      },
      {
        file: "10-tutor-invitations.png",
        title: "Invitations",
        route: "/tutor/invites",
        caption:
          "Incoming briefs a tutor has been matched to, each carrying its own explainable match reasons — subject fit, level, language, responsiveness — instead of a bare lead.",
      },
      {
        file: "11-tutor-invitations-compact.png",
        title: "Invitations — narrow viewport",
        route: "/tutor/invites",
        caption: "The same inbox at a narrower width — the match-reason chips still read clearly without the full sidebar.",
      },
      {
        file: "12-tutor-invite-review.png",
        title: "Review & respond",
        route: "/tutor/invites/[id]",
        caption:
          "The moment that makes the whole model work: the student's brief on the left, an AI-drafted proposal already priced from the tutor's own rate card on the right, and three honest options — Adjust, Decline, Send.",
      },
      {
        file: "13-proposal-sent.png",
        title: "Proposal sent",
        route: "/tutor/invites/[id]",
        caption:
          "The confirmation a tutor sees right after pressing Send. Nothing reached the student before this screen — the AI drafted, the tutor approved.",
      },
      {
        file: "14-tutor-quotes.png",
        title: "My Quotes",
        route: "/tutor/quotes",
        caption: "Every proposal a tutor has sent, split by status. Pending vs. accepted counts give a tutor an at-a-glance read on their own win rate.",
      },
      {
        file: "15-tutor-bookings.png",
        title: "My Bookings",
        route: "/tutor/bookings",
        caption: "Completed sessions with student name, mode, and rate — the raw material behind the learning journey a student sees on their side.",
      },
      {
        file: "16-tutor-earnings.png",
        title: "Earnings",
        route: "/tutor/earnings",
        caption:
          "Available balance, pending funds, and a transaction history that itemises the platform fee on every session payment — this is where the 15% from the business plan is actually visible to a tutor.",
      },
      {
        file: "17-tutor-profile-coordinates.png",
        title: "Edit Tutor Profile — coordinates",
        route: "/tutor/profile",
        caption:
          "The geolocation control added to the tutor profile form — “Use my location” plus manual latitude/longitude — the fix that makes in-person distance matching actually work end to end.",
      },
      {
        file: "18-tutor-settings.png",
        title: "Settings",
        route: "/tutor/settings",
        caption: "Default hourly rate, online-only toggle, and service radius — the defaults every new quote inherits.",
      },
    ],
  },
];

const allShots = parts.flatMap((p) => p.shots);

function shotExists(file: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", SHOT_DIR, file));
  } catch {
    return false;
  }
}

export default async function BusinessPlanScreenshotsPage() {
  await requireSuperAdmin();

  const missing = allShots.filter((s) => !shotExists(s.file));
  let counter = 0;

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <Link
        href="/admin/business-plan"
        className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        ← Back to Business Plan
      </Link>

      <div className="mt-4">
        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">APPENDIX</div>
        <h1 className="mt-1 font-serif text-4xl text-[var(--color-text)]">Screens to capture</h1>
        <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          The captured set referenced from the business plan&rsquo;s appendix, walked in story order: through the
          front door, through a student&rsquo;s first question to a booked lesson, then through a tutor&rsquo;s
          inbox to getting paid.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--color-text)]">
          <strong>{missing.length} of {allShots.length}</strong> images aren&rsquo;t on disk yet. Drop the files
          below into <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[0.9em]">apps/edumatch/public/{SHOT_DIR}/</code>{" "}
          — this page picks them up automatically, no redeploy needed:
          <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-[13px]">
            {missing.map((s) => (
              <li key={s.file}>{s.file}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10">
        {parts.map((part) => (
          <div key={part.title} className="mt-16 border-t border-[var(--color-border)] pt-8 first:mt-0 first:border-0 first:pt-0">
            <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">{part.label.toUpperCase()}</div>
            <h2 className="mt-1 font-serif text-2xl text-[var(--color-text)]">{part.title}</h2>

            <div className="mt-8 space-y-10">
              {part.shots.map((s) => {
                counter += 1;
                const exists = shotExists(s.file);
                return (
                  <figure key={s.file}>
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-serif text-xl text-[var(--color-text)]">
                        <span className="mr-2 font-mono text-xs text-[var(--color-text-muted)]">{String(counter).padStart(2, "0")}</span>
                        {s.title}
                      </h3>
                      <code className="whitespace-nowrap rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-primary)]">
                        {s.route}
                      </code>
                    </div>

                    {exists ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static screenshot from /public, not an optimizable remote asset
                      <img
                        src={`/${SHOT_DIR}/${s.file}`}
                        alt={`${s.title} — screenshot of ${s.route}`}
                        className="w-full rounded-lg border border-[var(--color-border)]"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-center text-sm text-[var(--color-text-muted)]">
                        <span>
                          Missing — save as <code className="font-mono text-xs">{s.file}</code>
                        </span>
                      </div>
                    )}

                    <figcaption className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-muted)]">
                      {s.caption}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
