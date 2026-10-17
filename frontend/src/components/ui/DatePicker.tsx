"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  name: string;
  required?: boolean;
  /** ISO dates (YYYY-MM-DD). Days outside the range are disabled. */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Starting value (ISO YYYY-MM-DD), e.g. when editing a record */
  defaultValue?: string;
  /** Makes the picker controlled: the parent decides what is shown (it can change it from elsewhere) */
  value?: string;
  onChange?: (value: string) => void;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const display = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export default function DatePicker({ name, required, min, max, placeholder = "DD-MM-YYYY", defaultValue = "", value: controlled, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [inner, setValue] = useState(defaultValue);
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [cursor, setCursor] = useState(() => new Date()); // month being shown
  const [focusIso, setFocusIso] = useState("");
  const [yearPage, setYearPage] = useState(0); // first year of the visible 12-year block
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  const todayIso = toISO(new Date());
  const isDisabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  const openPicker = () => {
    const root = rootRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      const bounds = root.closest("dialog")?.getBoundingClientRect();
      const top = Math.max(bounds?.top ?? 0, 0);
      const bottom = Math.min(bounds ? bounds.bottom - 84 : window.innerHeight, window.innerHeight - 12);
      const below = bottom - rect.bottom - 8;
      const above = rect.top - top - 16;
      setPlacement(below < 380 && above > below ? "top" : "bottom");
    }
    const start = value ? fromISO(value) : fromISO(max && todayIso > max ? max : todayIso);
    setCursor(new Date(start.getFullYear(), start.getMonth(), 1));
    setFocusIso(toISO(start));
    setView("days");
    setOpen(true);
  };

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const select = (iso: string) => {
    if (isDisabled(iso)) return;
    setValue(iso);
    onChange?.(iso);
    close(true);
  };

  const clear = () => {
    setValue("");
    onChange?.("");
    close(true);
  };

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep keyboard focus on the active day
  useEffect(() => {
    if (!open || view !== "days") return;
    popupRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus({ preventScroll: true });
  }, [open, view, focusIso, cursor]);

  const moveFocus = (next: Date) => {
    setFocusIso(toISO(next));
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const current = fromISO(focusIso);
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) {
      e.preventDefault();
      moveFocus(addDays(current, steps[e.key]));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const delta = e.key === "PageUp" ? -1 : 1;
      moveFocus(new Date(current.getFullYear(), current.getMonth() + delta, current.getDate()));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const shiftMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  // 6 weeks starting on the Sunday on/before the 1st
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const yearStart = yearPage || Math.floor(cursor.getFullYear() / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i);

  const monthDisabled = (m: number) => {
    const startIso = toISO(new Date(cursor.getFullYear(), m, 1));
    const endIso = toISO(new Date(cursor.getFullYear(), m + 1, 0));
    return (!!min && endIso < min) || (!!max && startIso > max);
  };
  const yearDisabled = (y: number) => (!!min && `${y}-12-31` < min) || (!!max && `${y}-01-01` > max);

  return (
    <div className="datepicker" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className="date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
      >
        <span className={value ? "" : "placeholder"}>{value ? display(value) : placeholder}</span>
        <CalendarDays size={16} strokeWidth={1.75} />
      </button>

      {/* Carries the value for FormData and drives native "required" validation */}
      <input
        className="date-native"
        name={name}
        value={value}
        required={required}
        tabIndex={-1}
        aria-hidden
        onChange={() => {}}
      />

      <div
        ref={popupRef}
        className="date-popup"
        data-open={open}
        data-placement={placement}
        role="dialog"
        aria-label="Choose date"
      >
        <div className="date-head">
          <button
            type="button"
            className="date-title"
            onClick={() => {
              setYearPage(Math.floor(cursor.getFullYear() / 12) * 12);
              setView(view === "days" ? "months" : view === "months" ? "years" : "days");
            }}
          >
            {view === "years" ? `${years[0]} – ${years[11]}` : view === "months" ? cursor.getFullYear() : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}
          </button>
          <div className="date-nav">
            <button
              type="button"
              aria-label="Previous"
              onClick={() =>
                view === "days"
                  ? shiftMonth(-1)
                  : view === "months"
                    ? setCursor((c) => new Date(c.getFullYear() - 1, c.getMonth(), 1))
                    : setYearPage(yearStart - 12)
              }
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() =>
                view === "days"
                  ? shiftMonth(1)
                  : view === "months"
                    ? setCursor((c) => new Date(c.getFullYear() + 1, c.getMonth(), 1))
                    : setYearPage(yearStart + 12)
              }
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {view === "days" && (
          <>
            <div className="date-weekdays" aria-hidden>
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="date-grid" onKeyDown={onGridKeyDown}>
              {days.map((d) => {
                const iso = toISO(d);
                return (
                  <button
                    key={iso}
                    type="button"
                    data-iso={iso}
                    tabIndex={iso === focusIso ? 0 : -1}
                    className={[
                      "date-day",
                      d.getMonth() !== cursor.getMonth() ? "outside" : "",
                      iso === todayIso ? "today" : "",
                      iso === value ? "selected" : "",
                    ].join(" ")}
                    disabled={isDisabled(iso)}
                    aria-label={d.toDateString()}
                    aria-pressed={iso === value}
                    onClick={() => select(iso)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === "months" && (
          <div className="date-cells">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`date-cell${cursor.getMonth() === i ? " selected" : ""}`}
                disabled={monthDisabled(i)}
                onClick={() => {
                  setCursor(new Date(cursor.getFullYear(), i, 1));
                  setFocusIso(toISO(new Date(cursor.getFullYear(), i, 1)));
                  setView("days");
                }}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        )}

        {view === "years" && (
          <div className="date-cells">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`date-cell${cursor.getFullYear() === y ? " selected" : ""}`}
                disabled={yearDisabled(y)}
                onClick={() => {
                  setCursor(new Date(y, cursor.getMonth(), 1));
                  setView("months");
                }}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <div className="date-foot">
          <button type="button" onClick={clear}>Clear</button>
          <button
            type="button"
            disabled={isDisabled(todayIso)}
            onClick={() => select(todayIso)}
          >
            Today
          </button>
        </div>
      </div>
    </div>
  );
}
