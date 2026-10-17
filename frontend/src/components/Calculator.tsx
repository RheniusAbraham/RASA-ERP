"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator as CalculatorIcon, Delete } from "lucide-react";
import { EMPTY, evaluate, formatNumber, pressKey, type CalcState } from "@/lib/calculator";

type Key = { label: string; key: string; kind?: "op" | "fn" | "eq" };

const KEYS: Key[] = [
  { label: "AC", key: "AC", kind: "fn" },
  { label: "( )", key: "paren", kind: "fn" },
  { label: "%", key: "%", kind: "fn" },
  { label: "÷", key: "÷", kind: "op" },
  { label: "7", key: "7" },
  { label: "8", key: "8" },
  { label: "9", key: "9" },
  { label: "×", key: "×", kind: "op" },
  { label: "4", key: "4" },
  { label: "5", key: "5" },
  { label: "6", key: "6" },
  { label: "−", key: "−", kind: "op" },
  { label: "1", key: "1" },
  { label: "2", key: "2" },
  { label: "3", key: "3" },
  { label: "+", key: "+", kind: "op" },
  { label: "±", key: "±", kind: "fn" },
  { label: "0", key: "0" },
  { label: ".", key: "." },
  { label: "=", key: "=", kind: "eq" },
];

const KEYBOARD: Record<string, string> = {
  "*": "×", x: "×", X: "×", "/": "÷", "-": "−", Enter: "=", "=": "=", Backspace: "⌫", Delete: "AC", c: "AC", C: "AC",
};

/** Turns the expression into something readable: grouped digits, with the operators spaced out. */
function pretty(expr: string) {
  return expr.replace(/[0-9]+(\.[0-9]*)?/g, (n) => {
    const [int, dec] = n.split(".");
    const grouped = new Intl.NumberFormat("en-IN").format(Number(int));
    return dec === undefined ? grouped : `${grouped}.${dec}`;
  });
}

export default function Calculator() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CalcState>(EMPTY);
  const ref = useRef<HTMLDivElement>(null);

  const press = (key: string) =>
    setState((s) => {
      if (key === "paren") {
        const opens = (s.expr.match(/\(/g) ?? []).length - (s.expr.match(/\)/g) ?? []).length;
        const last = s.expr.slice(-1);
        const closing = opens > 0 && /[0-9)%]/.test(last);
        return pressKey(s, closing ? ")" : "(");
      }
      return pressKey(s, key);
    });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // typing into a form field elsewhere on the page must not be hijacked
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = KEYBOARD[e.key] ?? e.key;
      if (/^[0-9.+−×÷%()]$/.test(key) || ["=", "⌫", "AC"].includes(key)) {
        e.preventDefault();
        press(key);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // live preview of the answer while typing, once the expression is complete
  const live = state.done || state.error ? null : evaluate(state.expr);
  const result = state.error
    ? state.error
    : state.done
      ? formatNumber(Number(state.expr))
      : live && "value" in live
        ? formatNumber(live.value)
        : "";
  const showPreview = !state.done && !state.error && live && "value" in live && /[+−×÷%(]/.test(state.expr.replace(/^−/, ""));

  return (
    <div className="calc-wrap" ref={ref}>
      <button
        type="button"
        className="header-icon"
        aria-label="Calculator"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <CalculatorIcon size={18} />
      </button>

      <div className="calc-panel" data-open={open} role="dialog" aria-label="Calculator" aria-hidden={!open}>
        <div className="calc-display" aria-live="polite">
          <div className="calc-expr">{state.expr ? pretty(state.expr) : " "}</div>
          <div className="calc-result" data-error={!!state.error} data-final={state.done}>
            {state.done ? result : state.error ? result : showPreview ? `= ${result}` : state.expr ? " " : "0"}
          </div>
        </div>

        <div className="calc-keys">
          {KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              className="calc-key"
              data-kind={k.kind}
              tabIndex={open ? 0 : -1}
              onClick={() => press(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <button type="button" className="calc-back" tabIndex={open ? 0 : -1} onClick={() => press("⌫")} aria-label="Backspace">
          <Delete size={16} strokeWidth={1.75} /> Backspace
        </button>
      </div>
    </div>
  );
}
