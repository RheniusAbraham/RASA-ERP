"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck, ChevronDown, IndianRupee, Truck, Warehouse, X } from "lucide-react";
import type { BillingLine, Contract } from "./AddContractDialog";
import { PAYMENT_METHODS, ProofPicker, type PaymentInput } from "./UpdatePaymentPanel";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import { daysUntil, formatDate, todayISO } from "@/lib/dates";

/** What came back of one material when the contract is concluded. */
export const RETURN_DESTINATIONS = ["Back to Yard", "Moved to Another Site"] as const;
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number];

export type RetrievedInput = {
  materialId: number;
  intact: number;
  damaged: number;
  destination: ReturnDestination | null;
  /** Which site they moved to, in the user's words (optional) */
  siteNote?: string | null;
  /** Move the intact units straight to another running contract (optional) */
  assignToContractId?: number | null;
};

export type ConcludeInput = {
  /** The day the work really ended */
  workEndedOn: string;
  materials: RetrievedInput[];
};

type Props = {
  open: boolean;
  /** The live contract, so payments entered here show up straight away */
  contract: Contract;
  /** Every contract, to offer the running ones that can take the units that move on */
  contracts: Contract[];
  /** "conclude" closes the contract; "adjust" corrects the day the work ended on one that is already concluded */
  mode: "conclude" | "adjust";
  /** The day the picker starts on */
  initialDate: string;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (input: ConcludeInput) => Promise<void>;
  /** Records a payment against a billing line */
  onPay: (input: PaymentInput) => Promise<void>;
};

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");
const rupees = (n: number) => `₹${money.format(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A payment entered right here against one billing line, without leaving the dialog. */
function LinePayment({ line, onPay }: { line: BillingLine; onPay: Props["onPay"] }) {
  const [typed, setTyped] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amount = typed ?? (line.balance > 0 ? String(line.balance) : "");
  const valid = amount !== "" && Number(amount) > 0;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onPay({ line: line.key, amount: Number(amount), paidOn, method, proofs });
      setTyped(null);
      setProofs([]);
      setMethod("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conclude-pay-form">
      <div className="form-grid">
        <label className="field">
          <span>Amount Paid by the Customer</span>
          <div className="input-prefix">
            <span aria-hidden>₹</span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </label>
        <div className="field">
          <span>Payment Date</span>
          <DatePicker name={`paidOn-${line.key}`} value={paidOn} max={todayISO()} onChange={(iso) => iso && setPaidOn(iso)} />
        </div>
        <div className="field full">
          <span>Payment Method (optional)</span>
          <Combobox value={method} onChange={setMethod} options={PAYMENT_METHODS} placeholder="Cash, UPI, bank transfer…" />
        </div>
        <div className="field full">
          <span>Payment Proof</span>
          <ProofPicker files={proofs} onChange={setProofs} />
        </div>
      </div>
      {error && <p className="file-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || !valid || proofs.length === 0} onClick={save}
        title={!valid ? "Enter the amount paid" : proofs.length === 0 ? "Add a payment proof to save" : undefined}>
        <IndianRupee size={14} strokeWidth={1.75} /> {busy ? "Saving…" : "Save Payment"}
      </button>
    </div>
  );
}

/** One month (or the extended period): what is billed, what is paid, and a way to add a payment. */
function PaymentLine({ line, onPay }: { line: BillingLine; onPay: Props["onPay"] }) {
  const [adding, setAdding] = useState(false);
  const settled = round2(line.paid + line.creditIn);
  return (
    <li className="conclude-pay-line" data-status={line.status.replace(" ", "-").toLowerCase()}>
      <div className="conclude-pay-head">
        <div className="conclude-pay-title">
          <strong>{line.label}</strong>
          <small>
            Billed {rupees(line.amount)} · Paid {rupees(settled)}
            {line.balance > 0 && ` · ${rupees(line.balance)} due`}
          </small>
        </div>
        <span className="payable-pay-chip">{line.status}</span>
        <button type="button" className="btn btn-secondary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          {adding ? "Hide" : "Add payment"} <ChevronDown size={14} strokeWidth={2} className="conclude-chevron" data-open={adding} />
        </button>
      </div>
      {adding && <LinePayment line={line} onPay={onPay} />}
    </li>
  );
}

/**
 * Closing a contract. Asks on which day the work really ended (so a contract forgotten for a while is not charged
 * for days the customer did not use), shows what has been paid line by line (payments can be added here), and
 * asks what came back of every material: how many intact and how many damaged.
 */
export default function ConcludeDialog({ open, contract, contracts, mode, initialDate, onClose, onSubmit, onPay }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState(initialDate);
  const [retrieved, setRetrieved] = useState<Record<number, { intact: string; damaged: string; destination: ReturnDestination | ""; siteNote: string; assignTo?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const concluding = mode === "conclude";
  const perDay = contract.finalDailyCost ?? contract.dailyCost;
  // days past the end date up to the chosen day, charged by the day
  const extraDays = day ? Math.max(daysUntil(day) - daysUntil(contract.endDate), 0) : 0;
  const extraAmount = round2(extraDays * perDay);

  const materials = contract.materials.map((m) => {
    const sent = m.dispatchedQuantity ?? m.quantity;
    const entry = retrieved[m.materialId] ?? { intact: "", damaged: "", destination: "" as const, siteNote: "" };
    const filled = entry.intact !== "" && entry.damaged !== "";
    const intact = Number(entry.intact);
    const damaged = Number(entry.damaged);
    const whole = Number.isInteger(intact) && Number.isInteger(damaged) && intact >= 0 && damaged >= 0;
    const back = filled && whole ? intact + damaged : 0;
    // a destination is needed once anything came back
    const needsDestination = filled && whole && back > 0 && entry.destination === "";
    return { m, sent, entry, filled, whole, intact, damaged, back, needsDestination, tooMany: filled && whole && back > sent, notReturned: sent - back };
  });
  const materialsOk = materials.every((x) => x.filled && x.whole && !x.tooMany && !x.needsDestination);

  const setField = (id: number, field: "intact" | "damaged", value: string) =>
    setRetrieved((r) => ({ ...r, [id]: { ...(r[id] ?? { intact: "", damaged: "", destination: "", siteNote: "" }), [field]: value } }));
  const setAssignTo = (id: number, assignTo: string) =>
    setRetrieved((r) => ({ ...r, [id]: { ...(r[id] ?? { intact: "", damaged: "", destination: "", siteNote: "" }), assignTo } }));
  const setSiteNote = (id: number, siteNote: string) =>
    setRetrieved((r) => ({ ...r, [id]: { ...(r[id] ?? { intact: "", damaged: "", destination: "", siteNote: "" }), siteNote } }));
  const setDestination = (id: number, destination: ReturnDestination) =>
    setRetrieved((r) => ({ ...r, [id]: { ...(r[id] ?? { intact: "", damaged: "", destination: "", siteNote: "" }), destination } }));

  const submit = async () => {
    if (!day || (concluding && !materialsOk)) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        workEndedOn: day,
        materials: materials.map((x) => ({
          materialId: x.m.materialId,
          intact: x.intact,
          damaged: x.damaged,
          destination: x.back > 0 && x.entry.destination !== "" ? x.entry.destination : null,
          siteNote: x.entry.destination === "Moved to Another Site" && x.intact > 0 ? x.entry.siteNote.trim() || null : null,
          assignToContractId: x.entry.destination === "Moved to Another Site" && x.intact > 0 && x.entry.assignTo ? Number(x.entry.assignTo) : null,
        })),
      });
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
          <h2 className="dialog-title">{concluding ? "Conclude this contract" : "Adjust the end day"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <p className="early-lead">
            {concluding
              ? "The work is finished and the contract closes. Check the payments, record what came back of the materials, and choose the day the work really ended."
              : "Choose the day the work really ended. The extended period is charged up to that day."}
          </p>

          <h3 className="form-section">Work Ended On</h3>
          <div className="field">
            <DatePicker
              name="workEndedOn"
              value={day}
              min={contract.startDate}
              max={todayISO()}
              placeholder="Pick the last day of work"
              onChange={(iso) => iso && setDay(iso)}
            />
          </div>
          <ul className="early-changes">
            <li>
              <span>Contract End Date</span>
              <span className="early-change">{formatDate(contract.endDate)}</span>
            </li>
            <li>
              <span>Extended period charged</span>
              <span className="early-change">
                {extraDays === 0 ? (
                  <em>none: the work ended by the end date</em>
                ) : (
                  <strong>
                    {extraDays} day{extraDays === 1 ? "" : "s"} · {rupees(extraAmount)}
                  </strong>
                )}
              </span>
            </li>
          </ul>

          {concluding && (
            <>
              <h3 className="form-section">Payments</h3>
              {contract.billingLines.length === 0 ? (
                <p className="breakdown-hint">Nothing is billed yet.</p>
              ) : (
                <>
                  <ul className="conclude-pay-list">
                    {contract.billingLines.map((l) => (
                      <PaymentLine key={l.key} line={l} onPay={onPay} />
                    ))}
                  </ul>
                  <div className="conclude-pay-total" data-owing={contract.totalOutstanding > 0}>
                    <span>
                      Received <strong>{rupees(contract.totalReceived)}</strong>
                    </span>
                    <span>
                      Outstanding <strong>{rupees(contract.totalOutstanding)}</strong>
                    </span>
                  </div>
                  {contract.totalOutstanding > 0 && (
                    <p className="conclude-owing" role="note">
                      {rupees(contract.totalOutstanding)} is still unpaid. You can conclude the contract, and the balance stays on record to collect.
                    </p>
                  )}
                </>
              )}

              <h3 className="form-section">Materials</h3>
              <ul className="retrieve-list">
                {materials.map(({ m, sent, entry, tooMany, notReturned, filled, whole, back }) => (
                  <li key={m.materialId} className="retrieve-card" data-invalid={tooMany}>
                    <div className="retrieve-head">
                      <strong>{m.name}</strong>
                      <span>
                        Dispatched {count.format(sent)} {m.quantityUnit}
                      </span>
                    </div>
                    <p className="retrieve-title">Quantity of Materials Retrieved</p>
                    <div className="retrieve-fields">
                      <label className="field">
                        <span>No of Intact Materials</span>
                        <div className="qty-input" data-invalid={tooMany}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            required
                            value={entry.intact}
                            onChange={(e) => setField(m.materialId, "intact", e.target.value)}
                          />
                          <em>{m.quantityUnit}</em>
                        </div>
                      </label>
                      <label className="field">
                        <span>No of Damaged Materials</span>
                        <div className="qty-input" data-invalid={tooMany}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            required
                            value={entry.damaged}
                            onChange={(e) => setField(m.materialId, "damaged", e.target.value)}
                          />
                          <em>{m.quantityUnit}</em>
                        </div>
                      </label>
                    </div>
                    <div className="retrieve-destination" role="radiogroup" aria-label={`Material Return Destination for ${m.name}`}>
                      <span className="retrieve-title">Material Return Destination</span>
                      <div className="destination-choices">
                        {RETURN_DESTINATIONS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={entry.destination === d}
                            className="destination-choice"
                            disabled={filled && whole && back === 0}
                            onClick={() => setDestination(m.materialId, d)}
                          >
                            {d === "Back to Yard" ? <Warehouse size={15} strokeWidth={1.75} /> : <Truck size={15} strokeWidth={1.75} />} {d}
                          </button>
                        ))}
                      </div>
                      {filled && whole && back === 0 ? (
                        <small className="retrieve-note">Not needed: nothing came back.</small>
                      ) : filled && whole && entry.destination === "" ? (
                        <small className="retrieve-note" data-short="true">Choose where the materials went.</small>
                      ) : null}
                    </div>
                    {entry.destination === "Moved to Another Site" && back > 0 && (
                      <label className="field retrieve-site">
                        <span>Assign the intact units to a running contract (optional)</span>
                        <select value={entry.assignTo ?? ""} onChange={(e) => setAssignTo(m.materialId, e.target.value)}>
                          <option value="">Leave them free at the other site</option>
                          {contracts
                            .filter(
                              (c) =>
                                c.id !== contract.id &&
                                (c.status === "Dispatched" || c.status === "Deployed") &&
                                c.materials.some((x) => x.materialId === m.materialId),
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.customerName} · {c.siteAddress}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {entry.destination === "Moved to Another Site" && back > 0 && (
                      <label className="field retrieve-site">
                        <span>Which site? (optional)</span>
                        <input
                          type="text"
                          maxLength={200}
                          value={entry.siteNote}
                          onChange={(e) => setSiteNote(m.materialId, e.target.value)}
                          placeholder="For example: Karunya Nagar, plot 9"
                        />
                      </label>
                    )}
                    {tooMany ? (
                      <p className="file-error" role="alert">
                        That is more than the {count.format(sent)} {m.quantityUnit} that were dispatched.
                      </p>
                    ) : filled && whole ? (
                      <ul className="retrieve-preview">
                        {Number(entry.intact) > 0 && (
                          <li>
                            {count.format(Number(entry.intact))} {m.quantityUnit} go{" "}
                            {entry.destination === "Moved to Another Site"
                              ? entry.assignTo
                                ? "straight to the other contract (they never pass through the yard)"
                                : "to wait at another site, free to assign (not in the yard)"
                              : "back to the inventory, available again"}
                          </li>
                        )}
                        {Number(entry.damaged) > 0 && (
                          <li data-tone="damaged">{count.format(Number(entry.damaged))} {m.quantityUnit} are marked Damaged in the yard (not available until repaired)</li>
                        )}
                        {notReturned > 0 && (
                          <li data-tone="lost">{count.format(notReturned)} {m.quantityUnit} are written off as lost and taken off the total owned</li>
                        )}
                        {notReturned === 0 && <li>Everything that was dispatched came back</li>}
                      </ul>
                    ) : (
                      <small className="retrieve-note">Enter 0 if none came back.</small>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">
            {concluding
              ? materialsOk
                ? "The contract is closed once you confirm."
                : "Fill in what came back of every material, and where it went, to conclude."
              : "This changes what the customer is charged."}
          </span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !day || (concluding && !materialsOk)}>
              <CheckCheck size={16} strokeWidth={1.75} /> {busy ? "Saving…" : concluding ? "Yes, conclude" : "Save end day"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
