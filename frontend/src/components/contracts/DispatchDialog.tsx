"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { Contract } from "./AddContractDialog";
import SourcePicker, { sourceProblem, sourceTotal, toSources, type SourceChoice, type SourceValues } from "./SourcePicker";
import { api } from "@/lib/api";
import type { Distribution, StockLot } from "@/lib/stock";
import { computeBreakdown } from "@/lib/contract-billing";
import { formatDate } from "@/lib/dates";

export type DispatchInput = {
  materials: { materialId: number; quantity: number; sources: SourceChoice[] }[];
  finalTransportationCost: number;
  finalCost: number;
  loadingCharges: number;
};

type Props = {
  open: boolean;
  contract: Contract;
  /** How much of each material (by id) is in the yard and not held by other contracts */
  availableOf: (materialId: number) => number;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (input: DispatchInput) => Promise<void>;
};

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

export default function DispatchDialog({ open, contract, availableOf, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState<Record<number, string>>(() =>
    Object.fromEntries(contract.materials.map((m) => [m.materialId, String(m.quantity)])),
  );
  // Both start from the estimate: the transport as estimated, the total as that transport plus the materials
  const [finalTransport, setFinalTransport] = useState(String(contract.transportationCost));
  const [finalOverride, setFinalOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState("");
  // the lots of free units waiting at other sites, for each material, and what the user chose to take from where
  const [lots, setLots] = useState<Record<number, StockLot[]> | null>(null);
  const [sources, setSources] = useState<Record<number, SourceValues>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    let current = true;
    Promise.all(contract.materials.map((m) => api.get<Distribution>(`/materials/${m.materialId}/distribution`).then((d) => [m.materialId, d.lots] as const)))
      .then((entries) => current && setLots(Object.fromEntries(entries)))
      .catch(() => current && setLots({}));
    return () => {
      current = false;
    };
  }, [contract.materials]);

  const lines = contract.materials.map((m) => {
    const text = actual[m.materialId] ?? "";
    const quantity = Number(text);
    const available = availableOf(m.materialId);
    const own = lots?.[m.materialId] ?? [];
    // with nothing but the yard to take from there is nothing to choose: it starts as the dispatched quantity
    const values: SourceValues = sources[m.materialId] ?? (own.length === 0 ? { yard: text } : {});
    const total = sourceTotal(values);
    const plannable = available + own.reduce((sum, l) => sum + l.quantity, 0);
    const invalid = text === "" || !Number.isInteger(quantity) || quantity < 0;
    const problem = sourceProblem(values, available, own, m.quantityUnit);
    return {
      m,
      text,
      quantity,
      available,
      own,
      values,
      total,
      plannable,
      problem,
      tooMany: quantity > plannable,
      invalid,
      unsourced: !invalid && quantity > 0 && total !== quantity,
    };
  });
  const sourcesOk = lots !== null && lines.every((l) => !l.problem && !l.unsourced);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const computedFinal = String(round2((Number(finalTransport) || 0) + contract.materialsCost));
  const finalText = finalOverride ?? computedFinal;
  const billing = computeBreakdown({
    startDate: contract.startDate,
    months: contract.months,
    days: contract.days,
    estimatedCost: finalText === "" ? NaN : Number(finalText),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some((l) => l.invalid || l.tooMany) || !sourcesOk) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        materials: lines.map((l) => ({ materialId: l.m.materialId, quantity: l.quantity, sources: l.quantity > 0 ? toSources(l.values) : [] })),
        finalTransportationCost: Number(finalTransport),
        finalCost: Number(finalText),
        loadingCharges: Number(loading),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog-wide dialog-fit"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <form onSubmit={handleSubmit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">Dispatch Details</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <h3 className="form-section">Customer</h3>
          <div className="dispatch-customer">{contract.customerName}</div>

          <h3 className="form-section">Materials Dispatched</h3>
          <ul className="dispatch-list">
            {lines.map(({ m, text, available, own, values, total, plannable, problem, tooMany, unsourced, quantity }) => (
              <li key={m.materialId} className="dispatch-row">
                <strong className="dispatch-row-name">{m.name}</strong>
                <div className="dispatch-row-fields">
                  <div className="dispatch-box">
                    <span>Planned</span>
                    <b>
                      {count.format(m.quantity)} {m.quantityUnit}
                    </b>
                  </div>
                  <label className="dispatch-box">
                    <span>Actually dispatched</span>
                    <div className="qty-input" data-invalid={tooMany}>
                      <input
                        type="number"
                        min="0"
                        max={plannable}
                        step="1"
                        inputMode="numeric"
                        required
                        value={text}
                        onChange={(e) => setActual((a) => ({ ...a, [m.materialId]: e.target.value }))}
                        aria-label={`Quantity of ${m.name} dispatched to the site`}
                      />
                      <em>{m.quantityUnit}</em>
                    </div>
                  </label>
                </div>
                {tooMany && (
                  <p className="file-error" role="alert">
                    Only {count.format(plannable)} {m.quantityUnit} are available (yard and other sites together).
                  </p>
                )}
                {!tooMany && quantity > 0 && (
                  <>
                    <SourcePicker
                      name={m.name}
                      unit={m.quantityUnit}
                      yardAvailable={available}
                      lots={own}
                      values={values}
                      onChange={(next) => setSources((all) => ({ ...all, [m.materialId]: next }))}
                    />
                    {problem ? (
                      <p className="file-error" role="alert">{problem}</p>
                    ) : (
                      <small className="retrieve-note" data-short={unsourced}>
                        {unsourced
                          ? `Taken from the sources so far: ${count.format(total)} of ${count.format(quantity)} ${m.quantityUnit}. They must add up to what is dispatched.`
                          : `All ${count.format(quantity)} ${m.quantityUnit} are accounted for.`}
                      </small>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          <h3 className="form-section">Cost</h3>
          <div className="form-grid">
            <div className="field">
              <span>Estimated Transportation Cost</span>
              <div className="dispatch-static">₹{money.format(contract.transportationCost)}</div>
            </div>
            <label className="field">
              <span>Updated Final Cost for Transportation</span>
              <div className="input-prefix">
                <span aria-hidden>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={finalTransport}
                  onChange={(e) => setFinalTransport(e.target.value)}
                />
              </div>
              <small className="field-hint">Starts from the estimate. Change it to the real transport cost.</small>
            </label>

            <div className="field">
              <span>Estimated Cost</span>
              <div className="dispatch-static">₹{money.format(contract.estimatedCost)}</div>
            </div>
            <label className="field">
              <span>Updated Final Cost</span>
              <div className="input-prefix">
                <span aria-hidden>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={finalText}
                  onChange={(e) => setFinalOverride(e.target.value === "" ? null : e.target.value)}
                />
              </div>
              {finalOverride !== null && finalOverride !== computedFinal ? (
                <span className="cost-row">
                  <span className="override-badge">User Overridden Value</span>
                  <button type="button" className="reset-pill" onClick={() => setFinalOverride(null)}>
                    <RotateCcw size={13} strokeWidth={2} /> Reset to automatic
                  </button>
                </span>
              ) : (
                <small className="field-hint">The updated transport plus the materials cost. Type a different figure to override it.</small>
              )}
            </label>
          </div>

          <section className="doc-group">
            <h3 className="form-section">Monthly Cost</h3>
            {!billing ? (
              <p className="breakdown-hint">Enter the updated final cost to see what each month will cost.</p>
            ) : (
              <ul className="breakdown-list">
                <li className="breakdown-row breakdown-day">
                  <div className="breakdown-main">
                    <span className="breakdown-title">Updated Cost For A Day</span>
                    <span className="breakdown-meta">
                      ₹{money.format(Number(finalText))} ÷ {billing.basisDays} days
                    </span>
                  </div>
                  <span className="line-amounts">
                    <span className="breakdown-amount">₹{money.format(billing.dailyRate)}</span>
                    <span className="doc-row-meta">Estimated ₹{money.format(contract.dailyCost)}</span>
                  </span>
                </li>
                {billing.periods.map((p, i) => (
                  <li key={p.label} className="breakdown-row">
                    <div className="breakdown-main">
                      <span className="breakdown-title">Cost for {p.label}</span>
                      <span className="breakdown-meta">
                        {p.days} days · {formatDate(p.from)} – {formatDate(p.to)}
                      </span>
                    </div>
                    <span className="line-amounts">
                      <span className="breakdown-amount">₹{money.format(p.cost)}</span>
                      {contract.breakdown[i] && <span className="doc-row-meta">Estimated ₹{money.format(contract.breakdown[i].cost)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <h3 className="form-section">Charges</h3>
          <div className="form-grid">
            <label className="field full">
              <span>Loading/Unloading Charges</span>
              <div className="input-prefix">
                <span aria-hidden>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={loading}
                  onChange={(e) => setLoading(e.target.value)}
                />
              </div>
            </label>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">The contract is marked as dispatched when you confirm.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !sourcesOk} title={!sourcesOk ? "Say where every material is taken from" : undefined}>{submitting ? "Saving…" : "Confirm Dispatch"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
