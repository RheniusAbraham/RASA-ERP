"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import MultiSelect from "@/components/ui/MultiSelect";
import type { Material } from "@/components/materials/AddMaterialDialog";
import { computeBreakdown, contractEndDate, periodBetween, type BillingPeriod } from "@/lib/contract-billing";
import { formatDate, todayISO } from "@/lib/dates";
import { availableToPlan } from "@/lib/stock";

/** One material going to the site: which one, how many, and what it is estimated to cost. */
export type ContractItemInput = { materialId: number; quantity: number };

export type ContractInput = {
  customerId: number;
  siteAddress: string;
  materials: ContractItemInput[];
  startDate: string;
  months: number;
  days: number;
  transportationCost: number;
  materialsCost: number;
  estimatedCost: number;
  /** Notes about the estimate */
  description: string;
};

/** A material on a stored contract, with the quantity unit it was counted in when it was added. */
export type ContractItem = {
  materialId: number;
  name: string;
  quantity: number;
  quantityUnit: string;
  /** How many were actually dispatched; null until the contract is dispatched */
  dispatchedQuantity: number | null;
  /** What came back when the contract was concluded; null until then */
  retrievedIntact: number | null;
  retrievedDamaged: number | null;
  /** Where what came back went; null until concluded, or when nothing came back */
  returnDestination: "Back to Yard" | "Moved to Another Site" | null;
  returnSiteNote: string | null;
  /** Where the dispatched units were taken from */
  sources: { label: string; quantity: number; yard: boolean }[];
};

/** A payment the customer made against one billing line of a contract */
export type Payment = {
  id: number;
  /** "1", "2", ... for the months, or "extension" */
  line: string;
  amount: number;
  paidOn: string;
  method: string | null;
  voided: boolean;
  voidReason: string | null;
  proofs: { kind: string; filename: string; contentType: string; size: number; url: string }[];
  createdAt: string;
};

/** One thing the customer is billed for (a month or the extended period) and how much of it is paid */
export type BillingLine = {
  key: string;
  label: string;
  amount: number;
  /** How much of the line has built up so far (the days worked x the cost for a day) */
  accrued: number;
  /** What is due now: built up so far, less what is paid (never negative) */
  dueNow: number;
  paid: number;
  creditIn: number;
  creditOut: number;
  balance: number;
  status: "Unpaid" | "Part paid" | "Paid" | "Overpaid";
};

/** A contract as stored by the backend */
export type Contract = Omit<ContractInput, "materials"> & {
  id: number;
  customerName: string;
  materials: ContractItem[];
  /** "Estimated" until the materials are sent to the site, then "Dispatched" */
  status: "Estimated" | "Dispatched" | "Deployed" | "Concluded" | "Closed";
  dispatchedAt: string | null;
  deployedAt: string | null;
  concludedAt: string | null;
  closedAt: string | null;
  /** Filled in at dispatch */
  finalTransportationCost: number | null;
  finalCost: number | null;
  loadingCharges: number | null;
  finalBreakdown: BillingPeriod[];
  /** Cost for a day: estimated cost / (months x 30 + days) */
  dailyCost: number;
  /** Last day of the contract: the start date plus the time period */
  endDate: string;
  /** What the customer is billed for, line by line, with what has been paid against each */
  billingLines: BillingLine[];
  payments: Payment[];
  totalBilled: number;
  totalReceived: number;
  totalOutstanding: number;
  /** Money paid above what is billed so far */
  creditBalance: number;
  /** The day the work really ended (concluded contracts) */
  workEndedOn: string | null;
  /** Days past the end date so far, charged or not */
  extensionElapsedDays: number;
  /** Days being charged: limited without a confirmation, and fixed once concluded */
  extendedDays: number;
  /** Charging has stopped until the user confirms the work is still running (or concludes) */
  extensionPaused: boolean;
  /** The last day that can be charged without a new confirmation */
  extensionChargeUntil: string | null;
  extensionStart: string | null;
  extensionEnd: string | null;
  /** What those days cost: the days x the (updated) cost for a day */
  extensionAmount: number;
  createdAt: string;
  /** When it was deployed before its planned start: the date it was planned to start (startDate is then the real start) */
  plannedStartDate: string | null;
  /** The same for the updated final cost; null until dispatched */
  finalDailyCost: number | null;
  /** Cost split month by month, using the real days in each contract month */
  breakdown: BillingPeriod[];
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Contract | null;
  customers: { id: number; name: string; phone: string }[];
  materials: Material[];
  /** All contracts, to work out how much of each material is already committed elsewhere */
  contracts: Contract[];
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (contract: ContractInput) => Promise<void> | void;
};

