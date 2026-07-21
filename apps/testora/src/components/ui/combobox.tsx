"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  /** The text shown in the trigger and the list, and what the filter matches against. */
  label: string;
  /** Optional dimmer secondary text shown after the label (e.g. "(2 cases)"). Not searched. */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Text for the search box. */
  searchPlaceholder?: string;
  /** Shown when the filter matches nothing. */
  emptyText?: string;
  className?: string;
  /** Min-width utility for the trigger; lists can be wider than the trigger. */
  triggerClassName?: string;
}

/**
 * A searchable single-select dropdown — a drop-in upgrade for a native <select>
 * when the option list is long. Type to fuzzily filter, arrow keys to move,
 * Enter to pick, Esc to close. Closes on click-outside and blur.
 *
 * Kept dependency-free (no popover lib) and absolutely-positioned beneath the
 * trigger; the parent should not clip overflow.
 */
export function Combobox({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches",
  className,
  triggerClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  // Case-insensitive subsequence-ish match: every search token must appear in
  // the label. Cheap and forgiving for "cont form" → "Contact form UI".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const tokens = q.split(/\s+/);
    return options.filter((o) => {
      const label = o.label.toLowerCase();
      return tokens.every((t) => label.includes(t));
    });
  }, [options, query]);

  // Keep the active row in range whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Focus the search field when the menu opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Scroll the active option into view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function commit(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        commit(filtered[activeIndex]!);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint && (
                <span className="text-muted-foreground"> {selected.hint}</span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-max min-w-full max-w-[min(36rem,90vw)] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-controls={listId}
              aria-expanded={open}
            />
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
            )}
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                    isActive ? "bg-primary/15 text-foreground" : "text-foreground/90",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isSelected ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  <span className="truncate">
                    {option.label}
                    {option.hint && (
                      <span className="text-muted-foreground"> {option.hint}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
