import { api } from "./api/client";

export type WarehouseType = "china" | "uzbekistan" | "chegara" | "ortaOmbor" | "ortaMijoz";

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  description?: string;
  type?: WarehouseType;
  createdAt: string;
}

export async function getWarehouses(): Promise<Warehouse[]> {
  return await api<Warehouse[]>("/warehouses");
}

export async function createWarehouse(data: Omit<Warehouse, "id" | "createdAt">): Promise<Warehouse> {
  return await api<Warehouse>("/warehouses", {
    method: "POST",
    json: data
  });
}

export async function updateWarehouse(id: string, data: Partial<Pick<Warehouse, "name" | "address" | "description" | "type">>): Promise<void> {
  await api(`/warehouses/${id}`, {
    method: "PATCH",
    json: data
  });
}

export async function deleteWarehouse(id: string): Promise<void> {
  await api(`/warehouses/${id}`, {
    method: "DELETE"
  });
}

// --- Kirim wizard records ---

export interface KirimMeasurement {
  id: string;
  value: string;
  unit: string;
}

export interface KirimPlace {
  id: string;
  count: string;
  unit: string;
}

export interface KirimManualVolume {
  id: string;
  value: string;
}

export type VolumeMode = "places" | "quantity" | "manual";

export interface KirimProduct {
  id: string;
  measurements: KirimMeasurement[];
  places: KirimPlace[];
  quantity: string;
  width: string;
  length: string;
  height: string;
  dimensionUnit: string;
  volumeMode: VolumeMode;
  manualVolumes: KirimManualVolume[];
  totalVolume: string;
  brutto: string;
  bruttoUnit: string;
  netto: string;
  nettoUnit: string;
  note: string;
}

export interface KirimAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface KirimRecord {
  id: string;
  warehouseId: string;
  date: string;
  clientCode: string;
  clientName: string;
  clientPhone: string;
  taskDescription: string;
  assignedEmployeeName: string;
  assignedEmployeeId?: string;
  taskDeadline?: string;
  taskNotifyAt?: string;
  taskNote: string;
  attachments: KirimAttachment[];
  taskStatus: "pending" | "completed" | "approved";
  taskApiId?: string;
  products: KirimProduct[];
  dispatchedProductIds?: string[];
  /** productId → nechta joy chiqarilgani (qisman chiqim uchun) */
  dispatchedPlaces?: Record<string, number>;
  createdAt: string;
}

export async function getKirimRecords(warehouseId: string): Promise<KirimRecord[]> {
  return await api<KirimRecord[]>(`/warehouses/${warehouseId}/kirim`);
}

export async function addKirimRecord(data: Omit<KirimRecord, "id" | "createdAt">): Promise<KirimRecord> {
  return await api<KirimRecord>(`/warehouses/${data.warehouseId}/kirim`, {
    method: "POST",
    json: data
  });
}

export async function deleteKirimRecord(id: string): Promise<void> {
  await api(`/warehouses/kirim/${id}`, {
    method: "DELETE"
  });
}

export async function updateKirimStatus(id: string, status: KirimRecord["taskStatus"]): Promise<void> {
  await api(`/warehouses/kirim/${id}/status`, {
    method: "PATCH",
    json: { status }
  });
}

export async function updateDispatchedPlaces(
  kirimId: string,
  productId: string,
  placesCount: number,
  totalPlaces: number,
): Promise<void> {
  await api(`/warehouses/kirim/${kirimId}/dispatch-places`, {
    method: "PATCH",
    json: { productId, placesCount, totalPlaces }
  });
}

// Tovarni (kirim mahsulotini) backendda yangilaydi — joylar va o'lchovlar bilan birga.
// Avval localStorage'ga yozilar edi (o'zgarish saqlanmasdi); endi API orqali saqlanadi.
export async function updateKirimProduct(updatedProduct: KirimProduct): Promise<void> {
  await api(`/warehouses/kirim/product/${updatedProduct.id}`, {
    method: "PATCH",
    json: updatedProduct,
  });
}

