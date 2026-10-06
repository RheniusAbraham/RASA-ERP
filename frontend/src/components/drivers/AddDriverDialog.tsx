"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import FileField from "@/components/ui/FileField";
import type { FileInfo } from "@/lib/api";

export type DriverInput = {
  name: string;
  phone: string;
  aadhaarNumber: string;
  dateOfBirth: string;
  dateOfJoining: string;
  licenseNumber: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  address: string;
  fixedHireAmount: number;
};

/** The files uploaded after the driver is created */
export type DriverFiles = {
  photo: File | null;
  /** Required when adding; when editing, null keeps the stored file */
  aadhaarProof: File | null;
  licenseProof: File | null;
};

/** A driver as stored by the backend */
export type Driver = DriverInput & {
  id: number;
  files: Partial<Record<"photo" | "aadhaarProof" | "licenseProof", FileInfo>>;
  /** Required files that haven't been uploaded */
  missingFiles: string[];
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Driver | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (driver: DriverInput, files: DriverFiles) => Promise<void> | void;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AddDriverDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [aadhaarProof, setAadhaarProof] = useState<File | null>(null);
  const [licenseProof, setLicenseProof] = useState<File | null>(null);
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
    if (!editing && (!aadhaarProof || !licenseProof)) return;
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(
        {
          name: get("name"),
          phone: get("phone"),
          aadhaarNumber: get("aadhaarNumber"),
          dateOfBirth: get("dateOfBirth"),
          dateOfJoining: get("dateOfJoining"),
          licenseNumber: get("licenseNumber"),
          bankName: get("bankName"),
          branchName: get("branchName"),
          accountNumber: get("accountNumber"),
          ifscCode: get("ifscCode").toUpperCase(),
          address: get("address"),
          fixedHireAmount: Number(get("fixedHireAmount")),
        },
        { photo, aadhaarProof, licenseProof },
      );
      // Remount the form so every field and file picker starts empty next time
      setFormKey((k) => k + 1);
      setPhoto(null);
      setAadhaarProof(null);
      setLicenseProof(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog-wide"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <form key={formKey} onSubmit={handleSubmit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">{editing ? "Edit Driver" : "Add Driver"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
        <h3 className="form-section">Personal Details</h3>
        <div className="form-grid">
          <label className="field">
            <span>Driver Name</span>
            <input name="name" defaultValue={editing?.name} type="text" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Phone Number</span>
            <input name="phone" defaultValue={editing?.phone} type="tel" required autoComplete="off" />
          </label>
          <div className="field full">
            <span>Driver&apos;s Photo</span>
            <FileField kind="image" file={photo} onChange={setPhoto} maxMB={5} existing={editing?.files.photo} />
          </div>
          <label className="field">
            <span>Driver Aadhaar Number</span>
            <input
              name="aadhaarNumber" defaultValue={editing?.aadhaarNumber}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{12}"
              maxLength={12}
              title="12-digit Aadhaar number"
              required
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>License Number</span>
            <input name="licenseNumber" defaultValue={editing?.licenseNumber} type="text" required autoComplete="off" />
          </label>
          <div className="field">
            <span>Date of Birth</span>
            <DatePicker defaultValue={editing?.dateOfBirth} name="dateOfBirth" max={today()} required />
            </div>
          <div className="field">
            <span>Date of Joining</span>
            <DatePicker defaultValue={editing?.dateOfJoining} name="dateOfJoining" required />
            </div>
          <label className="field full">
            <span>Address</span>
            <textarea name="address" defaultValue={editing?.address} rows={3} required />
          </label>
        </div>

        <h3 className="form-section">Bank Details</h3>
        <div className="form-grid">
          <label className="field">
            <span>Bank Name</span>
            <input name="bankName" defaultValue={editing?.bankName} type="text" placeholder="e.g. HDFC Bank" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Branch Name of the Bank</span>
            <input name="branchName" defaultValue={editing?.branchName} type="text" placeholder="e.g. Coimbatore Main" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Account Number</span>
            <input
              name="accountNumber" defaultValue={editing?.accountNumber}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{9,18}"
              title="9 to 18 digit account number"
              placeholder="e.g. 1234567890123456"
              required
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>IFSC Code</span>
            <input
              name="ifscCode" defaultValue={editing?.ifscCode}
              type="text"
              pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}"
              title="11 characters, e.g. HDFC0001234"
              maxLength={11}
              placeholder="e.g. HDFC0001234"
              className="uppercase"
              required
              autoComplete="off"
            />
          </label>
        </div>

        <h3 className="form-section">Documents &amp; Pay</h3>
        <div className="form-grid">
          <div className="field">
            <span>Driver Aadhaar Proof (PDF) (Max 25MB)</span>
            <FileField kind="pdf" file={aadhaarProof} onChange={setAadhaarProof} maxMB={25} required={!editing?.files.aadhaarProof} existing={editing?.files.aadhaarProof} />
          </div>
          <div className="field">
            <span>License Proof (PDF) (Max 25MB)</span>
            <FileField kind="pdf" file={licenseProof} onChange={setLicenseProof} maxMB={25} required={!editing?.files.licenseProof} existing={editing?.files.licenseProof} />
          </div>
          <label className="field full">
            <span>Fixed Hire Amount</span>
            <div className="input-prefix">
              <span aria-hidden>₹</span>
              <input name="fixedHireAmount" defaultValue={editing?.fixedHireAmount} type="number" min="0" step="0.01" inputMode="decimal" required />
            </div>
          </label>
        </div>

        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">All fields are required except the photo.</span>
          <div className="dialog-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Driver"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
