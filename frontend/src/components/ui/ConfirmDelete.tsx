"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  /** What is about to be deleted, e.g. "Ravi Kumar". Null keeps the dialog closed. */
  name: string | null;
  /** What it is, e.g. "driver" */
  kind: string;
  /** Extra warning, e.g. "Its uploaded documents will be deleted too." */
  warning?: string;
  /** Reject (throw) to keep the dialog open and show the message, e.g. "still used by a contract" */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDelete({ name, kind, warning, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const open = name !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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

  const cancel = () => {
    setError("");
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog-confirm"
      onClose={cancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) cancel();
      }}
    >
      <div className="dialog-body">
        <div className="confirm-icon" aria-hidden>
          <AlertTriangle size={22} strokeWidth={1.75} />
        </div>
        <h2 className="dialog-title">Delete this {kind}?</h2>
        <p className="confirm-text">
          <strong>{name}</strong> will be permanently deleted. {warning} This can&apos;t be undone.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
