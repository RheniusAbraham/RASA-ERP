"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Distribution, StockActionInput, StockActionName } from "@/lib/stock";

type Props = {
  open: boolean;
  data: Distribution;
  /** The action the dialog starts on */
  initial: StockActionName;
  /** For "bring to the yard": the lot to start on */
  initialLotId?: number;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (input: StockActionInput) => Promise<void>;
};

const count = new Intl.NumberFormat("en-IN");

/** Moves units between the stock buckets of a material, with a reason that is kept in the history. */
export default function StockActionDialog({ open, data, initial, initialLotId, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<StockActionName>(initial);
  const [lotId, setLotId] = useState<number | undefined>(initialLotId ?? data.lots[0]?.id);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const unit = data.quantityUnit;
  const lot = data.lots.find((l) => l.id === lotId);
  // each action, what it does, and how many units it can apply to
  const actions: { id: StockActionName; label: string; hint: string; max: number }[] = [
    { id: "repair", label: "Repaired", hint: "Damaged units are usable again: they go back to the available stock.", max: data.damaged },
    { id: "write-off-damaged", label: "Write off damaged units", hint: "Damaged units are scrapped and taken off the total owned.", max: data.damaged },
    { id: "lot-to-yard", label: "Bring units from another site to the yard", hint: "Free units waiting at another site are now in the yard.", max: lot?.quantity ?? 0 },
    { id: "mark-damaged", label: "Mark units in the yard as damaged", hint: "Units in the yard were found damaged: they are no longer available.", max: data.available },
    { id: "write-off-yard", label: "Write off units from the yard", hint: "Units from the yard are lost or scrapped and taken off the total owned.", max: data.available },
    { id: "restore-lost", label: "Restore written-off units", hint: "Units that were written off turned up again.", max: data.lost },
  ];
  const current = actions.find((a) => a.id === action)!;
  const typed = Number(quantity);
  const valid = quantity !== "" && Number.isInteger(typed) && typed > 0 && typed <= current.max && reason.trim() !== "" && (action !== "lot-to-yard" || !!lot);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action, quantity: typed, reason: reason.trim(), lotId: action === "lot-to-yard" ? lotId : undefined });
      setQuantity("");
      setReason("");
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
      <form onSubmit={submit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">Correct Stock</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <h3 className="form-section">What happened?</h3>
          <div className="stock-actions" role="radiogroup" aria-label="Stock action">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={action === a.id}
                className="stock-action-choice"
                disabled={a.id === "lot-to-yard" ? data.lots.length === 0 : a.max === 0}
                onClick={() => {
                  setAction(a.id);
                  setQuantity("");
                }}
              >
                <strong>{a.label}</strong>
                <small>{a.hint}</small>
              </button>
            ))}
          </div>

          <div className="form-grid">
            {action === "lot-to-yard" && (
              <label className="field full">
                <span>Which units waiting at another site?</span>
                <select value={lotId ?? ""} onChange={(e) => { setLotId(Number(e.target.value)); setQuantity(""); }}>
                  {data.lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {count.format(l.quantity)} {unit} · {l.note || "another site"}
                      {l.fromCustomer ? ` · from ${l.fromCustomer}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Quantity</span>
              <div className="qty-input" data-invalid={quantity !== "" && typed > current.max}>
                <input
                  type="number"
                  min="1"
                  max={current.max}
                  step="1"
                  inputMode="numeric"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
                <em>{unit}</em>
              </div>
              <small className="field-hint">Up to {count.format(current.max)} {unit}.</small>
            </label>
            <label className="field full">
              <span>Reason</span>
              <textarea
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being corrected? It is kept in the stock history."
              />
            </label>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">Every correction is recorded, never changed afterwards.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Close</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !valid}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
