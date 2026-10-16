"use client";
import { useState } from "react";
export function ExpandableNotes({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial),
    [expanded, setExpanded] = useState(initial.length <= 300);
  const long = value.length > 300;
  return (
    <div className="expandable-notes">
      <input type="hidden" name="notes" value={value} />
      {!expanded && long ? (
        <p className="notes-preview">{value.slice(0, 220)}…</p>
      ) : (
        <textarea
          id="notes"
          rows={long ? 12 : 4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={30000}
          wrap="soft"
        />
      )}
      {long && (
        <button
          type="button"
          className="notes-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Plegar notas" : "Desplegar notas completas"}
        </button>
      )}
    </div>
  );
}
