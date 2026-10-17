"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import { QUANTITY_UNITS } from "@/lib/material-options";

export type MaterialInput = {
  name: string;
  totalQuantityOwned: number;
  /** What the quantity is counted in, e.g. "pcs" */
  quantityUnit: string;
  structuralDescription: string;
  additionalInformation: string;
};

/** A material as stored by the backend */
export type Material = MaterialInput & {
  id: number;
  /** Written off (lost or scrapped): taken off the total owned */
  lost: number;
  /** In the yard but damaged: owned, not available */
  damaged: number;
  /** Free units waiting at another site: owned, not in the yard */
  elsewhere: number;
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Material | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (material: MaterialInput) => Promise<void> | void;
};

const count = new Intl.NumberFormat("en-IN");

export default function AddMaterialDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quantityUnit, setQuantityUnit] = useState(editing?.quantityUnit ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.totalQuantityOwned - editing.lost) : "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        name: get("name"),
        // the form shows what is owned now (after write-offs); the stored figure is the baseline before them
        totalQuantityOwned: Number(quantity) + (editing?.lost ?? 0),
        quantityUnit: quantityUnit.trim(),
        structuralDescription: get("structuralDescription"),
        additionalInformation: get("additionalInformation"),
      });
      setFormKey((k) => k + 1); // remount so the form starts empty next time
      setQuantityUnit("");
      setQuantity("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // A live sentence showing how the quantity will read once saved
  const hasQuantity = quantity !== "" && quantityUnit.trim() !== "";

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <form key={formKey} onSubmit={handleSubmit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">{editing ? "Edit Material" : "Add Material"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field full">
            <span>Material Name</span>
            <input name="name" defaultValue={editing?.name} type="text" required autoComplete="off" />
          </label>

          <label className="field">
            <span>Total Quantity Owned</span>
            <input
              name="totalQuantityOwned"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              required
            />
            <small className="field-hint">How many you own in total.</small>
          </label>
          <div className="field">
            <span>Quantity Unit</span>
            <Combobox
              required
              allowCustom
              value={quantityUnit}
              onChange={setQuantityUnit}
              options={QUANTITY_UNITS}
              placeholder="Select or type a unit"
            />
            <small className="field-hint">What you count them in, e.g. pcs or sq ft.</small>
          </div>

          <label className="field full">
            <span>Structural Description</span>
            <textarea name="structuralDescription" defaultValue={editing?.structuralDescription} rows={3} required />
          </label>
          <label className="field full">
            <span>Additional Information</span>
            <textarea name="additionalInformation" defaultValue={editing?.additionalInformation} rows={3} />
          </label>
        </div>

        <div className="preview-line" aria-live="polite">
          <span className="preview-label">On the card it will read</span>
          {hasQuantity ? (
            <span className="preview-value">
              <strong>{count.format(Number(quantity))} {quantityUnit.trim()} owned</strong>
            </span>
          ) : (
            <span className="preview-value muted">Fill in the quantity to see it here.</span>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Material"}</button>
        </div>
      </form>
    </dialog>
  );
}
