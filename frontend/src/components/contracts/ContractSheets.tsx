"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, Boxes, CalendarClock, CalendarDays, Check, CheckCheck, Clock, Lock, FileText, Hammer, IndianRupee, MapPin, Send, Truck, Wallet } from "lucide-react";
import type { Contract } from "./AddContractDialog";
import PayableProgress, { ExtendedChip } from "./PayableProgress";
import { formatDate, localDateFromUtc } from "@/lib/dates";

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");
const rupees = (n: number) => `₹${money.format(n)}`;
const dayOf = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : null);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const period = (months: number, days: number) =>
  [months ? plural(months, "month") : "", days ? plural(days, "day") : ""].filter(Boolean).join(" ");

type Sheet = "estimation" | "dispatch" | "deployment";

const isDeployed = (c: Contract) => c.status === "Deployed" || c.status === "Concluded" || c.status === "Closed";
const isConcluded = (c: Contract) => c.status === "Concluded" || c.status === "Closed";
const currentSheet = (c: Contract): Sheet => (isDeployed(c) ? "deployment" : c.status === "Dispatched" ? "dispatch" : "estimation");

/** One figure that changed between phases: "₹6,000 → ₹5,000", with the difference. */
function Compare({ label, icon, before, after }: { label: string; icon: ReactNode; before: number; after: number }) {
  const diff = Math.round((after - before) * 100) / 100;
  return (
    <li className="compare-row">
      <span className="compare-label">
        {icon} {label}
      </span>
      <span className="compare-values">
        <span className="compare-before">{rupees(before)}</span>
        <ArrowRight size={14} strokeWidth={2} aria-hidden />
        <strong>{rupees(after)}</strong>
        {diff !== 0 && (
          <em className="compare-diff" data-up={diff > 0}>
            {diff > 0 ? "+" : "−"}
            {rupees(Math.abs(diff))}
          </em>
        )}
      </span>
    </li>
  );
}

function Tile({ icon, label, value, wide }: { icon: ReactNode; label: string; value: string; wide?: boolean }) {
  return (
    <div className={`sheet-tile${wide ? " wide" : ""}`}>
      <span className="sheet-tile-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <dt>{label}</dt>
        <dd className="pre-wrap">{value}</dd>
      </div>
    </div>
  );
}

