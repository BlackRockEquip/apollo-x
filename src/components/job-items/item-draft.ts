// 2026-10-29, Engineering multi-item jobs: the item shapes the screens share. A "draft" is one row on the New Job screen (all text,
// as typed); an "item row" is what the API returns for an item already on a job.

export type ItemDraft = {
  key: string;
  component: string;
  componentModel: string;
  componentSerial: string;
  componentPartNumber: string;
  machineMake: string;
  machineModel: string;
  machineSerial: string;
  plantNumber: string;
  machineHours: string;
  workRequested: string;
  conditionOnReceipt: string;
  etaDate: string;
  mechanicEtaDate: string;
};

export type ItemRow = {
  id: string;
  sequence: number;
  status: string;
  component: string | null;
  componentModel: string | null;
  componentSerial: string | null;
  componentPartNumber: string | null;
  machineMake: string | null;
  machineModel: string | null;
  machineSerial: string | null;
  plantNumber: string | null;
  machineHours: string | number | null;
  workRequested: string | null;
  conditionOnReceipt: string | null;
  etaDate: string | null;
  mechanicEtaDate: string | null;
};

let counter = 0;
export function newItemKey(): string {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

export function blankDraft(): ItemDraft {
  return {
    key: newItemKey(),
    component: "", componentModel: "", componentSerial: "", componentPartNumber: "",
    machineMake: "", machineModel: "", machineSerial: "", plantNumber: "", machineHours: "",
    workRequested: "", conditionOnReceipt: "", etaDate: "", mechanicEtaDate: "",
  };
}

const CONTENT_KEYS: Array<keyof ItemDraft> = [
  "component", "componentModel", "componentSerial", "componentPartNumber", "machineMake", "machineModel", "machineSerial",
  "plantNumber", "machineHours", "workRequested", "conditionOnReceipt", "etaDate", "mechanicEtaDate",
];

export function isBlankDraft(draft: ItemDraft): boolean {
  return CONTENT_KEYS.every((key) => draft[key].trim() === "");
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// What the API takes for one item (empty boxes become null; the server trims and limits lengths).
export function draftToPayload(draft: ItemDraft) {
  return {
    component: text(draft.component),
    componentModel: text(draft.componentModel),
    componentSerial: text(draft.componentSerial),
    componentPartNumber: text(draft.componentPartNumber),
    machineMake: text(draft.machineMake),
    machineModel: text(draft.machineModel),
    machineSerial: text(draft.machineSerial),
    plantNumber: text(draft.plantNumber),
    machineHours: text(draft.machineHours),
    workRequested: text(draft.workRequested),
    conditionOnReceipt: text(draft.conditionOnReceipt),
    etaDate: text(draft.etaDate),
    mechanicEtaDate: text(draft.mechanicEtaDate),
  };
}

export function rowToDraft(row: ItemRow): ItemDraft {
  const date = (value: string | null) => (value ? value.slice(0, 10) : "");
  return {
    key: row.id,
    component: row.component ?? "", componentModel: row.componentModel ?? "", componentSerial: row.componentSerial ?? "",
    componentPartNumber: row.componentPartNumber ?? "", machineMake: row.machineMake ?? "", machineModel: row.machineModel ?? "",
    machineSerial: row.machineSerial ?? "", plantNumber: row.plantNumber ?? "",
    machineHours: row.machineHours == null ? "" : String(Number(row.machineHours)),
    workRequested: row.workRequested ?? "", conditionOnReceipt: row.conditionOnReceipt ?? "",
    etaDate: date(row.etaDate), mechanicEtaDate: date(row.mechanicEtaDate),
  };
}
