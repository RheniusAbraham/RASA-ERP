"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Hourglass, MapPin, SlidersHorizontal, Warehouse } from "lucide-react";
import StockActionDialog from "./StockActionDialog";
import { api } from "@/lib/api";
import { daysUntil, formatDate, localDateFromUtc } from "@/lib/dates";
import { useData } from "@/lib/store";
import type { Distribution, StockActionInput, StockActionName } from "@/lib/stock";

const count = new Intl.NumberFormat("en-IN");

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** A short, status-aware note about timing: when it starts, when the stock comes back, or that it is late. */
function timingNote(c: Distribution["contracts"][number]): { text: string; tone: "ok" | "warn" | "danger" } {
  if (c.status === "Estimated") {
    const d = daysUntil(c.startDate);
    if (d > 1) return { text: `Starts in ${days(d)}`, tone: "ok" };
    if (d === 1) return { text: "Starts tomorrow", tone: "ok" };
    if (d === 0) return { text: "Starts today", tone: "ok" };
    return { text: "Start date passed", tone: "warn" };
  }
  if (c.status === "Dispatched") {
    const sent = c.dispatchedAt ? `Dispatched ${formatDate(c.dispatchedAt.slice(0, 10))}` : "Dispatched";
    return daysUntil(c.startDate) < 0 ? { text: `${sent} · not deployed yet`, tone: "warn" } : { text: sent, tone: "ok" };
  }
  const left = daysUntil(c.endDate);
  if (left > 0) return { text: `${days(left)} left`, tone: "ok" };
  if (left === 0) return { text: "Ends today", tone: "warn" };
  return { text: `Overdue by ${days(-left)}`, tone: "danger" };
}

