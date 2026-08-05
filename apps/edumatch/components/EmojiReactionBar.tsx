"use client";

import { useState } from "react";

export type MessageReactions = Partial<
  Record<
    | "thumbsup"
    | "thumbsdown"
    | "check"
    | "question"
    | "eyes"
    | "tada"
    | "heart"
    | "fire"
    | "rocket"
    | "taco"
    | "star"
    | "tart",
    string[]
  >
>;

type SupportedEmoji = keyof MessageReactions;

const EMOJI_MAP: Record<SupportedEmoji, string> = {
  thumbsup: "👍",
  thumbsdown: "👎",
  check: "✅",
  question: "❓",
  eyes: "👀",
  tada: "🎉",
  heart: "❤️",
  fire: "🔥",
  rocket: "🚀",
  taco: "🌮",
  star: "⭐",
  tart: "🍰",
};

const ALL_EMOJIS = Object.keys(EMOJI_MAP) as SupportedEmoji[];

interface Props {
  messageId: string;
  reactions: MessageReactions;
  currentUserId: string;
  /** If true, picker opens above the bar (for messages near the bottom of the thread). */
  pickerAbove?: boolean;
}

export default function EmojiReactionBar({
  messageId,
  reactions,
  currentUserId,
  pickerAbove = false,
}: Props) {
  const [local, setLocal] = useState<MessageReactions>(reactions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<SupportedEmoji | null>(null);

  async function toggle(emoji: SupportedEmoji) {
    if (busy) return;
    setBusy(emoji);
    setPickerOpen(false);

    // Optimistic update
    const prev = local[emoji] ?? [];
    const alreadyReacted = prev.includes(currentUserId);
    const next = alreadyReacted
      ? prev.filter((id) => id !== currentUserId)
      : [...prev, currentUserId];
    setLocal((r) => {
      const updated = { ...r };
      if (next.length === 0) {
        delete updated[emoji];
      } else {
        updated[emoji] = next;
      }
      return updated;
    });

    try {
      const res = await fetch(
        `/api/verification/messages/${messageId}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { reactions: MessageReactions };
        setLocal(data.reactions);
      } else {
        // Revert on failure
        setLocal(reactions);
      }
    } catch {
      setLocal(reactions);
    } finally {
      setBusy(null);
    }
  }

  const activeEmojis = ALL_EMOJIS.filter(
    (e) => local[e] && (local[e]?.length ?? 0) > 0,
  );

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1">
      {/* Existing reaction chips */}
      {activeEmojis.map((emoji) => {
        const users = local[emoji] ?? [];
        const mine = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => void toggle(emoji)}
            disabled={busy === emoji}
            aria-label={`${EMOJI_MAP[emoji]} ${users.length}${mine ? " (you reacted)" : ""}`}
            aria-pressed={mine}
            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${
              mine
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel)]"
            } disabled:opacity-50`}
          >
            <span aria-hidden="true">{EMOJI_MAP[emoji]}</span>
            <span>{users.length}</span>
          </button>
        );
      })}

      {/* Add-reaction button */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          aria-haspopup="true"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-panel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
        >
          +
        </button>

        {pickerOpen && (
          <div
            role="menu"
            aria-label="Emoji picker"
            className={`absolute z-10 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-lg ${
              pickerAbove ? "bottom-7 left-0" : "left-0 top-7"
            }`}
          >
            {ALL_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                role="menuitem"
                onClick={() => void toggle(emoji)}
                disabled={busy === emoji}
                aria-label={emoji}
                className="rounded p-1 text-base transition-colors hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50"
              >
                {EMOJI_MAP[emoji]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
