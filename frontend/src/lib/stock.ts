import type { Contract } from "@/components/contracts/AddContractDialog";
import type { Material } from "@/components/materials/AddMaterialDialog";

/** One lot of free units waiting at another site. */
export type StockLot = {
  id: number;
  quantity: number;
  note: string | null;
  fromCustomer: string | null;
  since: string;
  daysWaiting: number;
};

/** One entry in a material's stock history. */
export type StockMovement = {
  id: number;
  kind: string;
  quantity: number;
  contractId: number | null;
  customerName: string | null;
  reason: string | null;
  createdAt: string;
};

/** Where the stock of one material is. */
export type Distribution = {
  /** Owned after write-offs */
  totalOwned: number;
  /** Held by open contracts */
  inUse: number;
  /** In the yard and available for a contract */
  available: number;
  /** Free units waiting at other sites */
  elsewhere: number;
  damaged: number;
  /** Written off */
  lost: number;
  quantityUnit: string;
  contracts: {
    contractId: number;
    customerName: string;
    siteAddress: string;
    status: "Estimated" | "Dispatched" | "Deployed" | "Concluded" | "Closed";
    holding: boolean;
    startDate: string;
    endDate: string;
    dispatchedAt: string | null;
    plannedQuantity: number;
    dispatchedQuantity: number | null;
    quantity: number;
    retrievedIntact: number | null;
    retrievedDamaged: number | null;
    returnDestination: string | null;
  }[];
  lots: StockLot[];
  movements: StockMovement[];
};

export type StockActionName = "repair" | "write-off-damaged" | "mark-damaged" | "write-off-yard" | "lot-to-yard" | "restore-lost";

export type StockActionInput = {
  action: StockActionName;
  quantity: number;
  reason: string;
  lotId?: number;
};

/** What the other open contracts hold of a material: [dispatched, planned only]. A concluded contract holds nothing. */
function holdsOf(material: Material, contracts: Contract[], excludingContractId?: number): [number, number] {
  let dispatched = 0;
  let planned = 0;
  for (const c of contracts) {
    if (c.id === excludingContractId || c.status === "Concluded" || c.status === "Closed") continue;
    const line = c.materials.find((x) => x.materialId === material.id);
    if (!line) continue;
    if (c.status === "Estimated") planned += line.quantity;
    else dispatched += line.dispatchedQuantity ?? line.quantity;
  }
  return [dispatched, planned];
}

/**
 * What a contract can still take from the yard: what is owned (after write-offs), less what is damaged, waiting at
 * another site, or dispatched on other open contracts. Contracts that are only planned can take their units from the
 * free lots at other sites first, so they only hold the yard for what those lots cannot cover.
 * `excludingContractId` leaves that contract's own lines out, so editing a contract does not count against itself.
 */
export function availableInYard(material: Material, contracts: Contract[], excludingContractId?: number): number {
  const [dispatched, planned] = holdsOf(material, contracts, excludingContractId);
  const owned = material.totalQuantityOwned - material.lost;
  return Math.max(0, owned - material.damaged - material.elsewhere - dispatched - Math.max(planned - material.elsewhere, 0));
}

/**
 * What can be planned for a contract: the free units waiting at other sites count too, because they can be
 * dispatched from where they are, and every open contract holds its share.
 */
export function availableToPlan(material: Material, contracts: Contract[], excludingContractId?: number): number {
  const [dispatched, planned] = holdsOf(material, contracts, excludingContractId);
  return Math.max(0, material.totalQuantityOwned - material.lost - material.damaged - dispatched - planned);
}