/** Where the stock of one material is: the buckets, units waiting at other sites, who holds how many, and the history. */
export default function MaterialDistribution({ materialId }: { materialId: number }) {
  const { contracts, materials, stockAction } = useData();
  const [data, setData] = useState<Distribution | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<{ action: StockActionName; lotId?: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Read again whenever a contract or the material's stock changes
  useEffect(() => {
    let current = true;
    api
      .get<Distribution>(`/materials/${materialId}/distribution`)
      .then((d) => {
        if (!current) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [materialId, contracts, materials]);

  if (failed) return <p className="breakdown-hint">Could not load where this stock is.</p>;
  if (!data) return <p className="breakdown-hint">Loading…</p>;

  const unit = data.quantityUnit;
  const open = (action: StockActionName, lotId?: number) => {
    setDialog({ action, lotId });
    setDialogOpen(true);
  };

  return (
    <>
      <div className="stock-toolbar">
        <button type="button" className="btn btn-secondary" onClick={() => open(data.damaged > 0 ? "repair" : data.lots.length > 0 ? "lot-to-yard" : "mark-damaged")}>
          <SlidersHorizontal size={14} strokeWidth={1.75} /> Correct Stock
        </button>
      </div>

      <div className="stock-tiles stock-tiles-6">
        <div>
          <span>Total Owned</span>
          <strong>{count.format(data.totalOwned)} {unit}</strong>
        </div>
        <div>
          <span>In Use</span>
          <strong>{count.format(data.inUse)} {unit}</strong>
        </div>
        <div data-low={data.available === 0} data-good={data.available > 0}>
          <span>Available (Yard)</span>
          <strong>{count.format(data.available)} {unit}</strong>
        </div>
        <div data-tone="site">
          <span>At Another Site</span>
          <strong>{count.format(data.elsewhere)} {unit}</strong>
        </div>
        <div data-tone="damaged">
          <span>Damaged</span>
          <strong>{count.format(data.damaged)} {unit}</strong>
          {data.damaged > 0 && (
            <span className="stock-tile-actions">
              <button type="button" onClick={() => open("repair")}>Repaired</button>
              <button type="button" onClick={() => open("write-off-damaged")}>Write off</button>
            </span>
          )}
        </div>
        <div data-tone="lost">
          <span>Lost</span>
          <strong>{count.format(data.lost)} {unit}</strong>
        </div>
      </div>

      {data.lots.length > 0 && (
        <>
          <h4 className="form-section">Waiting At Another Site</h4>
          <ul className="lot-list">
            {data.lots.map((l) => (
              <li key={l.id} className="lot-row" data-stale={l.daysWaiting >= 7}>
                <span className="lot-icon" aria-hidden>
                  <Hourglass size={16} strokeWidth={1.75} />
                </span>
                <div className="lot-main">
                  <strong>
                    {count.format(l.quantity)} {unit} · {l.note || "another site"}
                  </strong>
                  <small>
                    {l.fromCustomer ? `from ${l.fromCustomer} · ` : ""}waiting {days(l.daysWaiting)}
                  </small>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => open("lot-to-yard", l.id)}>
                  <Warehouse size={14} strokeWidth={1.75} /> Bring to yard
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="form-section">Contracts</h4>
      {data.contracts.length === 0 ? (
        <p className="breakdown-hint">Not assigned to any contract yet.</p>
      ) : (
        <ul className="stock-list">
          {data.contracts.map((c, i) => (
            <li key={c.contractId} className="stock-row" data-closed={!c.holding} style={{ "--i": i } as React.CSSProperties}>
              <span className="stock-avatar" aria-hidden>{c.customerName.trim().charAt(0).toUpperCase()}</span>
              <div className="stock-row-main">
                <div className="stock-row-top">
                  <span className="stock-row-customer">{c.customerName}</span>
                  <span className="status-pill" data-status={c.status}>{c.status}</span>
                </div>
                <span className="stock-row-site">
                  <MapPin size={13} strokeWidth={1.75} /> {c.siteAddress}
                </span>
                {c.holding && c.startDate && c.endDate ? (
                  <div className="stock-when">
                    <span className="stock-dates">
                      <CalendarDays size={13} strokeWidth={1.75} /> {formatDate(c.startDate)} → {formatDate(c.endDate)}
                    </span>
                    <span className="stock-note" data-tone={timingNote(c).tone}>{timingNote(c).text}</span>
                  </div>
                ) : (
                  c.retrievedIntact !== null && (
                    <div className="stock-when">
                      <span className="stock-dates">
                        {count.format(c.retrievedIntact)} intact{c.returnDestination === "Moved to Another Site" ? " moved on" : " to the yard"} ·{" "}
                        {count.format(c.retrievedDamaged ?? 0)} damaged ·{" "}
                        {count.format(Math.max((c.dispatchedQuantity ?? c.plannedQuantity) - c.retrievedIntact - (c.retrievedDamaged ?? 0), 0))} lost
                      </span>
                    </div>
                  )
                )}
              </div>
              <div className="stock-row-side">
                <strong>{count.format(c.quantity)}</strong>
                <span className="stock-unit">{unit}</span>
                {c.dispatchedQuantity !== null && <small>of {count.format(c.plannedQuantity)} planned</small>}
                {!c.holding && <small>returned</small>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.movements.length > 0 && (
        <details className="stock-history">
          <summary>Stock history ({data.movements.length})</summary>
          <ul>
            {data.movements.map((m) => (
              <li key={m.id}>
                <strong>
                  {m.kind} · {count.format(m.quantity)} {unit}
                </strong>
                <small>
                  {formatDate(localDateFromUtc(m.createdAt))}
                  {m.customerName ? ` · ${m.customerName}` : ""}
                  {m.reason ? ` · ${m.reason}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog && (
        <StockActionDialog
          key={`${dialog.action}-${dialog.lotId ?? 0}`}
          open={dialogOpen}
          data={data}
          initial={dialog.action}
          initialLotId={dialog.lotId}
          onClose={() => setDialogOpen(false)}
          onSubmit={async (input: StockActionInput) => {
            setData(await stockAction(materialId, input));
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
