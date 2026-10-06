"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import FileField from "@/components/ui/FileField";
import type { FileInfo } from "@/lib/api";
import { DOCUMENTS, MANUFACTURERS, TRUCK_TYPES } from "@/lib/fleet-options";
import { TYRE_LAYOUT_OPTIONS } from "@/lib/tyre-layouts";
import { TyreLayoutDiagram } from "./TyreLayoutDiagram";

export type TruckDocumentInput = {
  number?: string;
  validity: string;
  expense: number;
};

/** The truck's details; the proof files are uploaded after it is created */
export type TruckInput = {
  registrationNumber: string;
  manufacturer: string;
  modelName: string;
  chassisNumber: string;
  yearOfManufacture: number;
  truckType: string;
  odometer: number;
  fuelCapacity: number;
  /** Tyre layout id, e.g. "10+1" (see lib/tyre-layouts.ts) */
  tyreLayout: string;
  documents: Record<string, TruckDocumentInput>;
};

/** A document as stored by the backend, with its uploaded proof (if any) */
export type TruckDocument = TruckDocumentInput & { file: FileInfo | null };

/** A truck as stored by the backend */
export type Truck = Omit<TruckInput, "documents"> & {
  id: number;
  documents: Record<string, TruckDocument>;
  /** Document proofs that haven't been uploaded */
  missingFiles: string[];
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Truck | null;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (truck: TruckInput, proofs: Record<string, File>) => Promise<void> | void;
};

function RupeeInput({ name, placeholder, defaultValue }: { name: string; placeholder: string; defaultValue?: number }) {
  return (
    <div className="input-prefix">
      <span aria-hidden>₹</span>
      <input name={name} type="number" min="0" step="0.01" inputMode="decimal" placeholder={placeholder} defaultValue={defaultValue} required />
    </div>
  );
}

