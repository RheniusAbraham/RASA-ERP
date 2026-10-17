"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, CheckCircle2, Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/store";

type WaitingLot = {
  lotId: number;
  materialName: string;
  quantity: number;
  quantityUnit: string;
  note: string | null;
  fromCustomer: string | null;
  daysWaiting: number;
};

/** The bell in the header: lists contracts that need attention, such as one running past its end date. */
export default function NotificationBell() {
  const { contracts, materials } = useData();
  const [waiting, setWaiting] = useState<WaitingLot[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // deployed contracts that are past their end date and have not been concluded
  const overdue = contracts
    .filter((c) => c.status === "Deployed" && (c.extensionElapsedDays ?? 0) > 0)
    .sort((a, b) => (b.extensionElapsedDays ?? 0) - (a.extensionElapsedDays ?? 0));

  const attention = overdue.length + waiting.length;

  // free units that have waited at another site for a week or more
  useEffect(() => {
    let current = true;
    api
      .get<WaitingLot[]>("/materials/lots/waiting")
      .then((rows) => current && setWaiting(rows.filter((r) => r.daysWaiting >= 7)))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [contracts, materials]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="bell-wrap" ref={ref}>
      <button
        type="button"
        className="header-icon"
        aria-label={attention > 0 ? `Notifications: ${attention} need attention` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} />
        {attention > 0 && <span className="bell-badge">{attention}</span>}
      </button>

      <div className="bell-panel" data-open={open} role="dialog" aria-label="Notifications" aria-hidden={!open}>
        <h3 className="bell-title">Needs attention</h3>
        {attention === 0 ? (
          <p className="bell-empty">
            <CheckCircle2 size={16} strokeWidth={1.75} /> Nothing needs your attention.
          </p>
        ) : (
          <ul className="bell-list">
            {overdue.map((c) => (
              <li key={c.id}>
                <Link href="/manage-contracts" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="bell-item" data-paused={c.extensionPaused}>
                  <span className="bell-item-icon" aria-hidden>
                    <CalendarClock size={16} strokeWidth={1.75} />
                  </span>
                  <span className="bell-item-text">
                    <strong>{c.customerName}</strong>
                    <small>
                      {c.extensionElapsedDays} day{c.extensionElapsedDays === 1 ? "" : "s"} past its end date and not concluded.
                      {c.extensionPaused ? " Charging is paused until you confirm." : " Has the work finished?"}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
            {waiting.map((l) => (
              <li key={`lot-${l.lotId}`}>
                <Link href="/materials" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="bell-item" data-paused="false">
                  <span className="bell-item-icon" aria-hidden>
                    <Hourglass size={16} strokeWidth={1.75} />
                  </span>
                  <span className="bell-item-text">
                    <strong>
                      {l.quantity} {l.quantityUnit} of {l.materialName}
                    </strong>
                    <small>
                      {l.note ? `At ${l.note}` : l.fromCustomer ? `Left at the site of ${l.fromCustomer}` : "At another site"}: waiting {l.daysWaiting} days with no contract to use
                      them. Assign them or bring them to the yard.
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
