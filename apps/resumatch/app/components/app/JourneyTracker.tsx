import Link from "next/link";
import type { JourneyCounts } from "../../../lib/journey";

type Stage = "profile" | "tailor" | "track";

/**
 * Profile → Tailor → Track, with each stop's real state: done (✓ + a count
 * where there is one), current (the page you are on), or still ahead.
 * Every stop links to its page. Rendered as an ordered list so the order
 * and states read correctly without the visual.
 */
export function JourneyTracker({ counts, current }: { counts: JourneyCounts; current: Stage }) {
  const stops: { id: Stage; label: string; href: string; done: boolean; detail: string }[] = [
    {
      id: "profile",
      label: "Profile",
      href: "/profile",
      done: counts.profileConfirmed,
      detail: counts.profileConfirmed ? "Confirmed" : "Not confirmed yet",
    },
    {
      id: "tailor",
      label: "Tailor",
      href: "/tailor",
      done: counts.tailoredCount > 0,
      detail:
        counts.tailoredCount > 0
          ? `${counts.tailoredCount} tailored CV${counts.tailoredCount === 1 ? "" : "s"}`
          : "Nothing tailored yet",
    },
    {
      id: "track",
      label: "Track",
      href: "/applications",
      done: counts.applicationsCount > 0,
      detail:
        counts.applicationsCount > 0
          ? `${counts.applicationsCount} application${counts.applicationsCount === 1 ? "" : "s"}`
          : "No applications yet",
    },
  ];

  return (
    <nav className="rx-journey" aria-label="Your progress">
      <p className="rx-journey__title">Your journey</p>
      <ol className="rx-journey__track">
        {stops.map((stop, i) => {
          const state = stop.id === current ? "current" : stop.done ? "done" : "todo";
          return (
            <li key={stop.id} className={`rx-journey__stop rx-journey__stop--${state}`}>
              <Link href={stop.href} className="rx-journey__link" aria-current={stop.id === current ? "page" : undefined}>
                <span className="rx-journey__node" aria-hidden="true">
                  {stop.done && stop.id !== current ? "✓" : i + 1}
                </span>
                <span className="rx-journey__label">{stop.label}</span>
                <span className="rx-journey__detail">
                  {stop.done ? <span className="sr-only">Done: </span> : null}
                  {stop.detail}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
