/** Shapes returned by orders-svc /logistics (see its OpenAPI). Money travels as strings. */

export type ShipmentStatus =
  | "PENDING_RECEIPT"
  | "RECEIVED"
  | "MISSING"
  | "DELIVERED"
  | "FAILED"
  | "RETURN_PENDING";

export type CollectionStatus = "NOT_REQUIRED" | "PENDING" | "PARTIAL" | "COLLECTED";

export type RouteStatus = "ASSIGNED" | "IN_PROGRESS" | "CLOSED";

export type ImportStatus = "DRAFT" | "CONFIRMED" | "DISCARDED";

export type LogisticsContract = {
  schemaVersion: number;
  failureReasons: { code: string; label: string; requiresNote: boolean }[];
  labels: {
    shipmentStatus: Record<ShipmentStatus, string>;
    collectionStatus: Record<CollectionStatus, string>;
    routeStatus: Record<RouteStatus, string>;
  };
};

export type Carrier = { id: number; code: string; name: string; currency: string };

export type RowIssue = {
  code: string;
  field?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ShipmentTotals = {
  shipments: number;
  packages: number;
  amount: number;
  stops: number;
};

export type DeclaredTotals = {
  amount?: number | null;
  shipments?: number | null;
  packages?: number | null;
  stops?: number | null;
};

export type ImportRow = {
  rowNumber: number;
  sourceOrder: string | null;
  raw: Record<string, unknown>;
  normalized: {
    trackingNumber: string;
    senderName: string | null;
    recipientName: string | null;
    addressText: string | null;
    locality: string | null;
    locationSource: "COORDINATES" | "PLUS_CODE" | "ADDRESS_TEXT";
    packages: number;
    amountToCollect: number;
  } | null;
  errors: RowIssue[];
  warnings: RowIssue[];
  excluded: boolean;
};

export type ShipmentImport = {
  id: number;
  carrier: Carrier;
  sheetNumber: string;
  sheetDate: string | null;
  sourceFormat: string;
  status: ImportStatus;
  version: number;
  createdAt: string;
  confirmedAt: string | null;
  routeId: number | null;
  piiErased: boolean;
  summary: {
    totalRows: number;
    rowsWithErrors: number;
    rowsWithWarnings: number;
    excludedRows: number;
    includedRows: number;
  };
  totals: {
    declared: DeclaredTotals | null;
    parsed: ShipmentTotals;
    included: ShipmentTotals;
    mismatches: { field: "amount" | "shipments" | "packages"; declared: number; parsed: number }[];
  };
  importWarnings: RowIssue[];
  canConfirm: boolean;
  rows?: ImportRow[];
};

export type DeliveryAttempt = {
  id: number;
  result: "DELIVERED" | "FAILED";
  reason: string | null;
  note: string | null;
  actorUserId: number;
  actorRole: string;
  occurredAt: string;
};

export type ShipmentCollection = {
  id: number;
  amount: string;
  method: string;
  status: "RECORDED" | "VOIDED";
  note: string | null;
  occurredAt: string;
  voidReason: string | null;
};

export type Shipment = {
  id: number;
  trackingNumber: string;
  sourceOrder: string | null;
  senderName: string | null;
  remito: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressText: string | null;
  locality: string | null;
  packages: number;
  amountToCollect: string;
  collectedAmount: string;
  status: ShipmentStatus;
  collectionStatus: CollectionStatus;
  lastAttempt: DeliveryAttempt | null;
  attempts: DeliveryAttempt[];
  collections: ShipmentCollection[];
};

export type RouteStop = {
  id: number;
  sequence: number;
  addressText: string | null;
  locality: string | null;
  pending: boolean;
  amountToCollect: string;
  shipments: Shipment[];
};

export type RouteSummary = {
  shipments: number;
  packages: number;
  stops: number;
  pending: number;
  byStatus: Record<ShipmentStatus, number>;
  expectedAmount: string;
  deliveredExpectedAmount: string;
  collectedAmount: string;
};

export type LogisticsRoute = {
  id: number;
  status: RouteStatus;
  version: number;
  businessDate: string;
  courierId: number;
  carrier: Carrier;
  import: { id: number; sheetNumber: string; sheetDate: string | null };
  receivedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  hasSettlement: boolean;
  summary: RouteSummary;
  stops?: RouteStop[];
};

export type SettlementLine = {
  shipmentId: number;
  trackingNumber: string;
  senderName: string | null;
  remito: string | null;
  packages: number;
  amountToCollect: number;
  collected: number;
  difference: number;
};

export type SettlementReturnLine = Omit<SettlementLine, "collected" | "difference"> & {
  reason: string | null;
};

export type SettlementSnapshot = {
  currency: string;
  expectedAmount: number;
  collectedAmount: number;
  differenceAmount: number;
  counts: {
    shipments: number;
    delivered: number;
    returnPending: number;
    missing: number;
    deliveredWithCollectionDifference: number;
  };
  packages: { total: number; delivered: number; returnPending: number; missing: number };
  bySender: {
    senderName: string;
    delivered: number;
    returnPending: number;
    missing: number;
    expectedAmount: number;
    collectedAmount: number;
  }[];
  delivered: SettlementLine[];
  toReturn: SettlementReturnLine[];
  missing: SettlementReturnLine[];
};

export type RouteSettlement = {
  routeId: number;
  generatedAt: string;
  generatedBy: number;
  currency: string;
  expectedAmount: string;
  collectedAmount: string;
  differenceAmount: string;
  snapshot: SettlementSnapshot;
};

export type AuditEntry = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: number;
  actorRole: string;
  data: Record<string, unknown> | null;
  createdAt: string;
};

/** Problem details returned by the API, with the stable business code. */
export type LogisticsProblem = {
  status?: number;
  title?: string;
  detail?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
};