export async function markProductsDispatched(kirimRecordId: string, productIds: string[]): Promise<void> {
  await api(`/warehouses/kirim/${kirimRecordId}/mark-dispatched`, {
    method: "PATCH",
    json: { productIds }
  });
}

export async function getUndispatchedKirimForClient(warehouseId: string, clientCode: string): Promise<KirimRecord[]> {
  const records = await getKirimRecords(warehouseId);
  return records
    .filter(r => r.clientCode === clientCode)
    .filter(r => {
      const done = new Set(r.dispatchedProductIds ?? []);
      return r.products.some(p => !done.has(p.id));
    });
}

// --- Complex Chiqim records ---

export interface ChiqimPhoto {
  name: string;
  dataUrl: string;
}

export interface ChiqimRecord {
  id: string;
  warehouseId: string;
  date: string;
  clientCode: string;
  clientName: string;
  clientPhone: string;
  kirimRecordId: string;
  selectedProductIds: string[];
  /** productId → shu chiqimda olingan ulush (0..1]; yo'q bo'lsa 1 (to'liq) */
  productRatios?: Record<string, number>;
  vehicleNumber: string;
  photos: ChiqimPhoto[];
  note?: string;
  /** Qabul qiluvchi (manzil) ombor — chiqim qilinayotganda belgilanadi */
  destWarehouseId?: string | null;
  createdAt: string;
}

export async function getChiqimRecordsV2(warehouseId: string): Promise<ChiqimRecord[]> {
  return await api<ChiqimRecord[]>(`/warehouses/${warehouseId}/chiqim`);
}

export async function addChiqimRecordV2(data: Omit<ChiqimRecord, "id" | "createdAt">): Promise<ChiqimRecord> {
  return await api<ChiqimRecord>(`/warehouses/${data.warehouseId}/chiqim`, {
    method: "POST",
    json: data
  });
}

/**
 * Chiqim yozuvini tahrirlash (sana, fura, manzil ombor, izoh, rasmlar).
 * Faqat direktor yoki tahrirlash huquqi bor hodim — backend tekshiradi.
 */
export async function updateChiqimRecordV2(
  id: string,
  data: { date?: string; vehicleNumber?: string; destWarehouseId?: string | null; note?: string | null; photos?: ChiqimPhoto[] },
): Promise<ChiqimRecord> {
  return await api<ChiqimRecord>(`/warehouses/chiqim/${id}`, { method: "PATCH", json: data });
}

export async function deleteChiqimRecordV2(id: string): Promise<void> {
  await api(`/warehouses/chiqim/${id}`, {
    method: "DELETE"
  });
}

// All chiqim records across all China warehouses
export async function getAllChiqimRecordsGlobal(): Promise<ChiqimRecord[]> {
  return await api<ChiqimRecord[]>('/warehouses/chiqim/all');
}

// All kirim records across all China warehouses
export async function getAllKirimRecordsGlobal(): Promise<KirimRecord[]> {
  return await api<KirimRecord[]>('/warehouses/kirim/all');
}

// ══════════════════════════════════════════════════════════════
// UZB LOGISTIKA — endi backend API orqali (ilgari localStorage edi).
// Shu sabab ma'lumot barcha foydalanuvchi/qurilmalarда umumiy bo'ladi,
// omborlararo o'tkazma boshqa omborда ham ko'rinadi.
// ══════════════════════════════════════════════════════════════

// ─── UZB Warehouse — Truck Receipt (Fura qabul qilish) ────────

export interface ChiqimReceipt {
  id: string;
  uzbWarehouseId: string;
  vehicleNumber: string;
  // chiqimRecordId → ratio (1 = full, 0 < x < 1 = partial)
  receivedRatios: Record<string, number>;
  /** chiqimRecordId → qoldiq yo'naltirilgan ombor id (qisman qabulda) */
  forwards?: Record<string, string>;
  note?: string;
  receivedAt: string;
  createdAt: string;
}

/** Barcha omborlardagi fura qabul yozuvlari — statuslarni hisoblash uchun */
export async function getAllReceiptsGlobal(): Promise<ChiqimReceipt[]> {
  return await api<ChiqimReceipt[]>("/warehouses/receipts/all");
}

