"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import CustomerGrid from "./CustomerGrid";
import AddCustomerDialog, { type Customer } from "./AddCustomerDialog";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";

export default function CustomersView() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  // editing = the record being edited (null when adding); deleting = the one awaiting confirmation
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (record: Customer) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <>
      <section className="bento-card section-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="section-header">
          <h2 className="section-title">Our Customer Information</h2>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add Customer
          </button>
        </div>

        <LoadErrorNotice />
        {customers.length === 0 ? (
          <EmptyState>No customers added yet.</EmptyState>
        ) : (
          <CustomerGrid customers={customers} onEdit={openEdit} onDelete={setDeleting} />
        )}
      </section>

      <AddCustomerDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={async (c) => {
          if (editing) await updateCustomer(editing.id, c);
          else await addCustomer(c);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting?.name ?? null}
        kind="customer"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteCustomer(deleting!.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
