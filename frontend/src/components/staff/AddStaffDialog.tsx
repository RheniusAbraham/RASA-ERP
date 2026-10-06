"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import FileField from "@/components/ui/FileField";
import type { FileInfo } from "@/lib/api";
import { DEPARTMENTS, SOFTWARE_DESIGNATIONS } from "@/lib/staff-options";

export type StaffInput = {
  name: string;
  staffId: string;
  department: string;
  designation: string;
  dateOfBirth: string;
  dateOfJoining: string;
  email: string;
  contactNumber: string;
  softwareDesignation: string;
  password: string;
  address: string;
  aadharNumber: string;
};

/** The files uploaded after the staff member is created */
export type StaffFiles = {
  photo: File | null;
  /** Required when adding; when editing, null keeps the stored file */
  aadharCard: File | null;
};

/** A staff member as stored by the backend (the password is never sent back) */
export type Staff = Omit<StaffInput, "password"> & {
  id: number;
  /** The login username, always the email */
  username: string;
  files: Partial<Record<"photo" | "aadharCard", FileInfo>>;
  missingFiles: string[];
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Staff | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (staff: StaffInput, files: StaffFiles) => Promise<void> | void;
};

const today = () => new Date().toISOString().slice(0, 10);

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span>
      {children}
      {required && <span className="req" aria-hidden> *</span>}
    </span>
  );
}

export default function AddStaffDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [aadharCard, setAadharCard] = useState<File | null>(null);
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [softwareDesignation, setSoftwareDesignation] = useState(editing?.softwareDesignation ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [showPassword, setShowPassword] = useState(false);
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
    if (!editing && !aadharCard) return;
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(
        {
          name: get("name"),
          staffId: get("staffId"),
          department,
          designation: get("designation"),
          dateOfBirth: get("dateOfBirth"),
          dateOfJoining: get("dateOfJoining"),
          email: get("email"),
          contactNumber: get("contactNumber"),
          softwareDesignation,
          password: String(data.get("password") ?? ""),
          address: get("address"),
          aadharNumber: get("aadharNumber"),
        },
        { photo, aadharCard },
      );
      // Remount the form so every field and file picker starts empty next time
      setFormKey((k) => k + 1);
      setPhoto(null);
      setAadharCard(null);
      setDepartment("");
      setSoftwareDesignation("");
      setEmail("");
      setShowPassword(false);
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
          <h2 className="dialog-title">{editing ? "Edit Staff" : "Add Staff"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <h3 className="form-section">Personal Details</h3>
          <div className="form-grid">
            <div className="field full">
              <Label>Identity Image (Passport Size Photo) (Max 25MB)</Label>
              <FileField kind="image" file={photo} onChange={setPhoto} maxMB={25} existing={editing?.files.photo} />
            </div>
            <label className="field">
              <Label required>Staff&apos;s Name</Label>
              <input name="name" defaultValue={editing?.name} type="text" placeholder="e.g. Anita Menon" required autoComplete="off" />
            </label>
            <label className="field">
              <Label required>Staff ID</Label>
              <input name="staffId" defaultValue={editing?.staffId} type="text" placeholder="e.g. STF-1003" required autoComplete="off" />
            </label>
            <div className="field">
              <Label required>Date of Birth</Label>
              <DatePicker defaultValue={editing?.dateOfBirth} name="dateOfBirth" max={today()} required />
            </div>
            <label className="field">
              <Label required>Contact Number</Label>
              <input name="contactNumber" defaultValue={editing?.contactNumber} type="tel" placeholder="+91 90000 00000" required autoComplete="off" />
            </label>
            <label className="field full">
              <Label required>Address</Label>
              <textarea name="address" defaultValue={editing?.address} rows={3} required />
            </label>
          </div>

          <h3 className="form-section">Employment</h3>
          <div className="form-grid">
            <div className="field">
              <Label required>Department</Label>
              <Combobox
                required
                allowCustom
                value={department}
                onChange={setDepartment}
                options={DEPARTMENTS}
                placeholder="Select or type a department"
              />
            </div>
            <label className="field">
              <Label required>Designation</Label>
              <input name="designation" defaultValue={editing?.designation} type="text" placeholder="e.g. Operations Manager" required autoComplete="off" />
            </label>
            <div className="field">
              <Label required>Date of Joining</Label>
              <DatePicker defaultValue={editing?.dateOfJoining} name="dateOfJoining" required />
            </div>
            <label className="field">
              <Label required>Email</Label>
              <input
                name="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
          </div>

          <h3 className="form-section">Software Access</h3>
          <div className="form-grid">
            <div className="field full">
              <Label required>Software Designation</Label>
              <Combobox
                required
                value={softwareDesignation}
                onChange={setSoftwareDesignation}
                options={SOFTWARE_DESIGNATIONS}
                placeholder="Select a software designation"
              />
            </div>
          </div>

          <section className="doc-group">
            <h3 className="form-section">Software Credentials</h3>
            <div className="form-grid">
              <label className="field">
                <Label>Username (auto-filled from email)</Label>
                <input type="text" value={email} placeholder="Auto-filled from email" readOnly tabIndex={-1} />
              </label>
              <label className="field">
                <Label required={!editing}>Password</Label>
                <div className="password-field">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={editing ? "Leave blank to keep the current one" : "Set a login password"}
                    minLength={8}
                    required={!editing}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                </div>
              </label>
            </div>
          </section>

          <h3 className="form-section">Identity Proof</h3>
          <div className="form-grid">
            <label className="field">
              <Label>Aadhar Number</Label>
              <input
                name="aadharNumber" defaultValue={editing?.aadharNumber}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{12}"
                maxLength={12}
                title="12-digit Aadhar number"
                placeholder="12-digit Aadhar number"
                autoComplete="off"
              />
            </label>
            <div className="field">
              <Label required>Aadhar Card (PDF) (Max 25MB)</Label>
              <FileField kind="pdf" file={aadharCard} onChange={setAadharCard} maxMB={25} required={!editing?.files.aadharCard} existing={editing?.files.aadharCard} />
            </div>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">Fields marked * are required.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Staff"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
