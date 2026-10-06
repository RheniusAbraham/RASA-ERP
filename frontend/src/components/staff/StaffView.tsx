"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus,
  Hash,
  Briefcase,
  Phone,
  Building2,
  BadgeCheck,
  Cake,
  CalendarDays,
  Mail,
  MapPin,
  Fingerprint,
  Laptop,
  AtSign,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import AddStaffDialog, { type Staff } from "./AddStaffDialog";
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

function Avatar({ staff }: { staff: Staff }) {
  return staff.files.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileHref(staff.files.photo.url)} alt="" />
  ) : (
    <>{staff.name.charAt(0).toUpperCase()}</>
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

export default function StaffView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Staff | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Staff) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const { staff, addStaff, updateStaff, deleteStaff } = useData();
  const [selected, setSelected] = useState<number | null>(null);
  const member = selected === null ? null : staff[selected];

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
          <h2 className="section-title">Our Staff Information</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Staff
          </button>
        </div>

        <LoadErrorNotice />
        {staff.length === 0 ? (
          <EmptyState>No staff added yet.</EmptyState>
        ) : (
          <ul className="customer-grid">
            {staff.map((s, i) => (
              <li key={s.id} className="has-actions">
                <motion.button
                  type="button"
                  layoutId={`staff-card-${i}`}
                  className="customer-card"
                  style={cardRadius}
                  onClick={() => setSelected(i)}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  aria-label={`View details for ${s.name}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`staff-avatar-${i}`} className="customer-avatar">
                      <Avatar staff={s} />
                    </motion.span>
                    <motion.h3 layoutId={`staff-name-${i}`} className="customer-card-name">
                      {s.name}
                    </motion.h3>
                  </div>
                  <dl className="customer-details">
                    <Detail icon={Hash} label="Staff ID" value={s.staffId} />
                    <Detail icon={Briefcase} label="Department · Designation" value={`${s.department} · ${s.designation}`} />
                    <Detail icon={Phone} label="Contact Number" value={s.contactNumber} />
                  </dl>
                </motion.button>
              <CardActions label={s.name} onEdit={() => openEdit(s)} onDelete={() => setDeleting(s)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddStaffDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={async (s, files) => {
          if (editing) await updateStaff(editing.id, s, files);
          else await addStaff(s, files);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting?.name ?? null}
        kind="staff member"
        warning="Their login and uploaded documents will be deleted too."
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteStaff(deleting!.id);
          setDeleting(null);
        }}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {member && selected !== null && (
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
                  layoutId={`staff-card-${selected}`}
                  className="customer-expanded truck-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={member.name}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`staff-avatar-${selected}`} className="customer-avatar large">
                      <Avatar staff={member} />
                    </motion.span>
                    <motion.h3 layoutId={`staff-name-${selected}`} className="customer-expanded-name">
                      {member.name}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${member.name}`} title="Edit" onClick={() => { setSelected(null); openEdit(member); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${member.name}`} title="Delete" onClick={() => { setSelected(null); setDeleting(member); }}>
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
                      <Detail icon={Hash} label="Staff ID" value={member.staffId} />
                      <Detail icon={Phone} label="Contact Number" value={member.contactNumber} />
                      <Detail icon={Building2} label="Department" value={member.department} />
                      <Detail icon={Briefcase} label="Designation" value={member.designation} />
                      <Detail icon={Cake} label="Date of Birth" value={formatDate(member.dateOfBirth)} />
                      <Detail icon={CalendarDays} label="Date of Joining" value={formatDate(member.dateOfJoining)} />
                      <div className="full">
                        <Detail icon={Mail} label="Email" value={member.email} />
                      </div>
                      <div className="full">
                        <Detail icon={MapPin} label="Address" value={member.address} />
                      </div>
                    </dl>

                    <h4 className="form-section">Software Access</h4>
                    <dl className="customer-expanded-details">
                      <Detail icon={Laptop} label="Software Designation" value={member.softwareDesignation} />
                      <Detail icon={AtSign} label="Username" value={member.username} />
                    </dl>

                    <h4 className="form-section">Identity Proof</h4>
                    <dl className="customer-expanded-details">
                      <Detail icon={Fingerprint} label="Aadhar Number" value={member.aadharNumber} />
                    </dl>
                    <ul className="doc-list" style={{ marginTop: "1rem" }}>
                      <li className="doc-row">
                        <div className="doc-row-main">
                          <span className="doc-row-title">
                            <BadgeCheck size={14} strokeWidth={1.75} style={{ display: "inline", marginRight: 6 }} />
                            Aadhar Card
                          </span>
                          <span className="doc-row-meta">{member.files.aadharCard ? member.files.aadharCard.filename : "Not uploaded"}</span>
                        </div>
                        {member.files.aadharCard && (
                          <button type="button" className="doc-view" onClick={() => openFile(member.files.aadharCard!.url)}>
                            View <ExternalLink size={13} strokeWidth={1.75} />
                          </button>
                        )}
                      </li>
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
