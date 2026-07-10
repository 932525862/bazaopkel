// Ombor arxividagi kirim/chiqim yozuvlarini Excel (.xlsx) ga eksport qilish.
import { downloadXlsx, type SheetData, type CellValue } from "./xlsx-export";
import type { WarehouseArchiveEntry, WarehouseDamageEntry } from "./warehouse";

// Panel filtrlaridagi hodisa turlari bilan bir xil guruhlash
export const KIRIM_EVENTS = ["KIRIM_CREATED", "TRUCK_RECEIVED", "TRUCK_PARTIAL_RECEIVED", "TRANSFER_RECEIVED"];
export const CHIQIM_EVENTS = ["CHIQIM_SENT", "DISPATCH_TO_CLIENT", "TRANSFER_SENT", "REMAINDER_FORWARDED", "CHIQIM_DELIVERED"];

const EVENT_LABEL: Record<string, string> = {
  KIRIM_CREATED: "Kirim",
  TRUCK_RECEIVED: "Fura qabul qilindi",
  TRUCK_PARTIAL_RECEIVED: "Qisman qabul",
  TRANSFER_RECEIVED: "O'tkazma qabul",
  CHIQIM_SENT: "Yo'lga chiqdi",
  DISPATCH_TO_CLIENT: "Mijozga chiqim",
  TRANSFER_SENT: "O'tkazma",
  REMAINDER_FORWARDED: "Qoldiq yo'naltirildi",
  CHIQIM_DELIVERED: "Yetkazildi",
};

interface CargoLike {
  clientCode?: string;
  clientName?: string;
  clientPhone?: string;
  vehicleNumber?: string;
  date?: string;
  ratio?: number;
  products?: any[];
  totals?: any;
}

// Bitta arxiv yozuvidagi barcha yuk (cargo) bloklarini yig'ib beradi
function cargosOf(d: Record<string, any>): CargoLike[] {
  const out: CargoLike[] = [];
  if (d.cargo) out.push({ ...d.cargo, ratio: typeof d.ratio === "number" ? d.ratio : d.cargo.ratio });
  if (Array.isArray(d.cargos)) d.cargos.forEach((c: any) => out.push(c));
  if (Array.isArray(d.items)) {
    d.items.forEach((it: any) => {
      const c = it.cargo ?? {};
      out.push({
        ...c,
        clientCode: it.clientCode ?? c.clientCode,
        clientName: it.clientName ?? c.clientName,
        ratio: typeof it.ratio === "number" ? it.ratio : c.ratio,
      });
    });
  }
  if (Array.isArray(d.products) && d.products.length && !d.cargo) {
    out.push({
      products: d.products,
      totals: d.totals,
      clientCode: d.clientCode,
      clientName: d.clientName,
      clientPhone: d.clientPhone,
      vehicleNumber: d.vehicleNumber,
      date: d.date,
    });
  }
  return out;
}

const num = (v: any): CellValue => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : "";
};

const HEADERS = [
  "Sana", "Vaqt", "Hodisa", "Mijoz kodi", "Mijoz ismi", "Telefon", "Fura",
  "Yo'nalish", "Tovar", "Joy", "Soni (dona)", "Brutto (kg)", "Hajm (m³)",
  "Ulush %", "Izoh", "Kim tomonidan",
];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return String(iso ?? "").slice(0, 10); }
}
function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function directionOf(d: Record<string, any>): string {
  if (d.destWarehouseName) return `→ ${d.destWarehouseName}`;
  if (d.forwardWarehouseName) return `qoldiq → ${d.forwardWarehouseName}`;
  if (d.sourceWarehouseName) return `manba: ${d.sourceWarehouseName}`;
  return "";
}

// Berilgan yozuvlardan (bitta hodisa turi guruhi) bo'yicha .xlsx varaq qatorlarini yasaydi
function buildRows(entries: WarehouseArchiveEntry[]): { rows: CellValue[][]; totals: { joys: number; qty: number; brutto: number; vol: number } } {
  const rows: CellValue[][] = [HEADERS];
  let tJoys = 0, tQty = 0, tBrutto = 0, tVol = 0;

  // Eng yangi tepada — o'qishga qulay bo'lishi uchun eskisidan yangisiga tartiblaymiz
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const e of sorted) {
    const d = e.details ?? {};
    const label = EVENT_LABEL[e.eventType] ?? e.eventType;
    const dir = directionOf(d);
    const cargos = cargosOf(d);

    if (cargos.length === 0) {
      // Tovar tafsiloti yo'q — hodisa qatori sifatida yozamiz (hech narsa yo'qolmasin)
      rows.push([
        fmtDate(e.createdAt), fmtTime(e.createdAt), label,
        d.clientCode ?? "", d.clientName ?? "", d.clientPhone ?? "", d.vehicleNumber ?? "",
        dir, e.title ?? "", "", "", "", "", "", e.note ?? "", e.createdByName ?? "",
      ]);
      continue;
    }

    for (const c of cargos) {
      const prods = Array.isArray(c.products) ? c.products : [];
      if (prods.length === 0) {
        const t = c.totals ?? {};
        rows.push([
          fmtDate(e.createdAt), fmtTime(e.createdAt), label,
          c.clientCode ?? "", c.clientName ?? "", c.clientPhone ?? "", c.vehicleNumber ?? "",
          dir, "", num(t.joys), num(t.quantity ?? t.qty), num(t.bruttoKg), num(t.volumeM3 ?? t.vol),
          typeof c.ratio === "number" ? Math.round(c.ratio * 100) : "", e.note ?? "", e.createdByName ?? "",
        ]);
        continue;
      }
      for (const pr of prods) {
        const joys = num(pr.joys), qty = num(pr.quantity ?? pr.qty), brutto = num(pr.bruttoKg), vol = num(pr.volumeM3 ?? pr.vol);
        if (typeof joys === "number") tJoys += joys;
        if (typeof qty === "number") tQty += qty;
        if (typeof brutto === "number") tBrutto += brutto;
        if (typeof vol === "number") tVol += vol;
        rows.push([
          fmtDate(e.createdAt), fmtTime(e.createdAt), label,
          c.clientCode ?? "", c.clientName ?? "", c.clientPhone ?? "", c.vehicleNumber ?? "",
          dir, pr.name ?? "", joys, qty, brutto, vol,
          typeof pr.sharePercent === "number" ? pr.sharePercent : (typeof c.ratio === "number" ? Math.round(c.ratio * 100) : ""),
          pr.note ?? e.note ?? "", e.createdByName ?? "",
        ]);
      }
    }
  }

  // Jami qatori
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  rows.push([]);
  rows.push(["", "", "JAMI", "", "", "", "", "", "", round2(tJoys), Math.round(tQty), round2(tBrutto), round3(tVol), "", "", ""]);

  return { rows, totals: { joys: round2(tJoys), qty: Math.round(tQty), brutto: round2(tBrutto), vol: round3(tVol) } };
}