export async function getChiqimReceipts(uzbWarehouseId: string): Promise<ChiqimReceipt[]> {
  return await api<ChiqimReceipt[]>(`/warehouses/${uzbWarehouseId}/receipts`);
}

export async function addChiqimReceipt(data: Omit<ChiqimReceipt, "id" | "createdAt">): Promise<ChiqimReceipt> {
  return await api<ChiqimReceipt>(`/warehouses/${data.uzbWarehouseId}/receipts`, {
    method: "POST",
    json: {
      vehicleNumber: data.vehicleNumber,
      receivedRatios: data.receivedRatios,
      forwards: data.forwards ?? {},
      note: data.note,
      receivedAt: data.receivedAt,
    },
  });
}

export async function deleteChiqimReceipt(id: string): Promise<void> {
  await api(`/warehouses/receipts/${id}`, { method: "DELETE" });
}

// ─── UZB Warehouse — Dispatch (Chiqim — mijoz ID bo'yicha) ────

/** Chiqim paytidagi to'lov snapshoti — kelajakda kengaytiriladigan struktura */
export interface DispatchPayment {
  mode: "none" | "full" | "partial";
  totalAmount?: number;
  paidAmount?: number;
  nextPaymentAt?: string;
  [key: string]: any;
}

export interface UzbDispatch {
  id: string;
  uzbWarehouseId: string;
  clientCode: string;
  clientName?: string;
  chiqimRecordIds: string[];
  ratios: Record<string, number>; // chiqimRecordId -> ratio (1 = full)
  note?: string;
  /** Chiqim paytida kiritilgan to'lov ma'lumoti (snapshot) */
  payment?: DispatchPayment | null;
  dispatchedAt: string;
  createdAt: string;
}

export async function getUzbDispatches(uzbWarehouseId: string): Promise<UzbDispatch[]> {
  return await api<UzbDispatch[]>(`/warehouses/${uzbWarehouseId}/uzb-dispatches`);
}

export async function addUzbDispatch(data: Omit<UzbDispatch, "id" | "createdAt">): Promise<UzbDispatch> {
  return await api<UzbDispatch>(`/warehouses/${data.uzbWarehouseId}/uzb-dispatches`, {
    method: "POST",
    json: {
      clientCode: data.clientCode,
      clientName: data.clientName,
      chiqimRecordIds: data.chiqimRecordIds,
      ratios: data.ratios,
      note: data.note,
      payment: data.payment ?? null,
      dispatchedAt: data.dispatchedAt,
    },
  });
}

export async function deleteUzbDispatch(id: string): Promise<void> {
  await api(`/warehouses/uzb-dispatches/${id}`, { method: "DELETE" });
}

// ─── UZB Warehouse — Transfer (ombor → ombor) ─────────────────

export type UzbTransferStatus = "in_transit" | "received";

export interface UzbTransfer {
  id: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  clientCode: string;
  clientName?: string;
  chiqimRecordIds: string[];
  ratios: Record<string, number>;
  note?: string;
  status?: UzbTransferStatus; // "in_transit" = yo'lda, "received" = qabul qilindi
  transferredAt: string;
  receivedAt?: string;
  createdAt: string;
}

export async function getOutgoingUzbTransfers(sourceWarehouseId: string): Promise<UzbTransfer[]> {
  return await api<UzbTransfer[]>(`/warehouses/${sourceWarehouseId}/transfers/outgoing`);
}

export async function getIncomingUzbTransfers(destWarehouseId: string): Promise<UzbTransfer[]> {
  return await api<UzbTransfer[]>(`/warehouses/${destWarehouseId}/transfers/incoming`);
}

export async function addUzbTransfer(data: Omit<UzbTransfer, "id" | "createdAt" | "status" | "receivedAt">): Promise<UzbTransfer> {
  return await api<UzbTransfer>(`/warehouses/${data.sourceWarehouseId}/transfers`, {
    method: "POST",
    json: {
      destWarehouseId: data.destWarehouseId,
      clientCode: data.clientCode,
      clientName: data.clientName,
      chiqimRecordIds: data.chiqimRecordIds,
      ratios: data.ratios,
      note: data.note,
      transferredAt: data.transferredAt,
    },
  });
}

