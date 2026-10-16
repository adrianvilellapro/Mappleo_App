"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { matchesSearch } from "../search";

export function OfferPicker({
  options,
  value,
  readOnly,
}: {
  options: { id: string; label: string }[];
  value: string;
  readOnly: boolean;
}) {
  const [selected, setSelected] = useState(value);
  const [text, setText] = useState(
    options.find((offer) => offer.id === value)?.label ?? "",
  );
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const visible = useMemo(
    () => options.filter((offer) => matchesSearch(offer.label, search)),
    [options, search],
  );
  useEffect(() => {
    input.current?.setCustomValidity(
      selected ? "" : "Selecciona una oferta de la lista.",
    );
  }, [selected]);
  useEffect(() => {
    if (open)
      list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);
  const choose = (offer: { id: string; label: string }) => {
    setSelected(offer.id);
    setText(offer.label);
    setSearch("");
    setOpen(false);
  };
  return (
    <div
      className="offer-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div className="offer-combobox-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          id="jobOfferId"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && visible[activeIndex]
              ? listId + "-" + activeIndex
              : undefined
          }
          autoComplete="off"
          placeholder="Buscar por puesto o empresa…"
          value={text}
          required
          disabled={readOnly}
          onFocus={(event) => {
            setActiveIndex(0);
            if (selected) {
              setSearch("");
              event.currentTarget.select();
            }
            setOpen(true);
          }}
          onChange={(event) => {
            setText(event.target.value);
            setSearch(event.target.value);
            setSelected("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex((index) =>
                open
                  ? Math.max(0, Math.min(visible.length - 1, index + direction))
                  : 0,
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (visible[activeIndex]) choose(visible[activeIndex]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {!readOnly && (
          <button
            type="button"
            aria-label="Mostrar ofertas"
            aria-expanded={open}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) setOpen(false);
              else {
                setSearch("");
                setActiveIndex(0);
                input.current?.focus();
                setOpen(true);
              }
            }}
          >
            <ChevronDown size={17} />
          </button>
        )}
      </div>
      <input type="hidden" name="jobOfferId" value={selected} />
      {open && !readOnly && (
        <ul
          id={listId}
          className="offer-options"
          role="listbox"
          aria-label="Ofertas disponibles"
          ref={list}
        >
          {visible.length ? (
            visible.map((offer, index) => (
              <li key={offer.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={listId + "-" + index}
                  aria-selected={selected === offer.id}
                  className={index === activeIndex ? "offer-option-active" : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(offer)}
                >
                  <span>{offer.label}</span>
                  {selected === offer.id && <Check size={15} />}
                </button>
              </li>
            ))
          ) : (
            <li className="offer-no-results" role="presentation">
              No hay ofertas que coincidan.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
