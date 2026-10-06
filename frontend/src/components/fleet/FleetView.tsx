"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Truck as TruckIcon, Factory, CircleDot, Fuel, Gauge, Hash, ExternalLink, X } from "lucide-react";
import AddTruckDialog, { type Truck } from "./AddTruckDialog";
import CardActions from "@/components/ui/CardActions";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import { Pencil, Trash2 } from "lucide-react";
import { openFile } from "@/lib/files";
import { daysUntil, formatDate } from "@/lib/dates";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";
import { DOCUMENTS } from "@/lib/fleet-options";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { TyreLayoutDiagram } from "./TyreLayoutDiagram";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function validityStatus(iso: string) {
  const days = daysUntil(iso);
  if (days < 0) return { label: "Expired", tone: "expired" };
  if (days === 0) return { label: "Expires today", tone: "soon" };
  if (days <= 30) return { label: `${days}d left`, tone: "soon" };
  return { label: "Valid", tone: "valid" };
}

export default function FleetView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Truck | null>(null);
  const [deleting, setDeleting] = useState<Truck | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Truck) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const { trucks, addTruck, updateTruck, deleteTruck } = useData();
  const [selected, setSelected] = useState<number | null>(null);
  const truck = selected === null ? null : trucks[selected];

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <>
      <section className="bento-card section-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="section-header">
          <h2 className="section-title">Our Fleet</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Truck
          </button>
        </div>

        <LoadErrorNotice />
        {trucks.length === 0 ? (
          <EmptyState>No trucks added yet.</EmptyState>
        ) : (
          <ul className="customer-grid">
            {trucks.map((t, i) => (
              <li key={t.id} className="has-actions">
                <motion.button
                  type="button"
                  layoutId={`truck-card-${i}`}
                  className="customer-card"
                  style={cardRadius}
                  onClick={() => setSelected(i)}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  aria-label={`View details for ${t.registrationNumber}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`truck-avatar-${i}`} className="customer-avatar">
                      <TruckIcon size={18} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`truck-name-${i}`} className="customer-card-name">
                      {t.registrationNumber}
                    </motion.h3>
                  </div>
                  <dl className="customer-details">
                    <div className="customer-field">
                      <Factory size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div>
                        <dt>Manufacturer &amp; Model</dt>
                        <dd>{t.manufacturer} {t.modelName}</dd>
                      </div>
                    </div>
                    <div className="customer-field">
                      <TruckIcon size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div>
                        <dt>Truck Type · Year</dt>
                        <dd>{t.truckType} · {t.yearOfManufacture}</dd>
                      </div>
                    </div>
                  </dl>
                </motion.button>
              <CardActions label={t.registrationNumber} onEdit={() => openEdit(t)} onDelete={() => setDeleting(t)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddTruckDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={async (t, proofs) => {
          if (editing) await updateTruck(editing.id, t, proofs);
          else await addTruck(t, proofs);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting?.registrationNumber ?? null}
        kind="truck"
        warning="Its documents will be deleted too."
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteTruck(deleting!.id);
          setDeleting(null);
        }}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {truck && selected !== null && (
              <div className="customer-overlay" key="overlay">
                <motion.div
                  className="customer-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setSelected(null)}
                />
                <motion.div
                  layoutId={`truck-card-${selected}`}
                  className="customer-expanded truck-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={truck.registrationNumber}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`truck-avatar-${selected}`} className="customer-avatar large">
                      <TruckIcon size={22} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`truck-name-${selected}`} className="customer-expanded-name">
                      {truck.registrationNumber}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${truck.registrationNumber}`} title="Edit" onClick={() => { setSelected(null); openEdit(truck); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${truck.registrationNumber}`} title="Delete" onClick={() => { setSelected(null); setDeleting(truck); }}>
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                    <motion.button
                      type="button"
                      className="header-icon dialog-close"
                      aria-label="Close"
                      onClick={() => setSelected(null)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: 0.15 } }}
                      exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    >
                      <X size={16} strokeWidth={1.75} />
                    </motion.button>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.12, duration: 0.3 } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    <dl className="customer-expanded-details">
                      <Detail icon={Factory} label="Manufacturer" value={truck.manufacturer} />
                      <Detail icon={TruckIcon} label="Model Name" value={truck.modelName} />
                      <Detail icon={Hash} label="Chassis Number" value={truck.chassisNumber} />
                      <Detail icon={TruckIcon} label="Year of Manufacture" value={String(truck.yearOfManufacture)} />
                      <Detail icon={TruckIcon} label="Truck Type" value={truck.truckType} />
                      <Detail icon={CircleDot} label="Tyre Layout" value={getTyreLayout(truck.tyreLayout)?.label ?? truck.tyreLayout} />
                      <Detail icon={Gauge} label="Odometer During Purchase" value={`${money.format(truck.odometer)} km`} />
                      <Detail icon={Fuel} label="Fuel Capacity" value={`${money.format(truck.fuelCapacity)} L`} />
                    </dl>

                    {getTyreLayout(truck.tyreLayout) && (
                      <>
                        <h4 className="form-section">Tyre Layout</h4>
                        <TyreLayoutDiagram layout={getTyreLayout(truck.tyreLayout)!} />
                      </>
                    )}

                    <h4 className="form-section">Documents</h4>
                    <ul className="doc-list">
                      {DOCUMENTS.map((cfg) => {
                        const d = truck.documents[cfg.key];
                        const status = validityStatus(d.validity);
                        return (
                          <li key={cfg.key} className="doc-row">
                            <div className="doc-row-main">
                              <span className="doc-row-title">{cfg.title}</span>
                              <span className="doc-row-meta">
                                {d.number ? `${d.number} · ` : ""}
                                Valid till {formatDate(d.validity)} · ₹{money.format(d.expense)}
                              </span>
                            </div>
                            <span className={`status-chip ${status.tone}`}>{status.label}</span>
                            {d.file && (
                              <button type="button" className="doc-view" onClick={() => openFile(d.file!.url)}>
                                View <ExternalLink size={13} strokeWidth={1.75} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Factory; label: string; value: string }) {
  return (
    <div className="customer-field">
      <Icon size={15} strokeWidth={1.75} className="customer-field-icon" />
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}
