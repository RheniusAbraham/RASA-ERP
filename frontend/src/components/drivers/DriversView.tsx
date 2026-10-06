"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus,
  Phone,
  IdCard,
  CalendarDays,
  Cake,
  Fingerprint,
  Landmark,
  Building2,
  Hash,
  Binary,
  MapPin,
  IndianRupee,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import AddDriverDialog, { type Driver } from "./AddDriverDialog";
import CardActions from "@/components/ui/CardActions";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import { Pencil, Trash2 } from "lucide-react";
import { fileHref } from "@/lib/api";
import { openFile } from "@/lib/files";
import { formatDate } from "@/lib/dates";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function Avatar({ driver }: { driver: Driver }) {
  return driver.files.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileHref(driver.files.photo.url)} alt="" />
  ) : (
    <>{driver.name.charAt(0).toUpperCase()}</>
  );
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="customer-field">
      <Icon size={15} strokeWidth={1.75} className="customer-field-icon" />
      <div>
        <dt>{label}</dt>
        <dd>{value || "—"}</dd>
      </div>
    </div>
  );
}

export default function DriversView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState<Driver | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Driver) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const { drivers, addDriver, updateDriver, deleteDriver } = useData();
  const [selected, setSelected] = useState<number | null>(null);
  const driver = selected === null ? null : drivers[selected];

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
          <h2 className="section-title">Our Driver Information</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Driver
          </button>
        </div>

        <LoadErrorNotice />
        {drivers.length === 0 ? (
          <EmptyState>No drivers added yet.</EmptyState>
        ) : (
          <ul className="customer-grid">
            {drivers.map((d, i) => (
              <li key={d.id} className="has-actions">
                <motion.button
                  type="button"
                  layoutId={`driver-card-${i}`}
                  className="customer-card"
                  style={cardRadius}
                  onClick={() => setSelected(i)}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  aria-label={`View details for ${d.name}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`driver-avatar-${i}`} className="customer-avatar">
                      <Avatar driver={d} />
                    </motion.span>
                    <motion.h3 layoutId={`driver-name-${i}`} className="customer-card-name">
                      {d.name}
                    </motion.h3>
                  </div>
                  <dl className="customer-details">
                    <Detail icon={Phone} label="Phone Number" value={d.phone} />
                    <Detail icon={IdCard} label="License Number" value={d.licenseNumber} />
                    <Detail icon={CalendarDays} label="Date of Joining" value={formatDate(d.dateOfJoining)} />
                  </dl>
                </motion.button>
              <CardActions label={d.name} onEdit={() => openEdit(d)} onDelete={() => setDeleting(d)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddDriverDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={async (d, files) => {
          if (editing) await updateDriver(editing.id, d, files);
          else await addDriver(d, files);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting?.name ?? null}
        kind="driver"
        warning="Their uploaded documents will be deleted too."
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteDriver(deleting!.id);
          setDeleting(null);
        }}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {driver && selected !== null && (
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
                  layoutId={`driver-card-${selected}`}
                  className="customer-expanded truck-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={driver.name}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`driver-avatar-${selected}`} className="customer-avatar large">
                      <Avatar driver={driver} />
                    </motion.span>
                    <motion.h3 layoutId={`driver-name-${selected}`} className="customer-expanded-name">
                      {driver.name}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${driver.name}`} title="Edit" onClick={() => { setSelected(null); openEdit(driver); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${driver.name}`} title="Delete" onClick={() => { setSelected(null); setDeleting(driver); }}>
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
                      <Detail icon={Phone} label="Phone Number" value={driver.phone} />
                      <Detail icon={IdCard} label="License Number" value={driver.licenseNumber} />
                      <Detail icon={Fingerprint} label="Aadhaar Number" value={driver.aadhaarNumber} />
                      <Detail icon={IndianRupee} label="Fixed Hire Amount" value={`₹${money.format(driver.fixedHireAmount)}`} />
                      <Detail icon={Cake} label="Date of Birth" value={formatDate(driver.dateOfBirth)} />
                      <Detail icon={CalendarDays} label="Date of Joining" value={formatDate(driver.dateOfJoining)} />
                      <div className="full">
                        <Detail icon={MapPin} label="Address" value={driver.address} />
                      </div>
                    </dl>

                    <h4 className="form-section">Bank Details</h4>
                    <dl className="customer-expanded-details">
                      <Detail icon={Landmark} label="Bank Name" value={driver.bankName} />
                      <Detail icon={Building2} label="Branch" value={driver.branchName} />
                      <Detail icon={Hash} label="Account Number" value={driver.accountNumber} />
                      <Detail icon={Binary} label="IFSC Code" value={driver.ifscCode} />
                    </dl>

                    <h4 className="form-section">Documents</h4>
                    <ul className="doc-list">
                      {[
                        { title: "Aadhaar Proof", file: driver.files.aadhaarProof },
                        { title: "License Proof", file: driver.files.licenseProof },
                      ].map(({ title, file }) => (
                        <li key={title} className="doc-row">
                          <div className="doc-row-main">
                            <span className="doc-row-title">{title}</span>
                            <span className="doc-row-meta">{file ? file.filename : "Not uploaded"}</span>
                          </div>
                          {file && (
                            <button type="button" className="doc-view" onClick={() => openFile(file.url)}>
                              View <ExternalLink size={13} strokeWidth={1.75} />
                            </button>
                          )}
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
