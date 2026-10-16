"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { cleanTechnologyName, technologyKey } from "../domain/technologies";

export function TechnologyPicker({
  initial,
  options,
}: {
  initial: string[];
  options: string[];
}) {
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState("");
  const selectedKeys = useMemo(
    () => new Set(selected.map(technologyKey)),
    [selected],
  );
  const suggestions = options
    .filter(
      (name) =>
        !selectedKeys.has(technologyKey(name)) &&
        name
          .toLocaleLowerCase("es")
          .includes(query.trim().toLocaleLowerCase("es")),
    )
    .slice(0, 12);
  const add = (raw: string) => {
    const name = cleanTechnologyName(raw);
    if (!name || name.length > 100) return;
    const known = options.find(
      (option) => technologyKey(option) === technologyKey(name),
    );
    const canonical = known ?? name;
    setSelected((current) =>
      current.some((item) => technologyKey(item) === technologyKey(canonical))
        ? current
        : [...current, canonical],
    );
    setQuery("");
  };
  return (
    <div className="technology-picker">
      <div className="technology-chips">
        {selected.map((name) => (
          <span className="technology-chip" key={technologyKey(name)}>
            {name}
            <button
              type="button"
              aria-label={`Quitar ${name}`}
              onClick={() =>
                setSelected((current) =>
                  current.filter((item) => item !== name),
                )
              }
            >
              <X size={13} />
            </button>
            <input type="hidden" name="technologies" value={name} />
          </span>
        ))}
      </div>
      <div className="technology-search-row">
        <input
          id="technologies"
          type="search"
          name="technologiesDraft"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(query);
            }
          }}
          maxLength={100}
          placeholder="Ej. Angular, Docker…"
        />
        <button
          type="button"
          className="button button-outline"
          onClick={() => add(query)}
          disabled={!query.trim()}
        >
          <Plus size={14} /> Añadir
        </button>
      </div>
      {!!suggestions.length && (
        <div
          className="technology-suggestions"
          aria-label="Opciones disponibles"
        >
          {suggestions.map((name) => (
            <button key={name} type="button" onClick={() => add(name)}>
              <Plus size={12} /> {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