function Steps({ contract }: { contract: Contract }) {
  const steps = [
    { name: "Estimated", icon: <FileText size={14} strokeWidth={2} />, date: formatDate(localDateFromUtc(contract.createdAt)), done: true },
    { name: "Dispatched", icon: <Send size={14} strokeWidth={2} />, date: dayOf(contract.dispatchedAt), done: contract.status !== "Estimated" },
    { name: "Deployed", icon: <Hammer size={14} strokeWidth={2} />, date: dayOf(contract.deployedAt), done: isDeployed(contract) },
    { name: "Concluded", icon: <CheckCheck size={14} strokeWidth={2} />, date: dayOf(contract.concludedAt), done: isConcluded(contract) },
    { name: "Closed", icon: <Lock size={14} strokeWidth={2} />, date: dayOf(contract.closedAt), done: contract.status === "Closed" },
  ];
  const current = steps.findLastIndex((s) => s.done);
  return (
    <ol className="sheet-steps" aria-label="Contract progress">
      {steps.map((s, i) => (
        <li key={s.name} data-state={i < current ? "done" : i === current ? "current" : "todo"}>
          <span className="sheet-step-dot">{i < current ? <Check size={14} strokeWidth={2.5} /> : s.icon}</span>
          <span className="sheet-step-text">
            <strong>{s.name}</strong>
            <small>{s.done ? (s.date ?? "Done") : "Pending"}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function EstimationSheet({ contract }: { contract: Contract }) {
  return (
    <>
      <h4 className="form-section">Materials Required</h4>
      <ul className="doc-list">
        {contract.materials.map((m) => (
          <li key={m.materialId} className="doc-row">
            <div className="doc-row-main">
              <span className="doc-row-title">{m.name}</span>
            </div>
            <span className="breakdown-amount">
              {count.format(m.quantity)} {m.quantityUnit}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="form-section">Estimated Costs</h4>
      <dl className="customer-expanded-details">
        <div className="customer-field">
          <Truck size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Transportation</dt><dd>{rupees(contract.transportationCost)}</dd></div>
        </div>
        <div className="customer-field">
          <Boxes size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Materials</dt><dd>{rupees(contract.materialsCost)}</dd></div>
        </div>
        <div className="full">
          <div className="route-amount route-amount-large">
            <span className="route-amount-label">
              <IndianRupee size={14} strokeWidth={1.75} /> Estimated Cost
            </span>
            <span className="route-amount-value">{rupees(contract.estimatedCost)}</span>
          </div>
        </div>
      </dl>

      {contract.description && (
        <>
          <h4 className="form-section">Description For Estimation</h4>
          <p className="pre-wrap contract-notes">{contract.description}</p>
        </>
      )}

      <h4 className="form-section">Estimated Cost Month by Month</h4>
      <ul className="breakdown-list">
        <li className="breakdown-row breakdown-day">
          <div className="breakdown-main">
            <span className="breakdown-title">Cost For A Day</span>
            <span className="breakdown-meta">
              {rupees(contract.estimatedCost)} ÷ {contract.months * 30 + contract.days} days
            </span>
          </div>
          <span className="breakdown-amount">{rupees(contract.dailyCost)}</span>
        </li>
        {contract.breakdown.map((p) => (
          <li key={p.label} className="breakdown-row">
            <div className="breakdown-main">
              <span className="breakdown-title">Estimated Cost for {p.label}</span>
              <span className="breakdown-meta">
                {p.days} days · {formatDate(p.from)} – {formatDate(p.to)}
              </span>
            </div>
            <span className="breakdown-amount">{rupees(p.cost)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function DispatchSheet({ contract, onSendMore }: { contract: Contract; onSendMore: () => void }) {
  const finalCost = contract.finalCost ?? contract.estimatedCost;
  const finalTransport = contract.finalTransportationCost ?? contract.transportationCost;
  const finalDaily = contract.finalDailyCost ?? contract.dailyCost;
  return (
    <>
      <h4 className="form-section">Materials Dispatched</h4>
      <ul className="doc-list">
        {contract.materials.map((m) => (
          <li key={m.materialId} className="doc-row">
            <div className="doc-row-main">
              <span className="doc-row-title">{m.name}</span>
              <span className="doc-row-meta">Planned {count.format(m.quantity)} {m.quantityUnit}</span>
              {m.sources.length > 0 && (
                <span className="doc-row-meta source-line">
                  Taken from: {m.sources.map((x) => `${x.yard ? "Yard" : `Another site (${x.label})`} ${count.format(x.quantity)}`).join(" · ")}
                </span>
              )}
            </div>
            <span className="line-amounts">
              <span className="breakdown-amount">
                {count.format(m.dispatchedQuantity ?? m.quantity)} {m.quantityUnit}
              </span>
              <span className="doc-row-meta">dispatched</span>
            </span>
          </li>
        ))}
      </ul>

      {(contract.status === "Dispatched" || contract.status === "Deployed") && (
        <button type="button" className="btn btn-secondary send-more-btn" onClick={onSendMore}>
          <Send size={14} strokeWidth={1.75} /> Send More Materials
        </button>
      )}

      <h4 className="form-section">Estimated → Updated</h4>
      <ul className="compare-list">
        <Compare label="Transportation" icon={<Truck size={14} strokeWidth={1.75} />} before={contract.transportationCost} after={finalTransport} />
        <Compare label="Cost For A Day" icon={<IndianRupee size={14} strokeWidth={1.75} />} before={contract.dailyCost} after={finalDaily} />
        <Compare label="Final Cost" icon={<IndianRupee size={14} strokeWidth={1.75} />} before={contract.estimatedCost} after={finalCost} />
      </ul>

      <dl className="customer-expanded-details">
        <div className="customer-field">
          <Truck size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Loading/Unloading Charges</dt><dd>{rupees(contract.loadingCharges ?? 0)}</dd></div>
        </div>
        <div className="customer-field">
          <Send size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Dispatched On</dt><dd>{dayOf(contract.dispatchedAt) ?? "—"}</dd></div>
        </div>
      </dl>

      <h4 className="form-section">Updated Cost Month by Month</h4>
      <ul className="breakdown-list">
        <li className="breakdown-row breakdown-day">
          <div className="breakdown-main">
            <span className="breakdown-title">Updated Cost For A Day</span>
            <span className="breakdown-meta">
              {rupees(finalCost)} ÷ {contract.months * 30 + contract.days} days
            </span>
          </div>
          <span className="breakdown-amount">{rupees(finalDaily)}</span>
        </li>
        {(contract.finalBreakdown.length > 0 ? contract.finalBreakdown : contract.breakdown).map((p, i) => (
          <li key={p.label} className="breakdown-row">
            <div className="breakdown-main">
              <span className="breakdown-title">Cost for {p.label}</span>
              <span className="breakdown-meta">
                {p.days} days · {formatDate(p.from)} – {formatDate(p.to)}
              </span>
            </div>
            <span className="line-amounts">
              <span className="breakdown-amount">{rupees(p.cost)}</span>
              {contract.breakdown[i] && contract.breakdown[i].cost !== p.cost && (
                <span className="doc-row-meta">Estimated {rupees(contract.breakdown[i].cost)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

type ExtensionHandlers = {
  /** The user confirms the work is still running past the end date */
  onStillRunning: () => Promise<void>;
  /** Opens the conclude dialog with this day chosen */
  onConcludeOn: (day: string) => void;
  /** Opens the dialog to correct the day the work ended */
  onAdjustEnd: () => void;
  /** Opens the payment dialog for a billing line ("1", "2", ... or "extension") */
  onUpdatePayment: (lineKey: string) => void;
  /** Opens the dialog to send more units of the contract's materials */
  onSendMore: () => void;
};

/** Shown when a deployed contract is past its end date: has the work finished, or is it still running? */
function ExtensionWarning({ contract, handlers }: { contract: Contract; handlers: ExtensionHandlers }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const elapsed = contract.extensionElapsedDays ?? 0;
  if (contract.status !== "Deployed" || elapsed <= 0) return null;

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await handlers.onStillRunning();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="extension-warning" data-paused={contract.extensionPaused} role="alert">
      <div className="extension-warning-head">
        <AlertTriangle size={18} strokeWidth={1.75} />
        <strong>{contract.extensionPaused ? "Charging is paused" : "This contract is past its end date"}</strong>
      </div>
      <p>
        {contract.extensionPaused
          ? `It is ${elapsed} days past ${formatDate(contract.endDate)} and has not been concluded. To protect the customer, only ${contract.extendedDays} days are charged until you confirm the work is still running or conclude the contract.`
          : `It is ${elapsed} day${elapsed === 1 ? "" : "s"} past ${formatDate(contract.endDate)} and has not been concluded, so the customer is being charged for these days. Has the work finished?`}
      </p>
      {error && <p className="file-error">{error}</p>}
      <div className="extension-warning-actions">
        <button type="button" className="btn btn-primary" onClick={() => handlers.onConcludeOn(contract.endDate)}>
          <CheckCheck size={14} strokeWidth={1.75} /> Work ended on the end date
        </button>
        <button type="button" className="btn btn-secondary" onClick={confirm} disabled={busy}>
          {busy ? "Confirming…" : "Still running"}
        </button>
      </div>
    </div>
  );
}

function DeploymentSheet({ contract, handlers }: { contract: Contract; handlers: ExtensionHandlers }) {
  return (
    <>
      <ExtensionWarning contract={contract} handlers={handlers} />
      <ExtendedChip contract={contract} />
      <PayableProgress contract={contract} onUpdatePayment={handlers.onUpdatePayment} />

      <h4 className="form-section">Dates</h4>
      <dl className="customer-expanded-details">
        <div className="customer-field">
          <CalendarDays size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Work Started</dt><dd>{formatDate(contract.startDate)}</dd></div>
        </div>
        <div className="customer-field">
          <CalendarDays size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Contract End Date</dt><dd>{formatDate(contract.endDate)}</dd></div>
        </div>
        <div className="customer-field">
          <Hammer size={15} strokeWidth={1.75} className="customer-field-icon" />
          <div><dt>Deployed On</dt><dd>{dayOf(contract.deployedAt) ?? "—"}</dd></div>
        </div>
        {contract.plannedStartDate && (
          <div className="customer-field">
            <Clock size={15} strokeWidth={1.75} className="customer-field-icon" />
            <div><dt>Originally Planned Start</dt><dd>{formatDate(contract.plannedStartDate)}</dd></div>
          </div>
        )}
        {isConcluded(contract) && (
          <>
            <div className="customer-field">
              <CheckCheck size={15} strokeWidth={1.75} className="customer-field-icon" />
              <div><dt>Work Ended On</dt><dd>{contract.workEndedOn ? formatDate(contract.workEndedOn) : "—"}</dd></div>
            </div>
            <div className="customer-field">
              <CheckCheck size={15} strokeWidth={1.75} className="customer-field-icon" />
              <div><dt>Concluded On</dt><dd>{dayOf(contract.concludedAt) ?? "—"}</dd></div>
            </div>
          </>
        )}
      </dl>
      {isConcluded(contract) && contract.materials.some((m) => m.retrievedIntact !== null) && (
        <>
          <h4 className="form-section">Materials Retrieved</h4>
          <ul className="doc-list">
            {contract.materials.map((m) => {
              const sent = m.dispatchedQuantity ?? m.quantity;
              const intact = m.retrievedIntact ?? 0;
              const damaged = m.retrievedDamaged ?? 0;
              const missing = sent - intact - damaged;
              return (
                <li key={m.materialId} className="doc-row">
                  <div className="doc-row-main">
                    <span className="doc-row-title">{m.name}</span>
                    <span className="doc-row-meta">Dispatched {count.format(sent)} {m.quantityUnit}</span>
                  </div>
                  <span className="line-amounts">
                    <span className="breakdown-amount">
                      {count.format(intact)} intact · {count.format(damaged)} damaged
                    </span>
                    <span className="doc-row-meta">
                      {missing > 0 ? `${count.format(missing)} not returned` : "all returned"}
                      {m.returnDestination && ` · ${m.returnDestination}`}
                      {m.returnSiteNote && ` (${m.returnSiteNote})`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {contract.status === "Concluded" && (
        <button type="button" className="btn btn-secondary adjust-end-btn" onClick={handlers.onAdjustEnd}>
          <CalendarClock size={14} strokeWidth={1.75} /> Adjust End Day
        </button>
      )}
    </>
  );
}

/**
 * The body of an expanded contract: where it is in its life (steps), the facts that do not change (summary),
 * and one sheet per phase. It opens on the sheet for the contract's current phase.
 * `action` is the slider for the next phase, kept pinned at the bottom.
 */
export default function ContractSheets({ contract, action, handlers }: { contract: Contract; action?: ReactNode; handlers: ExtensionHandlers }) {
  const phase = currentSheet(contract);
  const [sheet, setSheet] = useState<Sheet>(phase);
  // when the contract moves to its next phase (dispatched, deployed) or another contract is shown, follow it
  const phaseKey = `${contract.id}:${phase}`;
  const [seenPhase, setSeenPhase] = useState(phaseKey);
  if (seenPhase !== phaseKey) {
    setSeenPhase(phaseKey);
    setSheet(phase);
  }

  const tabs: { id: Sheet; label: string; icon: ReactNode }[] = [
    { id: "estimation", label: "Estimation Sheet", icon: <FileText size={15} strokeWidth={1.75} /> },
    ...(contract.status !== "Estimated" ? [{ id: "dispatch" as const, label: "Dispatch Sheet", icon: <Send size={15} strokeWidth={1.75} /> }] : []),
    ...(isDeployed(contract) ? [{ id: "deployment" as const, label: "Deployment", icon: <Wallet size={15} strokeWidth={1.75} /> }] : []),
  ];

  return (
    <>
      <Steps contract={contract} />

      <dl className="sheet-summary">
        <Tile icon={<MapPin size={15} strokeWidth={1.75} />} label="Address of the Site" value={contract.siteAddress} wide />
        <Tile icon={<Clock size={15} strokeWidth={1.75} />} label="Time Period" value={period(contract.months, contract.days)} />
        <Tile
          icon={<CalendarDays size={15} strokeWidth={1.75} />}
          label="Start Date"
          value={formatDate(contract.startDate) + (contract.plannedStartDate ? " (started early)" : "")}
        />
        <Tile icon={<CalendarDays size={15} strokeWidth={1.75} />} label="End Date" value={formatDate(contract.endDate)} />
      </dl>

      {tabs.length > 1 && (
        <div className="sheet-tabs" role="tablist" aria-label="Contract sheets">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={sheet === t.id} className="sheet-tab" onClick={() => setSheet(t.id)}>
              {sheet === t.id && <motion.span layoutId="sheet-tab-pill" className="sheet-tab-pill" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="sheet-tab-label">
                {t.icon} {t.label}
              </span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sheet}
          role="tabpanel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.22 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          {sheet === "estimation" && <EstimationSheet contract={contract} />}
          {sheet === "dispatch" && <DispatchSheet contract={contract} onSendMore={handlers.onSendMore} />}
          {sheet === "deployment" && <DeploymentSheet contract={contract} handlers={handlers} />}
        </motion.div>
      </AnimatePresence>

      {action && <div className="sheet-action">{action}</div>}
    </>
  );
}
