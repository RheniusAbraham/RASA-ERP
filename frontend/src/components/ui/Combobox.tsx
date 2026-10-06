"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyText?: string;
  required?: boolean;
  /** Let the user keep text that is not in the list (e.g. a custom type). */
  allowCustom?: boolean;
};

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyText = "No results found",
  required,
  allowCustom,
}: Props) {
  const listId = useId();
  // null → show the selected value; string → the user is typing a search
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [maxHeight, setMaxHeight] = useState(210);
  const rootRef = useRef<HTMLDivElement>(null);

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
      const wantsUp = below < 210 && above > below;
      setPlacement(wantsUp ? "top" : "bottom");
      setMaxHeight(Math.max(120, Math.min(210, wantsUp ? above : below)));
    }
    setOpen(true);
  };

  const filtered =
    query === null ? options : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  const select = (option: string) => {
    onChange(option);
    setQuery(null);
    setOpen(false);
  };

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
      if (filtered[activeIndex]) select(filtered[activeIndex]);
      else if (allowCustom) setOpen(false);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      setQuery(null);
    }
  };

  return (
    <div className="combobox" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={query ?? value}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(allowCustom ? e.target.value : "");
          setActive(0);
          if (!open) openList();
        }}
        onFocus={openList}
        // the input keeps focus after a pick, so a plain click must reopen the list
        onClick={() => {
          if (!open) openList();
        }}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown size={16} strokeWidth={1.75} className="combobox-chevron" data-open={open} />

      <ul
        id={listId}
        role="listbox"
        className="combobox-list"
        data-open={open}
        data-placement={placement}
        style={{ maxHeight }}
      >
        {filtered.length === 0 ? (
          <li className="combobox-empty">{emptyText}</li>
        ) : (
          filtered.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              className={`combobox-option${i === activeIndex ? " active" : ""}${o === value ? " selected" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(o)}
            >
              {o}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
