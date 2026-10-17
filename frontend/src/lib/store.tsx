"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Contract, ContractInput } from "@/components/contracts/AddContractDialog";
import type { DispatchInput } from "@/components/contracts/DispatchDialog";
import type { PaymentInput } from "@/components/contracts/UpdatePaymentPanel";
import type { ConcludeInput } from "@/components/contracts/ConcludeDialog";
import type { SendMoreInput } from "@/components/contracts/SendMoreDialog";
import type { Distribution, StockActionInput } from "@/lib/stock";
import type { Customer, CustomerInput } from "@/components/customers/AddCustomerDialog";
import type { Driver, DriverFiles, DriverInput } from "@/components/drivers/AddDriverDialog";
import type { Truck, TruckInput } from "@/components/fleet/AddTruckDialog";
import type { Material, MaterialInput } from "@/components/materials/AddMaterialDialog";
import type { Staff, StaffFiles, StaffInput } from "@/components/staff/AddStaffDialog";
import { api, createWithFiles, updateWithFiles } from "@/lib/api";
import { DOCUMENTS } from "@/lib/fleet-options";

/**
 * Everything the pages show, loaded once from the FastAPI backend and shared between pages
 * (e.g. a form on one page can pick from records added on another).
 *
 * Every add / update / delete function rejects with an Error whose message is safe to show
 * to the user.
 *
 * Drivers, staff and trucks are created with JSON first and their files uploaded after;
 * if an upload fails the new record is removed again (see createWithFiles). When editing, the
 * details are saved first and only files the user picked are re-uploaded; an upload failure then
 * keeps the saved details and reports the problem (see updateWithFiles).
 */
type DataStore = {
  /** False until the first load has finished (success or failure) */
  loaded: boolean;
  /** Set when the backend couldn't be reached on load */
  loadError: string | null;

  customers: Customer[];
  addCustomer: (customer: CustomerInput) => Promise<void>;
  updateCustomer: (id: number, customer: CustomerInput) => Promise<void>;
  deleteCustomer: (id: number) => Promise<void>;

  materials: Material[];
  addMaterial: (material: MaterialInput) => Promise<void>;
  updateMaterial: (id: number, material: MaterialInput) => Promise<void>;
  deleteMaterial: (id: number) => Promise<void>;

  contracts: Contract[];
  addContract: (contract: ContractInput) => Promise<void>;
  updateContract: (id: number, contract: ContractInput) => Promise<void>;
  dispatchContract: (id: number, details: DispatchInput) => Promise<void>;
  /** `confirmEarlyStart` is needed to deploy before the planned start date: the contract then starts today */
  /** Sends more units of materials already on a running contract, from the yard and/or lots at other sites */
  sendMore: (id: number, input: SendMoreInput) => Promise<void>;
  deployContract: (id: number, confirmEarlyStart?: boolean) => Promise<void>;
  /** Concludes a deployed contract: the day the work really ended and what came back of every material */
  concludeContract: (id: number, details: ConcludeInput) => Promise<void>;
  /** Moves units between the stock buckets of a material (repair, write off, bring to the yard ...) */
  stockAction: (materialId: number, input: StockActionInput) => Promise<Distribution>;
  /** Closes a concluded contract for good */
  closeContract: (id: number) => Promise<void>;
  adjustWorkEnd: (id: number, workEndedOn: string) => Promise<void>;
  confirmExtension: (id: number) => Promise<void>;
  /** Records a payment (with its proof images) against a billing line of a contract */
  addPayment: (contractId: number, input: PaymentInput) => Promise<void>;
  voidPayment: (contractId: number, paymentId: number, reason: string) => Promise<void>;
  deleteContract: (id: number) => Promise<void>;

  drivers: Driver[];
  addDriver: (driver: DriverInput, files: DriverFiles) => Promise<void>;
  updateDriver: (id: number, driver: DriverInput, files: DriverFiles) => Promise<void>;
  deleteDriver: (id: number) => Promise<void>;

  staff: Staff[];
  addStaff: (staff: StaffInput, files: StaffFiles) => Promise<void>;
  updateStaff: (id: number, staff: StaffInput, files: StaffFiles) => Promise<void>;
  deleteStaff: (id: number) => Promise<void>;

  trucks: Truck[];
  addTruck: (truck: TruckInput, proofs: Record<string, File>) => Promise<void>;
  /** `proofs` holds only the documents whose file was replaced */
  updateTruck: (id: number, truck: TruckInput, proofs: Record<string, File>) => Promise<void>;
  deleteTruck: (id: number) => Promise<void>;
};

const DataContext = createContext<DataStore | null>(null);

const DRIVER_FILE_LABELS = { photo: "photo", aadhaarProof: "Aadhaar proof", licenseProof: "license proof" };
const STAFF_FILE_LABELS = { photo: "photo", aadharCard: "Aadhar card" };
const TRUCK_FILE_LABELS = Object.fromEntries(DOCUMENTS.map((d) => [d.key, d.proofLabel.replace(/ \(.*\)$/, "")]));

function replaceIn<T extends { id: number }>(set: Dispatch<SetStateAction<T[]>>, record: T) {
  set((prev) => prev.map((r) => (r.id === record.id ? record : r)));
}