function safeFile(s: string): string {
  return (s || "ombor").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 60);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Bitta ombor uchun KIRIM yozuvlarini .xlsx qilib yuklab olish */
export function exportWarehouseKirim(warehouseName: string, entries: WarehouseArchiveEntry[]): number {
  const list = entries.filter(e => KIRIM_EVENTS.includes(e.eventType));
  const { rows } = buildRows(list);
  const sheet: SheetData = { name: "Kirim", rows };
  downloadXlsx(`${safeFile(warehouseName)}_kirim_${today()}.xlsx`, [sheet]);
  return list.length;
}

/** Bitta ombor uchun CHIQIM yozuvlarini .xlsx qilib yuklab olish */
export function exportWarehouseChiqim(warehouseName: string, entries: WarehouseArchiveEntry[]): number {
  const list = entries.filter(e => CHIQIM_EVENTS.includes(e.eventType));
  const { rows } = buildRows(list);
  const sheet: SheetData = { name: "Chiqim", rows };
  downloadXlsx(`${safeFile(warehouseName)}_chiqim_${today()}.xlsx`, [sheet]);
  return list.length;
}

/** Foydalanuvchi arxivda belgilagan aniq yozuvlarni (istalgan turdagi aralash) .xlsx qilib yuklab olish */
export function exportWarehouseSelected(warehouseName: string, selectedEntries: WarehouseArchiveEntry[]): number {
  const { rows } = buildRows(selectedEntries);
  const sheet: SheetData = { name: "Tanlangan", rows };
  downloadXlsx(`${safeFile(warehouseName)}_tanlangan_${today()}.xlsx`, [sheet]);
  return selectedEntries.length;
}

// ══════════════════════════════════════════════════════════════
// ZARARLANGAN YUKLAR — .xlsx eksport (to'liq ma'lumot bilan)
// ══════════════════════════════════════════════════════════════

const DAMAGE_HEADERS = [
  "Qabul sanasi", "Qayd vaqti", "Fura", "Mijoz kodi", "Mijoz ismi",
  "Manba ombor", "Qabul ombori", "Zarar (dona)",
  "Yukdagi jami (dona)", "Yuk joy", "Yuk brutto (kg)", "Yuk hajm (m³)",
  "Tovarlar", "Zarar sababi", "Kim qayd etdi",
];

/** Zarar yozuvlarini .xlsx qilib yuklab olish (tanlanganlar yoki hammasi) */
export function exportDamagesExcel(entries: WarehouseDamageEntry[], label: string = "zararlangan_yuklar"): number {
  const rows: CellValue[][] = [DAMAGE_HEADERS];
  let totalDamaged = 0;

  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const e of sorted) {
    const t = e.cargoTotals ?? {};
    const qty = num(e.quantity);
    if (typeof qty === "number") totalDamaged += qty;
    const productsText = (e.products ?? [])
      .map(p => `${p.name}${typeof p.quantity === "number" ? ` (${Math.round(p.quantity)} dona)` : ""}`)
      .join("; ");
    rows.push([
      fmtDate(String(e.receivedAt)), fmtTime(e.createdAt), e.vehicleNumber ?? "",
      e.clientCode ?? "", e.clientName ?? "",
      e.sourceWarehouseName ?? "", e.warehouseName ?? "",
      qty,
      num(t.quantity), num(t.joys), num(t.bruttoKg), num(t.volumeM3),
      productsText, e.note ?? "", e.createdByName ?? "",
    ]);
  }

  rows.push([]);
  rows.push(["", "", "JAMI", "", "", "", "", Math.round(totalDamaged * 100) / 100, "", "", "", "", "", "", ""]);

  const sheet: SheetData = { name: "Zararlangan yuklar", rows };
  downloadXlsx(`${safeFile(label)}_${today()}.xlsx`, [sheet]);
  return entries.length;
}

/** Ikkalasi bitta faylda — Kirim va Chiqim alohida varaqlarda */
export function exportWarehouseAll(warehouseName: string, entries: WarehouseArchiveEntry[]): void {
  const kirim = buildRows(entries.filter(e => KIRIM_EVENTS.includes(e.eventType)));
  const chiqim = buildRows(entries.filter(e => CHIQIM_EVENTS.includes(e.eventType)));
  downloadXlsx(`${safeFile(warehouseName)}_kirim_chiqim_${today()}.xlsx`, [
    { name: "Kirim", rows: kirim.rows },
    { name: "Chiqim", rows: chiqim.rows },
  ]);
}
