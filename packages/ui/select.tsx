"use client";

import { useEffect, useRef, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type Option = { value: string; label: string };
const empty = "__mappleo_empty__";

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  label,
  disabled,
  required,
  className = "",
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  id?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const initial =
    defaultValue !== undefined ? defaultValue : options[0]?.value || "";
  const [selected, setSelected] = useState(initial);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = value ?? selected;
  useEffect(() => {
    const form = trigger.current?.closest("form");
    const reset = () => setSelected(initial);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  return (
    <>
      <SelectPrimitive.Root
        value={current || empty}
        onValueChange={(v) => {
          const next = v === empty ? "" : v;
          setSelected(next);
          onValueChange?.(next);
        }}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={trigger}
          id={id}
          aria-label={label}
          aria-required={required}
          className={"app-select " + className}
        >
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon>
            <ChevronDown size={16} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="app-select-content"
            position="popper"
            sideOffset={5}
            collisionPadding={12}
          >
            <SelectPrimitive.ScrollUpButton className="app-select-scroll">
              <ChevronUp size={15} />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="app-select-options">
              {options.map((o) => (
                <SelectPrimitive.Item
                  className="app-select-option"
                  key={o.value || empty}
                  value={o.value || empty}
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check size={15} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="app-select-scroll">
              <ChevronDown size={15} />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {name && <input type="hidden" name={name} value={current} />}
    </>
  );
}
