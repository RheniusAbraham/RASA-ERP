"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type CustomerInput = {
  name: string;
  phone: string;
  contactPerson: string;
  gst: string;
  email: string;
  address: string;
};

/** A customer as stored by the backend */
export type Customer = CustomerInput & { id: number };

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Customer | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (customer: CustomerInput) => Promise<void> | void;
};

export default function AddCustomerDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
    const form = e.currentTarget;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        name: get("name"),
        phone: get("phone"),
        contactPerson: get("contactPerson"),
        gst: get("gst"),
        email: get("email"),
        address: get("address"),
      });
      form.reset();
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
      <form onSubmit={handleSubmit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">{editing ? "Edit Customer" : "Add Customer"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Customer Name</span>
            <input name="name" defaultValue={editing?.name} type="text" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Phone Number</span>
            <input name="phone" defaultValue={editing?.phone} type="tel" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Contact Personnel Name</span>
            <input name="contactPerson" defaultValue={editing?.contactPerson} type="text" autoComplete="off" />
          </label>
          <label className="field">
            <span>GST Number</span>
            <input name="gst" defaultValue={editing?.gst} type="text" autoComplete="off" />
          </label>
          <label className="field full">
            <span>Email</span>
            <input name="email" defaultValue={editing?.email} type="email" autoComplete="off" />
          </label>
          <label className="field full">
            <span>Customer Address</span>
            <textarea name="address" defaultValue={editing?.address} rows={3} />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Customer"}</button>
        </div>
      </form>
    </dialog>
  );
}