export default function AddTruckDialog({ open, editing, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [manufacturer, setManufacturer] = useState(editing?.manufacturer ?? "");
  const [truckType, setTruckType] = useState(editing?.truckType ?? "");
  const [tyreLayoutLabel, setTyreLayoutLabel] = useState(
    () => TYRE_LAYOUT_OPTIONS.find((l) => l.id === editing?.tyreLayout)?.label ?? "",
  );
  const previewRef = useRef<HTMLDivElement>(null);
  const selectedLayout = TYRE_LAYOUT_OPTIONS.find((l) => l.label === tyreLayoutLabel);
  const [proofs, setProofs] = useState<Record<string, File | null>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const selectedLayoutId = selectedLayout?.id;
  useEffect(() => {
    if (!selectedLayoutId) return;
    const t = setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
    return () => clearTimeout(t);
  }, [selectedLayoutId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();

    const documents: Record<string, TruckDocumentInput> = {};
    const files: Record<string, File> = {};
    for (const doc of DOCUMENTS) {
      const proof = proofs[doc.key];
      if (!proof && !editing?.documents[doc.key]?.file) return;
      if (proof) files[doc.key] = proof;
      documents[doc.key] = {
        number: doc.numberLabel ? get(`${doc.key}-number`) : undefined,
        validity: get(`${doc.key}-validity`),
        expense: Number(get(`${doc.key}-expense`)),
      };
    }

    setSubmitting(true);
    setError("");
    try {
      await onSubmit(
        {
          registrationNumber: get("registrationNumber").toUpperCase(),
          manufacturer,
          modelName: get("modelName"),
          chassisNumber: get("chassisNumber").toUpperCase(),
          yearOfManufacture: Number(get("yearOfManufacture")),
          truckType,
          odometer: Number(get("odometer")),
          fuelCapacity: Number(get("fuelCapacity")),
          tyreLayout: selectedLayout?.id ?? "",
          documents,
        },
        files,
      );
      // Remount the form so every field and file picker starts empty next time
      setFormKey((k) => k + 1);
      setManufacturer("");
      setTruckType("");
      setTyreLayoutLabel("");
      setProofs({});
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
          <h2 className="dialog-title">{editing ? "Edit Truck" : "Add Truck"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
        <h3 className="form-section">Truck Details</h3>
        <div className="form-grid">
          <label className="field">
            <span>Truck Registration Number</span>
            <input name="registrationNumber" defaultValue={editing?.registrationNumber} type="text" placeholder="e.g. TN 69 AA 1256" className="uppercase" required autoComplete="off" />
          </label>
          <div className="field">
            <span>Manufacturer</span>
            <Combobox
              required
              allowCustom
              value={manufacturer}
              onChange={setManufacturer}
              options={MANUFACTURERS}
              placeholder="Search manufacturers..."
            />
          </div>
          <label className="field">
            <span>Model Name</span>
            <input name="modelName" defaultValue={editing?.modelName} type="text" placeholder="e.g. Signa 4623.S" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Chassis Number</span>
            <input name="chassisNumber" defaultValue={editing?.chassisNumber} type="text" placeholder="e.g. TATZ94AE7P7A0001" className="uppercase" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Year of Manufacture</span>
            <input
              name="yearOfManufacture" defaultValue={editing?.yearOfManufacture}
              type="number"
              inputMode="numeric"
              min="1980"
              max={new Date().getFullYear() + 1}
              placeholder="e.g. 2019"
              required
            />
          </label>
          <div className="field">
            <span>Truck Type</span>
            <Combobox
              required
              allowCustom
              value={truckType}
              onChange={setTruckType}
              options={TRUCK_TYPES}
              placeholder="Select or type a truck type"
            />
          </div>
          <label className="field">
            <span>Odometer During Purchase</span>
            <input name="odometer" defaultValue={editing?.odometer} type="number" min="0" inputMode="numeric" placeholder="e.g. 84500" required />
          </label>
          <label className="field">
            <span>Fuel Capacity of the Truck (Fuel Tank Size in Liters)</span>
            <input name="fuelCapacity" defaultValue={editing?.fuelCapacity} type="number" min="0" inputMode="decimal" placeholder="e.g. 400" required />
          </label>
          <div className="field full">
            <span>Tyre Layout</span>
            <Combobox
              required
              value={tyreLayoutLabel}
              onChange={setTyreLayoutLabel}
              options={TYRE_LAYOUT_OPTIONS.map((l) => l.label)}
              placeholder="Select a tyre layout"
            />
            {open && selectedLayout && (
              <div className="tyre-preview" ref={previewRef}>
                <TyreLayoutDiagram layout={selectedLayout} />
              </div>
            )}
          </div>
        </div>

        {DOCUMENTS.map((doc) => (
          <section key={doc.key} className="doc-group">
            <h3 className="form-section">{doc.title}</h3>
            <div className="form-grid">
              {doc.numberLabel && (
                <label className="field">
                  <span>{doc.numberLabel}</span>
                  <input name={`${doc.key}-number`} defaultValue={editing?.documents[doc.key]?.number ?? undefined} type="text" placeholder={doc.numberPlaceholder} required autoComplete="off" />
                </label>
              )}
              <div className="field">
                <span>{doc.dateLabel}</span>
                <DatePicker name={`${doc.key}-validity`} defaultValue={editing?.documents[doc.key]?.validity} required />
              </div>
              <label className="field">
                <span>{doc.expenseLabel}</span>
                <RupeeInput name={`${doc.key}-expense`} placeholder={doc.expensePlaceholder} defaultValue={editing?.documents[doc.key]?.expense} />
              </label>
              <div className={`field${doc.numberLabel ? "" : " full"}`}>
                <span>{doc.proofLabel}</span>
                <FileField
                  kind={doc.proofKind}
                  file={proofs[doc.key] ?? null}
                  onChange={(f) => setProofs((p) => ({ ...p, [doc.key]: f }))}
                  maxMB={25}
                  required={!editing?.documents[doc.key]?.file}
                  existing={editing?.documents[doc.key]?.file}
                />
              </div>
            </div>
          </section>
        ))}

        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">{DOCUMENTS.filter((d) => proofs[d.key] || editing?.documents[d.key]?.file).length} of {DOCUMENTS.length} documents attached</span>
          <div className="dialog-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Truck"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
