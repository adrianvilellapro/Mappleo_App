import { describe, expect, it } from "vitest";
import { creationShortcut } from "../../packages/ui/creation-shortcut";
const event = {
  ctrlKey: true,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  code: "KeyE",
  key: "e",
};
describe("creation shortcuts", () => {
  it("recognises company shortcuts on Spanish keyboards, including the euro character", () => {
    expect(creationShortcut(event)).toBe("companies");
    expect(creationShortcut({ ...event, key: "€" })).toBe("companies");
    expect(creationShortcut({ ...event, key: "€", code: "" })).toBe(
      "companies",
    );
    expect(creationShortcut({ ...event, key: "E", code: "" })).toBe(
      "companies",
    );
  });
  it("requires the exact modifiers and avoids composition or held-key repeats", () => {
    for (const change of [
      { ctrlKey: false },
      { altKey: false },
      { shiftKey: true },
      { metaKey: true },
      { repeat: true },
      { isComposing: true },
    ])
      expect(creationShortcut({ ...event, ...change })).toBeUndefined();
  });
  it("retains every web shortcut and the existing Windows aliases", () => {
    for (const [letter, kind] of Object.entries({
      O: "offers",
      C: "applications",
      V: "networking",
      P: "contacts",
      N: "networking",
      T: "contacts",
    }))
      expect(
        creationShortcut({
          ...event,
          code: "Key" + letter,
          key: letter.toLowerCase(),
        }),
      ).toBe(kind);
  });
});
