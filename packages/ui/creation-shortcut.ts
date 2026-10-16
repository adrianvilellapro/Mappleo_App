import type { EntityKind } from "../domain/tracker";

type ShortcutEvent = Pick<
  KeyboardEvent,
  | "ctrlKey"
  | "altKey"
  | "shiftKey"
  | "metaKey"
  | "repeat"
  | "isComposing"
  | "code"
  | "key"
>;
const destinations: Record<string, EntityKind> = {
  E: "companies",
  O: "offers",
  C: "applications",
  V: "networking",
  P: "contacts",
  N: "networking",
  T: "contacts", // Preserve the original Windows shortcuts.
};

export function creationShortcut(event: ShortcutEvent): EntityKind | undefined {
  if (
    !event.ctrlKey ||
    !event.altKey ||
    event.shiftKey ||
    event.metaKey ||
    event.repeat ||
    event.isComposing
  )
    return;
  // Some Spanish Windows layouts report Ctrl+Alt+E as € and omit KeyE.
  // Prefer the physical code, but also recognise the resulting character.
  const letter = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : event.key === "€"
      ? "E"
      : event.key.toUpperCase();
  return destinations[letter];
}

export function editingTextOrDialog(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='dialog']",
    )
  );
}
