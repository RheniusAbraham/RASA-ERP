"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, FileSignature, Send, Hammer, CheckCheck, Lock, MapPin, Clock, IndianRupee, Boxes, X } from "lucide-react";
import AddContractDialog, { type Contract } from "./AddContractDialog";
import SlideToConfirm from "@/components/ui/SlideToConfirm";
import DispatchDialog from "./DispatchDialog";
import EarlyStartDialog from "./EarlyStartDialog";
import ConcludeDialog from "./ConcludeDialog";
import UpdatePaymentPanel from "./UpdatePaymentPanel";
import SendMoreDialog from "./SendMoreDialog";
import ContractSheets from "./ContractSheets";
import CardActions from "@/components/ui/CardActions";
import ConfirmDelete from "@/components/ui/ConfirmDelete";
import { Pencil, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import LoadErrorNotice from "@/components/ui/LoadErrorNotice";
import { useData } from "@/lib/store";
import { daysUntil, formatDate, todayISO } from "@/lib/dates";
import { availableInYard } from "@/lib/stock";

const spring = { type: "spring", stiffness: 260, damping: 30 } as const;
const cardRadius = { borderRadius: 24 };
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const period = (months: number, days: number) =>
  [months ? plural(months, "month") : "", days ? plural(days, "day") : ""].filter(Boolean).join(" ");

export default function ManageContractsView({ closed = false }: { closed?: boolean }) {
  const { customers, materials, contracts: allContracts, addContract, updateContract, dispatchContract, deployContract, concludeContract, adjustWorkEnd, confirmExtension, addPayment, voidPayment, sendMore, closeContract, deleteContract } = useData();
  // closed contracts live on their own page; the other contracts stay here
  const contracts = allContracts.filter((c) => (c.status === "Closed") === closed);
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
  // the contract whose dispatch details are being filled in (the slider only opens this; nothing is dispatched yet)
  const [dispatching, setDispatching] = useState<Contract | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [closeError, setCloseError] = useState("");
  // a contract the user wants to deploy before its start date: they are asked to confirm first
  const [early, setEarly] = useState<Contract | null>(null);
  const [earlyOpen, setEarlyOpen] = useState(false);
  // concluding (or correcting the end day of a concluded contract) asks on which day the work really ended
  const [ending, setEnding] = useState<{ contract: Contract; mode: "conclude" | "adjust"; day: string } | null>(null);
  const [endingOpen, setEndingOpen] = useState(false);
  // the contract that more materials are being sent to
  const [sendingMore, setSendingMore] = useState<number | null>(null);
  const [sendingOpen, setSendingOpen] = useState(false);
  // the billing line whose payment is being recorded
  const [paying, setPaying] = useState<{ id: number; line: string } | null>(null);
  const openEnding = (c: Contract, mode: "conclude" | "adjust", day: string) => {
    setEnding({ contract: c, mode, day });
    setEndingOpen(true);
  };
  const contract = selected === null ? null : contracts[selected];
  // the payment panel belongs to the open contract card: it goes when the card closes
  if (selected === null && paying !== null) setPaying(null);

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes the payment panel first, then the card
      if (e.key === "Escape") {
        if (paying) setPaying(null);
        else setSelected(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected, paying]);

  return (
    <>
      <section className="bento-card section-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="section-header">
          <h2 className="section-title">{closed ? "Closed Contracts" : "Contract Information"}</h2>
          {!closed && (
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} strokeWidth={2} /> Add Contract
            </button>
          )}
        </div>

        <LoadErrorNotice />
        {contracts.length === 0 ? (
          <EmptyState>{closed ? "No contracts have been closed yet." : "No contracts added yet."}</EmptyState>
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
                  aria-label={`View details for the contract with ${c.customerName}`}
                >
                  <div className="customer-card-head">
                    <motion.span layoutId={`contract-avatar-${i}`} className="customer-avatar">
                      <FileSignature size={18} strokeWidth={1.75} />
                    </motion.span>
                    <div className="contract-card-title">
                      <motion.h3 layoutId={`contract-name-${i}`} className="customer-card-name">
                        {c.customerName}
                      </motion.h3>
                      <span className="status-pill" data-status={c.status}>{c.status}</span>
                    {c.status === "Deployed" && (c.extensionElapsedDays ?? 0) > 0 && (
                      <span className="status-pill extended-pill" data-severe={c.extensionElapsedDays > 3}>
                        Extended · {c.extensionElapsedDays} day{c.extensionElapsedDays === 1 ? "" : "s"}
                        {c.extensionElapsedDays > 3 && " · conclude?"}
                      </span>
                    )}
                    </div>
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
                      <Boxes size={15} strokeWidth={1.75} className="customer-field-icon" />
                      <div>
                        <dt>Materials</dt>
                        <dd className="clamp-2">{c.materials.map((m) => `${m.name} (${count.format(m.quantity)} ${m.quantityUnit})`).join(", ")}</dd>
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
              <CardActions label={`the contract with ${c.customerName}`} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {sendingMore !== null && contracts.find((c) => c.id === sendingMore) && (
        <SendMoreDialog
          key={`send-more-${sendingMore}`}
          open={sendingOpen}
          contract={contracts.find((c) => c.id === sendingMore)!}
          yardOf={(materialId) => {
            const material = materials.find((m) => m.id === materialId);
            return material ? availableInYard(material, allContracts) : 0;
          }}
          onClose={() => setSendingOpen(false)}
          onSubmit={async (input) => {
            await sendMore(sendingMore, input);
            setSendingOpen(false);
          }}
        />
      )}
      {ending && (
        <ConcludeDialog
          key={`${ending.contract.id}-${ending.mode}-${ending.day}`}
          open={endingOpen}
          contract={contracts.find((c) => c.id === ending.contract.id) ?? ending.contract}
          contracts={allContracts}
          mode={ending.mode}
          initialDate={ending.day}
          onClose={() => setEndingOpen(false)}
          onSubmit={async (input) => {
            if (ending.mode === "adjust") await adjustWorkEnd(ending.contract.id, input.workEndedOn);
            else await concludeContract(ending.contract.id, input);
            setEndingOpen(false);
          }}
          onPay={(input) => addPayment(ending.contract.id, input)}
        />
      )}
      {early && (
        <EarlyStartDialog
          key={`early-${early.id}`}
          open={earlyOpen}
          contract={early}
          onClose={() => setEarlyOpen(false)}
          onConfirm={async () => {
            await deployContract(early.id, true);
            setEarlyOpen(false);
          }}
        />
      )}
      {dispatching && (
        <DispatchDialog
          key={`dispatch-${dispatching.id}`}
          open={dispatchOpen}
          contract={dispatching}
          availableOf={(materialId) => {
            const material = materials.find((m) => m.id === materialId);
            return material ? availableInYard(material, allContracts, dispatching.id) : 0;
          }}
          onClose={() => setDispatchOpen(false)}
          onSubmit={async (details) => {
            await dispatchContract(dispatching.id, details);
            setDispatchOpen(false);
          }}
        />
      )}
      <AddContractDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        editing={editing}
        customers={customers}
        materials={materials}
        contracts={allContracts}
        onClose={closeDialog}
        onSubmit={async (c) => {
          if (editing) await updateContract(editing.id, c);
          else await addContract(c);
          closeDialog();
        }}
      />

      <ConfirmDelete
        name={deleting ? `Contract with ${deleting.customerName}` : null}
        kind="contract"
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
                  layout="position"
                  className="customer-expanded truck-expanded"
                  style={{ borderRadius: 32 }}
                  transition={spring}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Contract with ${contract.customerName}`}
                >
                  <div className="customer-card-head expanded-head">
                    <motion.span layoutId={`contract-avatar-${selected}`} className="customer-avatar large">
                      <FileSignature size={22} strokeWidth={1.75} />
                    </motion.span>
                    <motion.h3 layoutId={`contract-name-${selected}`} className="customer-expanded-name">
                      {contract.customerName}
                    </motion.h3>
                    <div className="expanded-actions">
                      <button type="button" className="header-icon" aria-label={`Edit ${`the contract with ${contract.customerName}`}`} title="Edit" onClick={() => { setSelected(null); openEdit(contract); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="header-icon danger" aria-label={`Delete ${`the contract with ${contract.customerName}`}`} title="Delete" onClick={() => { setSelected(null); setDeleting(contract); }}>
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
                    <ContractSheets
                      contract={contract}
                      handlers={{
                        onStillRunning: () => confirmExtension(contract.id),
                        onConcludeOn: (day) => openEnding(contract, "conclude", day),
                        onSendMore: () => {
                          setSendingMore(contract.id);
                          setSendingOpen(true);
                        },
                        onUpdatePayment: (line) => {
                          setPaying({ id: contract.id, line });
                        },
                        onAdjustEnd: () => openEnding(contract, "adjust", contract.workEndedOn ?? todayISO()),
                      }}
                      action={
                        contract.status === "Estimated" ? (
                          <SlideToConfirm
                            label="Slide to Mark as Dispatched"
                            hint="Next, enter what was actually sent"
                            icon={<Send size={18} strokeWidth={1.75} />}
                            resetAfter
                            onConfirm={() => {
                              setDispatching(contract);
                              setDispatchOpen(true);
                            }}
                          />
                        ) : contract.status === "Dispatched" ? (
                          <>
                            {deployError && <p className="file-error" role="alert">{deployError}</p>}
                            <SlideToConfirm
                              label="Slide to Mark as Deployed"
                              hint="The work on site has officially started"
                              icon={<Hammer size={18} strokeWidth={1.75} />}
                              resetAfter
                              onConfirm={async () => {
                                setDeployError("");
                                if (daysUntil(contract.startDate) > 0) {
                                  // before the start date: nothing is deployed until the user confirms in the dialog
                                  setEarly(contract);
                                  setEarlyOpen(true);
                                  return;
                                }
                                try {
                                  await deployContract(contract.id);
                                } catch (e) {
                                  setDeployError(e instanceof Error ? e.message : "Could not mark as deployed");
                                  throw e;
                                }
                              }}
                            />
                          </>
                        ) : contract.status === "Deployed" ? (
                          <SlideToConfirm
                            label="Slide to Conclude Contract"
                            hint="The work is finished and the contract closes"
                            icon={<CheckCheck size={18} strokeWidth={1.75} />}
                            tone="success"
                            resetAfter
                            onConfirm={() => openEnding(contract, "conclude", todayISO())}
                          />
                        ) : contract.status === "Concluded" ? (
                          <>
                            {closeError && <p className="file-error" role="alert">{closeError}</p>}
                            <SlideToConfirm
                              label={contract.totalOutstanding > 0.01 ? `Settle ₹${contract.totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 2 })} to close` : "Slide to Close Contract"}
                              hint={contract.totalOutstanding > 0.01 ? "Record the customer's payments first" : "The contract is closed and kept as a record"}
                              locked={contract.totalOutstanding > 0.01}
                              icon={<Lock size={18} strokeWidth={1.75} />}
                              tone="dark"
                              onConfirm={async () => {
                                setCloseError("");
                                try {
                                  await closeContract(contract.id);
                                  setSelected(null);
                                } catch (e) {
                                  setCloseError(e instanceof Error ? e.message : "Could not close the contract");
                                  throw e;
                                }
                              }}
                            />
                          </>
                        ) : undefined
                      }
                    />
                  </motion.div>
                </motion.div>

                <AnimatePresence>
                  {paying && paying.id === contract.id && (
                    <UpdatePaymentPanel
                      key={`${paying.id}-${paying.line}`}
                      contract={contract}
                      lineKey={paying.line}
                      onClose={() => setPaying(null)}
                      onSubmit={(input) => addPayment(paying.id, input)}
                      onVoid={(paymentId, reason) => voidPayment(paying.id, paymentId, reason)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
