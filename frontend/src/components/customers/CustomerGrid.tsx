"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Phone, UserRound, FileText, Mail, MapPin, X, type LucideIcon } from "lucide-react";
import type { Customer } from "./AddCustomerDialog";
import CardActions from "@/components/ui/CardActions";
import { Pencil, Trash2 } from "lucide-react";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };

function Field({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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

export default function CustomerGrid({
  customers,
  onEdit,
  onDelete,
}: {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  const openEdit = onEdit;
  const setDeleting = onDelete;
  const [selected, setSelected] = useState<number | null>(null);
  const customer = selected === null ? null : customers[selected];

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
      <ul className="customer-grid">
        {customers.map((c, i) => (
          <li key={c.id} className="has-actions">
            <motion.button
              type="button"
              layoutId={`customer-card-${i}`}
              className="customer-card"
              style={cardRadius}
              onClick={() => setSelected(i)}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              aria-label={`View details for ${c.name}`}
            >
              <div className="customer-card-head">
                <motion.span layoutId={`customer-avatar-${i}`} className="customer-avatar">
                  {c.name.charAt(0).toUpperCase()}
                </motion.span>
                <motion.h3 layoutId={`customer-name-${i}`} className="customer-card-name">
                  {c.name}
                </motion.h3>
              </div>
              <dl className="customer-details">
                <Field icon={Phone} label="Phone Number" value={c.phone} />
                <Field icon={UserRound} label="Contact Personnel" value={c.contactPerson} />
              </dl>
            </motion.button>
          <CardActions label={c.name} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
          </li>
        ))}
      </ul>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {customer && selected !== null && (
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
                  layoutId={`customer-card-${selected}`}
                  className="customer-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={customer.name}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`customer-avatar-${selected}`} className="customer-avatar large">
                      {customer.name.charAt(0).toUpperCase()}
                    </motion.span>
                    <motion.h3 layoutId={`customer-name-${selected}`} className="customer-expanded-name">
                      {customer.name}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${customer.name}`} title="Edit" onClick={() => { setSelected(null); openEdit(customer); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${customer.name}`} title="Delete" onClick={() => { setSelected(null); setDeleting(customer); }}>
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

                  <motion.dl
                    className="customer-expanded-details"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.12, duration: 0.3 } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    <Field icon={Phone} label="Phone Number" value={customer.phone} />
                    <Field icon={UserRound} label="Contact Personnel" value={customer.contactPerson} />
                    <Field icon={FileText} label="GST Number" value={customer.gst} />
                    <Field icon={Mail} label="Email" value={customer.email} />
                    <div className="full">
                      <Field icon={MapPin} label="Address" value={customer.address} />
                    </div>
                  </motion.dl>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
