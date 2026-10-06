export const MANUFACTURERS = [
  "Tata Motors",
  "Ashok Leyland",
  "Mahindra",
  "BharatBenz",
  "Eicher",
  "Volvo",
  "Scania",
  "MAN",
  "Force Motors",
  "Isuzu",
  "SML Isuzu",
  "AMW",
  "Mercedes-Benz",
  "Maruti Suzuki",
];

export const TRUCK_TYPES = [
  "Open Body",
  "Closed Body / Container",
  "Tipper",
  "Dumper",
  "Transit Mixer",
  "Tanker",
  "Flatbed",
  "Low-bed Trailer",
  "Tractor Trailer",
  "Mini Truck (LCV)",
];

export type DocumentConfig = {
  key: string;
  title: string;
  numberLabel?: string;
  numberPlaceholder?: string;
  dateLabel: string;
  expenseLabel: string;
  expensePlaceholder: string;
  proofLabel: string;
  proofKind: "pdf" | "document";
};

export const DOCUMENTS: DocumentConfig[] = [
  {
    key: "rc",
    title: "RC Details",
    dateLabel: "RC Validity Date",
    expenseLabel: "Expenses For RC",
    expensePlaceholder: "e.g. 5000",
    proofLabel: "RC Document Proof (PDF/Image)",
    proofKind: "document",
  },
  {
    key: "fc",
    title: "FC Details",
    dateLabel: "FC Validity Date",
    expenseLabel: "Expenses For FC",
    expensePlaceholder: "e.g. 15000",
    proofLabel: "FC Document Proof (PDF)",
    proofKind: "pdf",
  },
  {
    key: "roadTax",
    title: "Road Tax",
    numberLabel: "Road Tax Number",
    numberPlaceholder: "e.g. RT-TN-998877",
    dateLabel: "Road Tax Validity Date",
    expenseLabel: "Expenses For Road Tax",
    expensePlaceholder: "e.g. 8000",
    proofLabel: "Road Tax Document Proof (PDF)",
    proofKind: "pdf",
  },
  {
    key: "insurance",
    title: "Insurance Details",
    dateLabel: "Insurance Expiry Date",
    expenseLabel: "Expenses for Insurance",
    expensePlaceholder: "e.g. 25000",
    proofLabel: "Insurance Document Proof (PDF/Image)",
    proofKind: "document",
  },
  {
    key: "nationalPermit",
    title: "National Permit",
    numberLabel: "National Permit Number",
    numberPlaceholder: "e.g. NP-TN-554433",
    dateLabel: "National Permit Validity Date",
    expenseLabel: "Expenses For National Permit",
    expensePlaceholder: "e.g. 5000",
    proofLabel: "National Permit Proof (PDF)",
    proofKind: "pdf",
  },
  {
    key: "localPermit",
    title: "Local Permit",
    numberLabel: "Local Permit Number",
    numberPlaceholder: "e.g. LP-TN-112233",
    dateLabel: "Local Permit Validity Date",
    expenseLabel: "Expenses For Local Permit",
    expensePlaceholder: "e.g. 2000",
    proofLabel: "Local Permit Proof (PDF)",
    proofKind: "pdf",
  },
  {
    key: "pollution",
    title: "Pollution Certificate",
    numberLabel: "Pollution Certificate Number",
    numberPlaceholder: "e.g. TN09BR0012345",
    dateLabel: "Pollution Certificate Validity Date",
    expenseLabel: "Expenses For Pollution Certificate",
    expensePlaceholder: "e.g. 1000",
    proofLabel: "Pollution Certificate Proof (PDF)",
    proofKind: "pdf",
  },
];
