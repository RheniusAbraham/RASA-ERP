"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Boxes, IndianRupee, Package, Ruler, StickyNote, X } from "lucide-react";
import AddMaterialDialog, { type Material } from "./AddMaterialDialog";
import CardActions from "@/components/ui/CardActions";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import { Pencil, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

export default function MaterialsView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Material) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const { materials, addMaterial, updateMaterial, deleteMaterial } = useData();
  const [selected, setSelected] = useState<number | null>(null);
  const material = selected === null ? null : materials[selected];

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
          <h2 className="section-title">Our Material Information</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Material
          </button>
        </div>

        <LoadErrorNotice />
        {materials.length === 0 ? (
          <EmptyState>No materials added yet.</EmptyState>
        ) : (
          <ul className="customer-grid">
            {materials.map((m, i) => (
              <li key={m.id} className="has-actions">
                <motion.button
                  type="button"
                  layoutId={`material-card-${i}`}
                  className="customer-card"
                  style={cardRadius}
                  onClick={() => setSelected(i)}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  aria-label={`View details for ${m.name}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`material-avatar-${i}`} className="customer-avatar">
                      <Boxes size={18} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`material-name-${i}`} className="customer-card-name">
                      {m.name}
                    </motion.h3>
                  </div>
                  <dl className="customer-details">
                    <div className="customer-field">
                      <IndianRupee size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Cost For a Piece</dt><dd>₹{money.format(m.costPerPiece)}</dd></div>
                    </div>
                    <div className="customer-field">
                      <Package size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Total Quantity Owned</dt><dd>{count.format(m.totalQuantityOwned)} pcs</dd></div>
                    </div>
                    <div className="customer-field">
                      <Ruler size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Structural Description</dt><dd className="clamp-2">{m.structuralDescription}</dd></div>
                    </div>
                  </dl>
                </motion.button>
              <CardActions label={m.name} onEdit={() => openEdit(m)} onDelete={() => setDeleting(m)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddMaterialDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={async (m) => {
          if (editing) await updateMaterial(editing.id, m);
          else await addMaterial(m);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting?.name ?? null}
        kind="material"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteMaterial(deleting!.id);
          setDeleting(null);
        }}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {material && selected !== null && (
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
                  layoutId={`material-card-${selected}`}
                  className="customer-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={material.name}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`material-avatar-${selected}`} className="customer-avatar large">
                      <Boxes size={22} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`material-name-${selected}`} className="customer-expanded-name">
                      {material.name}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${material.name}`} title="Edit" onClick={() => { setSelected(null); openEdit(material); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${material.name}`} title="Delete" onClick={() => { setSelected(null); setDeleting(material); }}>
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
                    <div className="customer-field">
                      <IndianRupee size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Cost For a Piece</dt><dd>₹{money.format(material.costPerPiece)}</dd></div>
                    </div>
                    <div className="customer-field">
                      <Package size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div><dt>Total Quantity Owned</dt><dd>{count.format(material.totalQuantityOwned)} pcs</dd></div>
                    </div>
                    <div className="full">
                      <div className="customer-field">
                        <Ruler size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Structural Description</dt><dd className="pre-wrap">{material.structuralDescription}</dd></div>
                      </div>
                    </div>
                    <div className="full">
                      <div className="customer-field">
                        <StickyNote size={15} strokeWidth={1.75} className="customer-field-icon" />
                        <div><dt>Additional Information</dt><dd className="pre-wrap">{material.additionalInformation || "—"}</dd></div>
                      </div>
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
