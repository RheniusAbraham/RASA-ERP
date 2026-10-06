"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  placeholder?: string;
  emptyText?: string;
  required?: boolean;
};

export default function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Search and select",
  emptyText = "No results found",
  required,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [maxHeight, setMaxHeight] = useState(220);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  // Open towards whichever side has more room inside the dialog / viewport
  const openList = () => {
    const root = rootRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      const bounds = root.closest("dialog")?.getBoundingClientRect();
      const top = Math.max(bounds?.top ?? 0, 0);
      const bottom = Math.min(bounds ? bounds.bottom - 84 : window.innerHeight, window.innerHeight - 12);
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 16;
      const wantsUp = below < 220 && above > below;
      setPlacement(wantsUp ? "top" : "bottom");
      setMaxHeight(Math.max(120, Math.min(220, wantsUp ? above : below)));
    }
    setOpen(true);
  };

  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openList();
      setActive(Math.min(activeIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (filtered[activeIndex]) toggle(filtered[activeIndex]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="multiselect" ref={rootRef}>
      <div
        className="multiselect-box"
        data-open={open}
        onMouseDown={(e) => {
          // keep focus on the input when clicking chips/padding
          if (e.target !== inputRef.current) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => toggle(v)}>
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          placeholder={value.length === 0 ? placeholder : ""}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) openList();
          }}
          onFocus={openList}
          onClick={() => {
            if (!open) openList();
          }}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown size={16} strokeWidth={1.75} className="multiselect-chevron" data-open={open} />
      </div>

      {/* Carries the selection for native "required" validation */}
      <input
        className="date-native"
        value={value.join(", ")}
        required={required}
        tabIndex={-1}
        aria-hidden
        onChange={() => {}}
      />

      <ul
        id={listId}
        role="listbox"
        aria-multiselectable
        className="combobox-list"
        data-open={open}
        data-placement={placement}
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <li className="combobox-empty">{emptyText}</li>
        ) : (
          filtered.map((o, i) => {
            const selected = value.includes(o);
            return (
              <li
                key={o}
                role="option"
                aria-selected={selected}
                className={`combobox-option multi${i === activeIndex ? " active" : ""}${selected ? " selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(o)}
              >
                <span className="multi-check" data-checked={selected}>
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
                {o}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
