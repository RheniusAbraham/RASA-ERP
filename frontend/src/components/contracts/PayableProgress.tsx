"use client";

import { motion } from "motion/react";
import { CalendarClock, FileText, IndianRupee, Wallet } from "lucide-react";
import type { BillingLine, Contract } from "./AddContractDialog";
import { daysUntil, formatDate } from "@/lib/dates";

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Invoice and payment buttons. Both come in the next phase: for now they only take their place. */
function Actions({ onUpdatePayment }: { onUpdatePayment?: () => void }) {
  return (
    <div className="payable-month-actions">
      <button type="button" className="btn btn-primary">
        <FileText size={14} strokeWidth={1.75} /> Generate Invoice
      </button>
      <button type="button" className="btn btn-secondary" onClick={onUpdatePayment}>
        <IndianRupee size={14} strokeWidth={1.75} /> Update Payment
      </button>
    </div>
  );
}

/**
 * What the customer owes so far for a deployed contract. The charge is by the day (the updated cost for a day),
 * so it builds up one day at a time from the start date up to the full updated cost. Days past the end date
 * (the contract is still open) are charged on top as the extended period, kept apart from the planned months.
 */
/**
 * One bar for a billing line: the track is the full amount, purple is what has built up so far (the days worked),
 * green is what has been paid. Where purple shows beyond the green, that part is due now. A marker shows how far
 * the days have got, so a payment ahead of the marker is easy to see.
 */
function LayeredBar({ amount, earned, paid, label }: { amount: number; earned: number; paid: number; label: string }) {
  const share = (v: number) => (amount > 0 ? Math.min(100, Math.max(0, (v / amount) * 100)) : 0);
  return (
    <div className="layered-bar" role="img" aria-label={label}>
      <motion.span
        className="layered-earned"
        initial={{ width: 0 }}
        animate={{ width: `${share(earned)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.1 }}
      />
      <motion.span
        className="layered-paid"
        initial={{ width: 0 }}
        animate={{ width: `${share(paid)}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.2 }}
      />
      {earned > 0 && earned < amount && <span className="layered-marker" style={{ left: `${share(earned)}%` }} aria-hidden />}
    </div>
  );
}

/** The payment status of one billing line, and what is due now. */
function PaymentStrip({ line }: { line: BillingLine | undefined }) {
  if (!line) return null;
  const settled = round2(line.paid + line.creditIn);
  return (
    <div className="payable-pay" data-status={line.status.replace(" ", "-").toLowerCase()}>
      <div className="payable-pay-top">
        <span className="payable-pay-chip">{line.status}</span>
        <span>
          {line.status === "Unpaid"
            ? `₹${money.format(line.balance)} to pay for the month`
            : line.status === "Part paid"
              ? `₹${money.format(settled)} paid · ₹${money.format(line.balance)} left for the month`
              : line.status === "Overpaid"
                ? `₹${money.format(settled)} paid · ₹${money.format(line.creditOut)} extra`
                : `₹${money.format(settled)} paid`}
        </span>
      </div>
      {line.creditIn > 0 && <small className="payable-pay-note">Includes ₹{money.format(line.creditIn)} credit carried over</small>}
      {line.dueNow > 0 ? (
        <small className="payable-pay-due" data-state="due">₹{money.format(line.dueNow)} due now for the days worked</small>
      ) : settled > 0 && line.accrued > 0 && line.balance > 0 ? (
        <small className="payable-pay-due" data-state="ahead">
          {settled > line.accrued + 0.005 ? "Paid ahead of the days worked" : "Paid up to date for the days worked"}
        </small>
      ) : null}
    </div>
  );
}

