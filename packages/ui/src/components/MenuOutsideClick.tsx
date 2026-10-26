"use client";

import { useEffect } from "react";

/**
 * Closes any open header dropdown (<details name="ui-header-menu">) when the
 * user clicks outside of it. The native <details> element only closes when its
 * own <summary> is toggled — it has no built-in "click outside to dismiss"
 * behavior, and no Escape-to-close either. This component installs one
 * document-level pointer listener and one keydown listener (Escape closes the
 * open menu and returns focus to its button) and is rendered once by
 * <AppShell>; it renders nothing itself.
 */
export function MenuOutsideClick() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      // Click inside a menu — let <details> handle it natively.
      if (target?.closest?.("details.ui-menu")) return;
      // Click outside — close every open header menu.
      document
        .querySelectorAll('details.ui-menu[open][name="ui-header-menu"]')
        .forEach((el) => {
          (el as HTMLDetailsElement).open = false;
        });
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      document
        .querySelectorAll<HTMLDetailsElement>('details.ui-menu[open][name="ui-header-menu"]')
        .forEach((el) => {
          const hadFocus = el.contains(document.activeElement);
          el.open = false;
          if (hadFocus) el.querySelector("summary")?.focus();
        });
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