function removeFrom<T extends { id: number }>(set: Dispatch<SetStateAction<T[]>>, id: number) {
  set((prev) => prev.filter((r) => r.id !== id));
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<Customer[]>("/customers"),
      api.get<Material[]>("/materials"),
      api.get<Contract[]>("/contracts"),
      api.get<Driver[]>("/drivers"),
      api.get<Staff[]>("/staff"),
      api.get<Truck[]>("/trucks"),
    ])
      .then(([cu, ma, co, dr, st, tr]) => {
        if (cancelled) return;
        setCustomers(cu);
        setMaterials(ma);
        setContracts(co);
        setDrivers(dr);
        setStaff(st);
        setTrucks(tr);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Contracts show their customer's and materials' names, so re-read them after those change
  // Concluding a contract and correcting stock change the damaged / lost / waiting figures of materials
  const refreshMaterials = () =>
    api
      .get<Material[]>("/materials")
      .then(setMaterials)
      .catch(() => undefined);

  const refreshContracts = () =>
    api
      .get<Contract[]>("/contracts")
      .then(setContracts)
      .catch(() => undefined);

  // A dispatched contract is deployed by the server when its start date arrives, so read the contracts again
  // whenever the tab is brought back to the front
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshContracts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const store: DataStore = {
    loaded,
    loadError,

    customers,
    addCustomer: async (input) => {
      const created = await api.post<Customer>("/customers", input);
      setCustomers((prev) => [...prev, created]);
    },
    updateCustomer: async (id, input) => {
      replaceIn(setCustomers, await api.put<Customer>(`/customers/${id}`, input));
      await refreshContracts();
    },
    deleteCustomer: async (id) => {
      await api.delete(`/customers/${id}`);
      removeFrom(setCustomers, id);
    },

    materials,
    addMaterial: async (input) => {
      const created = await api.post<Material>("/materials", input);
      setMaterials((prev) => [...prev, created]);
    },
    updateMaterial: async (id, input) => {
      replaceIn(setMaterials, await api.put<Material>(`/materials/${id}`, input));
      await refreshContracts();
    },
    deleteMaterial: async (id) => {
      await api.delete(`/materials/${id}`);
      removeFrom(setMaterials, id);
    },

    contracts,
    addContract: async (input) => {
      const created = await api.post<Contract>("/contracts", input);
      setContracts((prev) => [...prev, created]);
    },
    updateContract: async (id, input) => {
      replaceIn(setContracts, await api.put<Contract>(`/contracts/${id}`, input));
    },
    dispatchContract: async (id, details) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/dispatch`, details));
      await refreshMaterials(); // units taken from another site change what is waiting there
    },
    sendMore: async (id, input) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/send-more`, input));
      await refreshMaterials();
    },
    deployContract: async (id, confirmEarlyStart = false) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/deploy`, { confirmEarlyStart }));
    },
    concludeContract: async (id, details) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/conclude`, details));
      await refreshMaterials();
    },
    closeContract: async (id) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/close`, {}));
    },
    stockAction: async (materialId, input) => {
      const distribution = await api.post<Distribution>(`/materials/${materialId}/stock-actions`, input);
      await refreshMaterials();
      return distribution;
    },
    adjustWorkEnd: async (id, workEndedOn) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/adjust-end`, { workEndedOn }));
    },
    confirmExtension: async (id) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${id}/confirm-extension`, {}));
    },
    addPayment: async (contractId, input) => {
      const form = new FormData();
      form.append("line", input.line);
      form.append("amount", String(input.amount));
      form.append("paidOn", input.paidOn);
      if (input.method) form.append("method", input.method);
      input.proofs.forEach((file) => form.append("proofs", file));
      replaceIn(setContracts, await api.postForm<Contract>(`/contracts/${contractId}/payments`, form));
    },
    voidPayment: async (contractId, paymentId, reason) => {
      replaceIn(setContracts, await api.post<Contract>(`/contracts/${contractId}/payments/${paymentId}/void`, { reason }));
    },
    deleteContract: async (id) => {
      await api.delete(`/contracts/${id}`);
      removeFrom(setContracts, id);
    },

    drivers,
    addDriver: async (input, files) => {
      const created = await createWithFiles<Driver>("drivers", input, { ...files }, DRIVER_FILE_LABELS);
      setDrivers((prev) => [...prev, created]);
    },
    updateDriver: async (id, input, files) => {
      const { record, uploadError } = await updateWithFiles<Driver>("drivers", id, input, { ...files }, DRIVER_FILE_LABELS);
      replaceIn(setDrivers, record);
      if (uploadError) throw new Error(uploadError);
    },
    deleteDriver: async (id) => {
      await api.delete(`/drivers/${id}`);
      removeFrom(setDrivers, id);
    },

    staff,
    addStaff: async (input, files) => {
      const created = await createWithFiles<Staff>("staff", input, { ...files }, STAFF_FILE_LABELS);
      setStaff((prev) => [...prev, created]);
    },
    updateStaff: async (id, input, files) => {
      // An empty password means "keep the current one"
      const body = { ...input, password: input.password || undefined };
      const { record, uploadError } = await updateWithFiles<Staff>("staff", id, body, { ...files }, STAFF_FILE_LABELS);
      replaceIn(setStaff, record);
      if (uploadError) throw new Error(uploadError);
    },
    deleteStaff: async (id) => {
      await api.delete(`/staff/${id}`);
      removeFrom(setStaff, id);
    },

    trucks,
    addTruck: async (input, proofs) => {
      const created = await createWithFiles<Truck>("trucks", input, proofs, TRUCK_FILE_LABELS);
      setTrucks((prev) => [...prev, created]);
    },
    updateTruck: async (id, input, proofs) => {
      const { record, uploadError } = await updateWithFiles<Truck>("trucks", id, input, proofs, TRUCK_FILE_LABELS);
      replaceIn(setTrucks, record);
      if (uploadError) throw new Error(uploadError);
    },
    deleteTruck: async (id) => {
      await api.delete(`/trucks/${id}`);
      removeFrom(setTrucks, id);
    },
  };

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
