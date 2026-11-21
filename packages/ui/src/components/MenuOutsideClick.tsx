"use client";

import { useEffect } from "react";

/** Every header dropdown: TopNav's "Menu", AppSwitcher, UserMenu. */
const MENU_SELECTOR = "details.ui-menu";
const OPEN_MENU_SELECTOR = "details.ui-menu[open]";

/** Close every open header menu that does not contain `keep`. */
export function closeOpenMenus(root: ParentNode, keep?: Element | null) {
  root.querySelectorAll<HTMLDetailsElement>(OPEN_MENU_SELECTOR).forEach((el) => {
    if (keep && el.contains(keep)) return;
    el.open = false;
  });
}

/**
 * Dismissal for the header dropdowns (<details class="ui-menu">). The native
 * <details> element only closes when its own <summary> is toggled: it has no
 * "click outside to dismiss" and no Escape-to-close. This component installs
 * document-level listeners, is rendered once by <AppShell>, and renders
 * nothing itself:
 *
 * - a pointerdown anywhere closes every open menu the pointer is not inside
 *   (so opening one menu, or clicking the page, closes the others);
 * - choosing a link inside a menu panel closes that menu (needed for
 *   same-page #hash links and client-side navigation, where the header is
 *   not re-rendered);
 * - Escape closes the open menu and returns focus to its button.
 *
 * Every `.ui-menu` is covered, not only the ones sharing a `name` group:
 * TopNav's "Menu" had no `name`, so it used to stay open on outside clicks.
 */
export function MenuOutsideClick() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      closeOpenMenus(document, target?.closest?.(MENU_SELECTOR) ?? null);
    }
    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const link = target?.closest?.(".ui-menu__panel a[href]");
      if (!link) return;
      const menu = link.closest<HTMLDetailsElement>(MENU_SELECTOR);
      if (menu) menu.open = false;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(OPEN_MENU_SELECTOR).forEach((el) => {
        const hadFocus = el.contains(document.activeElement);
        el.open = false;
        if (hadFocus) el.querySelector("summary")?.focus();
      });
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
