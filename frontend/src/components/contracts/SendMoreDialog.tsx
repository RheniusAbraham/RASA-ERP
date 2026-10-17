"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { Contract } from "./AddContractDialog";
import SourcePicker, { sourceProblem, sourceTotal, toSources, type SourceChoice, type SourceValues } from "./SourcePicker";
import { api } from "@/lib/api";
import type { Distribution, StockLot } from "@/lib/stock";

export type SendMoreInput = {
  materials: { materialId: number; sources: SourceChoice[] }[];
};

type Props = {
  open: boolean;
  contract: Contract;
  /** What the yard can give of a material right now (the contract's own units are already out of it) */
  yardOf: (materialId: number) => number;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (input: SendMoreInput) => Promise<void>;
};

const count = new Intl.NumberFormat("en-IN");

/** Sends more units of materials that are already on a running contract, choosing where they are taken from. */
export default function SendMoreDialog({ open, contract, yardOf, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lots, setLots] = useState<Record<number, StockLot[]> | null>(null);
  const [values, setValues] = useState<Record<number, SourceValues>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // the lots waiting at other sites, for each material on the contract
  useEffect(() => {
    let current = true;
    Promise.all(contract.materials.map((m) => api.get<Distribution>(`/materials/${m.materialId}/distribution`).then((d) => [m.materialId, d.lots] as const)))
      .then((entries) => current && setLots(Object.fromEntries(entries)))
      .catch(() => current && setLots({}));
    return () => {
      current = false;
    };
  }, [contract.materials]);

  const rows = contract.materials.map((m) => {
    const v = values[m.materialId] ?? {};
    const own = lots?.[m.materialId] ?? [];
    return { m, v, own, total: sourceTotal(v), problem: sourceProblem(v, yardOf(m.materialId), own, m.quantityUnit) };
  });
  const any = rows.some((r) => r.total > 0);
  const valid = lots !== null && any && rows.every((r) => !r.problem);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ materials: rows.filter((r) => r.total > 0).map((r) => ({ materialId: r.m.materialId, sources: toSources(r.v) })) });
      setValues({});
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
          <h2 className="dialog-title">Send More Materials</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <p className="early-lead">
            Send extra units of the materials on this contract to the site. For each one, say how many come from the yard and how many from a lot waiting at another site.
            The costs on the contract are not changed.
          </p>
          {lots === null ? (
            <p className="breakdown-hint">Loading the stock…</p>
          ) : (
            <ul className="dispatch-list">
              {rows.map(({ m, v, own, total, problem }) => (
                <li key={m.materialId} className="dispatch-row">
                  <div className="retrieve-head">
                    <strong>{m.name}</strong>
                    <span>
                      Already dispatched {count.format(m.dispatchedQuantity ?? m.quantity)} {m.quantityUnit}
                    </span>
                  </div>
                  <SourcePicker
                    name={m.name}
                    unit={m.quantityUnit}
                    yardAvailable={yardOf(m.materialId)}
                    lots={own}
                    values={v}
                    onChange={(next) => setValues((all) => ({ ...all, [m.materialId]: next }))}
                  />
                  {problem ? (
                    <p className="file-error" role="alert">{problem}</p>
                  ) : (
                    <small className="retrieve-note">
                      {total > 0 ? `${count.format(total)} ${m.quantityUnit} more will be sent` : "Leave empty to send no more of this."}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">{any ? "The extra units are added to what was dispatched." : "Enter how many more to send, and from where."}</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
              <Send size={16} strokeWidth={1.75} /> {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
