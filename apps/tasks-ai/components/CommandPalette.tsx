"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "../lib/client/telemetry";
import { useCapture } from "./capture/CaptureDialog";

interface Command {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/**
 * ⌘K / Ctrl-K command palette: quick navigation + quick capture. Fully
 * keyboard-driven; Escape closes.
 *
 * Capture here hands off to the same global Capture dialog the shell button
 * opens (issue #366) rather than writing a task itself. That is what stops
 * the old behaviour — silently creating the task in `projects[0]` — from
 * being possible at all: the palette no longer chooses a destination, the
 * dialog shows one and lets the person change it.
 */
export function CommandPalette({ slug }: { slug: string }) {
  const router = useRouter();
  const capture = useCapture();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      ...(capture.canCapture
        ? [
            {
              id: "capture-blank",
              label: "Capture a task",
              run: () => capture.open("", "command_palette"),
            },
          ]
        : []),
      { id: "nav-home", label: "Go to Home", run: () => router.push(`/w/${slug}`) },
      { id: "nav-inbox", label: "Go to Inbox", run: () => router.push(`/w/${slug}/inbox`) },
      { id: "nav-mywork", label: "Go to My Work", run: () => router.push(`/w/${slug}/my-work`) },
      { id: "nav-projects", label: "Go to Projects", run: () => router.push(`/w/${slug}/projects`) },
    ];
    const captureCommands: Command[] =
      capture.canCapture && query.trim()
        ? [
            {
              id: "capture",
              label: `Capture: “${query.trim()}” — you pick where it goes`,
              run: () => capture.open(query.trim(), "command_palette"),
            },
          ]
        : [];
    const all = [...captureCommands, ...nav];
    return query.trim()
      ? all.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()) || c.id === "capture")
      : all;
  }, [capture, query, router, slug]);

  if (!open) return null;

  return (
    <div className="ta-cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="ta-cmdk__backdrop" onClick={() => setOpen(false)} />
      <div className="ta-cmdk__panel">
        <input
          ref={inputRef}
          className="ta-cmdk__input"
          placeholder="Type a command or a task title…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, commands.length - 1));
            if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            if (e.key === "Enter" && commands[cursor]) {
              track({ name: "command_palette.action", action: commands[cursor].id });
              void commands[cursor].run();
              setOpen(false);
            }
          }}
        />
        <ul className="ta-cmdk__list">
          {commands.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={i === cursor ? "is-active" : undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  void c.run();
                  setOpen(false);
                }}
              >
                {c.label}
              </button>
            </li>
          ))}
          {commands.length === 0 && <li className="ta-cmdk__empty">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
