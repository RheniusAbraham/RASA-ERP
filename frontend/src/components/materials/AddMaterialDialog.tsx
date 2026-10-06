"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type MaterialInput = {
  name: string;
  costPerPiece: number;
  totalQuantityOwned: number;
  structuralDescription: string;
  additionalInformation: string;
};

/** A material as stored by the backend */
export type Material = MaterialInput & { id: number };

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Material | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (material: MaterialInput) => Promise<void> | void;
};

export default function AddMaterialDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        costPerPiece: Number(get("costPerPiece")),
        totalQuantityOwned: Number(get("totalQuantityOwned")),
        structuralDescription: get("structuralDescription"),
        additionalInformation: get("additionalInformation"),
      });
      setFormKey((k) => k + 1); // remount so the form starts empty next time
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <label className="field">
            <span>Material Name</span>
            <input name="name" defaultValue={editing?.name} type="text" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Cost For a Piece</span>
            <div className="input-prefix">
              <span aria-hidden>₹</span>
              <input name="costPerPiece" defaultValue={editing?.costPerPiece} type="number" min="0" step="0.01" inputMode="decimal" required />
            </div>
          </label>
          <label className="field">
            <span>Total Quantity Owned</span>
            <input name="totalQuantityOwned" defaultValue={editing?.totalQuantityOwned} type="number" min="0" step="1" inputMode="numeric" required />
          </label>
          <label className="field full">
            <span>Structural Description</span>
            <textarea name="structuralDescription" defaultValue={editing?.structuralDescription} rows={3} required />
          </label>
          <label className="field full">
            <span>Additional Information</span>
            <textarea name="additionalInformation" defaultValue={editing?.additionalInformation} rows={3} />
          </label>
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
