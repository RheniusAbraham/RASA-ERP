"use client";

import { Hourglass, Warehouse } from "lucide-react";
import type { StockLot } from "@/lib/stock";

/** How many units are taken from each source, as typed: the key is "yard" or `lot:<id>`. */
export type SourceValues = Record<string, string>;

export type SourceChoice = { lotId: number | null; quantity: number };

const count = new Intl.NumberFormat("en-IN");

const lotLabel = (l: StockLot) => l.note || (l.fromCustomer ? `from ${l.fromCustomer}` : "another site");

/** The sources as the server wants them: only those with units, the yard as no lot. */
export function toSources(values: SourceValues): SourceChoice[] {
  return Object.entries(values)
    .map(([key, text]) => ({ lotId: key === "yard" ? null : Number(key.slice(4)), quantity: Number(text) }))
    .filter((s) => Number.isFinite(s.quantity) && s.quantity > 0);
}

export const sourceTotal = (values: SourceValues) => toSources(values).reduce((sum, s) => sum + s.quantity, 0);

/** What is wrong with the chosen sources, if anything: a whole number, and no more than a source holds. */
export function sourceProblem(values: SourceValues, yardAvailable: number, lots: StockLot[], unit: string): string {
  for (const [key, text] of Object.entries(values)) {
    if (text === "") continue;
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0) return "Use whole numbers.";
    const limit = key === "yard" ? yardAvailable : (lots.find((l) => `lot:${l.id}` === key)?.quantity ?? 0);
    if (n > limit) return `${key === "yard" ? "The yard has" : "That lot has"} only ${count.format(limit)} ${unit}.`;
  }
  return "";
}

type Props = {
  name: string;
  unit: string;
  /** What the yard can still give for this contract */
  yardAvailable: number;
  /** Free units waiting at other sites */
  lots: StockLot[];
  values: SourceValues;
  onChange: (values: SourceValues) => void;
};

/**
 * "Where is this taken from?": the yard and every lot waiting at another site, each with its own box. The user
 * says how many come from each; nothing is chosen for them (except the yard when it is the only source).
 */
export default function SourcePicker({ name, unit, yardAvailable, lots, values, onChange }: Props) {
  const set = (key: string, text: string) => onChange({ ...values, [key]: text });
  return (
    <div className="source-picker" role="group" aria-label={`Where ${name} is taken from`}>
      <p className="retrieve-title">Where is this taken from?</p>
      <div className="source-row">
        <span className="source-icon" aria-hidden>
          <Warehouse size={16} strokeWidth={1.75} />
        </span>
        <div className="source-name">
          <strong>Yard</strong>
          <small>{count.format(yardAvailable)} {unit} available</small>
        </div>
        <div className="qty-input">
          <input
            type="number"
            min="0"
            max={yardAvailable}
            step="1"
            inputMode="numeric"
            value={values.yard ?? ""}
            onChange={(e) => set("yard", e.target.value)}
            aria-label={`${name}: from the yard`}
          />
          <em>{unit}</em>
        </div>
      </div>
      {lots.map((l) => (
        <div key={l.id} className="source-row" data-site="true">
          <span className="source-icon" aria-hidden>
            <Hourglass size={16} strokeWidth={1.75} />
          </span>
          <div className="source-name">
            <strong>At another site · {lotLabel(l)}</strong>
            <small>
              {count.format(l.quantity)} {unit} waiting {l.daysWaiting} day{l.daysWaiting === 1 ? "" : "s"}
            </small>
          </div>
          <div className="qty-input">
            <input
              type="number"
              min="0"
              max={l.quantity}
              step="1"
              inputMode="numeric"
              value={values[`lot:${l.id}`] ?? ""}
              onChange={(e) => set(`lot:${l.id}`, e.target.value)}
              aria-label={`${name}: from the lot at ${lotLabel(l)}`}
            />
            <em>{unit}</em>
          </div>
        </div>
      ))}
    </div>
  );
}
