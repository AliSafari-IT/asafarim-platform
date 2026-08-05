import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Image as ImageIcon,
  LogIn,
  MapPin,
  MessageSquareText,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { HelpVisualKind } from "@/lib/help-content";

/**
 * Lightweight, dependency-free illustrations for Help Center steps.
 *
 * Deliberately not screenshots: real UI copy/labels drift constantly (see
 * the rest of this app's history), and a screenshot goes stale the moment
 * a button label changes. These are small HTML/CSS mockups that resemble
 * EduMatch's actual forms/cards/timelines/statuses in shape and color only
 * — decorative, never the sole carrier of meaning (every one pairs with
 * real step text, and aria-hidden keeps them out of the accessibility tree
 * so screen readers aren't shown a picture with nothing to say).
 *
 * Built from `var(--color-*)` tokens only, so it stays correct in both
 * themes automatically — nothing here hardcodes a hex color.
 */

const shell =
  "flex h-full w-full flex-col justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4";

function Bar({ w = "100%", h = 10 }: { w?: string; h?: number }) {
  return (
    <div
      className="rounded-full bg-[var(--color-surface-muted)]"
      style={{ width: w, height: h }}
    />
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
      {children}
    </span>
  );
}

function SignInVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <LogIn size={18} className="text-[var(--color-primary)]" />
        <Bar w="55%" h={12} />
      </div>
      <Bar w="90%" />
      <Bar w="70%" />
      <div className="mt-1 h-8 w-full rounded-lg bg-[var(--color-primary)] opacity-80" />
    </div>
  );
}

function FormVisual() {
  return (
    <div className={shell}>
      <Bar w="40%" h={8} />
      <div className="h-6 w-full rounded-md border border-[var(--color-border)]" />
      <Bar w="30%" h={8} />
      <div className="h-14 w-full rounded-md border border-[var(--color-border)]" />
      <div className="flex justify-end">
        <div className="h-7 w-20 rounded-md bg-[var(--color-primary)] opacity-80" />
      </div>
    </div>
  );
}

function AttachmentsVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <ImageIcon size={16} className="text-[var(--color-accent)]" />
        <Bar w="45%" />
      </div>
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-[var(--color-accent)]" />
        <Bar w="60%" />
      </div>
      <div className="rounded-md border border-dashed border-[var(--color-border-field)] px-3 py-2 text-center text-[11px] text-[var(--color-text-subtle)]">
        drag &amp; drop
      </div>
    </div>
  );
}

function AiResponseVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--color-accent)]" />
        <Bar w="35%" h={8} />
      </div>
      <Bar w="95%" />
      <Bar w="85%" />
      <Bar w="60%" />
    </div>
  );
}

function QuoteListVisual() {
  return (
    <div className={shell}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-2 py-1.5"
        >
          <div className="flex flex-1 flex-col gap-1">
            <Bar w="60%" h={7} />
            <Bar w="35%" h={6} />
          </div>
          <Chip>
            <Wallet size={11} />
          </Chip>
        </div>
      ))}
    </div>
  );
}

function QuoteCompareVisual() {
  return (
    <div className={shell}>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-md border border-[var(--color-border)] p-2"
          >
            <Bar w="70%" h={7} />
            <Bar w="50%" h={6} />
            <Bar w="80%" h={6} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckoutVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-[var(--color-primary)]" />
        <Bar w="45%" h={8} />
      </div>
      <div className="h-6 w-full rounded-md border border-[var(--color-border)]" />
      <div className="mt-1 h-8 w-full rounded-lg bg-[var(--color-primary)] opacity-80" />
    </div>
  );
}

function BookingStatusVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-[var(--color-primary)]" />
        <Bar w="50%" h={8} />
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-[var(--color-success)]" />
        <span className="text-[11px] font-medium text-[var(--color-success)]">
          confirmed
        </span>
      </div>
      <Bar w="65%" h={6} />
    </div>
  );
}

function DisputeVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-[var(--color-warning)]" />
        <Bar w="40%" h={8} />
      </div>
      <Bar w="90%" />
      <Bar w="70%" />
    </div>
  );
}

function TutorProfileVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-[var(--color-primary-soft)]" />
        <div className="flex flex-1 flex-col gap-1">
          <Bar w="50%" h={7} />
          <Bar w="30%" h={6} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip>subject</Chip>
        <Chip>subject</Chip>
        <Chip>
          <MapPin size={11} />
        </Chip>
      </div>
    </div>
  );
}

function VerificationVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-[var(--color-accent)]" />
        <Bar w="45%" h={8} />
      </div>
      <Chip>
        <BadgeCheck size={11} /> pending
      </Chip>
    </div>
  );
}

function RequestsListVisual() {
  return (
    <div className={shell}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <ClipboardList size={14} className="text-[var(--color-text-subtle)]" />
          <Bar w={`${70 - i * 15}%`} h={7} />
        </div>
      ))}
    </div>
  );
}

function QuoteFormVisual() {
  return (
    <div className={shell}>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Bar w="60%" h={6} />
          <div className="h-6 rounded-md border border-[var(--color-border)]" />
        </div>
        <div className="flex flex-col gap-1">
          <Bar w="60%" h={6} />
          <div className="h-6 rounded-md border border-[var(--color-border)]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-7 w-24 rounded-md bg-[var(--color-primary)] opacity-80" />
      </div>
    </div>
  );
}

function EarningsVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-[var(--color-success)]" />
        <Bar w="35%" h={8} />
      </div>
      <div className="text-lg font-bold text-[var(--color-success)]">
        €0.00
      </div>
      <Bar w="55%" h={6} />
    </div>
  );
}

function ConnectOnboardingVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <MessageSquareText size={16} className="text-[var(--color-primary)]" />
        <Bar w="55%" h={8} />
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i === 0 ? "bg-[var(--color-primary)]" : "bg-[var(--color-surface-muted)]"}`}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsVisual() {
  return (
    <div className={shell}>
      <div className="flex items-center gap-2">
        <Settings2 size={16} className="text-[var(--color-text-muted)]" />
        <Bar w="40%" h={8} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between">
          <Bar w="55%" h={6} />
          <div className="h-4 w-8 rounded-full bg-[var(--color-primary-soft)]" />
        </div>
      ))}
    </div>
  );
}

const VISUALS: Record<HelpVisualKind, () => React.JSX.Element> = {
  "sign-in": SignInVisual,
  form: FormVisual,
  attachments: AttachmentsVisual,
  "ai-response": AiResponseVisual,
  "quote-list": QuoteListVisual,
  "quote-compare": QuoteCompareVisual,
  checkout: CheckoutVisual,
  "booking-status": BookingStatusVisual,
  dispute: DisputeVisual,
  "tutor-profile": TutorProfileVisual,
  verification: VerificationVisual,
  "requests-list": RequestsListVisual,
  "quote-form": QuoteFormVisual,
  earnings: EarningsVisual,
  "connect-onboarding": ConnectOnboardingVisual,
  settings: SettingsVisual,
};

/** Renders one of the built-in illustrative mockups. Purely decorative. */
export function HelpVisual({ kind }: { kind: HelpVisualKind }) {
  const Visual = VISUALS[kind];
  return (
    <div aria-hidden="true" className="h-32 w-full sm:h-36">
      <Visual />
    </div>
  );
}
