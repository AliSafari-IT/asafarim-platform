import { ButtonLink } from "@asafarim/ui";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">TimelineAI</h1>
      <p className="text-lg text-[var(--color-text-muted,inherit)]">
        Build polished, visual timelines — for projects, history, roadmaps, and more.
        No account required to try it out.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {/* @asafarim/ui's ButtonLink, not a raw Tailwind-styled <a> — the
            shared package's base.css has an unlayered `a { color: var(--accent) }`
            rule that always beats Tailwind's @layer-utilities `text-white`
            (unlayered CSS wins over layered CSS regardless of specificity),
            which made this button's label invisible (white-on-white became
            accent-on-accent). ButtonLink's .ui-btn--primary class sets
            color via --accent-ink correctly within that same unlayered
            system, so it doesn't fight the cascade. */}
        <ButtonLink href="/create" variant="primary">
          Create a timeline
        </ButtonLink>
        <ButtonLink href="/gallery" variant="secondary">
          Browse the gallery
        </ButtonLink>
        <ButtonLink href="/dashboard" variant="secondary">
          Sign in for your dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