const MONTH_OPTIONS = Array.from({ length: 61 }, (_, i) => String(i)); // 0–60 months
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i)); // 0–30 days

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

function MoneyInput({
  name,
  value,
  onChange,
  required = true,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="input-prefix">
      <span aria-hidden>₹</span>
      <input
        name={name}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

/** Dropdown labels for records that can share a name: the extra text tells them apart. */
function labelled<T extends { id: number; name: string }>(items: T[], extra: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(i.name, (counts.get(i.name) ?? 0) + 1));
  return items.map((item) => ({ item, id: item.id, label: (counts.get(item.name) ?? 0) > 1 ? `${item.name} · ${extra(item)}` : item.name }));
}

export default function AddContractDialog({ open, editing, customers, materials: materialList, contracts, onClose, onSubmit }: Props) {
  /** What is in the yard for a material, not taken by other open contracts (this contract's own lines don't count) */
  const availableOf = (m: Material) => availableToPlan(m, contracts, editing?.id);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);

  const customerOptions = labelled(customers, (c) => c.phone);
  const materialOptions = labelled(materialList, (m) => `#${m.id}`);
  const [customerLabel, setCustomerLabel] = useState(
    () => customerOptions.find((o) => o.id === editing?.customerId)?.label ?? "",
  );
  const [materialLabels, setMaterialLabels] = useState<string[]>(() =>
    materialOptions.filter((o) => editing?.materials.some((m) => m.materialId === o.id)).map((o) => o.label),
  );
  // How many of each material are going to the site, as typed (keyed by material id)
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries((editing?.materials ?? []).map((m) => [m.materialId, String(m.quantity)])),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [months, setMonths] = useState(String(editing?.months ?? 0));
  const [days, setDays] = useState(String(editing?.days ?? 0));
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [periodError, setPeriodError] = useState("");

  const periodDays = Number(months) * 30 + Number(days);
  const endDate = contractEndDate(startDate, Number(months), Number(days));

  // The materials on the form, each with its quantity and cost as typed
  const selected = materialLabels
    .map((label) => materialOptions.find((o) => o.label === label)?.item)
    .filter((m): m is Material => !!m)
    .map((material) => {
      const quantityText = quantities[material.id] ?? "";
      const quantity = Number(quantityText);
      return {
        material,
        quantityText,
        available: availableOf(material),
        tooMany: quantity > availableOf(material),
      };
    });
  const [transport, setTransport] = useState(editing ? String(editing.transportationCost) : "");
  const [materialsCost, setMaterialsCost] = useState(editing ? String(editing.materialsCost) : "");
  // The total fills itself in (transport + materials) until the user types their own figure
  const computedTotal = transport === "" && materialsCost === "" ? "" : String(round2((Number(transport) || 0) + (Number(materialsCost) || 0)));
  const [totalOverride, setTotalOverride] = useState<string | null>(() =>
    editing && editing.estimatedCost !== round2(editing.transportationCost + editing.materialsCost) ? String(editing.estimatedCost) : null,
  );
  const total = totalOverride ?? computedTotal;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const billing = computeBreakdown({
    startDate,
    months: Number(months),
    days: Number(days),
    estimatedCost: total === "" ? NaN : Number(total),
  });
  const billedTotal = billing ? round2(billing.periods.reduce((sum, p) => sum + p.cost, 0)) : 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (periodDays <= 0 || !billing) {
      setPeriodError(periodDays <= 0 ? "Choose at least 1 day or 1 month." : "");
      return;
    }
    const customer = customerOptions.find((o) => o.label === customerLabel);
    if (!customer || selected.length === 0) return;
    const data = new FormData(e.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        customerId: customer.id,
        siteAddress: String(data.get("siteAddress") ?? "").trim(),
        materials: selected.map((s) => ({ materialId: s.material.id, quantity: Number(s.quantityText) })),
        startDate,
        months: Number(months),
        days: Number(days),
        transportationCost: Number(transport),
        materialsCost: Number(materialsCost),
        estimatedCost: Number(total),
        description: String(data.get("description") ?? "").trim(),
      });
      // Remount the form so every field starts empty next time
      setFormKey((k) => k + 1);
      setCustomerLabel("");
      setMaterialLabels([]);
      setQuantities({});
      setMonths("0");
      setDays("0");
      setStartDate("");
      setPeriodError("");
      setTransport("");
      setMaterialsCost("");
      setTotalOverride(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
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
      <form key={formKey} onSubmit={handleSubmit} className="dialog-body">
        <div className="dialog-header">
          <h2 className="dialog-title">{editing ? "Edit Contract Form" : "Contract Form"}</h2>
          <button type="button" className="header-icon dialog-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="dialog-scroll">
          <h3 className="form-section">Customer &amp; Site</h3>
          <div className="form-grid">
            <div className="field full">
              <span>Customer Name</span>
              <Combobox
                required
                value={customerLabel}
                onChange={setCustomerLabel}
                options={customerOptions.map((o) => o.label)}
                placeholder="Search and select a customer"
                emptyText={customers.length === 0 ? "No customers yet — add one in Our Customers" : "No customers found"}
              />
            </div>
            <label className="field full">
              <span>Address of the Site</span>
              <textarea name="siteAddress" defaultValue={editing?.siteAddress} rows={3} required />
            </label>
          </div>

          <h3 className="form-section">Requirements &amp; Time Period</h3>
          <div className="form-grid">
            <div className="field full">
              <span>Materials Required by the Customer</span>
              <MultiSelect
                required
                value={materialLabels}
                onChange={setMaterialLabels}
                options={materialOptions.map((o) => o.label)}
                placeholder="Search and select materials"
                emptyText={materialList.length === 0 ? "No materials yet — add one in Our Materials" : "No materials found"}
              />
              <small className="field-hint">Pick each material the customer needs. Its stock appears below, where you enter how many go to this site.</small>
            </div>

            {selected.length > 0 && (
              <div className="field full">
                <ul className="material-lines">
                  {selected.map(({ material, quantityText, available, tooMany }) => (
                    <li key={material.id} className="material-line">
                      <div className="material-line-head">
                        <strong>{material.name}</strong>
                        <button
                          type="button"
                          className="material-line-remove"
                          aria-label={`Remove ${material.name}`}
                          onClick={() => setMaterialLabels((labels) => labels.filter((l) => l !== materialOptions.find((o) => o.id === material.id)?.label))}
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>

                      <dl className="material-line-info">
                        <div>
                          <dt>Quantity Available</dt>
                          <dd>
                            {count.format(available)} {material.quantityUnit}
                            {material.elsewhere > 0 && <small className="avail-site"> · {count.format(material.elsewhere)} at another site</small>}
                          </dd>
                        </div>
                      </dl>
                      <label className="material-line-qty">
                        <span>Quantity going to this site</span>
                        <div className="qty-input" data-invalid={tooMany}>
                          <input
                            type="number"
                            min="1"
                            max={available}
                            step="1"
                            inputMode="numeric"
                            required
                            value={quantityText}
                            onChange={(e) => setQuantities((q) => ({ ...q, [material.id]: e.target.value }))}
                            aria-label={`Quantity of ${material.name} going to this site`}
                          />
                          <em>{material.quantityUnit}</em>
                        </div>
                      </label>
                      {tooMany && (
                        <p className="file-error" role="alert">
                          Only {count.format(available)} {material.quantityUnit} available.
                        </p>
                      )}

                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="field full">
              <span>Estimated Time Period</span>
              <div className="period-grid">
                <div className="period-field">
                  <Combobox required value={months} onChange={(v) => { setMonths(v); setPeriodError(""); }} options={MONTH_OPTIONS} placeholder="0" />
                  <em>Months</em>
                </div>
                <div className="period-field">
                  <Combobox required value={days} onChange={(v) => { setDays(v); setPeriodError(""); }} options={DAY_OPTIONS} placeholder="0" />
                  <em>Days</em>
                </div>
              </div>
              {periodError && <p className="file-error" role="alert">{periodError}</p>}
            </div>
            <div className="field">
              <span>Contract Start Date</span>
              {/* No dates in the past. An existing contract that already started keeps its own start date selectable. */}
              {editing?.status === "Deployed" || editing?.status === "Concluded" || editing?.status === "Closed" ? (
                <>
                  <div className="date-static">
                    <span>{editing.startDate.split("-").reverse().join("-")}</span>
                    <CalendarDays size={16} strokeWidth={1.75} />
                  </div>
                  <small className="field-hint">The work has started, so the start date is fixed.</small>
                </>
              ) : (
                <DatePicker
                  name="startDate"
                  defaultValue={editing?.startDate}
                  min={editing?.startDate && editing.startDate < todayISO() ? editing.startDate : todayISO()}
                  required
                  onChange={setStartDate}
                />
              )}
            </div>
            <div className="field">
              <span>Contract End Date</span>
              {startDate ? (
                <DatePicker
                  name="endDate"
                  value={endDate ?? ""}
                  min={startDate}
                  max={contractEndDate(startDate, 60, 30) ?? undefined}
                  placeholder="Set automatically"
                  onChange={(iso) => {
                    // Picking an end date works out the time period (a cleared date leaves it as it is)
                    const period = iso ? periodBetween(startDate, iso) : null;
                    if (!period) return;
                    setMonths(String(period.months));
                    setDays(String(period.days));
                    setPeriodError("");
                  }}
                />
              ) : (
                <div className="date-static">
                  <span className="placeholder">Pick a start date first</span>
                  <CalendarDays size={16} strokeWidth={1.75} />
                </div>
              )}
              <small className="field-hint">Fills in from the start date and time period. Pick a different date to change the time period.</small>
            </div>
          </div>

          <h3 className="form-section">Estimated Costs</h3>
          <div className="form-grid">
            <label className="field">
              <span>Estimated Cost for Transportation</span>
              <MoneyInput name="transportationCost" value={transport} onChange={setTransport} />
            </label>
            <label className="field">
              <span>Estimated Cost For Materials</span>
              <MoneyInput
                name="materialsCost"
                value={materialsCost}
                onChange={setMaterialsCost}
              />
            </label>
            <label className="field">
              <span>Estimated Cost</span>
              <MoneyInput
                name="estimatedCost"
                value={total}
                onChange={(v) => setTotalOverride(v === "" ? null : v)}
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field full">
              <span>Description For Estimation</span>
              <textarea
                name="description"
                defaultValue={editing?.description}
                rows={3}
                maxLength={2000}
                placeholder="Notes about this estimate, for example what the figures are based on"
              />
            </label>
          </div>

          <section className="doc-group">
            <h3 className="form-section">Estimated Cost Month by Month</h3>
            {!billing ? (
              <p className="breakdown-hint">
                Pick a start date, time period and estimated cost to see what each month will cost.
              </p>
            ) : (
              <>
                <ul className="breakdown-list">
                  <li className="breakdown-row breakdown-day">
                    <div className="breakdown-main">
                      <span className="breakdown-title">Cost For A Day</span>
                      <span className="breakdown-meta">
                        ₹{money.format(Number(total))} ÷ {billing.basisDays} days (a month counts as 30 days)
                      </span>
                    </div>
                    <span className="breakdown-amount">₹{money.format(billing.dailyRate)}</span>
                  </li>
                  {billing.periods.map((p) => (
                    <li key={p.label} className="breakdown-row">
                      <div className="breakdown-main">
                        <span className="breakdown-title">Estimated Cost for {p.label}</span>
                        <span className="breakdown-meta">
                          {p.days} days · {formatDate(p.from)} – {formatDate(p.to)}
                        </span>
                      </div>
                      <span className="breakdown-amount">₹{money.format(p.cost)}</span>
                    </li>
                  ))}
                </ul>
                <p className="breakdown-hint">
                  Each full month is charged for its actual number of days.
                  {billedTotal !== Number(total) && (
                    <> The months add up to ₹{money.format(billedTotal)} because of the different month lengths.</>
                  )}
                </p>
              </>
            )}
          </section>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-footer">
          <span className="dialog-hint">The total fills in automatically. Edit it to override.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Contract"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
