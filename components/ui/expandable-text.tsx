"use client";
import { useId, useState } from "react";
export function ExpandableText({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false),
    id = useId();
  const long = text.length > 300;
  return (
    <div className="expandable-text">
      <p id={id}>{long && !expanded ? text.slice(0, 300) + "…" : text}</p>
      {long && (
        <button
          type="button"
          className="notes-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={
            (expanded ? "Ocultar detalles de " : "Ver detalles de ") + label
          }
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
