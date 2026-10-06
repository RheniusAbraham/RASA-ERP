"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, FileSignature, MapPin, Clock, IndianRupee, CalendarDays, Truck, Boxes, X } from "lucide-react";
import AddContractDialog, { type Contract } from "./AddContractDialog";
import CardActions from "@/components/ui/CardActions";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import { Pencil, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";
import { formatDate } from "@/lib/dates";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const period = (months: number, days: number) =>
  [months ? plural(months, "month") : "", days ? plural(days, "day") : ""].filter(Boolean).join(" ");

export default function ContractsView() {
  const { customers, materials, contracts, addContract, updateContract, deleteContract } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Contract | null>(null);
  const [deleting, setDeleting] = useState<Contract | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Contract) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const [selected, setSelected] = useState<number | null>(null);
  const contract = selected === null ? null : contracts[selected];

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
          <h2 className="section-title">Scaffolding Contract Information</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Scaffolding Contract
          </button>
        </div>

        <LoadErrorNotice />
        {contracts.length === 0 ? (
          <EmptyState>No scaffolding contracts added yet.</EmptyState>
        ) : (
          <ul className="customer-grid">
            {contracts.map((c, i) => (
              <li key={c.id} className="has-actions">
                <motion.button
                  type="button"
                  layoutId={`contract-card-${i}`}
                  className="customer-card"
                  style={cardRadius}
                  onClick={() => setSelected(i)}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  aria-label={`View details for the scaffolding contract with ${c.customerName}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`contract-avatar-${i}`} className="customer-avatar">
                      <FileSignature size={18} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`contract-name-${i}`} className="customer-card-name">
                      {c.customerName}
                    </motion.h3>
                  </div>
                  <dl className="customer-details">
                    <div className="customer-field">
                      <MapPin size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Site</dt><dd className="clamp-2">{c.siteAddress}</dd></div>
                    </div>
                    <div className="customer-field">
                      <Clock size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div>
                        <dt>Time Period</dt>
                        <dd>{period(c.months, c.days)} · from {formatDate(c.startDate)}</dd>
                      </div>
                    </div>
                    <div className="customer-field">
                      <IndianRupee size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div>
                        <dt>Estimated Cost</dt>
                        <dd>₹{money.format(c.estimatedCost)}</dd>
                      </div>
                    </div>
                  </dl>
                </motion.button>
              <CardActions label={`the scaffolding contract with ${c.customerName}`} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddContractDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        customers={customers}
        materials={materials}
        onClose={closeDialog}
        onSubmit={async (c) => {
          if (editing) await updateContract(editing.id, c);
          else await addContract(c);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting ? `Scaffolding contract with ${deleting.customerName}` : null}
        kind="scaffolding contract"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteContract(deleting!.id);
          setDeleting(null);
        }}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {contract && selected !== null && (
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
                  layoutId={`contract-card-${selected}`}
                  className="customer-expanded truck-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Scaffolding contract with ${contract.customerName}`}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`contract-avatar-${selected}`} className="customer-avatar large">
                      <FileSignature size={22} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`contract-name-${selected}`} className="customer-expanded-name">
                      {contract.customerName}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${`the scaffolding contract with ${contract.customerName}`}`} title="Edit" onClick={() => { setSelected(null); openEdit(contract); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${`the scaffolding contract with ${contract.customerName}`}`} title="Delete" onClick={() => { setSelected(null); setDeleting(contract); }}>
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
                      <div className="full">
                        <div className="customer-field">
                          <MapPin size={15} strokeWidth={1.75} className="customer-field-icon" />
                          <div><dt>Address of the Site</dt><dd className="pre-wrap">{contract.siteAddress}</dd></div>
                        </div>
                      </div>
                      <div className="customer-field">
                        <Clock size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Estimated Time Period</dt><dd>{period(contract.months, contract.days)}</dd></div>
                      </div>
                      <div className="customer-field">
                        <CalendarDays size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Contract Start Date</dt><dd>{formatDate(contract.startDate)}</dd></div>
                      </div>
                    </dl>

                    <h4 className="form-section">Materials Required</h4>
                    <div className="chip-row">
                      {contract.materials.map((m) => (
                        <span key={m.id} className="chip chip-static">
                          <Boxes size={12} strokeWidth={2} /> {m.name}
                        </span>
                      ))}
                    </div>

                    <h4 className="form-section">Estimated Costs</h4>
                    <dl className="customer-expanded-details">
                      <div className="customer-field">
                        <Truck size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Transportation</dt><dd>₹{money.format(contract.transportationCost)}</dd></div>
                      </div>
                      <div className="customer-field">
                        <Boxes size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Materials</dt><dd>₹{money.format(contract.materialsCost)}</dd></div>
                      </div>
                      <div className="full">
                        <div className="route-amount route-amount-large">
                          <span className="route-amount-label">
                            <IndianRupee size={14} strokeWidth={1.75} /> Estimated Cost
                          </span>
                          <span className="route-amount-value">₹{money.format(contract.estimatedCost)}</span>
                        </div>
                      </div>
                    </dl>

                    <h4 className="form-section">Estimated Cost Month by Month</h4>
                    <ul className="breakdown-list">
                      {contract.breakdown.map((p) => (
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
