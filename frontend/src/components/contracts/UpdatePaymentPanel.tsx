"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import type { BillingLine, Contract, Payment } from "./AddContractDialog";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import { fileHref } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/dates";

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"];

export type PaymentInput = {
  line: string;
  amount: number;
  paidOn: string;
  method: string;
  proofs: File[];
};

type Props = {
  contract: Contract;
  /** The billing line being paid: "1", "2", ... or "extension" */
  lineKey: string;
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (input: PaymentInput) => Promise<void>;
  onVoid: (paymentId: number, reason: string) => Promise<void>;
};

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rupees = (n: number) => `₹${money.format(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_PROOFS = 2;

/** Up to two picture slots with previews. */
export function ProofPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  return (
    <div className="proof-picker">
      {previews.map((url, i) => (
        <div key={url} className="proof-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Payment proof ${i + 1}`} />
          <button type="button" aria-label={`Remove proof ${i + 1}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
            <X size={12} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      {files.length < MAX_PROOFS && (
        <button type="button" className="proof-add" onClick={() => input.current?.click()}>
          <ImagePlus size={20} strokeWidth={1.75} />
          <span>{files.length === 0 ? "Add proof" : "Add another"}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          onChange([...files, ...picked].slice(0, MAX_PROOFS));
        }}
      />
    </div>
  );
}

function History({ payments, onVoid }: { payments: Payment[]; onVoid: Props["onVoid"] }) {
  const [voiding, setVoiding] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (payments.length === 0) return null;
  const confirmVoid = async (id: number) => {
    setBusy(true);
    setError("");
    try {
      await onVoid(id, reason.trim());
      setVoiding(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void the payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="doc-group">
      <h3 className="form-section">Payments Recorded</h3>
      <ul className="pay-history">
        {payments.map((p) => (
          <li key={p.id} className="pay-history-row" data-voided={p.voided}>
            <div className="pay-history-main">
              <strong>{rupees(p.amount)}</strong>
              <small>
                {formatDate(p.paidOn)}
                {p.method ? ` · ${p.method}` : ""}
                {p.voided && ` · Voided: ${p.voidReason}`}
              </small>
            </div>
            <div className="pay-history-proofs">
              {p.proofs.map((proof) => (
                <a key={proof.kind} href={fileHref(proof.url)} target="_blank" rel="noreferrer" title="Open the proof">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileHref(proof.url)} alt={`Proof of the ${rupees(p.amount)} payment`} />
                </a>
              ))}
              {!p.voided && voiding !== p.id && (
                <button type="button" className="pay-void" onClick={() => setVoiding(p.id)}>
                  <RotateCcw size={12} strokeWidth={2} /> Void
                </button>
              )}
            </div>
            {voiding === p.id && (
              <div className="pay-void-form">
                <input
                  type="text"
                  placeholder="Why is this payment being voided?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => confirmVoid(p.id)}>
                  {busy ? "Voiding…" : "Void payment"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setVoiding(null)} disabled={busy}>
                  Keep
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="file-error" role="alert">{error}</p>}
    </section>
  );
}

/** Records money the customer paid against one billing line (a month or the extended period). */
export default function UpdatePaymentPanel({ contract, lineKey, onClose, onSubmit, onVoid }: Props) {
  const line: BillingLine | undefined = contract.billingLines.find((l) => l.key === lineKey);
  // null until the user types: then the box shows what is still due on this line
  const [typedAmount, setAmount] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!line) return null;

  const amount = typedAmount ?? (line.balance > 0 ? String(line.balance) : "");
  const typed = Number(amount);
  const valid = amount !== "" && typed > 0;
  // what the line looks like once this payment is added (the credit carried in from an earlier line counts too)
  const covered = round2(line.paid + line.creditIn + (valid ? typed : 0));
  const balanceAfter = round2(Math.max(line.amount - covered, 0));
  const extra = round2(Math.max(covered - line.amount, 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (proofs.length === 0) {
      setError("Add a picture of the payment proof (1 or 2 images).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ line: line.key, amount: typed, paidOn, method, proofs });
      setAmount(null);
      setProofs([]);
      setMethod("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const payments = contract.payments.filter((p) => p.line === line.key);

  return (
    <motion.aside
      className="pay-panel dialog-wide"
      role="complementary"
      aria-label={`Update payment for ${line.label}`}
      initial={{ opacity: 0, x: 48, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <form onSubmit={submit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">Update Payment · {line.label}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <div className="stock-tiles pay-tiles">
            <div>
              <span>Billed</span>
              <strong>{rupees(line.amount)}</strong>
            </div>
            <div>
              <span>Paid So Far</span>
              <strong>{rupees(round2(line.paid + line.creditIn))}</strong>
            </div>
            <div data-low={line.balance > 0}>
              <span>Balance Due</span>
              <strong>{rupees(line.balance)}</strong>
            </div>
          </div>
          {line.creditIn > 0 && <p className="breakdown-hint">Includes {rupees(line.creditIn)} carried over from an earlier payment that was more than was due.</p>}

          <h3 className="form-section">New Payment</h3>
          <div className="form-grid">
            <label className="field full">
              <span>Amount Paid by the Customer</span>
              <div className="input-prefix">
                <span aria-hidden>₹</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {valid && (
                <small className="pay-after" data-state={extra > 0 ? "over" : balanceAfter > 0 ? "part" : "paid"}>
                  {extra > 0
                    ? `${rupees(extra)} more than is due: it is carried forward as credit to the next payment.`
                    : balanceAfter > 0
                      ? `Balance after this payment: ${rupees(balanceAfter)} · Part paid`
                      : "Paid in full"}
                </small>
              )}
            </label>

            <div className="field">
              <span>Payment Date</span>
              <DatePicker name="paidOn" value={paidOn} max={todayISO()} onChange={(iso) => iso && setPaidOn(iso)} />
            </div>
            <div className="field">
              <span>Payment Method (optional)</span>
              <Combobox value={method} onChange={setMethod} options={PAYMENT_METHODS} placeholder="Cash, UPI, bank transfer…" />
            </div>

            <div className="field full">
              <span>Payment Proof</span>
              <ProofPicker files={proofs} onChange={setProofs} />
              <small className="field-hint" data-missing={proofs.length === 0}>
                {proofs.length === 0 ? "Required: add 1 or 2 pictures (a receipt, a screenshot or a photo of the cheque) to save the payment." : "1 or 2 pictures (a receipt, a screenshot or a photo of the cheque)."}
              </small>
            </div>
          </div>

          <History payments={payments} onVoid={onVoid} />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">A wrong payment can be voided, never deleted.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Close</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !valid || proofs.length === 0}
              title={!valid ? "Enter the amount paid" : proofs.length === 0 ? "Add a payment proof to save" : undefined}
            >
              {busy ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </div>
      </form>
    </motion.aside>
  );
}
