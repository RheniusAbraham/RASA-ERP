"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Hammer } from "lucide-react";
import type { Contract } from "./AddContractDialog";
import { computeBreakdown, contractEndDate } from "@/lib/contract-billing";
import { formatDate, todayISO } from "@/lib/dates";

type Props = {
  open: boolean;
  contract: Contract;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onConfirm: () => Promise<void>;
};

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Asks before a contract is deployed ahead of its start date: that means the work really starts today. */
export default function EarlyStartDialog({ open, contract, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const newStart = todayISO();
  const newEnd = contractEndDate(newStart, contract.months, contract.days);
  // The cost is charged by the day, so the day rate stays and only the month-by-month split follows the new dates
  const cost = contract.finalCost ?? contract.estimatedCost;
  const newSplit = computeBreakdown({ startDate: newStart, months: contract.months, days: contract.days, estimatedCost: cost });
  const oldSplit = contract.finalCost !== null ? contract.finalBreakdown : contract.breakdown;

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
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
      <div className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">Start this contract early?</h2>
        </div>

        <div className="dialog-scroll">
          <p className="early-lead">
            This contract is planned to start on <strong>{formatDate(contract.startDate)}</strong>. Marking it as deployed now means the work has
            really started today, so its dates change:
          </p>

          <ul className="early-changes">
            <li>
              <span>Contract Start Date</span>
              <span className="early-change">
                {formatDate(contract.startDate)} <ArrowRight size={14} strokeWidth={2} /> <strong>{formatDate(newStart)}</strong>
              </span>
            </li>
            <li>
              <span>Contract End Date</span>
              <span className="early-change">
                {formatDate(contract.endDate)} <ArrowRight size={14} strokeWidth={2} /> <strong>{newEnd ? formatDate(newEnd) : "—"}</strong>
              </span>
            </li>
            <li>
              <span>Cost For A Day</span>
              <span className="early-change">
                <strong>₹{money.format(contract.finalDailyCost ?? contract.dailyCost)}</strong> <em>unchanged</em>
              </span>
            </li>
          </ul>

          {newSplit && (
            <section className="doc-group">
              <h3 className="form-section">{contract.finalCost !== null ? "Updated Cost" : "Estimated Cost"} Month by Month</h3>
              <ul className="breakdown-list">
                {newSplit.periods.map((p, i) => (
                  <li key={p.label} className="breakdown-row">
                    <div className="breakdown-main">
                      <span className="breakdown-title">Cost for {p.label}</span>
                      <span className="breakdown-meta">
                        {p.days} days · {formatDate(p.from)} – {formatDate(p.to)}
                      </span>
                    </div>
                    <span className="line-amounts">
                      <span className="breakdown-amount">₹{money.format(p.cost)}</span>
                      {oldSplit[i] && <span className="doc-row-meta">Was ₹{money.format(oldSplit[i].cost)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="breakdown-hint">
                The total of ₹{money.format(cost)} and the cost for a day stay the same. Only how the cost is split across months follows the new dates.
                The planned start date is kept on the contract.
              </p>
            </section>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">This cannot be undone.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
              <Hammer size={16} strokeWidth={1.75} /> {busy ? "Saving…" : "Yes, mark as deployed"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
