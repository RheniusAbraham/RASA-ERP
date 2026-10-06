"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import DatePicker from "@/components/ui/DatePicker";
import MultiSelect from "@/components/ui/MultiSelect";
import { computeBreakdown, type BillingPeriod } from "@/lib/contract-billing";
import { formatDate } from "@/lib/dates";

export type ContractInput = {
  customerId: number;
  siteAddress: string;
  materialIds: number[];
  startDate: string;
  months: number;
  days: number;
  transportationCost: number;
  materialsCost: number;
  estimatedCost: number;
};

/** A contract as stored by the backend */
export type Contract = Omit<ContractInput, "materialIds"> & {
  id: number;
  customerName: string;
  materials: { id: number; name: string }[];
  /** Estimated cost / (months x 30 + days) */
  dailyRate: number | null;
  /** Cost split month by month, using the real days in each contract month */
  breakdown: BillingPeriod[];
};

type Props = {
  open: boolean;
  /** Set to edit an existing record instead of adding a new one */
  editing?: Contract | null;
  customers: { id: number; name: string; phone: string }[];
  materials: { id: number; name: string }[];
  onClose: () => void;
  /** Reject (throw) to keep the dialog open and show the message */
  onSubmit: (contract: ContractInput) => Promise<void> | void;
};

const MONTH_OPTIONS = Array.from({ length: 61 }, (_, i) => String(i)); // 0–60 months
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i)); // 0–30 days

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

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
  return items.map((item) => ({ id: item.id, label: (counts.get(item.name) ?? 0) > 1 ? `${item.name} · ${extra(item)}` : item.name }));
}

export default function AddContractDialog({ open, editing, customers, materials: materialList, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);

  const customerOptions = labelled(customers, (c) => c.phone);
  const materialOptions = labelled(materialList, (m) => `#${m.id}`);
  const [customerLabel, setCustomerLabel] = useState(
    () => customerOptions.find((o) => o.id === editing?.customerId)?.label ?? "",
  );
  const [materialLabels, setMaterialLabels] = useState<string[]>(() =>
    materialOptions.filter((o) => editing?.materials.some((m) => m.id === o.id)).map((o) => o.label),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [months, setMonths] = useState(String(editing?.months ?? 0));
  const [days, setDays] = useState(String(editing?.days ?? 0));
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [periodError, setPeriodError] = useState("");

  const [transport, setTransport] = useState(editing ? String(editing.transportationCost) : "");
  const [materialsCost, setMaterialsCost] = useState(editing ? String(editing.materialsCost) : "");
  // The total fills itself in until the user types their own figure
  const [totalOverride, setTotalOverride] = useState<string | null>(() =>
    editing && editing.estimatedCost !== round2(editing.transportationCost + editing.materialsCost) ? String(editing.estimatedCost) : null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const periodDays = Number(months) * 30 + Number(days);
  const computedTotal = transport === "" && materialsCost === "" ? "" : String(round2((Number(transport) || 0) + (Number(materialsCost) || 0)));
  const total = totalOverride ?? computedTotal;
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
    const materialIds = materialLabels.flatMap((label) => materialOptions.filter((o) => o.label === label).map((o) => o.id));
    if (!customer || materialIds.length === 0) return;
    const data = new FormData(e.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        customerId: customer.id,
        siteAddress: String(data.get("siteAddress") ?? "").trim(),
        materialIds,
        startDate,
        months: Number(months),
        days: Number(days),
        transportationCost: Number(transport),
        materialsCost: Number(materialsCost),
        estimatedCost: Number(total),
      });
      // Remount the form so every field starts empty next time
      setFormKey((k) => k + 1);
      setCustomerLabel("");
      setMaterialLabels([]);
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
          <h2 className="dialog-title">{editing ? "Edit Scaffolding Contract" : "Add Scaffolding Contract"}</h2>
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
            </div>
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
              <DatePicker name="startDate" defaultValue={editing?.startDate} required onChange={setStartDate} />
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
              <MoneyInput name="materialsCost" value={materialsCost} onChange={setMaterialsCost} />
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

          <section className="doc-group">
            <h3 className="form-section">Estimated Cost Month by Month</h3>
            {!billing ? (
              <p className="breakdown-hint">
                Pick a start date, time period and estimated cost to see what each month will cost.
              </p>
            ) : (
              <>
                <ul className="breakdown-list">
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
                  Daily rate ₹{money.format(billing.dailyRate)} (₹{money.format(Number(total))} ÷ {billing.basisDays} days, counting a month as 30 days).
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
          <span className="dialog-hint">Estimated Cost fills in automatically. Edit it to override.</span>
          <div className="dialog-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add Scaffolding Contract"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
