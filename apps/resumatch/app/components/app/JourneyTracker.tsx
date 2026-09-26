"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import type { JourneyCounts } from "../../../lib/journey";

type Stage = "profile" | "tailor" | "track";

/**
 * Profile → Tailor → Track, with each stop's real state: done (✓ + a count
 * where there is one), current (the page you are on), or still ahead.
 * Every stop links to its page. Rendered as an ordered list so the order
 * and states read correctly without the visual. A client component only
 * for `useTranslation()` — the pages that render it are server components.
 */
export function JourneyTracker({ counts, current }: { counts: JourneyCounts; current: Stage }) {
  const { t } = useTranslation();
  const countLabel = (key: string, count: number) => t(`${key}.${count === 1 ? "one" : "other"}`, { count });

  const stops: {
    id: Stage;
    label: string;
    href: string;
    done: boolean;
    detail: string;
  }[] = [
    {
      id: "profile",
      label: t("resumatch.journey.profile"),
      href: "/profile",
      done: counts.profileConfirmed,
      detail: counts.profileConfirmed
        ? t("resumatch.journey.profile.confirmed")
        : t("resumatch.journey.profile.pending"),
    },
    {
      id: "tailor",
      label: t("resumatch.journey.tailor"),
      href: "/tailor",
      done: counts.tailoredCount > 0,
      detail:
        counts.tailoredCount > 0
          ? countLabel("resumatch.journey.tailor.count", counts.tailoredCount)
          : t("resumatch.journey.tailor.none"),
    },
    {
      id: "track",
      label: t("resumatch.journey.track"),
      href: "/applications",
      done: counts.applicationsCount > 0,
      detail:
        counts.applicationsCount > 0
          ? countLabel("resumatch.journey.track.count", counts.applicationsCount)
          : t("resumatch.journey.track.none"),
    },
  ];

  return (
    <nav className="rx-journey" aria-label={t("resumatch.journey.aria")}>
      <p className="rx-journey__title">{t("resumatch.journey.title")}</p>
      <ol className="rx-journey__track">
        {stops.map((stop, i) => {
          const state = stop.id === current ? "current" : stop.done ? "done" : "todo";
          return (
            <li key={stop.id} className={`rx-journey__stop rx-journey__stop--${state}`}>
              <Link
                href={stop.href}
                className="rx-journey__link"
                aria-current={stop.id === current ? "page" : undefined}
              >
                <span className="rx-journey__node" aria-hidden="true">
                  {stop.done && stop.id !== current ? "✓" : i + 1}
                </span>
                <span className="rx-journey__label">{stop.label}</span>
                <span className="rx-journey__detail">
                  {stop.done ? <span className="sr-only">{t("resumatch.journey.done")}</span> : null}
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