// Manzil ombor o'tkazmani qabul qiladi (yo'lda → qabul qilindi)
export async function receiveUzbTransfer(id: string): Promise<UzbTransfer> {
  return await api<UzbTransfer>(`/warehouses/transfers/${id}/receive`, { method: "POST" });
}

export async function deleteUzbTransfer(id: string): Promise<void> {
  await api(`/warehouses/transfers/${id}`, { method: "DELETE" });
}

// ─── UZB Warehouse — Kirim (simple product intake) ────────────

export interface UzbKirimRecord {
  id: string;
  warehouseId: string;
  date: string;
  productName: string;
  quantity: number;
  unit: string;
  weight?: number;
  weightUnit?: string;
  note?: string;
  createdAt: string;
}

export async function getUzbKirimRecords(warehouseId: string): Promise<UzbKirimRecord[]> {
  return await api<UzbKirimRecord[]>(`/warehouses/${warehouseId}/uzb-kirim`);
}

export async function addUzbKirimRecord(data: Omit<UzbKirimRecord, "id" | "createdAt">): Promise<UzbKirimRecord> {
  return await api<UzbKirimRecord>(`/warehouses/${data.warehouseId}/uzb-kirim`, { method: "POST", json: data });
}

export async function deleteUzbKirimRecord(id: string): Promise<void> {
  await api(`/warehouses/uzb-kirim/${id}`, { method: "DELETE" });
}

// ─── UZB Warehouse — Chiqim (by client ID, no fura) ──────────

export interface UzbChiqimRecord {
  id: string;
  warehouseId: string;
  date: string;
  clientCode: string;
  clientName?: string;
  clientPhone?: string;
  productName: string;
  quantity: number;
  unit: string;
  weight?: number;
  weightUnit?: string;
  note?: string;
  createdAt: string;
}

export async function getUzbChiqimRecords(warehouseId: string): Promise<UzbChiqimRecord[]> {
  return await api<UzbChiqimRecord[]>(`/warehouses/${warehouseId}/uzb-chiqim`);
}

export async function addUzbChiqimRecord(data: Omit<UzbChiqimRecord, "id" | "createdAt">): Promise<UzbChiqimRecord> {
  return await api<UzbChiqimRecord>(`/warehouses/${data.warehouseId}/uzb-chiqim`, { method: "POST", json: data });
}

export async function deleteUzbChiqimRecord(id: string): Promise<void> {
  await api(`/warehouses/uzb-chiqim/${id}`, { method: "DELETE" });
}

// ══════════════════════════════════════════════════════════════
// OMBOR ARXIVI — o'chirib bo'lmaydigan tarix (serverda saqlanadi).
// Tahrirlash: faqat direktor yoki huquqi bor hodim. DELETE yo'q.
// ══════════════════════════════════════════════════════════════

export interface WarehouseArchiveEntry {
  id: string;
  warehouseId: string;
  warehouseName: string;
  eventType: string;
  title: string;
  details: Record<string, any>;
  note?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  editedById?: string | null;
  editedByName?: string | null;
  editedAt?: string | null;
  createdAt: string;
}

export async function getWarehouseArchive(warehouseId: string): Promise<WarehouseArchiveEntry[]> {
  return await api<WarehouseArchiveEntry[]>(`/warehouses/${warehouseId}/archive`);
}

export async function getAllWarehouseArchive(): Promise<WarehouseArchiveEntry[]> {
  return await api<WarehouseArchiveEntry[]>("/warehouses/archive/all");
}

export async function updateWarehouseArchiveEntry(
  id: string,
  data: { title?: string; note?: string | null },
): Promise<WarehouseArchiveEntry> {
  return await api<WarehouseArchiveEntry>(`/warehouses/archive/${id}`, {
    method: "PATCH",
    json: data,
  });
}
