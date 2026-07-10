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

  // Joriy manzil ombor: dastlab destWarehouseId, keyin oxirgi forward
  const dest: Record<string, string | null> = {};
  for (const cr of chiqim) dest[cr.id] = cr.destWarehouseId ?? null;
  const sortedReceipts = [...receipts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const rc of sortedReceipts) {
    for (const [crId, fwd] of Object.entries(rc.forwards ?? {})) dest[crId] = fwd;
  }

  const cargos: TransitCargo[] = [];
  for (const cr of chiqim) {
    const recv = received[cr.id] ?? 0;
    if (recv >= 0.999) continue; // to'liq yetib borgan — yo'lda emas

    const remainShare = Math.max(0, 1 - recv); // hali yo'lda qolgan ulush

    const products: TransitProduct[] = [];
    let tSoni = 0, tJoys = 0, tBrutto = 0, tVol = 0;
    for (const pid of cr.selectedProductIds) {
      const p = productMap[pid];
      if (!p) continue;
      const share = cr.productRatios?.[pid] ?? 1; // furadagi ulush
      const soni = (parseFloat(p.quantity) || 0) * share;
      const joys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share;
      const brutto = bruttoKg(p) * share;
      const vol = (parseFloat(p.totalVolume || "0") || 0) * share;
      tSoni += soni; tJoys += joys; tBrutto += brutto; tVol += vol;
      products.push({
        name: (p.measurements.find(m => m.value)?.value) || "Tovar",
        soni: Math.round(soni),
        joys: r2(joys),
        brutto: r2(brutto),
        vol: r3(vol),
        sharePercent: Math.round(share * 100),
      });
    }

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
      receivedPercent: Math.round(recv * 100),
      status: recv > 0 ? "partial" : "transit",
      note: cr.note ?? undefined,
      photoCount: (cr.photos ?? []).length,
      products,
      totals: { soni: Math.round(tSoni), joys: r2(tJoys), brutto: r2(tBrutto), vol: r3(tVol) },
      inTransitTotals: {
        soni: Math.round(tSoni * remainShare),
        joys: r2(tJoys * remainShare),
        brutto: r2(tBrutto * remainShare),
        vol: r3(tVol * remainShare),
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
