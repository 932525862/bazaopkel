// ─────────────────────────────────────────────────────────────
// YO'LDAGI YUKLAR — barcha omborlararo harakatlanayotgan yuklar.
// Manba: to'liq backend (chiqim/all, receipts/all, kirim/all, warehouses).
//
// "Yo'lda" ta'rifi (ilovaning asosiy modeli bilan bir xil):
//   Chiqim yozuvi (bir furadagi yuk) — uning jami qabul ulushi (receivedRatios
//   yig'indisi) 1 dan kichik bo'lsa, hali to'liq yetib bormagan = YO'LDA.
//     received == 0        → "Yo'lda"
//     0 < received < 1     → "Qisman qabul (X%)" (qolgani yo'lda)
//   Manzil ombor: oxirgi forward yoki dastlabki destWarehouseId.
// ─────────────────────────────────────────────────────────────
import {
  getWarehouses,
  getAllChiqimRecordsGlobal,
  getAllReceiptsGlobal,
  getAllKirimRecordsGlobal,
  type Warehouse,
  type KirimProduct,
  type ChiqimPhoto,
} from "./warehouse";

const WEIGHT_TO_KG: Record<string, number> = { kg: 1, g: 0.001, tonna: 1000, pound: 0.453592 };
function bruttoKg(p: KirimProduct): number {
  const v = parseFloat(p.brutto);
  return v ? v * (WEIGHT_TO_KG[p.bruttoUnit] ?? 1) : 0;
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface TransitProduct {
  name: string;
  soni: number;      // dona (butun)
  joys: number;      // joy
  brutto: number;    // kg
  vol: number;       // m³
  sharePercent: number; // furada shu tovardan olingan ulush (%)
}

export interface TransitCargo {
  id: string;                       // chiqim record id
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  destWarehouseId: string | null;
  destWarehouseName: string | null;
  vehicleNumber: string;
  clientCode: string;
  clientName: string;
  clientPhone: string;
  date: string;
  createdAt: string;
  receivedPercent: number;          // 0..100 (jami qabul qilingan)
  status: "transit" | "partial";    // "transit" = to'liq yo'lda, "partial" = qisman qabul, qolgani yo'lda
  note?: string;
  photoCount: number;
  photos: ChiqimPhoto[];            // furaning rasmlari (yo'lga chiqqan holati)
  products: TransitProduct[];
  totals: { soni: number; joys: number; brutto: number; vol: number };        // furadagi jami (jo'natilgan)
  inTransitTotals: { soni: number; joys: number; brutto: number; vol: number }; // hali yo'lda qolgan qism
}

export interface TransitData {
  cargos: TransitCargo[];
  warehouses: Warehouse[];
  totals: { trucks: number; soni: number; joys: number; brutto: number; vol: number };
}

export async function getInTransitCargo(): Promise<TransitData> {
  const [warehouses, chiqim, receipts, kirim] = await Promise.all([
    getWarehouses(),
    getAllChiqimRecordsGlobal(),
    getAllReceiptsGlobal(),
    getAllKirimRecordsGlobal(),
  ]);

  const whName = (id: string | null | undefined) =>
    id ? (warehouses.find(w => w.id === id)?.name ?? "Noma'lum ombor") : null;

  // productId → KirimProduct (barcha kirimlardan)
  const productMap: Record<string, KirimProduct> = {};
  kirim.forEach(r => r.products.forEach(p => { productMap[p.id] = p; }));

  // Jami qabul ulushi (bir yuk bir necha omborda qisman qabul qilinishi mumkin)
  const received: Record<string, number> = {};
  for (const rc of receipts) {
    for (const [crId, ratio] of Object.entries(rc.receivedRatios ?? {})) {
      received[crId] = (received[crId] ?? 0) + Number(ratio);
    }
  }

  // TOVAR-DARAJALI qabul ulushlari — chiqimRecordId → productId → jami ulush.
  // Receiptda per-product bo'lmasa (eski yozuv) — skalyar receivedRatio BARCHA tovarga.
  const crById = new Map(chiqim.map(c => [c.id, c]));
  const receivedProduct: Record<string, Record<string, number>> = {};
  for (const rc of receipts) {
    const ppr = rc.receivedProductRatios ?? {};
    for (const [crId, ratio] of Object.entries(rc.receivedRatios ?? {})) {
      if (!receivedProduct[crId]) receivedProduct[crId] = {};
      const per = ppr[crId];
      const pids = per ? Object.keys(per) : (crById.get(crId)?.selectedProductIds ?? []);
      for (const pid of pids) receivedProduct[crId][pid] = (receivedProduct[crId][pid] ?? 0) + (per ? (per[pid] ?? 0) : Number(ratio));
    }
  }

  // Joriy manzil ombor: dastlab destWarehouseId, keyin oxirgi forward
  const dest: Record<string, string | null> = {};
  for (const cr of chiqim) dest[cr.id] = cr.destWarehouseId ?? null;
  const sortedReceipts = [...receipts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const rc of sortedReceipts) {
    for (const [crId, fwd] of Object.entries(rc.forwards ?? {})) dest[crId] = fwd;
  }

  // Yuk JORIY manzil omborida "qayta ishlangan" (settled) bo'lsa — u YO'LDA emas.
  // Qabul qilinmagan qismi o'sha omborda ushlab qolinadi (forward yo'q). Forward
  // qilinganlar esa yangi manzilga hali yo'lda bo'lib qoladi (settled emas).
  const settledAtDest = new Set<string>();
  for (const cr of chiqim) {
    const d = dest[cr.id];
    if (!d) continue;
    if (receipts.some(rc => rc.uzbWarehouseId === d && (rc.receivedRatios ?? {})[cr.id] !== undefined)) {
      settledAtDest.add(cr.id);
    }
  }

  const cargos: TransitCargo[] = [];
  for (const cr of chiqim) {
    if (settledAtDest.has(cr.id)) continue; // manzil omborida qayta ishlangan — yo'lda emas
    const perRecv = receivedProduct[cr.id] ?? {};
    const scalarRecv = received[cr.id] ?? 0;

    const products: TransitProduct[] = [];
    let tSoni = 0, tJoys = 0, tBrutto = 0, tVol = 0;        // jo'natilgan (jami)
    let inSoni = 0, inJoys = 0, inBrutto = 0, inVol = 0;     // hali yo'lda qolgan qism
    for (const pid of cr.selectedProductIds) {
      const p = productMap[pid];
      if (!p) continue;
      const share = cr.productRatios?.[pid] ?? 1; // furadagi ulush
      const rp = perRecv[pid] ?? scalarRecv;      // shu TOVAR qabul ulushi (per-product)
      const remainP = Math.max(0, 1 - rp);        // shu tovarning yo'lda qolgani
      const soni = (parseFloat(p.quantity) || 0) * share;
      const joys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share;
      const brutto = bruttoKg(p) * share;
      const vol = (parseFloat(p.totalVolume || "0") || 0) * share;
      tSoni += soni; tJoys += joys; tBrutto += brutto; tVol += vol;
      inSoni += soni * remainP; inJoys += joys * remainP; inBrutto += brutto * remainP; inVol += vol * remainP;
      products.push({
        name: (p.measurements.find(m => m.value)?.value) || "Tovar",
        soni: Math.round(soni),
        joys: r2(joys),
        brutto: r2(brutto),
        vol: r3(vol),
        sharePercent: Math.round(share * 100),
      });
    }

    // Hech bir tovarda yo'lda qolgan qism bo'lmasa — yuk to'liq yetib borgan (yo'lda emas)
    if (inJoys <= 1e-9 && inSoni <= 1e-9 && inBrutto <= 1e-9 && inVol <= 1e-9) continue;

    // Umumiy qabul foizi — joy bo'yicha (bo'lmasa soni bo'yicha; ular ham bo'lmasa skalyar)
    const overallReceived = tJoys > 0 ? (1 - inJoys / tJoys)
      : tSoni > 0 ? (1 - inSoni / tSoni)
      : scalarRecv;

    cargos.push({
      id: cr.id,
      sourceWarehouseId: cr.warehouseId,
      sourceWarehouseName: whName(cr.warehouseId) ?? "Noma'lum ombor",
      destWarehouseId: dest[cr.id] ?? null,
      destWarehouseName: whName(dest[cr.id]),
      vehicleNumber: cr.vehicleNumber,
      clientCode: cr.clientCode,
      clientName: cr.clientName,
      clientPhone: cr.clientPhone,
      date: String(cr.date).slice(0, 10),
      createdAt: cr.createdAt,
      receivedPercent: Math.round(Math.max(0, Math.min(1, overallReceived)) * 100),
      status: overallReceived > 0.0005 ? "partial" : "transit",
      note: cr.note ?? undefined,
      photoCount: (cr.photos ?? []).length,
      photos: cr.photos ?? [],
      products,
      totals: { soni: Math.round(tSoni), joys: r2(tJoys), brutto: r2(tBrutto), vol: r3(tVol) },
      inTransitTotals: {
        soni: Math.round(inSoni),
        joys: r2(inJoys),
        brutto: r2(inBrutto),
        vol: r3(inVol),
      },
    });
  }

  // Eng yangi yuk tepada
  cargos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totals = cargos.reduce(
    (acc, c) => ({
      trucks: acc.trucks,
      soni: acc.soni + c.inTransitTotals.soni,
      joys: acc.joys + c.inTransitTotals.joys,
      brutto: acc.brutto + c.inTransitTotals.brutto,
      vol: acc.vol + c.inTransitTotals.vol,
    }),
    { trucks: cargos.length, soni: 0, joys: 0, brutto: 0, vol: 0 },
  );

  return {
    cargos,
    warehouses,
    totals: {
      trucks: cargos.length,
      soni: Math.round(totals.soni),
      joys: r2(totals.joys),
      brutto: r2(totals.brutto),
      vol: r3(totals.vol),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// QABUL QILINMAGAN (HELD) YUKLAR — barcha omborlar bo'yicha.
// Yuk manzil omborida "qayta ishlangan" (qabul yozuvi bor), lekin qabul
// qilinmagan (held) qismi o'sha omborda ushlab qolingan. Forward YO'Q.
// ─────────────────────────────────────────────────────────────
export interface HeldCargo {
  id: string;
  warehouseId: string;
  warehouseName: string;
  sourceWarehouseName: string;
  vehicleNumber: string;
  clientCode: string;
  clientName: string;
  date: string;
  createdAt: string;
  products: TransitProduct[];
  totals: { soni: number; joys: number; brutto: number; vol: number };
}

export interface HeldData {
  items: HeldCargo[];
  warehouses: Warehouse[];
  totals: { count: number; soni: number; joys: number; brutto: number; vol: number };
}

export async function getHeldCargo(): Promise<HeldData> {
  const [warehouses, chiqim, receipts, kirim] = await Promise.all([
    getWarehouses(),
    getAllChiqimRecordsGlobal(),
    getAllReceiptsGlobal(),
    getAllKirimRecordsGlobal(),
  ]);
  const whName = (id: string | null | undefined) =>
    id ? (warehouses.find(w => w.id === id)?.name ?? "Noma'lum ombor") : null;
  const productMap: Record<string, KirimProduct> = {};
  kirim.forEach(r => r.products.forEach(p => { productMap[p.id] = p; }));

  // Joriy manzil ombor (forward hisobga olinadi)
  const dest: Record<string, string | null> = {};
  for (const cr of chiqim) dest[cr.id] = cr.destWarehouseId ?? null;
  const sorted = [...receipts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const rc of sorted) for (const [crId, fwd] of Object.entries(rc.forwards ?? {})) dest[crId] = fwd;

  // TOVAR-DARAJALI qabul ulushlari (fallback: skalyar barcha tovarga)
  const crById = new Map(chiqim.map(c => [c.id, c]));
  const receivedProduct: Record<string, Record<string, number>> = {};
  for (const rc of receipts) {
    const ppr = rc.receivedProductRatios ?? {};
    for (const [crId, ratio] of Object.entries(rc.receivedRatios ?? {})) {
      if (!receivedProduct[crId]) receivedProduct[crId] = {};
      const per = ppr[crId];
      const pids = per ? Object.keys(per) : (crById.get(crId)?.selectedProductIds ?? []);
      for (const pid of pids) receivedProduct[crId][pid] = (receivedProduct[crId][pid] ?? 0) + (per ? (per[pid] ?? 0) : Number(ratio));
    }
  }

  const items: HeldCargo[] = [];
  for (const cr of chiqim) {
    const d = dest[cr.id];
    if (!d) continue;
    // Joriy manzil omborida qayta ishlangan (settled) bo'lishi shart — held qismi shu omborda
    const settled = receipts.some(rc => rc.uzbWarehouseId === d && (rc.receivedRatios ?? {})[cr.id] !== undefined);
    if (!settled) continue;

    const perRecv = receivedProduct[cr.id] ?? {};
    const products: TransitProduct[] = [];
    let tSoni = 0, tJoys = 0, tBrutto = 0, tVol = 0;
    for (const pid of cr.selectedProductIds) {
      const p = productMap[pid];
      if (!p) continue;
      const share = cr.productRatios?.[pid] ?? 1;
      const heldP = Math.max(0, 1 - (perRecv[pid] ?? 0)); // qabul qilinmagan ulush
      if (heldP <= 1e-9) continue;
      const soni = (parseFloat(p.quantity) || 0) * share * heldP;
      const joys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share * heldP;
      const brutto = bruttoKg(p) * share * heldP;
      const vol = (parseFloat(p.totalVolume || "0") || 0) * share * heldP;
      tSoni += soni; tJoys += joys; tBrutto += brutto; tVol += vol;
      products.push({
        name: (p.measurements.find(m => m.value)?.value) || "Tovar",
        soni: Math.round(soni),
        joys: r2(joys),
        brutto: r2(brutto),
        vol: r3(vol),
        sharePercent: Math.round(heldP * 100),
      });
    }
    if (products.length === 0) continue;

    items.push({
      id: cr.id,
      warehouseId: d,
      warehouseName: whName(d) ?? "Noma'lum ombor",
      sourceWarehouseName: whName(cr.warehouseId) ?? "Noma'lum ombor",
      vehicleNumber: cr.vehicleNumber,
      clientCode: cr.clientCode,
      clientName: cr.clientName,
      date: String(cr.date).slice(0, 10),
      createdAt: cr.createdAt,
      products,
      totals: { soni: Math.round(tSoni), joys: r2(tJoys), brutto: r2(tBrutto), vol: r3(tVol) },
    });
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totals = items.reduce(
    (acc, c) => ({
      count: acc.count,
      soni: acc.soni + c.totals.soni,
      joys: acc.joys + c.totals.joys,
      brutto: acc.brutto + c.totals.brutto,
      vol: acc.vol + c.totals.vol,
    }),
    { count: items.length, soni: 0, joys: 0, brutto: 0, vol: 0 },
  );
  return {
    items,
    warehouses,
    totals: {
      count: items.length,
      soni: Math.round(totals.soni),
      joys: r2(totals.joys),
      brutto: r2(totals.brutto),
      vol: r3(totals.vol),
    },
  };
}