export default function PayableProgress({ contract, onUpdatePayment }: { contract: Contract; onUpdatePayment?: (lineKey: string) => void }) {
  const periods = contract.finalBreakdown.length > 0 ? contract.finalBreakdown : contract.breakdown;
  if (periods.length === 0) return null;

  const concluded = contract.status === "Concluded" || contract.status === "Closed";
  // "Now" for the figures: today, or the day the contract was concluded
  const endedOn = contract.workEndedOn ?? contract.concludedAt?.slice(0, 10) ?? null;
  const shift = endedOn ? daysUntil(endedOn) : 0;
  const elapsed = (from: string, days: number) => Math.min(Math.max(-daysUntil(from) + shift + 1, 0), days);

  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  const planned = round2(periods.reduce((sum, p) => sum + p.cost, 0));
  const daysDone = periods.reduce((sum, p) => sum + elapsed(p.from, p.days), 0);
  const plannedAccrued = round2(periods.reduce((sum, p) => sum + (elapsed(p.from, p.days) / p.days) * p.cost, 0));

  const extendedDays = contract.extendedDays ?? 0;
  const extension = contract.extensionAmount ?? 0;
  const extended = extendedDays > 0;
  const accrued = round2(plannedAccrued + extension);
  const total = round2(planned + extension);
  const finished = daysDone >= totalDays;
  const perDay = contract.finalDailyCost ?? contract.dailyCost;
  const percent = planned > 0 ? Math.round((accrued / planned) * 100) : 0;

  // the bar covers the planned amount plus the extension; the extension is its own amber part
  const planShare = total > 0 ? (plannedAccrued / total) * 100 : 0;
  const extShare = total > 0 ? (extension / total) * 100 : 0;

  // Each month on its own: what the customer has to pay for it, and how much of that has built up
  const months = periods.map((p) => {
    const done = elapsed(p.from, p.days);
    return {
      ...p,
      done,
      accrued: round2((done / p.days) * p.cost),
      state: done === 0 ? "upcoming" : done >= p.days ? "completed" : "ongoing",
    } as const;
  });

  return (
    <section className="payable" aria-label="Amount the customer has to pay">
      <div className="payable-head">
        <span className="payable-icon" aria-hidden>
          <Wallet size={18} strokeWidth={1.75} />
        </span>
        <div className="payable-title">
          <span>Amount The Customer Has To Pay</span>
          <small>Builds up daily at ₹{money.format(perDay)} a day</small>
        </div>
        <div className="payable-amount">
          <strong>₹{money.format(accrued)}</strong>
          <small>
            of ₹{money.format(planned)}
            {extended && ` + ₹${money.format(extension)} extended`}
          </small>
        </div>
      </div>

      <div
        className="payable-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-label="Share of the total amount that has built up so far"
      >
        <motion.span
          className="payable-fill"
          initial={{ width: 0 }}
          animate={{ width: `${planShare}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.15 }}
        />
        {extended && (
          <motion.span
            className="payable-fill payable-fill-extended"
            initial={{ width: 0 }}
            animate={{ width: `${extShare}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.3 }}
          />
        )}
        <motion.span
          className="payable-paid-layer"
          initial={{ width: 0 }}
          animate={{ width: `${total > 0 ? Math.min(100, (contract.totalReceived / total) * 100) : 0}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.4 }}
        />
      </div>

      <ul className="payable-legend" aria-hidden>
        <li data-k="earned">Earned so far</li>
        <li data-k="paid">Paid</li>
        {extended && <li data-k="extended">Extended period</li>}
      </ul>

      <div className="payable-foot">
        <span>
          {extended
            ? `Day ${totalDays + extendedDays} of ${totalDays} · extended by ${extendedDays} day${extendedDays === 1 ? "" : "s"}`
            : finished
              ? "All days completed"
              : `Day ${daysDone} of ${totalDays}`}
        </span>
        <span>
          {percent}% · {finished ? `ended ${formatDate(contract.endDate)}` : `ends ${formatDate(contract.endDate)}`}
        </span>
      </div>

      <ul className="payable-summary">
        <li>
          <span>Received</span>
          <strong>₹{money.format(contract.totalReceived)}</strong>
        </li>
        <li data-owing={contract.totalOutstanding > 0}>
          <span>Outstanding</span>
          <strong>₹{money.format(contract.totalOutstanding)}</strong>
        </li>
        {contract.creditBalance > 0 && (
          <li data-credit>
            <span>Credit</span>
            <strong>₹{money.format(contract.creditBalance)}</strong>
          </li>
        )}
      </ul>

      <ul className="payable-months">
        {months.map((m, i) => (
          <li key={m.label} className="payable-month" data-state={m.state}>
            <div className="payable-month-top">
              <span className="payable-month-title">Amount To Pay For {m.label.replace(/month$/, "Month")}</span>
              <span className="payable-month-state">
                {m.state === "ongoing" ? "Ongoing" : m.state === "completed" ? "Completed" : "Upcoming"}
              </span>
            </div>
            <strong>₹{money.format(m.cost)}</strong>
            {(() => {
              const line = contract.billingLines.find((l) => l.key === String(i + 1));
              const earned = line?.accrued ?? m.accrued;
              const settled = line ? round2(line.paid + line.creditIn) : 0;
              return (
                <LayeredBar
                  amount={m.cost}
                  earned={earned}
                  paid={settled}
                  label={`${m.label}: ₹${money.format(earned)} earned so far, ₹${money.format(settled)} paid, of ₹${money.format(m.cost)}`}
                />
              );
            })()}
            <small>
              {m.state === "upcoming"
                ? `Starts ${formatDate(m.from)}`
                : m.state === "completed"
                  ? `All ${m.days} days · ${formatDate(m.from)} – ${formatDate(m.to)}`
                  : `Earned ₹${money.format(contract.billingLines.find((l) => l.key === String(i + 1))?.accrued ?? m.accrued)} · day ${m.done} of ${m.days}`}
            </small>
            <PaymentStrip line={contract.billingLines.find((l) => l.key === String(i + 1))} />
            <Actions onUpdatePayment={() => onUpdatePayment?.(String(i + 1))} />
          </li>
        ))}

        {extended && contract.extensionStart && contract.extensionEnd && (
          <li className="payable-month payable-extended" data-state={concluded ? "completed" : contract.extensionPaused ? "paused" : "ongoing"}>
            <div className="payable-month-top">
              <span className="payable-month-title">Amount To Pay For The Extended Period</span>
              <span className="payable-month-state">{concluded ? "Completed" : contract.extensionPaused ? "Paused" : "Ongoing"}</span>
            </div>
            <strong>₹{money.format(extension)}</strong>
            {(() => {
              const line = contract.billingLines.find((l) => l.key === "extension");
              const settled = line ? round2(line.paid + line.creditIn) : 0;
              return (
                <LayeredBar
                  amount={extension}
                  earned={extension}
                  paid={settled}
                  label={`Extended period: ₹${money.format(extension)} built up, ₹${money.format(settled)} paid`}
                />
              );
            })()}
            <small>
              {extendedDays} day{extendedDays === 1 ? "" : "s"} × ₹{money.format(perDay)} · {formatDate(contract.extensionStart)} –{" "}
              {formatDate(contract.extensionEnd)}
              {!concluded && !contract.extensionPaused && " (still running)"}
            </small>
            {contract.extensionPaused && (
              <small className="payable-paused">
                Charging is paused: {contract.extensionElapsedDays} days have passed, but only the days up to{" "}
                {contract.extensionChargeUntil ? formatDate(contract.extensionChargeUntil) : "the limit"} are charged until you confirm the work is still running.
              </small>
            )}
            <PaymentStrip line={contract.billingLines.find((l) => l.key === "extension")} />
            <Actions onUpdatePayment={() => onUpdatePayment?.("extension")} />
          </li>
        )}
      </ul>
    </section>
  );
}

export function ExtendedChip({ contract }: { contract: Contract }) {
  const days = contract.extensionElapsedDays ?? 0;
  if (days <= 0 || contract.status !== "Deployed") return null;
  return (
    <span className="extended-chip" title="The work has run past the contract end date">
      <CalendarClock size={12} strokeWidth={2} /> Extended · {days} day{days === 1 ? "" : "s"}
    </span>
  );
}
