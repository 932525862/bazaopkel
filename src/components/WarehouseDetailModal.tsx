import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ChevronLeft, Plus, Trash2, Package, ArrowDownCircle, ArrowUpCircle,
  MapPin, User, FileText, ChevronDown, ChevronUp, ExternalLink, Clock,
  Search, Truck, Camera, X as XIcon, CheckSquare, Square, Scale, IdCard,
  Building2, Globe, ImageIcon, Shield, Pencil, Check, Warehouse as WarehouseIcon,
  Lock, AlertTriangle, Users,
} from "lucide-react";
import { toast } from "sonner";
import { getStoredClientIds } from "@/lib/client-ids";
import { API } from "@/lib/api/client";
import {
  getKirimRecords,
  deleteKirimRecord,
  updateKirimProduct,
  markProductsDispatched,
  updateDispatchedPlaces,
  getChiqimRecordsV2,
  addChiqimRecordV2,
  updateChiqimRecordV2,
  deleteChiqimRecordV2,
  getAllChiqimRecordsGlobal,
  getAllKirimRecordsGlobal,
  getChiqimReceipts,
  addChiqimReceipt,
  deleteChiqimReceipt,
  getAllReceiptsGlobal,
  getUzbKirimRecords,
  addUzbKirimRecord,
  deleteUzbKirimRecord,
  getUzbDispatches,
  addUzbDispatch,
  deleteUzbDispatch,
  getOutgoingUzbTransfers,
  getIncomingUzbTransfers,
  addUzbTransfer,
  receiveUzbTransfer,
  deleteUzbTransfer,
  getWarehouses,
  type Warehouse,
  type KirimRecord,
  type KirimProduct,
  type ChiqimRecord,
  type ChiqimPhoto,
  type ChiqimReceipt,
  type UzbKirimRecord,
  type UzbDispatch,
  type UzbTransfer,
} from "@/lib/warehouse";
import { ConfirmModal } from "@/components/ConfirmModal";
import { WarehouseKirimWizard } from "@/components/WarehouseKirimWizard";
import { WarehouseArchivePanel } from "@/components/WarehouseArchivePanel";
import { ClientSalePanel } from "@/components/ClientSalePanel";
import { getTashkentDayjs } from "@/lib/date-utils";

// Biznes sanalar (kirim/chiqim/qabul/o'tkazma) doim TASHKENT (UTC+5) bo'yicha.
// Ilgari new Date().toISOString() (UTC) ishlatilgani sabab 00:00–05:00 orasida
// yozuvlar KECHAGI sana bilan saqlanar edi.
const todayTashkent = () => getTashkentDayjs().format("YYYY-MM-DD");

// data: URL'ni yangi oynada ochish — Chromium data:'ga to'g'ridan-to'g'ri
// navigatsiyani bloklaydi, shuning uchun blob URL orqali ochamiz.
function openPhotoUrl(url: string) {
  if (!url) return;
  if (!url.startsWith("data:")) { window.open(url, "_blank"); return; }
  fetch(url)
    .then(r => r.blob())
    .then(b => {
      const u = URL.createObjectURL(b);
      window.open(u, "_blank");
      setTimeout(() => URL.revokeObjectURL(u), 60_000);
    })
    .catch(() => toast.error("Rasmni ochib bo'lmadi"));
}

interface Props {
  warehouse: Warehouse;
  onClose: () => void;
}

type Tab = "kirim" | "chiqim";

// Compress image to max 800px, JPEG 72%
// MUHIM: onerror ham qo'yilgan — buzuq/o'qib bo'lmaydigan fayl tanlansa promise
// abadiy osilib qolmaydi (ilgari Promise.all hech qachon tugamay, rasm ham,
// xato xabari ham chiqmay qolardi).
async function compressImage(file: File): Promise<ChiqimPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        const scale = Math.min(1, MAX / img.width, MAX / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ name: file.name, dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
      };
      img.onerror = () => reject(new Error(`"${file.name}" rasmini o'qib bo'lmadi`));
      img.src = e.target!.result as string;
    };
    reader.onerror = () => reject(new Error(`"${file.name}" faylini o'qib bo'lmadi`));
    reader.readAsDataURL(file);
  });
}

// Fura rasmlarini yig'ganda takrorlanganini olib tashlaydi (dataUrl bo'yicha).
// Rasm bir dispatchning barcha yozuvlariga saqlanadi (har tovarda ko'rinsin uchun),
// shu sabab fura bo'yicha birlashtirilganda bir marta ko'rsatiladi.
function dedupePhotos(list: ChiqimPhoto[]): ChiqimPhoto[] {
  const seen = new Set<string>();
  const out: ChiqimPhoto[] = [];
  for (const ph of list) {
    if (ph?.dataUrl && !seen.has(ph.dataUrl)) { seen.add(ph.dataUrl); out.push(ph); }
  }
  return out;
}

function KirimStatusBadge({ status }: { status: KirimRecord["taskStatus"] }) {
  const map = {
    pending:   { label: "Kutilmoqda", cls: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" },
    completed: { label: "Tekshiruvda", cls: "bg-blue-600/10 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
    approved:  { label: "Tasdiqlandi", cls: "bg-blue-600/10 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
  };
  const s = map[status];
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function productSummary(p: KirimProduct): string {
  const meas = p.measurements.filter(m => m.value).map(m => m.value).join(", ");
  const weight = p.brutto ? `${p.brutto} ${p.bruttoUnit}` : "";
  return [meas, weight].filter(Boolean).join(" · ") || "Tovar";
}

const WEIGHT_TO_KG: Record<string, number> = {
  kg: 1,
  g: 0.001,
  tonna: 1000,
  pound: 0.453592,
};

// Brutto og'irlikni kg ga o'girib beradi (statistikalarda birgalikda yig'ish uchun)
function bruttoKg(p: KirimProduct): number {
  const v = parseFloat(p.brutto);
  if (!v) return 0;
  return v * (WEIGHT_TO_KG[p.bruttoUnit] ?? 1);
}

// Qisman qabul qilishda o'lchov asoslari — selectdagi value lar
const PARTIAL_BASES = [
  { key: "brutto", label: "Brutto og'irligi (kg)" },
  { key: "joy",    label: "Joy soni" },
  { key: "soni",   label: "Tovar soni" },
  { key: "hajm",   label: "Hajmi (m³)" },
] as const;

// Bitta tovarning tanlangan asos bo'yicha TO'LIQ qiymati
function productBasisTotal(p: KirimProduct, basis: string): number {
  const joy = p.places.reduce((sum, pl) => sum + (parseFloat(pl.count) || 0), 0);
  const soni = parseFloat(p.quantity) || 0;
  const brutto = bruttoKg(p);
  const hajm = parseFloat(p.totalVolume || "0") || 0;
  const v = basis === "joy" ? joy : basis === "soni" ? soni : basis === "brutto" ? brutto : basis === "hajm" ? hajm : 0;
  return v || joy || soni || 1;
}

// type="number" inputlarda sichqoncha g'ildiragi qiymatni bexosdan
// o'zgartirib yubormasligi uchun: scroll bo'lganda fokus olib tashlanadi.
const noWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// "Bir qismi" inputlarida max dan katta son KIRITILMAYDI —
// yozish paytidayoq qiymat max ga cheklanadi (xunuk avto-almashish o'rniga).
function clampToMax(val: string, max: number): string {
  if (val === "" || val === "-") return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  if (n < 0) return "0";
  if (max > 0 && n > max) return String(max);
  return val;
}

// Suzuvchi nuqta (IEEE) shovqinini tozalaydi: 2 - 1.77 = 0.22999999… → 0.23.
// Biznes mantiqni O'ZGARTIRMAYDI — faqat ayirish/qo'shishdan kelib chiqadigan
// mikro-xatolikni (12 dan ortiq kasr) yaxlitlab, haqiqiy qiymatni saqlaydi.
// Ayirmalar (masalan qolgan joy) hisoblangan joyda qo'llansa, quyi oqimdagi
// barcha ko'rinish va input qiymatlari avtomatik toza bo'ladi.
function clean(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1e6) / 1e6;
}

// ── Qisman (yoki to'liq) chiqim ulushini YAGONA joyda hisoblovchi funksiya ──
// MUHIM: dona (tovar soni) — BUTUN son bo'lishi shart, chunki mahsulotni bo'lib
// (0.66 dona) chiqim qilib bo'lmaydi. Shu sabab avval butun dona aniqlanadi,
// keyin qolgan barcha o'lchovlar (joy, hajm, brutto) shu donaga PROPORSIONAL
// hosil qilinadi. Natijada hisob-kitob doim izchil bo'ladi.
//   availableRatio — shu omborda hozir mavjud ulush (0..1)
//   partial        — { qty, unit } berilsa "Bir qismi", null bo'lsa "Barchasi"
export interface TakeBreakdown {
  ratio: number;   // to'liq mahsulotga nisbatan real olingan ulush (0..1)
  qty: number;     // dona — BUTUN son
  places: number;  // joy
  volume: number;  // m³
  brutto: number;  // kg
}

export function computeTake(
  p: KirimProduct,
  availableRatio: number,
  partial?: { qty?: string; unit?: string } | null,
): TakeBreakdown {
  const fullQty    = parseFloat(p.quantity) || 0;
  const fullPlaces = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
  const fullVolume = parseFloat(p.totalVolume || "0") || 0;
  const fullBrutto = bruttoKg(p);

  const avail = Math.max(0, Math.min(1, availableRatio));

  // 1) Kiritilgan asos (joy/soni/brutto/hajm) bo'yicha xom ulush — to'liq mahsulotga nisbatan.
  let ratio = avail; // "Barchasi" — mavjud qismini to'liq olish
  if (partial) {
    const entered = parseFloat(partial.qty || "0");
    const availBasis = productBasisTotal(p, partial.unit ?? "joy") * avail;
    ratio = entered > 0 && availBasis > 0 ? avail * Math.min(1, entered / availBasis) : 0;
  }

  // 2) Dona BUTUN QISMGA (floor) tushiriladi — MAX butun tovarlar soni.
  //    Masalan 10 joyga 223.6 dona to'g'ri kelsa, olinadigani 223 dona (224 EMAS),
  //    va joy/hajm/brutto shu 223 donadan proporsional qayta hisoblanadi.
  //    clean() — suzuvchi nuqta shovqinidan himoya: 222.9999997 avval 223 ga
  //    tozalanadi, floor esa uni saqlaydi (aks holda 222 bo'lib ketardi).
  let effRatio = ratio;
  let qty = fullQty * ratio;
  if (fullQty > 0) {
    const availPieces = Math.floor(clean(fullQty * avail));
    const pieces = Math.max(0, Math.min(availPieces, Math.floor(clean(fullQty * ratio))));
    qty = pieces;
    effRatio = pieces / fullQty;
  }

  return {
    ratio: effRatio,
    qty,
    places: fullPlaces * effRatio,
    volume: fullVolume * effRatio,
    brutto: fullBrutto * effRatio,
  };
}

// ── Ombor statistikasi panellari (Kirim va Chiqim ikkala bo'limda ham ko'rinadi) ──
interface ChinaStatsData {
  totalProducts: number; dispatchedProducts: number; remainingProducts: number;
  totalJoys: number; dispatchedJoys: number; remainingJoys: number;
  totalVolume: number; dispatchedVolume: number; remainingVolume: number;
  totalWeight: number; dispatchedWeight: number; remainingWeight: number;
}

function ChinaWarehouseStatsPanel({ recordCount, stats }: { recordCount: number; stats: ChinaStatsData }) {
  if (recordCount === 0) return null;
  return (
    <div className="shrink-0 mx-4 mt-4 mb-2 rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full bg-blue-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Ombor statistikasi</span>
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-medium">{recordCount} ta yetkazma</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-4 px-4 py-2 bg-slate-50/60 border-b border-border/40">
        <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-wider">Ko'rsatkich</span>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Jami keldi</span>
        <span className="text-[10px] font-black text-red-400/80 uppercase tracking-wider text-center">Chiqib ketdi</span>
        <span className="text-[10px] font-black text-emerald-600/80 uppercase tracking-wider text-center">Qoldi</span>
      </div>

      {/* Rows */}
      {[
        { icon: "📦", label: "Tovarlar", total: stats.totalProducts, dispatched: stats.dispatchedProducts, remaining: stats.remainingProducts, unit: "ta" },
        { icon: "🗃️", label: "Joylar",   total: stats.totalJoys,     dispatched: stats.dispatchedJoys,     remaining: stats.remainingJoys,     unit: "joy" },
        { icon: "📐", label: "Hajm",     total: stats.totalVolume,   dispatched: stats.dispatchedVolume,   remaining: stats.remainingVolume,   unit: "m³" },
        { icon: "⚖️", label: "Og'irlik", total: stats.totalWeight,   dispatched: stats.dispatchedWeight,   remaining: stats.remainingWeight,   unit: "kg" },
      ].map((row, i) => (
        <div
          key={row.label}
          className={`grid grid-cols-4 items-center px-4 py-2.5 ${i < 3 ? "border-b border-border/30" : ""} hover:bg-slate-50/50 transition-colors`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{row.icon}</span>
            <span className="text-xs font-bold text-foreground/80">{row.label}</span>
          </div>
          <div className="text-center">
            <span className="text-sm font-black text-foreground">{row.total}</span>
            <span className="text-[10px] text-muted-foreground ml-1">{row.unit}</span>
          </div>
          <div className="text-center">
            <span className="text-sm font-black text-red-500">{row.dispatched}</span>
            <span className="text-[10px] text-muted-foreground ml-1">{row.unit}</span>
          </div>
          <div className="text-center">
            <span className={`text-sm font-black ${row.remaining > 0 ? "text-emerald-600" : "text-muted-foreground/40"}`}>{row.remaining}</span>
            <span className="text-[10px] text-muted-foreground ml-1">{row.unit}</span>
          </div>
        </div>
      ))}

      {/* Progress bar */}
      {stats.totalJoys > 0 && (
        <div className="px-4 py-2.5 bg-slate-50/40 border-t border-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Chiqim jarayoni</span>
            <span className="text-[10px] font-black text-blue-600">
              {Math.round((stats.dispatchedJoys / stats.totalJoys) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((stats.dispatchedJoys / stats.totalJoys) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface UzbStatsData {
  inTransitProducts: number; receivedProducts: number; dispatchedProducts: number;
  inTransitJoys: number; receivedJoys: number; dispatchedJoys: number;
  inTransitVol: number; receivedVol: number; dispatchedVol: number;
  inTransitWeight: number; receivedWeight: number; dispatchedWeight: number;
}

function UzbWarehouseStatsPanel({ recordCount, stats }: { recordCount: number; stats: UzbStatsData }) {
  if (recordCount === 0) return null;
  return (
    <div className="shrink-0 mx-4 mt-4 mb-0">
      <div className="bg-white rounded-2xl border border-[#DDE1EA] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEF0F5] bg-[#F8F9FC]">
          <div className="flex items-center gap-2.5">
            <div className="w-[3px] h-4 rounded-full bg-[#005AB5]" />
            <span className="text-[11px] font-black uppercase tracking-widest text-[#374151]">Ombor holati</span>
          </div>
          <span className="text-[10px] text-[#9CA3AF] font-medium">{recordCount} ta yetkazma</span>
        </div>
        {/* Table head */}
        <div className="grid grid-cols-4 px-4 py-2 border-b border-[#EEF0F5]">
          <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Ko'rsatkich</span>
          <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider text-center">Yo'lda</span>
          <span className="text-[10px] font-bold text-[#005AB5] uppercase tracking-wider text-center">Omborida</span>
          <span className="text-[10px] font-bold text-[#059669] uppercase tracking-wider text-center">Mijozlarga</span>
        </div>
        {[
          { icon: "📦", label: "Tovarlar", inT: stats.inTransitProducts, rec: stats.receivedProducts, dis: stats.dispatchedProducts, unit: "ta" },
          { icon: "🗃️", label: "Joylar",   inT: stats.inTransitJoys,     rec: stats.receivedJoys,     dis: stats.dispatchedJoys,     unit: "joy" },
          { icon: "📐", label: "Hajm",     inT: stats.inTransitVol,      rec: stats.receivedVol,      dis: stats.dispatchedVol,      unit: "m³" },
          { icon: "⚖️", label: "Og'irlik", inT: stats.inTransitWeight,   rec: stats.receivedWeight,   dis: stats.dispatchedWeight,   unit: "kg" },
        ].map((row, i) => (
          <div key={row.label} className={`grid grid-cols-4 items-center px-4 py-2.5 ${i < 3 ? "border-b border-[#F3F4F6]" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm">{row.icon}</span>
              <span className="text-xs font-bold text-[#374151]">{row.label}</span>
            </div>
            <div className="text-center">
              <span className="text-sm font-black text-[#F59E0B]">{row.inT}</span>
              <span className="text-[10px] text-[#9CA3AF] ml-1">{row.unit}</span>
            </div>
            <div className="text-center">
              <span className="text-sm font-black text-[#005AB5]">{row.rec}</span>
              <span className="text-[10px] text-[#9CA3AF] ml-1">{row.unit}</span>
            </div>
            <div className="text-center">
              <span className={`text-sm font-black ${row.dis > 0 ? "text-[#059669]" : "text-[#D1D5DB]"}`}>{row.dis}</span>
              <span className="text-[10px] text-[#9CA3AF] ml-1">{row.unit}</span>
            </div>
          </div>
        ))}
        {/* Progress bar */}
        {(stats.receivedProducts + stats.dispatchedProducts) > 0 && (
          <div className="px-4 py-2.5 border-t border-[#EEF0F5] bg-[#F8F9FC]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Qabul qilish jarayoni</span>
              <span className="text-[10px] font-black text-[#005AB5]">
                {Math.round(((stats.receivedProducts + stats.dispatchedProducts) / Math.max(1, stats.inTransitProducts + stats.receivedProducts + stats.dispatchedProducts)) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#005AB5] to-[#3B82F6] rounded-full transition-all duration-500"
                style={{ width: `${Math.round(((stats.receivedProducts + stats.dispatchedProducts) / Math.max(1, stats.inTransitProducts + stats.receivedProducts + stats.dispatchedProducts)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Fura kartochkasida o'ng tomonda ko'rinadigan JAMI ko'rsatkichlar (ochmasdan):
// tovar soni · dona · joy · brutto (kg) · hajm (m³).
function TruckTotalsBox({ t, accent, className = "" }: {
  t: { tovar: number; qty: number; joys: number; brutto: number; vol: number };
  accent: "blue" | "violet";
  className?: string;
}) {
  const col = accent === "violet" ? "text-violet-600" : "text-[#005AB5]";
  return (
    <div className={`flex-col items-end gap-0.5 shrink-0 text-right ${className}`}>
      <span className={`text-[10px] font-black ${col} whitespace-nowrap`}>{t.tovar} tovar · {t.qty} dona</span>
      <span className="text-[10px] text-[#6B7280] font-semibold whitespace-nowrap">{t.joys} joy · {t.brutto} kg</span>
      <span className="text-[10px] text-[#6B7280] font-semibold whitespace-nowrap">{t.vol} m³</span>
    </div>
  );
}

// ── Stock ro'yxati uchun jamlash (fura → mijoz → tovar) ──────────────────────
type StockItem = { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming?: number };

// Bir guruh stock tovarining jami: dona / joy / brutto(kg) / hajm(m³) — mavjud ulush bilan.
function sumStock(items: StockItem[]) {
  let qty = 0, joys = 0, brutto = 0, vol = 0;
  for (const { product: p, available } of items) {
    qty    += (parseFloat(p.quantity) || 0) * available;
    joys   += p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * available;
    brutto += bruttoKg(p) * available;
    vol    += (parseFloat(p.totalVolume || "0") || 0) * available;
  }
  return {
    qty: Math.round(qty),
    joys: Math.round(joys * 100) / 100,
    brutto: Math.round(brutto * 100) / 100,
    vol: Math.round(vol * 1000) / 1000,
  };
}

// "Kirim tovarlar — omborda" ro'yxatini FURA → MIJOZ bo'yicha yig'iladigan (dropdown)
// ko'rinishga jamlaydi. 200-300 ta tovar bo'lsa ham o'qish/topish oson bo'ladi.
// Bir mijozda 1 ta tovar bo'lsa — to'g'ridan-to'g'ri kartochka; ko'p bo'lsa ichki dropdown.
function GroupedStockList({ items, accent, renderCard }: {
  items: StockItem[];
  accent: "blue" | "violet";
  renderCard: (item: StockItem, idx: number) => ReactNode;
}) {
  const [openV, setOpenV] = useState<Set<string>>(new Set());
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const toggleV = (k: string) => setOpenV(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleC = (k: string) => setOpenC(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Fura → tovarlar (global indeks saqlanadi — kartochka nomi/kaliti uchun)
  const vehicleMap = new Map<string, { it: StockItem; idx: number }[]>();
  items.forEach((it, idx) => {
    const vn = it.source.vehicleNumber || "—";
    if (!vehicleMap.has(vn)) vehicleMap.set(vn, []);
    vehicleMap.get(vn)!.push({ it, idx });
  });

  const c = accent === "violet"
    ? { ring: "border-violet-200", head: "hover:bg-violet-50/50", icon: "bg-violet-600/10 text-violet-600", badge: "text-violet-700 bg-violet-50 border-violet-200", code: "text-violet-700 bg-violet-50" }
    : { ring: "border-[#DBEAFE]", head: "hover:bg-[#F0F7FF]", icon: "bg-[#EFF6FF] text-[#005AB5]", badge: "text-[#005AB5] bg-[#EFF6FF] border-[#DBEAFE]", code: "text-[#005AB5] bg-[#EFF6FF]" };

  return (
    <div className="space-y-2">
      {Array.from(vehicleMap.entries()).map(([vn, entries]) => {
        const vOpen = openV.has(vn);
        const clientMap = new Map<string, { it: StockItem; idx: number }[]>();
        entries.forEach(e => {
          const cc = e.it.source.clientCode || "—";
          if (!clientMap.has(cc)) clientMap.set(cc, []);
          clientMap.get(cc)!.push(e);
        });
        const vt = sumStock(entries.map(e => e.it));
        return (
          <div key={vn} className={`rounded-xl border ${c.ring} bg-white overflow-hidden`}>
            <button onClick={() => toggleV(vn)} className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left ${c.head} transition-colors`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.icon}`}><Truck className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black font-mono text-foreground">{vn}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${c.badge}`}>{entries.length} tovar</span>
                  <span className="text-[10px] text-muted-foreground">{clientMap.size} mijoz</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {vt.qty} dona · {vt.joys} joy · {vt.brutto} kg · {vt.vol} m³
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${vOpen ? "rotate-180" : ""}`} />
            </button>
            {vOpen && (
              <div className="border-t border-border/50 bg-slate-50/40 p-2 space-y-2">
                {Array.from(clientMap.entries()).map(([cc, cEntries]) => {
                  const cKey = `${vn}::${cc}`;
                  const cOpen = openC.has(cKey);
                  const single = cEntries.length <= 1;
                  const name = cEntries[0].it.source.clientName;
                  const ct = sumStock(cEntries.map(e => e.it));
                  if (single) {
                    return <div key={cKey}>{cEntries.map(e => renderCard(e.it, e.idx))}</div>;
                  }
                  return (
                    <div key={cKey} className="rounded-lg border border-border/60 bg-white overflow-hidden">
                      <button onClick={() => toggleC(cKey)} className={`w-full flex items-center gap-2 px-3 py-2 text-left ${c.head} transition-colors`}>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${c.code}`}>{cc}</span>
                        {name ? <span className="text-[11px] text-foreground truncate">{name}</span> : null}
                        <span className="text-[10px] text-muted-foreground shrink-0">{cEntries.length} tovar</span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{ct.qty} dona · {ct.joys} joy · {ct.brutto} kg</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${cOpen ? "rotate-180" : ""}`} />
                      </button>
                      {cOpen && <div className="border-t border-border/50 p-2 space-y-2 bg-slate-50/30">{cEntries.map(e => renderCard(e.it, e.idx))}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mijoz ostidagi tovarlar jadvali — fura qabul qilishda "nima, qancha kelmoqda" ni
// chiqimdagidek to'liq ko'rsatadi: Tovar · Soni (dona) · Joy · Brutto (kg) · Hajm (m³) + Jami.
function ClientProductTable({ data, accent }: {
  data: {
    rows: { name: string; share: number; qty: number; joys: number; brutto: number; vol: number }[];
    totals: { qty: number; joys: number; brutto: number; vol: number };
  };
  accent: "blue" | "violet";
}) {
  const { rows, totals } = data;
  if (rows.length === 0) return null;
  const c = accent === "violet"
    ? { border: "border-violet-100", head: "bg-violet-50/60 text-violet-500", total: "text-violet-700", totalBg: "bg-violet-50/50" }
    : { border: "border-[#E5E9F2]", head: "bg-[#F5F8FF] text-[#7C93B5]", total: "text-[#005AB5]", totalBg: "bg-[#F0F7FF]" };
  return (
    <div className="px-3 pb-2.5">
      <div className={`rounded-lg border ${c.border} bg-white overflow-hidden`}>
        <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${c.head}`}>
          <span>Tovar</span><span className="text-right">Soni</span><span className="text-right">Joy</span><span className="text-right">Brutto</span><span className="text-right">Hajm</span>
        </div>
        {rows.map((l, i) => (
          <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-2.5 py-1 text-[10px] border-t ${c.border} items-center`}>
            <span className="font-bold text-[#374151] min-w-0 flex items-center gap-1">
              <Package className="w-2.5 h-2.5 text-[#9CA3AF] shrink-0" />
              <span className="truncate">{l.name}</span>
              {l.share < 0.999 && <span className="text-amber-600 font-medium shrink-0"> · {Math.round(l.share * 100)}%</span>}
            </span>
            <span className="text-right text-[#111827] font-semibold whitespace-nowrap">{l.qty} dona</span>
            <span className="text-right text-[#6B7280] whitespace-nowrap">{l.joys} joy</span>
            <span className="text-right text-[#6B7280] whitespace-nowrap">{l.brutto} kg</span>
            <span className="text-right text-[#6B7280] whitespace-nowrap">{l.vol} m³</span>
          </div>
        ))}
        {rows.length > 1 && (
          <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-2.5 py-1 text-[10px] border-t ${c.border} ${c.totalBg} font-black ${c.total}`}>
            <span>Jami</span>
            <span className="text-right whitespace-nowrap">{totals.qty} dona</span>
            <span className="text-right whitespace-nowrap">{totals.joys} joy</span>
            <span className="text-right whitespace-nowrap">{totals.brutto} kg</span>
            <span className="text-right whitespace-nowrap">{totals.vol} m³</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function WarehouseDetailModal({ warehouse, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("kirim");

  // ── Kirim state ──────────────────────────────────────
  const [kirimRecords, setKirimRecords] = useState<KirimRecord[]>([]);
  const [showKirimWizard, setShowKirimWizard] = useState(false);
  const [expandedKirim, setExpandedKirim] = useState<string | null>(null);
  const [deleteKirimId, setDeleteKirimId] = useState<string | null>(null);

  // ── Archive slide-over state ──────────────────────────
  const [showArchive, setShowArchive] = useState(false);

  // ── Chiqim panel state (hidden until "Chiqim qilish" clicked) ──
  const [showChiqimPanel, setShowChiqimPanel] = useState(false);

  // ── UZB Kirim panel state (hidden until "Kirim qilish" clicked) ──
  const [showUzbKirimPanel, setShowUzbKirimPanel] = useState(false);

  // Close archive + panels when tab changes
  useEffect(() => {
    setShowArchive(false);
    setShowChiqimPanel(false);
    setShowUzbKirimPanel(false);
    setShowPayments(false);
    setChiqimType(null);
    setSelectedDispatchClientCode(null);
    setUzbChiqimMode("truck");
  }, [tab]);

  // ── Inline product edit state ─────────────────────────
  const [editingProduct, setEditingProduct] = useState<{ kirimId: string; product: KirimProduct } | null>(null);

  const startEditProduct = (kirimId: string, product: KirimProduct) => {
    setEditingProduct({ kirimId, product: { ...product } });
  };

  const updEP = (patch: Partial<KirimProduct>) =>
    setEditingProduct(prev => prev ? { ...prev, product: { ...prev.product, ...patch } } : prev);

  const [savingEdit, setSavingEdit] = useState(false);
  const saveEditProduct = async () => {
    if (!editingProduct) return;
    setSavingEdit(true);
    try {
      await updateKirimProduct(editingProduct.product);
      toast.success("Tovar yangilandi");
      setEditingProduct(null);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Saqlashda xatolik");
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Chiqim state ─────────────────────────────────────
  const [chiqimRecords, setChiqimRecords] = useState<ChiqimRecord[]>([]);
  const [deleteChiqimId, setDeleteChiqimId] = useState<string | null>(null);

  // Chiqim product selection
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // "full" = take all, "partial" = take a portion
  const [productModes, setProductModes] = useState<Record<string, "full" | "partial">>({});
  const [partialInputs, setPartialInputs] = useState<Record<string, { qty: string; unit: string }>>({});

  // Chiqim save form
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [photos, setPhotos] = useState<ChiqimPhoto[]>([]);
  const [chiqimNote, setChiqimNote] = useState("");
  const [chiqimSaving, setChiqimSaving] = useState(false);

  // ── UZB Warehouse state ───────────────────────────────
  const [uzbKirimRecords, setUzbKirimRecords] = useState<UzbKirimRecord[]>([]);

  // UZB Kirim form
  const [uzbKirimProduct, setUzbKirimProduct] = useState("");
  const [uzbKirimQty, setUzbKirimQty] = useState("");
  const [uzbKirimUnit, setUzbKirimUnit] = useState("kg");
  const [uzbKirimWeight, setUzbKirimWeight] = useState("");
  const [uzbKirimWeightUnit, setUzbKirimWeightUnit] = useState("kg");
  const [uzbKirimNote, setUzbKirimNote] = useState("");
  const [uzbKirimDate, setUzbKirimDate] = useState(todayTashkent());

  const [deleteUzbKirimId, setDeleteUzbKirimId] = useState<string | null>(null);

  // ── UZB Dispatch state ────────────────────────────────
  const [uzbDispatches, setUzbDispatches] = useState<UzbDispatch[]>([]);
  const [selectedDispatchClientCode, setSelectedDispatchClientCode] = useState<string | null>(null);
  const [dispatchMode, setDispatchMode] = useState<"full" | "partial">("full");
  const [dispatchPartialQty, setDispatchPartialQty] = useState("");
  const [dispatchPartialUnit, setDispatchPartialUnit] = useState("joy");
  const [dispatchNote, setDispatchNote] = useState("");
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [deleteDispatchId, setDeleteDispatchId] = useState<string | null>(null);
  // Mijoz bo'yicha chiqim / o'tkazma — TOVAR-DARAJALI multiselect (O'rta ombor
  // chiqim tizimi kabi): tanlangan tovar id'lari. Rejim/qisman qiymatlar uchun
  // umumiy productModes/partialInputs xaritalari ishlatiladi.
  const [dispSelectedPids, setDispSelectedPids] = useState<Set<string>>(new Set());
  const toggleDispProduct = (pid: string) =>
    setDispSelectedPids(prev => { const n = new Set(prev); if (n.has(pid)) n.delete(pid); else n.add(pid); return n; });

  // ── TO'LOV — Mijozlar modulidagi tayyor to'lov tizimiga ulanadi.
  // "O'rta mijoz" va "Chiqaruvchi" turidagi omborlarning MIJOZ BO'YICHA
  // chiqim formasida ishlaydi.
  // "To'liq to'ladi" → setSale(status: full), "Qisman to'ladi" → setSale(status: partial)
  // paidAmount backend tomonidan avtomatik payment yozuvi sifatida saqlanadi. ──
  const paymentsEnabled = warehouse.type === "ortaMijoz" || warehouse.type === "uzbekistan";
  const [payMode, setPayMode] = useState<"none" | "full" | "partial">("none");
  const [payTotal, setPayTotal] = useState("");
  const [payAdditional, setPayAdditional] = useState(""); // qo'shimcha narx (jami summaning bir qismi) — statistikada alohida ko'rinadi
  const [payPaid, setPayPaid] = useState("");
  const [payNextDate, setPayNextDate] = useState("");
  const resetPayment = () => { setPayMode("none"); setPayTotal(""); setPayAdditional(""); setPayPaid(""); setPayNextDate(""); };

  // ── TO'LOVLAR paneli: chiqimlardan keyingi to'liq to'lov holati.
  // Snapshot dispatch.payment da, jonli holat Mijozlar bo'limidan olinadi. ──
  const [showPayments, setShowPayments] = useState(false);
  const [crmClients, setCrmClients] = useState<any[]>([]);

  /** Mijozlar bo'limidagi jonli mijoz ma'lumoti (kod bo'yicha).
   *  ASOSIY manba — backend (crmClients.clientCode). Zaxira — localStorage keshi. */
  const crmClientByCode = (code: string): any | null => {
    const norm = (code || "").toUpperCase().trim();
    if (!norm) return null;
    const byServer = crmClients.find((c: any) => (c.clientCode || "").toUpperCase().trim() === norm);
    if (byServer) return byServer;
    const uuid = clientUuidByCode(code);
    return uuid ? (crmClients.find((c: any) => c.id === uuid) ?? null) : null;
  };

  const fmtSum = (v: number) => (Math.round(v * 100) / 100).toLocaleString("ru-RU");

  /** Ombor mijoz kodi (OK/8001) → Mijozlar bo'limidagi mijoz UUID si.
   *  ASOSIY manba — server (clientCode), shu sabab boshqa qurilma/brauzerda ham
   *  to'lov mijozga bog'lanadi va statistikaga tushadi. Zaxira — localStorage keshi. */
  const clientUuidByCode = (code: string | null): string | null => {
    if (!code) return null;
    const norm = code.toUpperCase().trim();
    const byServer = crmClients.find((c: any) => (c.clientCode || "").toUpperCase().trim() === norm);
    if (byServer) return byServer.id;
    const found = Object.entries(storedIds).find(([, v]) => (v || "").toUpperCase().trim() === norm);
    return found ? found[0] : null;
  };

  // ── UZB Transfer (ombor→ombor) state ─────────────────
  const [chiqimType, setChiqimType] = useState<"client" | "warehouse" | null>(null);
  // Chiqaruvchi ombor: chiqim usuli — "truck" (tovar/fura) yoki "client" (mijoz bo'yicha).
  // FAQAT chiqaruvchi turida ikkala tizim ham mavjud.
  const [uzbChiqimMode, setUzbChiqimMode] = useState<"truck" | "client">("truck");

  // Chiqaruvchi (uzbekistan) omborda "Tovar / fura chiqimi" tugmasi olib tashlangan —
  // endi bu turda faqat mijoz bo'yicha chiqim bor, shuning uchun "tur tanlang" oraliq
  // ekraniga tushmasdan to'g'ridan-to'g'ri o'sha formaga o'tkaziladi.
  useEffect(() => {
    if (warehouse.type === "uzbekistan" && tab === "chiqim" && chiqimType === null) {
      setChiqimType("client");
    }
  }, [warehouse.type, tab, chiqimType]);
  const [outgoingTransfers, setOutgoingTransfers] = useState<UzbTransfer[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<UzbTransfer[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [selectedTransferDestId, setSelectedTransferDestId] = useState<string | null>(null);
  const [transferSaving, setTransferSaving] = useState(false);

  // ── UZB Truck Reception state ─────────────────────────
  const [allChinaChiqim, setAllChinaChiqim] = useState<ChiqimRecord[]>([]);
  const [allChinaKirim, setAllChinaKirim] = useState<KirimRecord[]>([]);
  const [uzbReceipts, setUzbReceipts] = useState<ChiqimReceipt[]>([]);
  // MULTI-SELECT: bir vaqtning o'zida BIR NECHTA furani tanlab qabul qilish mumkin.
  // Saqlashda har bir fura uchun alohida qabul yozuvi yaratiladi (backend o'zgarmagan).
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [vehicleMode, setVehicleMode] = useState<"full" | "partial">("full");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [crModes, setCrModes] = useState<Record<string, "full" | "partial">>({});
  const [crPartials, setCrPartials] = useState<Record<string, { qty: string; unit: string }>>({});
  // TOVAR-DARAJALI qisman qabul: chiqimRecordId → productId → { mode, qty, unit }.
  // mode: "full" (qolgan hammasini), "partial" (kiritilgan miqdorni), "none" (qabul qilinmaydi).
  type ProdPartial = { mode: "full" | "partial" | "none"; qty: string; unit: string };
  const [crProductPartials, setCrProductPartials] = useState<Record<string, Record<string, ProdPartial>>>({});
  const setProductPartial = (crId: string, pid: string, patch: Partial<ProdPartial>) =>
    setCrProductPartials(prev => ({
      ...prev,
      [crId]: {
        ...(prev[crId] ?? {}),
        [pid]: { ...({ mode: "full", qty: "", unit: "joy" } as ProdPartial), ...(prev[crId]?.[pid] ?? {}), ...patch },
      },
    }));
  const [receiptNote, setReceiptNote] = useState("");
  // ── ZARARLANGAN TOVARLAR (ixtiyoriy) — faqat zarar bo'lganda ochiladi.
  // 100% butun yuk qabul qilinsa bu blok umuman ishlatilmaydi.
  const [damageEnabled, setDamageEnabled] = useState(false);
  const [crDamages, setCrDamages] = useState<Record<string, { qty: string; note: string }>>({});
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [deleteReceiptId, setDeleteReceiptId] = useState<string | null>(null);
  const [releasingHeld, setReleasingHeld] = useState(false);
  // "Qabul qilinmagan" tovarlar — MULTISELECT (`${crId}::${pid}` kalitlari).
  // Tanlanganlar tasdiqlash bilan "Kirim tovarlar — omborda"ga o'tkaziladi.
  const [heldSelected, setHeldSelected] = useState<Set<string>>(new Set());
  const [confirmReleaseHeld, setConfirmReleaseHeld] = useState(false);
  const heldKey = (crId: string, pid: string) => `${crId}::${pid}`;
  const isHeldSelected = (crId: string, pid: string) => heldSelected.has(heldKey(crId, pid));
  const toggleHeldSelected = (crId: string, pid: string) =>
    setHeldSelected(prev => { const n = new Set(prev); const k = heldKey(crId, pid); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // ── Global qabul yozuvlari (statuslar), chiqim manzili, qoldiq forward, arxiv panel ──
  const [allReceipts, setAllReceipts] = useState<ChiqimReceipt[]>([]);
  const [chiqimDestId, setChiqimDestId] = useState<string>("");
  const [crForwards, setCrForwards] = useState<Record<string, string>>({});
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  // Joriy foydalanuvchining tahrirlash huquqi (direktor yoki canEditWarehouseArchive)
  const [canEditArchive, setCanEditArchive] = useState(false);
  useEffect(() => {
    API.me()
      .then((me: any) => {
        const isDirector = String(me?.role || "").toUpperCase() === "DIRECTOR";
        setCanEditArchive(isDirector || !!me?.canEditWarehouseArchive);
      })
      .catch(() => setCanEditArchive(false));
  }, []);

  // ── Chiqim yozuvini tahrirlash modali (faqat huquqi borlar) ──
  const [editingChiqim, setEditingChiqim] = useState<ChiqimRecord | null>(null);
  const [ecDate, setEcDate] = useState("");
  const [ecVehicle, setEcVehicle] = useState("");
  const [ecDestId, setEcDestId] = useState("");
  const [ecNote, setEcNote] = useState("");
  const [ecPhotos, setEcPhotos] = useState<ChiqimPhoto[]>([]);
  const [ecSaving, setEcSaving] = useState(false);

  const openChiqimEdit = (cr: ChiqimRecord) => {
    setEditingChiqim(cr);
    setEcDate(String(cr.date).slice(0, 10));
    setEcVehicle(cr.vehicleNumber);
    setEcDestId(cr.destWarehouseId ?? "");
    setEcNote(cr.note ?? "");
    setEcPhotos(cr.photos ?? []);
  };

  const handleEcPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const left = 20 - ecPhotos.length;
    if (left <= 0) { toast.error("Maksimal 20 ta rasm"); e.target.value = ""; return; }
    e.target.value = "";
    try {
      const compressed = await Promise.all(files.slice(0, left).map(compressImage));
      setEcPhotos(prev => [...prev, ...compressed]);
    } catch (err: any) {
      toast.error(err?.message || "Rasmni o'qib bo'lmadi");
    }
  };

  const handleSaveChiqimEdit = async () => {
    if (!editingChiqim) return;
    if (!ecVehicle.trim()) { toast.error("Avtomobil raqamini kiriting"); return; }
    if (!ecDestId) { toast.error("Qabul qiluvchi omborni tanlang"); return; }
    setEcSaving(true);
    try {
      await updateChiqimRecordV2(editingChiqim.id, {
        date: ecDate,
        vehicleNumber: ecVehicle.trim(),
        destWarehouseId: ecDestId,
        note: ecNote.trim() || null,
        photos: ecPhotos,
      });
      toast.success("Chiqim yozuvi yangilandi");
      setEditingChiqim(null);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Saqlashda xatolik (huquqingiz bo'lmasligi mumkin)");
    } finally {
      setEcSaving(false);
    }
  };

  // Chiqim yozuvini tahrirlash modali — barcha ombor ko'rinishlarida ishlatiladi
  const renderChiqimEditModal = () => editingChiqim && (
        <div className="fixed inset-0 z-[80] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-black text-foreground">Chiqimni tahrirlash</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-mono font-bold text-blue-600">{editingChiqim.clientCode}</span>
                  {" · "}{editingChiqim.selectedProductIds.length} ta tovar (tovar tarkibi o'zgarmaydi)
                </p>
              </div>
              <button onClick={() => setEditingChiqim(null)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Sana</label>
                <input
                  type="date" value={ecDate} onChange={e => setEcDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                  <Building2 className="w-3 h-3" /> Qabul qiluvchi ombor <span className="text-destructive">*</span>
                </label>
                <select
                  value={ecDestId} onChange={e => setEcDestId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">— Omborni tanlang —</option>
                  {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                  <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                </label>
                <input
                  value={ecVehicle} onChange={e => setEcVehicle(e.target.value)}
                  placeholder="01 A 123 AA"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                  <Camera className="w-3 h-3" /> Rasmlar
                  <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-secondary text-muted-foreground">{ecPhotos.length}/20</span>
                </label>
                {ecPhotos.length < 20 && (
                  <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-blue-200 bg-blue-600/5 hover:border-blue-400 text-xs text-blue-500 hover:text-blue-600 cursor-pointer transition-colors">
                    <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                    <input type="file" accept="image/*" multiple onChange={handleEcPhotos} className="hidden" />
                  </label>
                )}
                {ecPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                    {ecPhotos.map((ph, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                        <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setEcPhotos(prev => prev.filter((_, j) => j !== i))}
                          className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                        >
                          <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Izoh</label>
                <textarea
                  value={ecNote} onChange={e => setEcNote(e.target.value)}
                  placeholder="Qo'shimcha..." rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border shrink-0">
              <button
                onClick={handleSaveChiqimEdit} disabled={ecSaving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
              >
                {ecSaving ? "Saqlanmoqda..." : "Saqlash"}
              </button>
              <button
                onClick={() => setEditingChiqim(null)}
                className="px-5 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                Bekor
              </button>
            </div>
          </div>
        </div>
  );

  // Arxiv kartalarida "Batafsil" (show more) ochiq/yopiqligi
  const [expandedArchiveIds, setExpandedArchiveIds] = useState<Set<string>>(new Set());
  const toggleArchiveExpand = (id: string) =>
    setExpandedArchiveIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const storedIds = getStoredClientIds();

  // Parallel/eskirgan refresh'lar bir-birini yangi ma'lumot ustiga eski bilan
  // yozib yubormasligi uchun: faqat ENG OXIRGI chaqiruv natijasi qo'llanadi.
  const refreshSeq = useRef(0);
  const refresh = async () => {
    const seq = ++refreshSeq.current;
    try {
      const [kirim, chiqim, uzbKirim, whs, receiptsAll] = await Promise.all([
        getKirimRecords(warehouse.id),
        getChiqimRecordsV2(warehouse.id),
        getUzbKirimRecords(warehouse.id),
        getWarehouses(),
        getAllReceiptsGlobal(),
      ]);
      if (seq !== refreshSeq.current) return; // eskirgan javob — e'tiborsiz
      setKirimRecords(kirim);
      setChiqimRecords(chiqim);
      setUzbKirimRecords(uzbKirim);
      setAllWarehouses(whs);
      setAllReceipts(receiptsAll);
      if (warehouse.type !== "china") {
        const [chiqAll, kirimAll, receipts, dispatches, outgoing, incoming] = await Promise.all([
          getAllChiqimRecordsGlobal(),
          getAllKirimRecordsGlobal(),
          getChiqimReceipts(warehouse.id),
          getUzbDispatches(warehouse.id),
          getOutgoingUzbTransfers(warehouse.id),
          getIncomingUzbTransfers(warehouse.id),
        ]);
        if (seq !== refreshSeq.current) return;
        setAllChinaChiqim(chiqAll);
        setAllChinaKirim(kirimAll);
        setUzbReceipts(receipts);
        setUzbDispatches(dispatches);
        setOutgoingTransfers(outgoing);
        setIncomingTransfers(incoming);
        // Mijozlar bo'limidan jonli to'lov holati — mijozga chiqim qiladigan omborlarda
        if (warehouse.type === "ortaMijoz" || warehouse.type === "uzbekistan") {
          API.clients().then((cl: any[]) => {
            if (seq === refreshSeq.current) setCrmClients(cl ?? []);
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      // Bitta so'rov yiqilsa ham foydalanuvchi xabardor bo'ladi (ilgari jimgina
      // unhandled rejection bo'lib, UI bo'sh/eski holda qolardi).
      if (seq === refreshSeq.current) toast.error(err?.message || "Ma'lumotlarni yuklashda xatolik");
    }
  };

  useEffect(() => { refresh(); }, [warehouse.id]);

  // ── Computed ──────────────────────────────────────────
  const activeKirim = kirimRecords.filter(r => {
    const done = new Set(r.dispatchedProductIds ?? []);
    return r.products.some(p => !done.has(p.id));
  });
  const archivedKirim = kirimRecords.filter(r => {
    const done = new Set(r.dispatchedProductIds ?? []);
    return r.products.every(p => done.has(p.id));
  });

  const hasSelectedProducts = selectedProductIds.size > 0;

  // All undispatched products across ALL kirim records, sorted FIFO (oldest first)
  const allUndispatched = useMemo(() => {
    return [...kirimRecords]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .flatMap(r => {
        const done = new Set(r.dispatchedProductIds ?? []);
        return r.products
          .filter(p => !done.has(p.id))
          .map(p => ({ product: p, kirimRecord: r }));
      });
  }, [kirimRecords]);

  // product id → { product, kirimRecord }
  const allProductMap = useMemo(() => {
    const map: Record<string, { product: KirimProduct; kirimRecord: KirimRecord }> = {};
    kirimRecords.forEach(r => r.products.forEach(p => { map[p.id] = { product: p, kirimRecord: r }; }));
    return map;
  }, [kirimRecords]);

  // Running calculator totals (joy-based partial support)
  const chiqimTotals = useMemo(() => {
    let totalQty = 0, totalPlaces = 0, totalVolume = 0, totalBrutto = 0;
    for (const pid of selectedProductIds) {
      const entry = allProductMap[pid];
      if (!entry) continue;
      const { product, kirimRecord } = entry;
      const mode = productModes[pid] ?? "full";
      const fullJoys = product.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) || 1;
      const alreadyDispatched = (kirimRecord.dispatchedPlaces ?? {})[pid] ?? 0;
      const remainingJoys = Math.max(0, fullJoys - alreadyDispatched);
      const availableRatio = fullJoys > 0 ? remainingJoys / fullJoys : 1;
      const t = computeTake(product, availableRatio, mode === "partial" ? partialInputs[pid] : null);
      totalQty    += t.qty;      // dona — butun
      totalPlaces += t.places;
      totalVolume += t.volume;
      totalBrutto += t.brutto;
    }
    return {
      qty:    Math.round(totalQty),                 // dona — butun son
      places: Math.round(totalPlaces * 100) / 100,
      volume: Math.round(totalVolume * 1000) / 1000,
      brutto: Math.round(totalBrutto * 100) / 100,
    };
  }, [selectedProductIds, productModes, partialInputs, allProductMap]);

  // ── Warehouse statistics ──────────────────────────────
  const warehouseStats = useMemo(() => {
    let totalProducts = 0, dispatchedProducts = 0;
    let totalJoys = 0, dispatchedJoys = 0;
    let totalVolume = 0, dispatchedVolume = 0;
    let totalWeight = 0, dispatchedWeight = 0;
    for (const r of kirimRecords) {
      const doneSet = new Set(r.dispatchedProductIds ?? []);
      for (const p of r.products) {
        const pJoys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
        const pVolume = parseFloat(p.totalVolume || "0") || 0;
        const pWeight = bruttoKg(p);
        // Chiqarilgan ULUSH (0..1): joysiz tovar uchun pseudo-joy=1 modeli —
        // ilgari joysiz tovar to'liq chiqarilsa ham hajm/og'irlik statistikada
        // "chiqib ketdi" ustuniga tushmay, "Qoldi" doim oshiq ko'rinar edi.
        const dispatchedShare = doneSet.has(p.id)
          ? 1
          : Math.min(1, ((r.dispatchedPlaces ?? {})[p.id] ?? 0) / (pJoys > 0 ? pJoys : 1));
        totalProducts++;
        totalJoys += pJoys;
        totalVolume += pVolume;
        totalWeight += pWeight;
        dispatchedJoys += pJoys * dispatchedShare;
        dispatchedVolume += pVolume * dispatchedShare;
        dispatchedWeight += pWeight * dispatchedShare;
        if (doneSet.has(p.id)) dispatchedProducts++;
      }
    }
    return {
      totalProducts, dispatchedProducts, remainingProducts: totalProducts - dispatchedProducts,
      totalJoys:      Math.round(totalJoys * 10) / 10,
      dispatchedJoys: Math.round(dispatchedJoys * 10) / 10,
      remainingJoys:  Math.round((totalJoys - dispatchedJoys) * 10) / 10,
      totalVolume:      Math.round(totalVolume * 1000) / 1000,
      dispatchedVolume: Math.round(dispatchedVolume * 1000) / 1000,
      remainingVolume:  Math.round((totalVolume - dispatchedVolume) * 1000) / 1000,
      totalWeight:      Math.round(totalWeight * 100) / 100,
      dispatchedWeight: Math.round(dispatchedWeight * 100) / 100,
      remainingWeight:  Math.round((totalWeight - dispatchedWeight) * 100) / 100,
    };
  }, [kirimRecords]);

  // ── UZB Truck Reception computed ─────────────────────
  // BARCHA omborlar bo'yicha jami qabul ulushi (bir yuk bir necha omborda
  // qisman qabul qilinishi mumkin — forward tufayli)
  const cumulativeReceivedRatios = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of allReceipts) {
      for (const [crId, ratio] of Object.entries(r.receivedRatios)) {
        totals[crId] = (totals[crId] ?? 0) + Number(ratio);
      }
    }
    return totals;
  }, [allReceipts]);

  // SHU omborning o'zi qabul qilgan ulushlari
  const ownReceivedRatios = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of uzbReceipts) {
      for (const [crId, ratio] of Object.entries(r.receivedRatios)) {
        totals[crId] = (totals[crId] ?? 0) + Number(ratio);
      }
    }
    return totals;
  }, [uzbReceipts]);

  // chiqimRecordId → ChiqimRecord — per-product fallback (eski yozuvlar) uchun
  const chiqimById = useMemo(() => {
    const m: Record<string, ChiqimRecord> = {};
    for (const cr of allChinaChiqim) m[cr.id] = cr;
    for (const cr of chiqimRecords) if (!m[cr.id]) m[cr.id] = cr;
    return m;
  }, [allChinaChiqim, chiqimRecords]);

  // TOVAR-DARAJALI qabul ulushlari — chiqimRecordId → productId → jami ulush.
  // Receiptda per-product bo'lmasa (eski yozuv) — skalyar receivedRatio o'sha
  // yukning BARCHA tovarlariga bir xil qo'llanadi (backward-compat).
  const cumulativeReceivedProductRatios = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    for (const r of allReceipts) {
      const ppr = r.receivedProductRatios ?? {};
      for (const [crId, ratio] of Object.entries(r.receivedRatios)) {
        if (!totals[crId]) totals[crId] = {};
        const per = ppr[crId];
        const pids = per ? Object.keys(per) : (chiqimById[crId]?.selectedProductIds ?? []);
        for (const pid of pids) totals[crId][pid] = (totals[crId][pid] ?? 0) + (per ? (per[pid] ?? 0) : Number(ratio));
      }
    }
    return totals;
  }, [allReceipts, chiqimById]);

  const ownReceivedProductRatios = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    for (const r of uzbReceipts) {
      const ppr = r.receivedProductRatios ?? {};
      for (const [crId, ratio] of Object.entries(r.receivedRatios)) {
        if (!totals[crId]) totals[crId] = {};
        const per = ppr[crId];
        const pids = per ? Object.keys(per) : (chiqimById[crId]?.selectedProductIds ?? []);
        for (const pid of pids) totals[crId][pid] = (totals[crId][pid] ?? 0) + (per ? (per[pid] ?? 0) : Number(ratio));
      }
    }
    return totals;
  }, [uzbReceipts, chiqimById]);

  // SHU omborda "qayta ishlangan" (settled) yuklar — W'da qabul yozuvi bo'lgan barcha
  // yuklar (hatto hammasi "Yo'q" bo'lsa ham). Bunday yuk endi "kutilayotgan furalar"da
  // va "yo'lda"da ko'rinmaydi; qabul qilinmagan qismi shu omborda ushlab qolinadi.
  const settledAtWIds = useMemo(
    () => new Set(uzbReceipts.flatMap(r => Object.keys(r.receivedRatios ?? {}))),
    [uzbReceipts],
  );

  // Har bir chiqim yukining JORIY manzil ombori: boshlanishida destWarehouseId,
  // qisman qabulda qoldiq boshqa omborga yo'naltirilsa — oxirgi forward
  const currentDestMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const cr of allChinaChiqim) map[cr.id] = cr.destWarehouseId ?? null;
    for (const cr of chiqimRecords) if (!(cr.id in map)) map[cr.id] = cr.destWarehouseId ?? null;
    const sorted = [...allReceipts].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const r of sorted) {
      for (const [crId, fwd] of Object.entries(r.forwards ?? {})) map[crId] = fwd;
    }
    return map;
  }, [allChinaChiqim, chiqimRecords, allReceipts]);

  // Chiqim yuki statusi — manba ombor tarixida ko'rsatish uchun
  const chiqimStatusOf = (cr: ChiqimRecord) => {
    const received = cumulativeReceivedRatios[cr.id] ?? 0;
    const destId = currentDestMap[cr.id] ?? cr.destWarehouseId ?? null;
    const destName = destId ? (allWarehouses.find(w => w.id === destId)?.name ?? "Noma'lum ombor") : null;
    if (received >= 0.999) return { key: "received" as const, label: "Qabul qilindi", destName };
    if (received > 0) return { key: "partial" as const, label: `Qisman qabul (${Math.round(received * 100)}%)`, destName };
    return { key: "transit" as const, label: "Yo'lda", destName };
  };

  // Only fully received go to archive — partial stays in active.
  // 0.999 chegarasi chiqimStatusOf bilan BIR XIL: ulushlar 4 kasrga yaxlitlanib
  // saqlangani uchun ikki qisman qabul 0.9999 bo'lishi mumkin — ilgari (v >= 1)
  // bunday yuk "Qabul qilindi" deb ko'rinsa ham kutish ro'yxatidan chiqmay qolardi.
  const receivedChiqimIds = useMemo(
    () => new Set(Object.entries(cumulativeReceivedRatios).filter(([, v]) => v >= 0.999).map(([k]) => k)),
    [cumulativeReceivedRatios]
  );

  // Group active (unreceived or partially received) chiqim records by vehicle, FIFO
  const activeTrucks = useMemo(() => {
    const byVehicle: Record<string, ChiqimRecord[]> = {};
    [...allChinaChiqim]
      .filter(cr => !receivedChiqimIds.has(cr.id))
      // SHU omborda qayta ishlangan (settled) yuklar endi kutish ro'yxatida ko'rinmaydi —
      // ularning qabul qilinmagan qismi "Qabul qilinmagan" bo'limida turadi.
      .filter(cr => !settledAtWIds.has(cr.id))
      .filter(cr => cr.warehouseId !== warehouse.id)
      .filter(cr => {
        // Faqat SHU omborga mo'ljallangan (yoki manzilsiz eski) yuklar ko'rinadi
        const dest = currentDestMap[cr.id];
        return !dest || dest === warehouse.id;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach(cr => {
        if (!byVehicle[cr.vehicleNumber]) byVehicle[cr.vehicleNumber] = [];
        byVehicle[cr.vehicleNumber].push(cr);
      });
    return byVehicle;
  }, [allChinaChiqim, receivedChiqimIds, settledAtWIds, currentDestMap, warehouse.id]);

  const activeTruckList = useMemo(
    () => Object.entries(activeTrucks).sort(
      (a, b) => new Date(a[1][0]?.createdAt ?? "").getTime() - new Date(b[1][0]?.createdAt ?? "").getTime()
    ),
    [activeTrucks]
  );

  // Tanlangan BARCHA furalarning yuklari (ro'yxat tartibida birlashtirilgan)
  const selectedTruckChiqims = useMemo(
    () => activeTruckList.filter(([vn]) => selectedVehicles.has(vn)).flatMap(([, chiqims]) => chiqims),
    [selectedVehicles, activeTruckList]
  );

  // Product lookup map from all china kirim records
  const globalProductMap = useMemo(() => {
    const map: Record<string, KirimProduct> = {};
    allChinaKirim.forEach(r => r.products.forEach(p => { map[p.id] = p; }));
    return map;
  }, [allChinaKirim]);

  // Bir tovar uchun HOZIR qabul qilinadigan ulush (tovarning jo'natilgan miqdoriga
  // nisbatan, 0..1). Ilgari qabul qilingan qism (cumulative) chiqarib tashlanadi.
  const productAcceptRatio = (cr: ChiqimRecord, pid: string): number => {
    const p = globalProductMap[pid];
    if (!p) return 0;
    const dispShare = cr.productRatios?.[pid] ?? 1;
    const already = cumulativeReceivedProductRatios[cr.id]?.[pid] ?? 0;
    const remaining = Math.max(0, 1 - already);
    const clientMode = vehicleMode === "full" ? "full" : (crModes[cr.id] ?? "full");
    if (clientMode === "full") return remaining;
    const pp = crProductPartials[cr.id]?.[pid];
    const mode = pp?.mode ?? "full";
    if (mode === "none") return 0;
    if (mode === "partial") {
      const entered = parseFloat(pp?.qty || "0");
      const dispInBasis = productBasisTotal(p, pp?.unit || "joy") * dispShare;
      return dispInBasis > 0 ? Math.max(0, Math.min(remaining, entered / dispInBasis)) : 0;
    }
    return remaining; // "full" — qolgan hammasi
  };

  // Bir yuk (chiqim) bo'yicha: har tovarning qabul ulushi + umumiy (og'irlikli) ulush.
  const computeCrAccept = (cr: ChiqimRecord): { perProduct: Record<string, number>; aggregate: number } => {
    const perProduct: Record<string, number> = {};
    let wSum = 0, wAcc = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid];
      if (!p) continue;
      const dispShare = cr.productRatios?.[pid] ?? 1;
      const acc = productAcceptRatio(cr, pid);
      perProduct[pid] = acc;
      const joy = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * dispShare;
      const w = joy > 0 ? joy : ((parseFloat(p.quantity) || 0) * dispShare || 1);
      wSum += w; wAcc += w * acc;
    }
    return { perProduct, aggregate: wSum > 0 ? wAcc / wSum : 0 };
  };

  // ── TOVAR-DARAJALI qisman qabul qatorlari ──
  // Har bir tovarni ALOHIDA: Hammasi / Bir qismi (miqdor + o'lchov) / Yo'q.
  // Bitta odamda 2 (yoki undan ko'p) tovar bo'lsa, ularni mustaqil qabul qilish mumkin.
  const renderPartialProductRows = (cr: ChiqimRecord, accent: "blue" | "violet") => {
    const c = accent === "violet"
      ? { border: "border-violet-200", onSoft: "bg-violet-50 border-violet-200 text-violet-600", on: "bg-violet-500 border-violet-500 text-white", off: "bg-white border-gray-200 text-gray-400 hover:border-violet-200", input: "border-violet-200 focus:border-violet-400", ring: "focus:ring-violet-500/20", fwdHdr: "text-violet-700" }
      : { border: "border-[#BFDBFE]", onSoft: "bg-[#EFF6FF] border-[#BFDBFE] text-[#005AB5]", on: "bg-[#005AB5] border-[#005AB5] text-white", off: "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#BFDBFE]", input: "border-[#BFDBFE] focus:border-[#005AB5]", ring: "focus:ring-[#005AB5]/20", fwdHdr: "text-[#005AB5]" };

    let anyHeld = false;
    const rows = cr.selectedProductIds.map(pid => {
      const p = globalProductMap[pid];
      if (!p) return null;
      const name = p.measurements.filter(m => m.value).map(m => m.value).join(" ").trim() || "Tovar";
      const dispShare = cr.productRatios?.[pid] ?? 1;
      const remaining = Math.max(0, 1 - (cumulativeReceivedProductRatios[cr.id]?.[pid] ?? 0));
      const pp: ProdPartial = crProductPartials[cr.id]?.[pid] ?? { mode: "full", qty: "", unit: "joy" };
      const basis = pp.unit || "joy";
      // "soni" (dona) — HAR DOIM butun son; qolgan o'lchovlar 2 kasrgacha.
      const rawMax = productBasisTotal(p, basis) * dispShare * remaining;
      const maxQty = basis === "soni" ? Math.round(rawMax) : Math.round(rawMax * 100) / 100;
      if (remaining - productAcceptRatio(cr, pid) > 0.0005) anyHeld = true;
      return { pid, name, dispShare, remaining, pp, basis, maxQty, done: remaining <= 0.0005 };
    }).filter((r): r is NonNullable<typeof r> => !!r);

    return (
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.pid} className={`rounded-lg border ${c.border} bg-white overflow-hidden`}>
            <div className="flex items-center gap-2 px-2.5 py-2">
              <Package className="w-3 h-3 text-[#9CA3AF] shrink-0" />
              <span className="text-[11px] font-bold text-foreground flex-1 truncate">{r.name}</span>
              {r.done ? (
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">To'liq qabul qilingan</span>
              ) : (
                <div className="flex gap-1 shrink-0">
                  {([["full", "Hammasi"], ["partial", "Bir qismi"], ["none", "Yo'q"]] as const).map(([m, label]) => (
                    <button key={m} type="button"
                      onClick={() => setProductPartial(cr.id, r.pid, { mode: m })}
                      className={`px-2 py-1 rounded-md text-[9px] font-black border transition-all ${
                        r.pp.mode === m ? (m === "none" ? "bg-red-500 border-red-500 text-white" : m === "partial" ? c.on : c.onSoft) : c.off
                      }`}
                    >{label}</button>
                  ))}
                </div>
              )}
            </div>
            {!r.done && r.pp.mode === "partial" && (
              <div className="px-2.5 pb-2 flex gap-1.5">
                <input type="number" onWheel={noWheel} min="0" step="any" max={r.maxQty}
                  value={r.pp.qty}
                  onChange={e => setProductPartial(cr.id, r.pid, { qty: clampToMax(e.target.value, r.maxQty) })}
                  placeholder={`Max ${r.maxQty}`}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg border ${c.input} bg-white text-xs font-bold text-[#374151] focus:outline-none focus:ring-2 ${c.ring}`}
                />
                <select value={r.basis}
                  onChange={e => {
                    const u = e.target.value;
                    const p = globalProductMap[r.pid];
                    const rawNewMax = p ? productBasisTotal(p, u) * r.dispShare * r.remaining : 0;
                    const newMax = u === "soni" ? Math.round(rawNewMax) : Math.round(rawNewMax * 100) / 100;
                    setProductPartial(cr.id, r.pid, { unit: u, qty: clampToMax(r.pp.qty, newMax) });
                  }}
                  className={`px-2 py-1.5 rounded-lg border ${c.input} bg-white text-[11px] font-bold text-[#374151] focus:outline-none max-w-[46%]`}
                >
                  {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}

        {anyHeld && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
            <p className="text-[10px] font-bold text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              Qabul qilinmagan qism shu omborning «Qabul qilinmagan» bo'limida saqlanadi — keyin xohlagancha chiqim qilsa bo'ladi.
            </p>
          </div>
        )}
      </div>
    );
  };

  const fmt2 = (v: number) => Math.round(v * 100) / 100;
  const fmt3 = (v: number) => Math.round(v * 1000) / 1000;

  // Chiqim yukining tovarlari va jami qiymatlari (productRatios bilan) —
  // arxivdagi "Batafsil" bo'limi uchun
  const crCargo = (cr: ChiqimRecord) => {
    const items: { name: string; share: number; joys: number; qty: number; brutto: number; vol: number }[] = [];
    let joys = 0, qty = 0, brutto = 0, vol = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid] ?? allProductMap[pid]?.product;
      if (!p) continue;
      const share = cr.productRatios?.[pid] ?? 1;
      const pj = p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0) * share;
      const pq = (parseFloat(p.quantity) || 0) * share;
      const pb = bruttoKg(p) * share;
      const pv = (parseFloat(p.totalVolume || "0") || 0) * share;
      joys += pj; qty += pq; brutto += pb; vol += pv;
      items.push({ name: productSummary(p), share, joys: pj, qty: Math.round(pq), brutto: pb, vol: pv });
    }
    return { items, totals: { joys: fmt2(joys), qty: Math.round(qty), brutto: fmt2(brutto), vol: fmt3(vol) } };
  };

  // Mijoz kartasi sarlavhasi uchun: yukning shu omborда HALI QOLGAN (chiqarilmagan)
  // qismi — dona/joy/kg/hajm. crCargo butun KELGAN yukni beradi; bu esa availByCrPid
  // (qolgan ulush) bilan hisoblaydi, shunda "qancha chiqara olaman" ko'rinadi.
  const crRemaining = (cr: ChiqimRecord) => {
    let joys = 0, qty = 0, brutto = 0, vol = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid] ?? allProductMap[pid]?.product;
      if (!p) continue;
      const avail = availByCrPid[`${cr.id}:${pid}`] ?? 0;
      if (avail <= 0) continue;
      joys += p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0) * avail;
      qty += (parseFloat(p.quantity) || 0) * avail;
      brutto += bruttoKg(p) * avail;
      vol += (parseFloat(p.totalVolume || "0") || 0) * avail;
    }
    return { totals: { joys: fmt2(joys), qty: Math.round(qty), brutto: fmt2(brutto), vol: fmt3(vol) } };
  };

  // Chiqim/o'tkazma ARXIVI uchun: shu amalda HAQIQATAN chiqarilgan/o'tkazilgan
  // miqdor (tovar-darajali ulush bilan). crCargo butun yukni beradi; bu esa faqat
  // shu chiqimda ketgan qismini beradi — arxivda 67 emas, real 37/30 ko'rinsin uchun.
  // pct = shu yukning omborда bor bo'lgan qismidan qancha ulush chiqarilgani.
  const movedCargo = (
    cr: ChiqimRecord,
    perProduct?: Record<string, number>,
    scalarRatio = 1,
  ) => {
    let joys = 0, qty = 0, brutto = 0, vol = 0, inQty = 0, inJoys = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid] ?? allProductMap[pid]?.product;
      if (!p) continue;
      const inShare = cr.productRatios?.[pid] ?? 1;                    // omborga kelgan ulush (to'liq mahsulotга nisbatan)
      const moved = (perProduct && perProduct[pid] != null)
        ? Number(perProduct[pid])                                     // aniq: shu amalда ketgan ulush
        : inShare * scalarRatio;                                      // eski yozuv (per-product yo'q) — taxminiy
      const fJoys = p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0);
      const fQty = parseFloat(p.quantity) || 0;
      joys += fJoys * moved; qty += fQty * moved;
      brutto += bruttoKg(p) * moved; vol += (parseFloat(p.totalVolume || "0") || 0) * moved;
      inJoys += fJoys * inShare; inQty += fQty * inShare;
    }
    const pct = inQty > 0 ? Math.min(1, qty / inQty) : (inJoys > 0 ? Math.min(1, joys / inJoys) : scalarRatio);
    return { joys: fmt2(joys), qty: Math.round(qty), brutto: fmt2(brutto), vol: fmt3(vol), pct };
  };

  // Bir furadagi barcha yuklarning jami — kartochkada ochmasdan ko'rsatish uchun:
  // tovar soni, dona (soni), joy, brutto (kg), hajm (m³).
  const truckTotals = (chiqims: ChiqimRecord[]) => {
    let tovar = 0, qty = 0, joys = 0, brutto = 0, vol = 0;
    for (const cr of chiqims) {
      tovar += cr.selectedProductIds.length;
      const c = crCargo(cr);
      qty += c.totals.qty; joys += c.totals.joys; brutto += c.totals.brutto; vol += c.totals.vol;
    }
    return { tovar, qty, joys: fmt2(joys), brutto: fmt2(brutto), vol: fmt3(vol) };
  };

  // Chiqim yozuvidagi tovar nomlari (o'lchov qiymatlari) — fura qabul qilishda
  // "nima kelmoqda" ni ko'rsatish uchun.
  const productNamesOf = (cr: ChiqimRecord): string[] =>
    cr.selectedProductIds
      .map(pid => globalProductMap[pid])
      .filter((p): p is KirimProduct => !!p)
      .map(p => p.measurements.filter(m => m.value).map(m => m.value).join(" ").trim() || "Tovar");

  // Chiqim yozuvidagi har bir tovar bo'yicha TO'LIQ ma'lumot — chiqimdagidek:
  // nom, ulush (qisman bo'lsa %), soni (dona), joy soni, brutto (kg), hajm (m³) + Jami.
  const productRowsOf = (cr: ChiqimRecord) => {
    const rows: { name: string; share: number; qty: number; joys: number; brutto: number; vol: number }[] = [];
    let qty = 0, joys = 0, brutto = 0, vol = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid];
      if (!p) continue;
      const share = cr.productRatios?.[pid] ?? 1;
      const name = p.measurements.filter(m => m.value).map(m => m.value).join(" ").trim() || "Tovar";
      const pq = (parseFloat(p.quantity) || 0) * share;
      const pj = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share;
      const pb = bruttoKg(p) * share;
      const pv = (parseFloat(p.totalVolume || "0") || 0) * share;
      qty += pq; joys += pj; brutto += pb; vol += pv;
      rows.push({ name, share, qty: Math.round(pq), joys: fmt2(pj), brutto: fmt2(pb), vol: fmt3(pv) });
    }
    return { rows, totals: { qty: Math.round(qty), joys: fmt2(joys), brutto: fmt2(brutto), vol: fmt3(vol) } };
  };

  // Bitta kirim tovari bo'yicha chiqimlar tarixi va qoldiq —
  // "shu kuni shuncha tovar shu furada chiqib ketdi" ro'yxati
  const productDispatchHistory = (p: KirimProduct) => {
    const totalJoys = p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0);
    const qty = parseFloat(p.quantity) || 0;
    const bkg = bruttoKg(p);
    const vol = parseFloat(p.totalVolume || "0") || 0;
    const events = chiqimRecords
      .filter(cr => cr.selectedProductIds.includes(p.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(cr => {
        const share = cr.productRatios?.[p.id] ?? 1;
        const destId = cr.destWarehouseId ?? null;
        return {
          id: cr.id,
          date: String(cr.date).slice(0, 10),
          vehicle: cr.vehicleNumber,
          destName: destId ? (allWarehouses.find(w => w.id === destId)?.name ?? null) : null,
          share,
          joys: fmt2(totalJoys * share),
          qty: Math.round(qty * share), // dona — butun son (mahsulotni bo'lib bo'lmaydi)
          brutto: fmt2(bkg * share),
          vol: fmt3(vol * share),
        };
      });
    const dispatchedShare = Math.min(1, events.reduce((s2, e) => s2 + e.share, 0));
    const remainingShare = Math.max(0, 1 - dispatchedShare);
    return {
      events,
      remaining: {
        share: remainingShare,
        joys: fmt2(totalJoys * remainingShare),
        qty: Math.round(qty * remainingShare), // dona — butun son
        brutto: fmt2(bkg * remainingShare),
        vol: fmt3(vol * remainingShare),
      },
    };
  };

  // ── Qabul qilingan tovar kartasi — yaratuvchi ombordagi kabi TO'LIQ info.
  // Har bir qabul qiluvchi ombor "Kirim" bo'limida tovar tugaguncha turadi. ──
  const renderStockProductCard = (
    item: { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming?: number },
    idx: number,
    accent: "blue" | "violet" = "blue",
  ) => {
    const { pid, product: p, source, available } = item;
    const incoming = item.incoming ?? 1;                       // omborga real kelgan ulush
    const dispatchedShare = Math.max(0, incoming - available); // shu ombordan chiqib ketgan ulush
    const hasDispatched = dispatchedShare > 0.0005;
    const totalJoys = p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0);
    const fullQty = parseFloat(p.quantity) || 0;
    const fullVol = parseFloat(p.totalVolume || "0") || 0;
    const isPartial = available < 0.9995;
    const chip = accent === "violet" ? "text-violet-600 bg-violet-50" : "text-[#005AB5] bg-[#EFF6FF]";
    const iconWrap = accent === "violet" ? "bg-violet-50 text-violet-600" : "bg-[#EFF6FF] text-[#005AB5]";
    const productName = p.measurements.filter(m => m.value).map(m => m.value).join(", ") || `Tovar ${idx + 1}`;
    return (
      <div key={`${source.id}:${pid}`} className="bg-card rounded-xl border border-border/60 overflow-hidden hover:border-border transition-colors">
        {/* Sarlavha: tovar nomi + mijoz + holat + fura */}
        <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
            <Package className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-black text-foreground truncate">{productName}</p>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${chip}`}>{source.clientCode}</span>
              {isPartial && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  {Math.round(available * 100)}% mavjud
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {String(source.date).slice(0, 10)} · {source.clientName || source.clientCode}
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 shrink-0 font-mono">
            <Truck className="w-3 h-3" />{source.vehicleNumber}
          </span>
        </div>

        {/* SHU omborda MAVJUD (bucket) ulush — Dona eng yuqori prioritet (butun son) */}
        <div className="grid grid-cols-4 gap-px bg-border/40 border-y border-border/40">
          {[
            { label: "Soni", val: fullQty ? Math.floor(clean(fullQty * available)) : "—", sub: "dona" },
            { label: "Joy", val: totalJoys ? clean(totalJoys * available) : "—", sub: "joy" },
            { label: "Brutto", val: p.brutto ? clean(bruttoKg(p) * available) : "—", sub: p.bruttoUnit || "kg" },
            { label: "Hajm", val: fullVol ? clean(fullVol * available) : "—", sub: "m³" },
          ].map(s => (
            <div key={s.label} className="bg-card px-2 py-2 text-center min-w-0">
              <p className="text-[13px] font-black text-foreground leading-tight truncate">{s.val}</p>
              <p className="text-[8px] text-muted-foreground/70 font-black uppercase tracking-wider mt-0.5">{s.label}</p>
              {s.sub && <p className="text-[8px] text-muted-foreground/50 truncate">{s.sub}</p>}
            </div>
          ))}
        </div>

        <div className="px-3 py-2 space-y-1">
          {p.note && <p className="text-[11px] text-muted-foreground italic">{p.note}</p>}
          {hasDispatched && (
            <p className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              Kelgan: {Math.round(fullQty * incoming)} dona · chiqib ketgan: {Math.round(fullQty * dispatchedShare)} dona
            </p>
          )}
        </div>
      </div>
    );
  };

  // ── Arxiv kartalari uchun to'liq "Batafsil" bloklari ──
  // accent: har bir ombor turining o'z rangi (china=ko'k, o'rta ombor=amber)
  const renderChiqimArchiveDetails = (record: ChiqimRecord, accent: "blue" | "amber" = "blue") => {
    const cargo = crCargo(record);
    const st = chiqimStatusOf(record);
    const acText = accent === "amber" ? "text-amber-600" : "text-blue-600";
    const acVal = accent === "amber" ? "text-amber-700" : "text-blue-700";
    return (
      <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="text-[10px] text-muted-foreground">Mijoz ID: <strong className={`font-mono ${acText}`}>{record.clientCode}</strong></span>
          {record.clientName && <span className="text-[10px] text-muted-foreground">Ism: <strong className="text-foreground">{record.clientName}</strong></span>}
          {record.clientPhone && <span className="text-[10px] text-muted-foreground">Tel: <strong className="text-foreground">{record.clientPhone}</strong></span>}
          <span className="text-[10px] text-muted-foreground">Sana: <strong className="text-foreground">{String(record.date).slice(0, 10)}</strong></span>
          <span className="text-[10px] text-muted-foreground">Fura: <strong className="font-mono text-foreground">{record.vehicleNumber}</strong></span>
          {st.destName && <span className="text-[10px] text-muted-foreground">Manzil ombor: <strong className="text-foreground">{st.destName}</strong></span>}
          <span className="text-[10px] text-muted-foreground">Holat: <strong className={st.key === "received" ? "text-emerald-600" : st.key === "partial" ? "text-amber-600" : "text-blue-600"}>{st.label}</strong></span>
          <span className="text-[10px] text-muted-foreground">Yaratilgan: <strong className="text-foreground">{fmtDateTime(record.createdAt)}</strong></span>
        </div>
        {cargo.items.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Tovarlar ({cargo.items.length} ta)</p>
            {cargo.items.map((it, i) => (
              <div key={i} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
                <p className="text-[10px] font-bold text-foreground leading-snug">
                  {i + 1}. {it.name}
                  {it.share < 0.9995 && <span className="text-amber-600"> · {Math.round(it.share * 100)}% qismi</span>}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {fmt2(it.joys)} joy · {fmt2(it.qty)} dona · {fmt2(it.brutto)} kg · {fmt3(it.vol)} m³
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "Joy", val: cargo.totals.joys },
            { label: "Soni", val: cargo.totals.qty },
            { label: "Brutto kg", val: cargo.totals.brutto },
            { label: "m³", val: cargo.totals.vol },
          ].map(c => (
            <div key={c.label} className="text-center bg-card border border-border/60 rounded-lg py-1.5">
              <p className={`text-[11px] font-black ${acVal}`}>{c.val || "—"}</p>
              <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
        {record.note && <p className="text-[9px] italic text-muted-foreground">Izoh: {record.note}</p>}
        {record.photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {record.photos.map((ph, i) => (
              <img key={i} src={ph.dataUrl} alt={ph.name} onClick={() => openPhotoUrl(ph.dataUrl)}
                className="w-full aspect-square rounded-md object-cover border border-border cursor-pointer hover:opacity-90 transition-opacity" />
            ))}
          </div>
        )}
      </div>
    );
  };

  // accent: chiqaruvchi/o'rta mijoz=ko'k, chegara/o'rta ombor=binafsha
  const renderReceiptArchiveDetails = (receipt: ChiqimReceipt, accent: "blue" | "violet" = "blue") => (
    <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5 space-y-1.5">
      {Object.entries(receipt.receivedRatios).map(([crId, ratio]) => {
        const cr = allChinaChiqim.find(c => c.id === crId);
        if (!cr) return <p key={crId} className="text-[9px] text-muted-foreground italic">Yuk ma'lumoti topilmadi</p>;
        const cargo = crCargo(cr);
        const fwdId = receipt.forwards?.[crId];
        const fwdName = fwdId ? (allWarehouses.find(w => w.id === fwdId)?.name ?? "Noma'lum ombor") : null;
        const chipCls = accent === "violet" ? "text-violet-600 bg-violet-50" : "text-blue-600 bg-blue-50";
        return (
          <div key={crId} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[9px] font-black font-mono px-1 py-0.5 rounded ${chipCls}`}>{cr.clientCode}</span>
              {cr.clientName && <span className="text-[9px] text-muted-foreground">{cr.clientName}</span>}
              <span className={`text-[9px] font-bold ${ratio < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                {Math.round(ratio * 100)}% qabul qilindi
              </span>
              {fwdName && <span className="text-[9px] font-bold text-violet-600">qoldiq → {fwdName}</span>}
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {cr.selectedProductIds.length} tovar · {fmt2(cargo.totals.joys)} joy · {fmt2(cargo.totals.qty)} dona · {fmt2(cargo.totals.brutto)} kg · {cargo.totals.vol} m³
            </p>
            <p className="text-[9px] text-muted-foreground/60">Fura: {cr.vehicleNumber} · Chiqim sanasi: {String(cr.date).slice(0, 10)}</p>
          </div>
        );
      })}
      {receipt.note && <p className="text-[9px] italic text-muted-foreground">Izoh: {receipt.note}</p>}
    </div>
  );

  const renderDispatchArchiveDetails = (d: UzbDispatch) => (
    <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5 space-y-1.5">
      {(d.vehicleNumber || (d.photos && d.photos.length > 0)) && (
        <div className="flex items-center gap-2 flex-wrap pb-1.5 mb-1 border-b border-border/50">
          {d.vehicleNumber && (
            <span className="text-[9px] font-bold font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Truck className="w-2.5 h-2.5" /> {d.vehicleNumber}
            </span>
          )}
          {d.photos && d.photos.length > 0 && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Camera className="w-2.5 h-2.5" /> {d.photos.length} rasm
            </span>
          )}
          {(d.photos ?? []).slice(0, 5).map((ph, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); openPhotoUrl(ph.dataUrl); }} className="w-8 h-8 rounded overflow-hidden border border-border">
              <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {d.chiqimRecordIds.map(crId => {
        const cr = allChinaChiqim.find(c => c.id === crId);
        if (!cr) return <p key={crId} className="text-[9px] text-muted-foreground italic">Yuk ma'lumoti topilmadi</p>;
        // HAQIQATAN chiqarilgan miqdor (tovar-darajali ulush bilan) — butun yuk emas
        const cargo = movedCargo(cr, d.productRatios?.[crId], d.ratios[crId] ?? 1);
        return (
          <div key={crId} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black text-blue-600 font-mono bg-blue-50 px-1 py-0.5 rounded">{cr.clientCode}</span>
              {cr.clientName && <span className="text-[9px] text-muted-foreground">{cr.clientName}</span>}
              <span className={`text-[9px] font-bold ${cargo.pct < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                {Math.round(cargo.pct * 100)}% chiqarildi
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {cr.selectedProductIds.length} tovar · {cargo.joys} joy · {cargo.qty} dona · {cargo.brutto} kg · {cargo.vol} m³
            </p>
            <p className="text-[9px] text-muted-foreground/60">Kelgan fura: {cr.vehicleNumber} · {String(cr.date).slice(0, 10)}</p>
          </div>
        );
      })}
      {d.note && <p className="text-[9px] italic text-muted-foreground">Izoh: {d.note}</p>}
    </div>
  );

  // O'tkazma (ombor→ombor) arxiv "Batafsil" bloki
  const renderTransferArchiveDetails = (t: UzbTransfer) => (
    <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5 space-y-1.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="text-[10px] text-muted-foreground">Manba ombor: <strong className="text-foreground">{allWarehouses.find(w => w.id === t.sourceWarehouseId)?.name ?? "Noma'lum"}</strong></span>
        <span className="text-[10px] text-muted-foreground">Manzil ombor: <strong className="text-foreground">{allWarehouses.find(w => w.id === t.destWarehouseId)?.name ?? "Noma'lum"}</strong></span>
        <span className="text-[10px] text-muted-foreground">Jo'natilgan: <strong className="text-foreground">{String(t.transferredAt).slice(0, 10)}</strong></span>
        <span className="text-[10px] text-muted-foreground">Holat: <strong className={t.status === "received" ? "text-emerald-600" : "text-amber-600"}>{t.status === "received" ? "Qabul qilindi" : "Yo'lda"}</strong></span>
        {t.receivedAt && <span className="text-[10px] text-muted-foreground">Qabul vaqti: <strong className="text-foreground">{fmtDateTime(String(t.receivedAt))}</strong></span>}
      </div>
      {t.chiqimRecordIds.map(crId => {
        const cr = allChinaChiqim.find(c => c.id === crId);
        if (!cr) return <p key={crId} className="text-[9px] text-muted-foreground italic">Yuk ma'lumoti topilmadi</p>;
        // HAQIQATAN o'tkazilgan miqdor (tovar-darajali ulush bilan) — butun yuk emas
        const cargo = movedCargo(cr, t.productRatios?.[crId], t.ratios[crId] ?? 1);
        return (
          <div key={crId} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black text-blue-600 font-mono bg-blue-50 px-1 py-0.5 rounded">{cr.clientCode}</span>
              {cr.clientName && <span className="text-[9px] text-muted-foreground">{cr.clientName}</span>}
              <span className={`text-[9px] font-bold ${cargo.pct < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                {Math.round(cargo.pct * 100)}% o'tkazildi
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {cr.selectedProductIds.length} tovar · {cargo.joys} joy · {cargo.qty} dona · {cargo.brutto} kg · {cargo.vol} m³
            </p>
            <p className="text-[9px] text-muted-foreground/60">Kelgan fura: {cr.vehicleNumber} · {String(cr.date).slice(0, 10)}</p>
          </div>
        );
      })}
      {t.note && <p className="text-[9px] italic text-muted-foreground">Izoh: {t.note}</p>}
    </div>
  );

  // O'tkazma arxiv kartasi — kirim ("in") va chiqim ("out") arxivlari uchun
  const renderTransferArchiveCard = (t: UzbTransfer, direction: "in" | "out") => {
    const received = t.status === "received";
    const otherWh = allWarehouses.find(w => w.id === (direction === "out" ? t.destWarehouseId : t.sourceWarehouseId));
    return (
      <div key={`tr-${t.id}`} className="bg-card rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${received ? "bg-emerald-50 border border-emerald-100" : "bg-amber-50 border border-amber-100"}`}>
              <Building2 className={`w-4 h-4 ${received ? "text-emerald-600" : "text-amber-600"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg font-mono">{t.clientCode}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${received ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"}`}>
                  {received ? "Qabul qilindi" : "Yo'lda"}
                </span>
              </div>
              {t.clientName && t.clientName !== t.clientCode && (
                <p className="text-xs text-muted-foreground font-medium mt-1">{t.clientName}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {direction === "out" ? "→" : "←"} {otherWh?.name ?? "Noma'lum ombor"} · {t.chiqimRecordIds.length} ta yuk
              </p>
              {t.note && <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">{t.note}</p>}
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">{fmtDate(t.transferredAt)} · {fmtDateTime(t.createdAt)}</p>
            </div>
          </div>
          <span title="Arxiv yozuvi o'chirilmaydi" className="shrink-0 p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
        </div>
        <button
          onClick={() => toggleArchiveExpand(t.id)}
          className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors"
        >
          {expandedArchiveIds.has(t.id)
            ? <><ChevronUp className="w-3 h-3" /> Yopish</>
            : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
        </button>
        {expandedArchiveIds.has(t.id) && renderTransferArchiveDetails(t)}
      </div>
    );
  };

  // Calculator totals for current truck selection
  const receiptTotals = useMemo(() => {
    let clients = 0, products = 0, qty = 0, places = 0, volume = 0, brutto = 0;
    const eligible = vehicleMode === "full"
      ? selectedTruckChiqims
      : selectedTruckChiqims.filter(cr => selectedClientIds.has(cr.id));
    for (const cr of eligible) {
      clients += 1;
      for (const pid of cr.selectedProductIds) {
        const p = globalProductMap[pid];
        if (!p) continue;
        const share = cr.productRatios?.[pid] ?? 1;
        const acc = productAcceptRatio(cr, pid); // TOVAR-DARAJALI qabul ulushi
        if (acc > 0.0005) products += 1;
        const f = share * acc;
        qty    += (parseFloat(p.quantity)    || 0) * f;
        places += p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * f;
        volume += (parseFloat(p.totalVolume) || 0) * f;
        brutto += bruttoKg(p) * f;
      }
    }
    return {
      clients,
      products,
      qty:    Math.round(qty),                       // dona — butun son (mahsulotni bo'lib bo'lmaydi)
      places: Math.round(places * 100) / 100,
      volume: Math.round(volume * 1000) / 1000,
      brutto: Math.round(brutto * 100) / 100,
    };
  }, [selectedTruckChiqims, vehicleMode, selectedClientIds, crModes, crProductPartials, globalProductMap, cumulativeReceivedProductRatios]);

  // ── UZB Dispatch + Transfer computed ─────────────────
  // Faqat TO'LIQ chiqarilgan (ulush yig'indisi ≈ 1) yuk stockdan butunlay chiqadi.
  // Qisman chiqarilgan yukning qolgan qismi omborda qoladi (quyida per-product ayiriladi).
  const uzbDispatchedIds = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const d of uzbDispatches) for (const crId of d.chiqimRecordIds) sum[crId] = (sum[crId] ?? 0) + (d.ratios?.[crId] ?? 1);
    return new Set(Object.entries(sum).filter(([, v]) => v >= 0.999).map(([k]) => k));
  }, [uzbDispatches]);

  // TO'LIQ o'tkazilgan (yo'lda yoki qabul qilingan) yuklar manba ombordan chiqadi.
  const uzbTransferredOutIds = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const t of outgoingTransfers) for (const crId of t.chiqimRecordIds) sum[crId] = (sum[crId] ?? 0) + (t.ratios?.[crId] ?? 1);
    return new Set(Object.entries(sum).filter(([, v]) => v >= 0.999).map(([k]) => k));
  }, [outgoingTransfers]);

  // Manba ombor: hali yo'lda bo'lgan (qabul qilinmagan) chiqayotgan o'tkazmalar
  const outgoingInTransit = useMemo(
    () => outgoingTransfers.filter(t => t.status !== "received"),
    [outgoingTransfers]
  );
  // Manba ombor: manzil tomonidan qabul qilingan o'tkazmalar (arxiv/tugallangan)
  const outgoingReceived = useMemo(
    () => outgoingTransfers.filter(t => t.status === "received"),
    [outgoingTransfers]
  );

  // Manzil ombor: hali qabul qilinmagan (yo'ldagi) kelayotgan o'tkazmalar
  const pendingIncomingTransfers = useMemo(
    () => incomingTransfers.filter(t => t.status !== "received"),
    [incomingTransfers]
  );

  // Faqat QABUL QILINGAN o'tkazmalar manzil ombor omboriga (stock) qo'shiladi.
  // Yo'lda bo'lganlar hali qabul qilinmagani uchun stockка kirmaydi.
  const incomingTransferChiqimIds = useMemo(
    () => new Set(incomingTransfers.filter(t => t.status === "received").flatMap(t => t.chiqimRecordIds)),
    [incomingTransfers]
  );

  // Shu omborda mavjud tovarlar = o'zi qabul qilgan (qisman bo'lsa ham) + qabul qilingan o'tkazmalar
  const effectiveReceivedIds = useMemo(
    () => new Set([
      ...Object.entries(ownReceivedRatios).filter(([, v]) => v > 0).map(([k]) => k),
      ...incomingTransferChiqimIds,
    ]),
    [ownReceivedRatios, incomingTransferChiqimIds]
  );

  // Items "gone" from this warehouse = dispatched OR transferred out
  const uzbGoneIds = useMemo(
    () => new Set([...uzbDispatchedIds, ...uzbTransferredOutIds]),
    [uzbDispatchedIds, uzbTransferredOutIds]
  );

  // Mijoz chiqim (UzbDispatch) + boshqa omborga o'tkazma bo'yicha SHU ombordan chiqib
  // ketgan TOVAR-DARAJALI ulushlar (fallback: skalyar ratio barcha tovarga).
  const uzbGoneProductRatios = useMemo(() => {
    const totals: Record<string, number> = {};
    const add = (rows: { chiqimRecordIds: string[]; ratios?: Record<string, number>; productRatios?: Record<string, Record<string, number>> }[]) => {
      for (const row of rows) {
        const ppr = row.productRatios ?? {};
        for (const crId of row.chiqimRecordIds) {
          const per = ppr[crId];
          if (per && Object.keys(per).length) {
            for (const [pid, v] of Object.entries(per)) totals[pid] = (totals[pid] ?? 0) + Number(v);
          } else {
            const cr = chiqimById[crId];
            const r = row.ratios?.[crId] ?? 1;
            if (cr) for (const pid of cr.selectedProductIds) totals[pid] = (totals[pid] ?? 0) + (cr.productRatios?.[pid] ?? 1) * r;
          }
        }
      }
    };
    add(uzbDispatches);
    add(outgoingTransfers);
    return totals;
  }, [uzbDispatches, outgoingTransfers, chiqimById]);

  // ── O'rta ombor: received-by-truck products re-dispatched onward by another truck ──
  // Shu ombor keyingi furalar bilan jo'natib bo'lgan ulushlari (productRatios bilan)
  const ortaDispatchedRatios = useMemo(() => {
    const totals: Record<string, number> = {};
    const mine = allChinaChiqim.filter(cr => cr.warehouseId === warehouse.id);
    for (const cr of mine) {
      for (const pid of cr.selectedProductIds) {
        totals[pid] = (totals[pid] ?? 0) + (cr.productRatios?.[pid] ?? 1);
      }
    }
    return totals;
  }, [allChinaChiqim, warehouse.id]);

  // Shu ombordan CHIQIB KETGAN jami (per-product): orta re-dispatch + mijoz chiqim + o'tkazma.
  const goneProductRatios = useMemo(() => {
    const totals: Record<string, number> = { ...ortaDispatchedRatios };
    for (const [pid, v] of Object.entries(uzbGoneProductRatios)) totals[pid] = (totals[pid] ?? 0) + v;
    return totals;
  }, [ortaDispatchedRatios, uzbGoneProductRatios]);

  // O'tkazma orqali QABUL QILINGAN (received) yuklar — manzil omborga kelgan
  // TOVAR-DARAJALI ulush (to'liq mahsulotga nisbatan). Fallback: skalyar ratio.
  const incomingAcceptedProductRatios = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const t of incomingTransfers) {
      if (t.status !== "received") continue;
      const ppr = t.productRatios ?? {};
      for (const crId of t.chiqimRecordIds) {
        if (!map[crId]) map[crId] = {};
        const per = ppr[crId];
        const cr = chiqimById[crId];
        if (per && Object.keys(per).length) {
          for (const [pid, v] of Object.entries(per)) map[crId][pid] = (map[crId][pid] ?? 0) + Number(v);
        } else if (cr) {
          const r = t.ratios?.[crId] ?? 1;
          for (const pid of cr.selectedProductIds) map[crId][pid] = (map[crId][pid] ?? 0) + (cr.productRatios?.[pid] ?? 1) * r;
        }
      }
    }
    return map;
  }, [incomingTransfers, chiqimById]);

  // Har (chiqim yozuvi, tovar) bo'yicha SHU omborga REAL kelgan ulush.
  // O'tkazma orqali kelgan bo'lsa — o'tkazilgan miqdor (ilgari bu holat 100% deb
  // olinib, keldi-ketti hisobda ORTIQCHA chiqimga yo'l qo'yilardi); fura orqali
  // bo'lsa — jo'natilgan × qabul qilingan.
  const incomingByCrPid = useMemo(() => {
    const rowsByPid: Record<string, { crId: string; incoming: number; createdAt: string }[]> = {};
    for (const cr of allChinaChiqim) {
      if (!effectiveReceivedIds.has(cr.id)) continue;
      const transferIn = incomingAcceptedProductRatios[cr.id];
      const ownPer = ownReceivedProductRatios[cr.id];
      const ownScalar = ownReceivedRatios[cr.id];
      const hasOwnReceipt = ownPer !== undefined || ownScalar !== undefined;
      for (const pid of cr.selectedProductIds) {
        const dispShare = cr.productRatios?.[pid] ?? 1;
        // Fura qabul (shu ombor) + qabul qilingan o'tkazma — IKKALASI ham qo'shiladi.
        // Ilgari o'tkazma bo'lsa fura qabul qismi e'tiborsiz qolib, aralash oqimda
        // tovar stockdan g'oyib bo'lardi. Yig'indi jo'natilgan ulushdan oshmaydi.
        const ownIncoming = hasOwnReceipt
          ? dispShare * Math.min(1, ownPer?.[pid] ?? ownScalar ?? 0)
          : 0;
        const transferIncoming = transferIn ? (transferIn[pid] ?? 0) : 0;
        const incoming = Math.min(dispShare, ownIncoming + transferIncoming);
        if (incoming <= 0) continue;
        (rowsByPid[pid] ??= []).push({ crId: cr.id, incoming, createdAt: cr.createdAt });
      }
    }
    return rowsByPid;
  }, [allChinaChiqim, effectiveReceivedIds, incomingAcceptedProductRatios, ownReceivedProductRatios, ownReceivedRatios]);

  // Chiqib ketgan (gone) ulush kelgan yozuvlarga FIFO tarzda taqsimlanadi.
  // MUHIM: ilgari gone butun tovar bo'yicha global bo'lib, bitta tovar ikki chiqim
  // yozuvi bilan kelganda HAR IKKI qatordan to'liq ayirilar edi (ikki marta ayirish) —
  // natijada real qoldiq ko'rinmay, chiqim qilib bo'lmay qolardi.
  const availByCrPid = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [pid, rows] of Object.entries(incomingByCrPid)) {
      let gone = goneProductRatios[pid] ?? 0;
      const sorted = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const row of sorted) {
        const used = Math.min(row.incoming, gone);
        gone -= used;
        map[`${row.crId}:${pid}`] = Math.max(0, row.incoming - used);
      }
    }
    return map;
  }, [incomingByCrPid, goneProductRatios]);

  // Yozuvning shu omborda REAL qoldiq tovari bormi — TOVAR-DARAJALI tekshiruv.
  // MUHIM: ilgari bu yerda skalyar uzbGoneIds (ratios yig'indisi >= 0.999) filtri
  // ishlatilardi. Natijada qabul qilingan qismi to'liq chiqarilgan yuk ro'yxatdan
  // BUTUNLAY chiqib ketar edi — keyin "Qabul qilinmagan"dan stockка qabul qilingan
  // tovarlar hech qayerda ko'rinmay, G'OYIB bo'lib qolardi.
  const crHasStock = (cr: ChiqimRecord): boolean =>
    cr.selectedProductIds.some(pid => (availByCrPid[`${cr.id}:${pid}`] ?? 0) > 0.0005);

  // Clients who have received products not yet dispatched/transferred from this UZB warehouse
  const activeUzbClients = useMemo(() => {
    const byClient: Record<string, { records: ChiqimRecord[]; clientName: string }> = {};
    allChinaChiqim
      .filter(cr => effectiveReceivedIds.has(cr.id) && crHasStock(cr))
      .forEach(cr => {
        if (!byClient[cr.clientCode]) byClient[cr.clientCode] = { records: [], clientName: cr.clientName || "" };
        byClient[cr.clientCode].records.push(cr);
      });
    return byClient;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChinaChiqim, effectiveReceivedIds, availByCrPid]);

  const activeUzbClientList = useMemo(() => Object.entries(activeUzbClients), [activeUzbClients]);

  const selectedClientActiveRecords = useMemo(
    () => selectedDispatchClientCode ? (activeUzbClients[selectedDispatchClientCode]?.records ?? []) : [],
    [selectedDispatchClientCode, activeUzbClients]
  );

  // ── Mijoz bo'yicha chiqim / omborga o'tkazish — TOVAR-DARAJALI (O'rta ombor
  // chiqim tizimi bilan bir xil model). Tanlangan mijozning omborda MAVJUD
  // tovarlari — pid bo'yicha birlashtirilgan (bir tovar bir necha yozuv bilan
  // kelgan bo'lsa ham bitta qator). ──
  const clientStockProducts = useMemo(() => {
    const byPid: Record<string, { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming: number }> = {};
    for (const cr of selectedClientActiveRecords) {
      for (const pid of cr.selectedProductIds) {
        const product = globalProductMap[pid];
        if (!product) continue;
        const rows = incomingByCrPid[pid] ?? [];
        const incoming = rows.find(r => r.crId === cr.id)?.incoming ?? 0;
        const available = availByCrPid[`${cr.id}:${pid}`] ?? 0;
        if (!byPid[pid]) byPid[pid] = { pid, product, source: cr, available: 0, incoming: 0 };
        byPid[pid].available += available;
        byPid[pid].incoming += incoming;
      }
    }
    return Object.values(byPid).filter(x => x.available > 0.0005);
  }, [selectedClientActiveRecords, incomingByCrPid, availByCrPid, globalProductMap]);

  // Tanlangan tovarlar bo'yicha jami hisob — computeTake bilan (dona butun son)
  const dispSelTotals = useMemo(() => {
    let products = 0, qty = 0, places = 0, volume = 0, brutto = 0;
    for (const { pid, product, available } of clientStockProducts) {
      if (!dispSelectedPids.has(pid)) continue;
      const mode = productModes[pid] ?? "full";
      const t = computeTake(product, available, mode === "partial" ? partialInputs[pid] : null);
      products += 1;
      qty += t.qty; places += t.places; volume += t.volume; brutto += t.brutto;
    }
    return {
      products,
      qty:    Math.round(qty),
      places: Math.round(places * 100) / 100,
      volume: Math.round(volume * 1000) / 1000,
      brutto: Math.round(brutto * 100) / 100,
    };
  }, [clientStockProducts, dispSelectedPids, productModes, partialInputs]);

  // Received (via truck or transfer) but not yet dispatched/transferred from this UZB warehouse.
  // TOVAR-DARAJALI filtr (crHasStock) — skalyar uzbGoneIds emas: shunda "Qabul
  // qilinmagan"dan keyin qabul qilingan tovarlar ham ro'yxatda to'g'ri ko'rinadi.
  const receivedInWarehouseList = useMemo(() => {
    return allChinaChiqim.filter(cr => effectiveReceivedIds.has(cr.id) && crHasStock(cr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChinaChiqim, effectiveReceivedIds, availByCrPid]);

  // Qabul qilingan va hali (to'liq) jo'natilmagan tovarlar — mavjud ulush bilan.
  // available: tovarning shu omborda qolgan qismi (0..1]
  // MUHIM: bitta tovar (pid) bir necha chiqim yozuvi bilan kelgan bo'lsa, qatorlar
  // PID bo'yicha BIRLASHTIRILADI — ilgari har qatordan global gone ayirilib (ikki
  // marta ayirish), qoldiq yo'q bo'lib ko'rinar va React key'lar ham takrorlanardi.
  // source: shu pid keltirgan birinchi chiqim yozuvi (kirimRecordId barchasida bir xil).
  const receivedStockProducts = useMemo(() => {
    const byPid: Record<string, { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming: number }> = {};
    for (const cr of receivedInWarehouseList) {
      for (const pid of cr.selectedProductIds) {
        const product = globalProductMap[pid];
        if (!product) continue;
        const rows = incomingByCrPid[pid] ?? [];
        const incoming = rows.find(r => r.crId === cr.id)?.incoming ?? 0;
        const available = availByCrPid[`${cr.id}:${pid}`] ?? 0;
        if (!byPid[pid]) byPid[pid] = { pid, product, source: cr, available: 0, incoming: 0 };
        byPid[pid].available += available;
        byPid[pid].incoming += incoming;
      }
    }
    return Object.values(byPid).filter(x => x.available > 0.0005);
  }, [receivedInWarehouseList, incomingByCrPid, availByCrPid, globalProductMap]);

  // Held (qabul qilinmagan) qismidan chiqarilgan ulushlar — hozircha bo'sh;
  // "Qabul qilinmagan"ni chiqim qilish ulangach shu yerda hisoblanadi.
  const notAcceptedDispatchedRatios = useMemo<Record<string, number>>(() => ({}), []);

  // "QABUL QILINMAGAN (shu omborda)" — qisman qabulda olib ketilmagan (held) qism.
  // Settled yuklarning har tovari bo'yicha (1 - qabul ulushi). Forward YO'Q — shu omborda turadi.
  // MUHIM 1: uzbGoneIds bilan FILTRLANMAYDI — chiqim/o'tkazma faqat QABUL QILINGAN
  // qismdan bo'ladi; ilgari qabul qilingan qism to'liq chiqarilgach, held qism ham
  // ro'yxatdan yo'qolib qolar edi (jismonan omborda tursa ham).
  // MUHIM 2: qoldiq boshqa omborga FORWARD qilingan yuk bu yerda ko'rinMAYDI —
  // u jismonan boshqa omborga yo'lda; bu yerda "qabul qilib olish" noto'g'ri
  // qabul yozuvini yaratib, tovarni ikki omborda ko'rsatib yuborar edi.
  const notAcceptedStockProducts = useMemo(() => {
    return allChinaChiqim
      .filter(cr => settledAtWIds.has(cr.id))
      .filter(cr => {
        const d = currentDestMap[cr.id] ?? null;
        return !d || d === warehouse.id; // joriy manzil shu ombor (yoki manzilsiz eski yuk)
      })
      .flatMap(cr => {
        // KUMULYATIV qabul (barcha omborlar) — held faqat haqiqiy qolgan qism
        const cumPer = cumulativeReceivedProductRatios[cr.id];
        const cumScalar = cumulativeReceivedRatios[cr.id];
        return cr.selectedProductIds.map(pid => {
          const p = globalProductMap[pid];
          const fullQty = p ? (parseFloat(p.quantity) || 0) : 0;
          const dispShare = cr.productRatios?.[pid] ?? 1;
          const acceptedShare = Math.min(1, cumPer?.[pid] ?? cumScalar ?? 0);
          const heldShare = Math.max(0, 1 - acceptedShare);
          const goneRatio = notAcceptedDispatchedRatios[pid] ?? 0;   // held qismidan chiqarilgani
          // DONA — AUTHORITATIVE butun son: held = jo'natilgan − qabul qilingan − chiqqan.
          // Ikki bucket (qabul + held) yig'indisi jo'natilganga TENG bo'ladi (soxta 1 ta chiqmaydi).
          const dispatchedPieces = Math.round(fullQty * dispShare);
          const acceptedPieces = Math.round(fullQty * dispShare * acceptedShare);
          const gonePieces = Math.round(fullQty * goneRatio);
          const heldPieces = Math.max(0, dispatchedPieces - acceptedPieces - gonePieces);
          // available ulushi EXACT held donadan olinadi (joy/hajm ham shunga mos).
          // Dona yo'q (hajm asosidagi) tovarlar uchun — ulush bo'yicha.
          const available = fullQty > 0
            ? heldPieces / fullQty
            : Math.max(0, dispShare * heldShare - goneRatio);
          return { pid, product: p, source: cr, available, incoming: available };
        }).filter(x => x.available > 0.0005);
      }).filter((x): x is { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming: number } => !!x.product);
  }, [allChinaChiqim, settledAtWIds, currentDestMap, warehouse.id, cumulativeReceivedProductRatios, cumulativeReceivedRatios, globalProductMap, notAcceptedDispatchedRatios]);

  // Multiselect hisob-kitoblari — faqat ro'yxatda HOZIR mavjud tovarlar sanaladi
  // (eski/o'chirilgan kalitlar e'tiborga olinmaydi).
  const heldSelectedItems = useMemo(
    () => notAcceptedStockProducts.filter(x => heldSelected.has(heldKey(x.source.id, x.pid))),
    [notAcceptedStockProducts, heldSelected]
  );
  const allHeldSelected =
    notAcceptedStockProducts.length > 0 && heldSelectedItems.length === notAcceptedStockProducts.length;
  const toggleHeldSelectAll = () =>
    setHeldSelected(allHeldSelected
      ? new Set()
      : new Set(notAcceptedStockProducts.map(x => heldKey(x.source.id, x.pid))));

  const ortaSelectedIds = useMemo(
    () => receivedStockProducts.filter(x => selectedProductIds.has(x.pid)),
    [receivedStockProducts, selectedProductIds]
  );

  const ortaTotals = useMemo(() => {
    let qty = 0, places = 0, volume = 0, weight = 0;
    for (const { pid, product: p, available } of ortaSelectedIds) {
      const mode = productModes[pid] ?? "full";
      const t = computeTake(p, available, mode === "partial" ? partialInputs[pid] : null);
      qty    += t.qty;      // dona — butun
      places += t.places;
      volume += t.volume;
      weight += t.brutto;
    }
    return {
      qty:    Math.round(qty),                    // dona — butun son
      places: Math.round(places * 100) / 100,
      volume: Math.round(volume * 1000) / 1000,
      weight: Math.round(weight * 100) / 100,
    };
  }, [ortaSelectedIds, productModes, partialInputs]);

  // Uzbekistan warehouse statistics
  const uzbStats = useMemo(() => {
    // Faqat shu omborga aloqador yuklar: manzili shu ombor, yoki shu yerda
    // qabul qilingan / shu yerdan chiqarilgan
    const relevantChiqim = allChinaChiqim.filter(cr => {
      if (cr.warehouseId === warehouse.id) return false;
      const dest = currentDestMap[cr.id];
      return !dest || dest === warehouse.id || effectiveReceivedIds.has(cr.id) || uzbGoneIds.has(cr.id);
    });
    // TOVAR-DARAJALI buckets: har tovarning omborda MAVJUD (available), chiqib
    // ketgan (incoming − available) va hali kelmagan (dispShare − incoming)
    // ulushlari alohida sanaladi. Ilgari yuk butunicha bitta bucket'ga qo'yilib,
    // held qismi stockка qabul qilingach statistikada umuman ko'rinmay qolardi.
    let inTransitProducts = 0, inTransitJoys = 0, inTransitVol = 0, inTransitWeight = 0;
    let receivedProducts = 0, receivedJoys = 0, receivedVol = 0, receivedWeight = 0;
    let dispatchedProducts = 0, dispatchedJoys = 0, dispatchedVol = 0, dispatchedWeight = 0;
    for (const cr of relevantChiqim) {
      for (const pid of cr.selectedProductIds) {
        const p = globalProductMap[pid];
        if (!p) continue;
        const joysFull = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
        const volFull = parseFloat(p.totalVolume || "0") || 0;
        const weightFull = bruttoKg(p);
        const dispShare = cr.productRatios?.[pid] ?? 1;
        const incoming = (incomingByCrPid[pid] ?? []).find(r => r.crId === cr.id)?.incoming ?? 0;
        const available = availByCrPid[`${cr.id}:${pid}`] ?? 0;
        const gone = Math.max(0, incoming - available);
        const notArrived = Math.max(0, dispShare - incoming);
        if (notArrived > 0.0005) {
          inTransitProducts += 1;
          inTransitJoys += joysFull * notArrived; inTransitVol += volFull * notArrived; inTransitWeight += weightFull * notArrived;
        }
        if (available > 0.0005) {
          receivedProducts += 1;
          receivedJoys += joysFull * available; receivedVol += volFull * available; receivedWeight += weightFull * available;
        }
        if (gone > 0.0005) {
          dispatchedProducts += 1;
          dispatchedJoys += joysFull * gone; dispatchedVol += volFull * gone; dispatchedWeight += weightFull * gone;
        }
      }
    }
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      inTransitProducts,  inTransitJoys: r1(inTransitJoys),   inTransitVol:  Math.round(inTransitVol  * 1000) / 1000, inTransitWeight: Math.round(inTransitWeight * 100) / 100,
      receivedProducts,   receivedJoys: r1(receivedJoys),     receivedVol:   Math.round(receivedVol   * 1000) / 1000, receivedWeight: Math.round(receivedWeight * 100) / 100,
      dispatchedProducts, dispatchedJoys: r1(dispatchedJoys), dispatchedVol: Math.round(dispatchedVol * 1000) / 1000, dispatchedWeight: Math.round(dispatchedWeight * 100) / 100,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChinaChiqim, effectiveReceivedIds, uzbGoneIds, incomingByCrPid, availByCrPid, globalProductMap, currentDestMap, warehouse.id]);

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; }
  };
  const fmtDateTime = (iso: string) => {
    try { return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        setProductModes(m => { const n = { ...m }; delete n[productId]; return n; });
        setPartialInputs(m => { const n = { ...m }; delete n[productId]; return n; });
      } else {
        next.add(productId);
        setProductModes(m => ({ ...m, [productId]: "full" }));
      }
      return next;
    });
  };

  const setProductMode = (productId: string, mode: "full" | "partial") => {
    setProductModes(m => ({ ...m, [productId]: mode }));
    if (mode === "full") {
      setPartialInputs(m => { const n = { ...m }; delete n[productId]; return n; });
    } else {
      setPartialInputs(m => ({ ...m, [productId]: m[productId] ?? { qty: "", unit: "joy" } }));
    }
  };

  // ── Photos ────────────────────────────────────────────
  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 20 - photos.length;
    if (remaining <= 0) { toast.error("Maksimal 20 ta rasm"); e.target.value = ""; return; }
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) toast.warning(`Faqat ${remaining} ta rasm qo'shildi`);
    e.target.value = "";
    try {
      const compressed = await Promise.all(toProcess.map(compressImage));
      setPhotos(prev => [...prev, ...compressed]);
    } catch (err: any) {
      toast.error(err?.message || "Rasmni o'qib bo'lmadi");
    }
  };

  // ── Save chiqim ───────────────────────────────────────
  const handleSaveChiqim = async () => {
    if (!hasSelectedProducts) { toast.error("Kamida bitta tovar tanlang"); return; }
    if (!vehicleNumber.trim()) { toast.error("Avtomobil raqamini kiriting"); return; }
    if (!chiqimDestId) { toast.error("Qabul qiluvchi omborni tanlang"); return; }

    // Validate partial inputs
    for (const pid of selectedProductIds) {
      if ((productModes[pid] ?? "full") === "partial") {
        const inp = partialInputs[pid];
        if (!inp?.qty || parseFloat(inp.qty) <= 0) {
          toast.error("Qisman tanlangan tovar uchun miqdor kiriting");
          return;
        }
      }
    }

    setChiqimSaving(true);
    try {
      // Group selected products by their parent kirim record
      const groups: Record<string, string[]> = {};
      for (const pid of selectedProductIds) {
        const entry = allProductMap[pid];
        if (entry) {
          const rid = entry.kirimRecord.id;
          if (!groups[rid]) groups[rid] = [];
          groups[rid].push(pid);
        }
      }

      // Bitta furaga bir nechta kirim yozuvidan tovar tanlansa, tovarlar soni
      // EMAS, balki kirim-yozuv guruhlari sonicha alohida chiqim yaratiladi.
      // Rasm esa BITTA — shuning uchun uni faqat BIRINCHI guruhga yuboramiz,
      // aks holda har bir guruh o'zining nusxasini saqlab, qabul qiluvchi
      // ombor tomonida bitta rasm shu furaga tegishli barcha yozuvlar
      // bo'yicha ko'payib ko'rinadi (guruhlar soni bo'yicha).
      const groupEntries = Object.entries(groups);
      for (let groupIndex = 0; groupIndex < groupEntries.length; groupIndex++) {
        const [kirimRecordId, productIds] = groupEntries[groupIndex];
        const kr = allProductMap[productIds[0]]?.kirimRecord;

        // Har bir tovar uchun: qancha joy olinadi (asos bo'yicha kiritilgan
        // qiymat joyga aylantiriladi) va furadagi ulush (productRatios)
        const fullIds: string[] = [];
        const partialTakes: { pid: string; joysTaken: number; totalJoys: number }[] = [];
        const productRatios: Record<string, number> = {};

        for (const pid of productIds) {
          const product = allProductMap[pid]?.product;
          if (!product) { fullIds.push(pid); continue; }
          // MUHIM: joysiz (faqat soni/hajm/brutto) tovar uchun pseudo-joy = 1 —
          // chiqimTotals bilan bir xil model. Ilgari totalJoys=0 bo'lganda QISMAN
          // chiqim ham productRatios=1 bilan saqlanib, tovar TO'LIQ chiqarilgan deb
          // arxivlanar va qolgan qismi ombordan g'oyib bo'lar edi.
          const realJoys = product.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
          const totalJoys = realJoys > 0 ? realJoys : 1;
          const alreadyDispatched = (kr?.dispatchedPlaces ?? {})[pid] ?? 0;
          const remainingJoys = Math.max(0, totalJoys - alreadyDispatched);
          const mode = productModes[pid] ?? "full";
          const availableRatio = remainingJoys / totalJoys;

          // Ekranda ko'rsatilgan hisob bilan bir xil bo'lishi uchun aynan
          // computeTake ishlatiladi (dona butun → effektiv ulush shundan).
          let effRatio = availableRatio;
          let joysTaken = remainingJoys;
          if (mode === "partial") {
            const t = computeTake(product, availableRatio, partialInputs[pid]);
            effRatio = t.ratio;
            joysTaken = Math.round(totalJoys * effRatio * 100) / 100;
          }

          productRatios[pid] = Math.round(effRatio * 10000) / 10000;

          if (joysTaken >= remainingJoys - 0.005) {
            fullIds.push(pid);
          } else {
            partialTakes.push({ pid, joysTaken, totalJoys });
          }
        }

        await addChiqimRecordV2({
          warehouseId: warehouse.id,
          date: todayTashkent(),
          clientCode: kr?.clientCode ?? "",
          clientName: kr?.clientName ?? "",
          clientPhone: kr?.clientPhone ?? "",
          kirimRecordId,
          selectedProductIds: productIds,
          productRatios,
          vehicleNumber: vehicleNumber.trim(),
          photos, // rasm butun furaga tegishli — chiqimning BARCHA yozuvlariga saqlanadi (dedupePhotos bilan bir marta ko'rsatiladi)
          note: chiqimNote.trim() || undefined,
          destWarehouseId: chiqimDestId,
        });

        for (const t of partialTakes) {
          await updateDispatchedPlaces(kirimRecordId, t.pid, t.joysTaken, t.totalJoys);
        }
        if (fullIds.length > 0) await markProductsDispatched(kirimRecordId, fullIds);
      }

      toast.success("Chiqim saqlandi va tovarlar arxivlandi");

      setSelectedProductIds(new Set());
      setProductModes({});
      setPartialInputs({});
      setVehicleNumber(""); setPhotos([]); setChiqimNote(""); setChiqimDestId("");
      setShowChiqimPanel(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setChiqimSaving(false);
    }
  };

  // ── O'rta ombor: re-dispatch received products onward by a new truck ──
  const handleSaveOrtaChiqim = async () => {
    if (ortaSelectedIds.length === 0) { toast.error("Kamida bitta tovar tanlang"); return; }
    if (!vehicleNumber.trim()) { toast.error("Avtomobil raqamini kiriting"); return; }
    if (!chiqimDestId) { toast.error("Qabul qiluvchi omborni tanlang"); return; }

    // Qisman tanlangan tovarlar uchun miqdor kiritilganini tekshirish
    for (const { pid } of ortaSelectedIds) {
      if ((productModes[pid] ?? "full") === "partial") {
        const inp = partialInputs[pid];
        if (!inp?.qty || parseFloat(inp.qty) <= 0) {
          toast.error("Qisman tanlangan tovar uchun miqdor kiriting");
          return;
        }
      }
    }

    setChiqimSaving(true);
    try {
      // Har bir tovar uchun olinadigan ulush (asos bo'yicha) hisoblanadi,
      // so'ng asl kirim yozuvi bo'yicha guruhlanadi
      const groups: Record<string, { productIds: string[]; ratios: Record<string, number>; source: ChiqimRecord }> = {};
      for (const { pid, product, source, available } of ortaSelectedIds) {
        const mode = productModes[pid] ?? "full";
        // Ekrandagi hisob bilan bir xil: computeTake (dona butun → effektiv ulush)
        const take = computeTake(product, available, mode === "partial" ? partialInputs[pid] : null).ratio;
        if (take <= 0.0005) continue;
        const rid = source.kirimRecordId;
        if (!groups[rid]) groups[rid] = { productIds: [], ratios: {}, source };
        groups[rid].productIds.push(pid);
        groups[rid].ratios[pid] = Math.round(take * 10000) / 10000;
      }

      // Bir nechta kirim-yozuv guruhi bo'lsa ham, rasm faqat BIRINCHI guruhga
      // biriktiriladi — aks holda bitta yuklangan rasm qabul qiluvchi ombor
      // tomonida guruhlar sonicha ko'payib ko'rinadi (fura raqami bo'yicha
      // birlashtirilganda).
      const ortaGroupEntries = Object.entries(groups);
      for (let groupIndex = 0; groupIndex < ortaGroupEntries.length; groupIndex++) {
        const [kirimRecordId, { productIds, ratios, source }] = ortaGroupEntries[groupIndex];
        await addChiqimRecordV2({
          warehouseId: warehouse.id,
          date: todayTashkent(),
          clientCode: source.clientCode,
          clientName: source.clientName,
          clientPhone: source.clientPhone,
          kirimRecordId,
          selectedProductIds: productIds,
          productRatios: ratios,
          vehicleNumber: vehicleNumber.trim(),
          photos, // rasm butun furaga tegishli — chiqimning BARCHA yozuvlariga saqlanadi (dedupePhotos bilan bir marta ko'rsatiladi)
          note: chiqimNote.trim() || undefined,
          destWarehouseId: chiqimDestId,
        });
      }

      toast.success("Chiqim saqlandi");

      setSelectedProductIds(new Set());
      setProductModes({});
      setPartialInputs({});
      setVehicleNumber(""); setPhotos([]); setChiqimNote(""); setChiqimDestId("");
      setShowChiqimPanel(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setChiqimSaving(false);
    }
  };

  const handleDeleteKirim = async () => {
    if (!deleteKirimId) return;
    try {
      await deleteKirimRecord(deleteKirimId);
      toast.success("Kirim yozuvi o'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteKirimId(null);
      refresh();
    }
  };

  const handleDeleteChiqim = async () => {
    if (!deleteChiqimId) return;
    try {
      await deleteChiqimRecordV2(deleteChiqimId);
      toast.success("O'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteChiqimId(null);
      refresh();
    }
  };

  // ── UZB Truck Reception handlers ──────────────────────
  // MULTI-SELECT: furani bosish tanlovga qo'shadi/olib tashlaydi.
  // Fura tanlovdan chiqarilganda unga tegishli barcha kiritmalar tozalanadi.
  const handleSelectVehicle = (v: string) => {
    if (selectedVehicles.has(v)) {
      // Tanlovdan chiqarish — shu furaga tegishli barcha kiritmalarni tozalaymiz
      const ids = new Set((activeTrucks[v] ?? []).map(cr => cr.id));
      const clean = <T,>(m: Record<string, T>): Record<string, T> => {
        const n = { ...m };
        ids.forEach(id => delete n[id]);
        return n;
      };
      setSelectedClientIds(p => new Set([...p].filter(id => !ids.has(id))));
      setCrModes(m => clean(m));
      setCrPartials(m => clean(m));
      setCrProductPartials(m => clean(m));
      setCrForwards(m => clean(m));
      setCrDamages(m => clean(m));
      const next = new Set(selectedVehicles);
      next.delete(v);
      setSelectedVehicles(next);
      if (next.size === 0) { setVehicleMode("full"); setDamageEnabled(false); }
    } else {
      const next = new Set(selectedVehicles);
      next.add(v);
      setSelectedVehicles(next);
      // "Bir qismi" rejimida yangi fura mijozlari avtomatik tanlangan holda qo'shiladi
      if (vehicleMode === "partial") {
        setSelectedClientIds(p => new Set([...p, ...(activeTrucks[v] ?? []).map(cr => cr.id)]));
      }
    }
  };

  const handleSetVehicleMode = (mode: "full" | "partial") => {
    setVehicleMode(mode);
    if (mode === "partial") {
      setSelectedClientIds(new Set(selectedTruckChiqims.map(cr => cr.id)));
    } else {
      setSelectedClientIds(new Set());
    }
    setCrModes({}); setCrPartials({}); setCrProductPartials({}); setCrForwards({});
  };

  const toggleClientId = (id: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setCrModes(m => { const n = { ...m }; delete n[id]; return n; });
        setCrPartials(m => { const n = { ...m }; delete n[id]; return n; });
        setCrProductPartials(m => { const n = { ...m }; delete n[id]; return n; });
        setCrForwards(m => { const n = { ...m }; delete n[id]; return n; });
      }
      else next.add(id);
      return next;
    });
  };

  const handleSaveReceipt = async () => {
    if (selectedVehicles.size === 0) { toast.error("Fura tanlang"); return; }
    const eligible = vehicleMode === "full"
      ? selectedTruckChiqims
      : selectedTruckChiqims.filter(cr => selectedClientIds.has(cr.id));
    if (vehicleMode === "partial" && eligible.length === 0) { toast.error("Kamida bir mijozni tanlang"); return; }
    // Eslatma: qisman qabulda hech narsa qabul qilinmasa ham (hammasi "Yo'q")
    // ruxsat beriladi — o'sha yuk to'liq "Qabul qilinmagan" bo'limiga tushadi.

    // ── ZARARLANGAN TOVARLAR (ixtiyoriy) — kiritilgan bo'lsa tekshirib yig'amiz ──
    const damages: { chiqimRecordId: string; quantity: number; unit: string; note: string }[] = [];
    if (damageEnabled) {
      for (const cr of eligible) {
        const d = crDamages[cr.id];
        const qtyStr = (d?.qty ?? "").trim();
        const noteStr = (d?.note ?? "").trim();
        if (!qtyStr && !noteStr) continue; // bu yuk uchun zarar kiritilmagan — o'tkazib yuboramiz
        const qty = parseFloat(qtyStr || "0");
        if (!(qty > 0)) {
          toast.error(`${cr.clientName || cr.clientCode}: qabul qilinmaydigan miqdorni (dona) kiriting`);
          return;
        }
        // Yukdagi jami soni (dona) dan oshib ketmasin
        let totalSoni = 0;
        for (const pid of cr.selectedProductIds) {
          const p = globalProductMap[pid];
          if (!p) continue;
          const share = cr.productRatios?.[pid] ?? 1;
          totalSoni += (parseFloat(p.quantity) || 0) * share;
        }
        totalSoni = Math.round(totalSoni);
        if (totalSoni > 0 && qty > totalSoni) {
          toast.error(`${cr.clientName || cr.clientCode}: qabul qilinmaydigan miqdor (${qty}) yukdagi jami sonidan (${totalSoni} dona) oshib ketdi`);
          return;
        }
        if (!noteStr) {
          toast.error(`${cr.clientName || cr.clientCode}: qabul qilinmaslik sababini yozing — to'liq ma'lumot majburiy`);
          return;
        }
        damages.push({ chiqimRecordId: cr.id, quantity: qty, unit: "dona", note: noteStr });
      }
      if (damages.length === 0) {
        toast.error("«Qabul qilinmaydigan tovar bor» yoqilgan, lekin hech narsa kiritilmadi. Kiriting yoki blokni o'chiring.");
        return;
      }
    }

    setReceiptSaving(true);
    try {
      const receivedRatios: Record<string, number> = {};
      const receivedProductRatios: Record<string, Record<string, number>> = {};
      // Qabul qilinmagan qism boshqa omborga JO'NATILMAYDI — shu omborda «Qabul
      // qilinmagan» bo'limida qoladi. Har bir tanlangan yuk uchun yozuv yaratiladi
      // (hammasi "Yo'q" bo'lsa ham) — shunda yuk shu omborda "qayta ishlangan" bo'ladi.
      for (const cr of eligible) {
        const { perProduct, aggregate } = computeCrAccept(cr);
        receivedRatios[cr.id] = Math.round(aggregate * 10000) / 10000;
        receivedProductRatios[cr.id] = Object.fromEntries(
          cr.selectedProductIds.map(pid => [pid, Math.round((perProduct[pid] ?? 0) * 10000) / 10000]),
        );
      }
      // Har bir tanlangan fura uchun ALOHIDA qabul yozuvi yaratiladi —
      // backend bitta fura raqami bilan ishlaydi, shuning uchun ma'lumot
      // to'g'ri bo'linadi (arxiv, statuslar, qabul qilinmaganlar ham fura bo'yicha).
      let savedTrucks = 0;
      for (const [vn, chiqims] of activeTruckList) {
        if (!selectedVehicles.has(vn)) continue;
        const vnIds = new Set(chiqims.map(cr => cr.id));
        const vnRatios: Record<string, number> = {};
        const vnProductRatios: Record<string, Record<string, number>> = {};
        for (const [id, r] of Object.entries(receivedRatios)) if (vnIds.has(id)) vnRatios[id] = r;
        for (const [id, r] of Object.entries(receivedProductRatios)) if (vnIds.has(id)) vnProductRatios[id] = r;
        const vnDamages = damages.filter(d => vnIds.has(d.chiqimRecordId));
        // Bu furadan hech narsa tanlanmagan bo'lsa (qisman rejimda) — bo'sh yozuv yaratmaymiz
        if (Object.keys(vnRatios).length === 0 && vnDamages.length === 0) continue;
        await addChiqimReceipt({
          uzbWarehouseId: warehouse.id,
          vehicleNumber: vn,
          receivedRatios: vnRatios,
          receivedProductRatios: vnProductRatios,
          note: receiptNote.trim() || undefined,
          receivedAt: todayTashkent(),
          damages: vnDamages.length > 0 ? vnDamages : undefined,
        });
        savedTrucks++;
      }
      if (savedTrucks === 0) {
        toast.error("Qabul qilinadigan yuk tanlanmadi");
        setReceiptSaving(false);
        return;
      }
      const totalDamagedQty = damages.reduce((s, d) => s + d.quantity, 0);
      toast.success(
        (savedTrucks > 1 ? `${savedTrucks} ta fura qabul qilindi` : "Fura qabul qilindi") +
        (totalDamagedQty > 0 ? ` — ${totalDamagedQty} dona qabul qilinmadi (qayd etildi)` : "")
      );
      setSelectedVehicles(new Set()); setVehicleMode("full"); setSelectedClientIds(new Set()); setCrModes({}); setCrPartials({}); setCrProductPartials({}); setCrForwards({}); setReceiptNote(""); setDamageEnabled(false); setCrDamages({});
      setShowUzbKirimPanel(false);
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
    } finally {
      setReceiptSaving(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!deleteReceiptId) return;
    try {
      await deleteChiqimReceipt(deleteReceiptId);
      toast.success("O'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteReceiptId(null);
      await refresh();
    }
  };

  /**
   * ZARARLANGAN TOVARLAR bloki — fura qabul qilishda IXTIYORIY.
   * Yuk 100% butun bo'lsa bu blok yopiq turadi va oqimga umuman aralashmaydi.
   * Qabul qilinmaydigan tovar bo'lganda ochilib, har bir yuk (mijoz) bo'yicha miqdor + sabab kiritiladi.
   * Ma'lumot to'liq kontekst bilan saqlanadi va "Qabul qilinmagan yuklar" bo'limida ko'rinadi.
   */
  const renderDamageSection = () => {
    if (selectedVehicles.size === 0) return null;
    const eligible = vehicleMode === "full"
      ? selectedTruckChiqims
      : selectedTruckChiqims.filter(cr => selectedClientIds.has(cr.id));
    if (eligible.length === 0) return null;
    const totalDamaged = eligible.reduce((s, cr) => s + (parseFloat(crDamages[cr.id]?.qty || "0") || 0), 0);
    return (
      <div className="mx-3 mb-3">
        {!damageEnabled ? (
          <button
            onClick={() => setDamageEnabled(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 text-amber-700 text-xs font-black hover:bg-amber-100/60 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Qabul qilinmaydigan tovar bor (ixtiyoriy)
          </button>
        ) : (
          <div className="rounded-2xl border-2 border-amber-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-amber-800 uppercase tracking-wider">Qabul qilinmaydigan tovarlar</p>
                <p className="text-[10px] text-amber-700/70">Faqat qabul qilinmaydigan (shikastlangan/yaroqsiz) yukni to'ldiring — qolganini bo'sh qoldiring</p>
              </div>
              {totalDamaged > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                  Jami: {Math.round(totalDamaged * 100) / 100} dona
                </span>
              )}
              <button
                onClick={() => { setDamageEnabled(false); setCrDamages({}); }}
                className="p-1 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors shrink-0"
                title="Blokni o'chirish (hech narsa yozilmaydi)"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-amber-100">
              {eligible.map(cr => {
                const d = crDamages[cr.id];
                // Yukdagi jami soni (dona) — max chegara sifatida ko'rsatiladi
                let totalSoni = 0;
                for (const pid of cr.selectedProductIds) {
                  const p = globalProductMap[pid];
                  if (!p) continue;
                  const share = cr.productRatios?.[pid] ?? 1;
                  totalSoni += (parseFloat(p.quantity) || 0) * share;
                }
                totalSoni = Math.round(totalSoni);
                const hasDamage = !!(d?.qty && parseFloat(d.qty) > 0);
                return (
                  <div key={cr.id} className={`px-4 py-2.5 space-y-1.5 ${hasDamage ? "bg-amber-50/50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded font-mono text-amber-700 bg-amber-100">
                        {cr.clientCode}
                      </span>
                      <span className="text-[11px] text-[#6B7280] font-medium flex-1 truncate">
                        {cr.clientName || cr.clientCode}
                      </span>
                      {totalSoni > 0 && (
                        <span className="text-[9px] text-[#9CA3AF] font-bold shrink-0">jami {totalSoni} dona</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="number" min="0" step="any"
                        value={d?.qty ?? ""}
                        onChange={e => setCrDamages(m => ({ ...m, [cr.id]: { qty: e.target.value, note: m[cr.id]?.note ?? "" } }))}
                        placeholder="Miqdori (dona)"
                        className="w-28 px-3 py-2 rounded-lg border border-amber-200 bg-white text-xs font-bold text-[#374151] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 placeholder:text-[#C4C9D4]"
                      />
                      <input
                        value={d?.note ?? ""}
                        onChange={e => setCrDamages(m => ({ ...m, [cr.id]: { qty: m[cr.id]?.qty ?? "", note: e.target.value } }))}
                        placeholder="Qabul qilinmaslik sababi (majburiy)..."
                        className="flex-1 px-3 py-2 rounded-lg border border-amber-200 bg-white text-xs font-medium text-[#374151] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 placeholder:text-[#C4C9D4]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="px-4 py-2 text-[9px] text-amber-700/60 bg-amber-50/50 border-t border-amber-100">
              Yozuvlar o'chirib bo'lmaydigan tarixga yoziladi va «Yo'ldagi yuklar → Qabul qilinmagan yuklar» bo'limida to'liq ko'rinadi.
            </p>
          </div>
        )}
      </div>
    );
  };

  // ── UZB Dispatch handlers ─────────────────────────────
  const handleSelectDispatchClient = (clientCode: string) => {
    if (selectedDispatchClientCode === clientCode) {
      setSelectedDispatchClientCode(null);
    } else {
      setSelectedDispatchClientCode(clientCode);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy");
    }
    // Tovar tanlovlari mijozga bog'liq — mijoz almashganda tozalanadi
    setDispSelectedPids(new Set());
    setProductModes({});
    setPartialInputs({});
    resetPayment();
  };

  // Tanlangan tovarlar bo'yicha validatsiya (chiqim ham, o'tkazma ham)
  const validateDispatchSelection = (): boolean => {
    if (dispSelectedPids.size === 0 || dispSelTotals.products === 0) {
      toast.error("Kamida bitta tovar tanlang");
      return false;
    }
    for (const { pid } of clientStockProducts) {
      if (!dispSelectedPids.has(pid)) continue;
      if ((productModes[pid] ?? "full") === "partial") {
        const inp = partialInputs[pid];
        if (!inp?.qty || parseFloat(inp.qty) <= 0) {
          toast.error("Qisman tanlangan tovar uchun miqdor kiriting");
          return false;
        }
      }
    }
    return true;
  };

  // TANLANGAN tovarlardan chiqim/o'tkazma uchun TOVAR-DARAJALI ulushlar.
  // Har tovarning olinadigan ulushi computeTake bilan (dona-aniq, ekran hisobi
  // bilan bir xil), so'ng shu tovarni olib kelgan chiqim yozuvlariga FIFO
  // taqsimlanadi. ratios[cr] = yozuvning MAVJUD qismidan olinganining og'irlikli
  // nisbati (1 = yozuvning ombordagi barcha tovari chiqdi).
  const buildSelectedDispatchRatios = () => {
    const productRatios: Record<string, Record<string, number>> = {};
    for (const { pid, product, available } of clientStockProducts) {
      if (!dispSelectedPids.has(pid)) continue;
      const mode = productModes[pid] ?? "full";
      let remaining = computeTake(product, available, mode === "partial" ? partialInputs[pid] : null).ratio;
      if (remaining <= 0.00005) continue;
      const rows = (incomingByCrPid[pid] ?? [])
        .filter(r => selectedClientActiveRecords.some(cr => cr.id === r.crId))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const row of rows) {
        if (remaining <= 0.00005) break;
        const avail = availByCrPid[`${row.crId}:${pid}`] ?? 0;
        if (avail <= 0.00005) continue;
        const take = Math.min(avail, remaining);
        remaining -= take;
        if (!productRatios[row.crId]) productRatios[row.crId] = {};
        productRatios[row.crId][pid] = Math.round(take * 10000) / 10000;
      }
    }
    // Skalyar ratio: yozuvdagi mavjud tovarlarga nisbatan olingan ulush
    // (og'irlik: joy, bo'lmasa dona). >= 0.999 bo'lsa 1 — yozuv aktivdan chiqadi.
    const ratios: Record<string, number> = {};
    for (const [crId, per] of Object.entries(productRatios)) {
      const cr = chiqimById[crId];
      if (!cr) { ratios[crId] = 1; continue; }
      let wAvail = 0, wTaken = 0;
      for (const pid of cr.selectedProductIds) {
        const pr = globalProductMap[pid];
        if (!pr) continue;
        const avail = availByCrPid[`${crId}:${pid}`] ?? 0;
        const joy = pr.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
        const w = joy > 0 ? joy : ((parseFloat(pr.quantity) || 0) || 1);
        wAvail += w * avail;
        wTaken += w * (per[pid] ?? 0);
      }
      const r = wAvail > 0 ? wTaken / wAvail : 1;
      ratios[crId] = r >= 0.999 ? 1 : Math.round(r * 10000) / 10000;
    }
    return { ratios, productRatios, recordIds: Object.keys(productRatios) };
  };

  const handleSaveDispatch = async () => {
    if (!selectedDispatchClientCode) { toast.error("Mijoz tanlang"); return; }
    if (!validateDispatchSelection()) return;

    // ── TO'LOV MAJBURIY — mijozga chiqim (ID bo'yicha) faqat sotuv rasmiylashtirilgach.
    // Tovarni to'lovsiz jo'natish mumkin emas. Sotuv «Sotuv» bloki orqali qilinadi. ──
    if (paymentsEnabled && chiqimType === "client") {
      const sc = crmClientByCode(selectedDispatchClientCode);
      const saleStatus = sc?.sale?.status ?? "none";
      if (!sc) {
        toast.error("Mijoz «Mijozlar» bo'limida topilmadi — sotuvni rasmiylashtirib bo'lmaydi");
        return;
      }
      if (saleStatus === "none") {
        toast.error("Avval «Sotuv» bo'limida to'lovni rasmiylashtiring — to'lovsiz chiqim mumkin emas");
        return;
      }
    }

    // Fura raqami MAJBURIY (boshqa omborlar chiqimidagi kabi)
    if (!vehicleNumber.trim()) { toast.error("Avtomobil raqamini kiriting"); return; }

    setDispatchSaving(true);
    try {
      // ESLATMA: sotuv/to'lov endi ClientSalePanel orqali mijoz kartasiga alohida
      // yoziladi (statistikaga shu orqali tushadi). Bu yerda faqat tovar chiqimi
      // (yuk harakati) qayd etiladi.
      const fullNote = dispatchNote.trim();

      const dr = buildSelectedDispatchRatios();
      if (dr.recordIds.length === 0) { toast.error("Kamida bitta tovar tanlang"); return; }
      await addUzbDispatch({
        uzbWarehouseId: warehouse.id,
        clientCode: selectedDispatchClientCode,
        clientName: activeUzbClients[selectedDispatchClientCode]?.clientName || selectedDispatchClientCode,
        chiqimRecordIds: dr.recordIds,
        ratios: dr.ratios,
        productRatios: dr.productRatios,
        note: fullNote || undefined,
        vehicleNumber: vehicleNumber.trim(),
        photos,
        payment: { mode: "none" },
        dispatchedAt: todayTashkent(),
      });

      toast.success("Chiqim saqlandi");
      setSelectedDispatchClientCode(null);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy"); setDispatchNote("");
      setVehicleNumber(""); setPhotos([]);
      setDispSelectedPids(new Set()); setProductModes({}); setPartialInputs({});
      resetPayment();
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
    } finally {
      setDispatchSaving(false);
    }
  };

  // TANLANGAN "Qabul qilinmagan" tovarlarni STOCKка qabul qilib olish (multiselect,
  // tasdiqlash bilan). Har bir chiqim yozuvi uchun BITTA qabul yozuvi yaratiladi —
  // tanlangan tovarlar to'liq qabul holatiga o'tadi, "Kirim tovarlar — omborda"ga
  // ko'chadi va "Qabul qilinmagan" ro'yxatidan o'chadi. Bu amal BIR TOMONLAMA —
  // orqaga qaytarib bo'lmaydi.
  const handleReleaseHeldSelected = async () => {
    const items = heldSelectedItems;
    if (items.length === 0) { toast.error("Avval tovarlarni tanlang"); return; }
    setReleasingHeld(true);
    try {
      // Chiqim yozuvi bo'yicha guruhlash — bitta yozuvning bir necha tovari
      // bitta qabul yozuvida o'tkaziladi
      const byCr = new Map<string, { cr: ChiqimRecord; pids: Set<string> }>();
      for (const it of items) {
        if (!byCr.has(it.source.id)) byCr.set(it.source.id, { cr: it.source, pids: new Set() });
        byCr.get(it.source.id)!.pids.add(it.pid);
      }
      let moved = 0;
      for (const { cr, pids } of byCr.values()) {
        const perProduct: Record<string, number> = {};
        let maxDelta = 0;
        for (const p2 of cr.selectedProductIds) {
          if (pids.has(p2)) {
            // KUMULYATIV qabul (barcha omborlar) — aks holda boshqa omborda qabul
            // qilingan qism ham "qabul qilinmoqda" deb yozilib, tovar ikki omborda
            // dublikat bo'lib qolar edi.
            const already = cumulativeReceivedProductRatios[cr.id]?.[p2]
              ?? cumulativeReceivedRatios[cr.id]
              ?? 0;
            const delta = Math.max(0, 1 - Math.min(1, already));
            perProduct[p2] = delta > 0.0005 ? Math.round(delta * 10000) / 10000 : 0;
            if (perProduct[p2] > maxDelta) maxDelta = perProduct[p2];
          } else {
            perProduct[p2] = 0;
          }
        }
        if (maxDelta <= 0) continue; // bu yozuvda o'tkazadigan hech narsa yo'q
        // Umumiy (og'irlikli) ulush — faqat tanlangan tovarlar o'zgaradi
        let wSum = 0, wAcc = 0;
        for (const p2 of cr.selectedProductIds) {
          const pr = globalProductMap[p2];
          if (!pr) continue;
          const dispShare = cr.productRatios?.[p2] ?? 1;
          const joy = pr.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * dispShare;
          const w = joy > 0 ? joy : ((parseFloat(pr.quantity) || 0) * dispShare || 1);
          wSum += w; wAcc += w * (perProduct[p2] ?? 0);
        }
        const agg = wSum > 0 ? Math.round((wAcc / wSum) * 10000) / 10000 : maxDelta;
        await addChiqimReceipt({
          uzbWarehouseId: warehouse.id,
          vehicleNumber: cr.vehicleNumber,
          receivedRatios: { [cr.id]: agg },
          receivedProductRatios: { [cr.id]: perProduct },
          receivedAt: todayTashkent(),
          note: "«Qabul qilinmagan»dan stockка olindi",
        });
        moved += [...pids].length;
      }
      toast.success(`${moved} ta tovar stockка qabul qilindi`);
      setHeldSelected(new Set());
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
      // MUHIM: qisman muvaffaqiyatda (bir nechta yozuvdan ba'zilari saqlanib
      // qolgan bo'lishi mumkin) holatni darhol yangilaymiz — qayta urinish
      // ESKIRGAN qabul ulushlari bilan dublikat qabul yozuvi yaratmasligi uchun
      // (yangilangach delta=0 bo'lib, allaqachon o'tganlar o'tkazib yuboriladi).
      await refresh().catch(() => {});
    } finally {
      setReleasingHeld(false);
      setConfirmReleaseHeld(false);
    }
  };

  const handleDeleteDispatch = async () => {
    if (!deleteDispatchId) return;
    try {
      await deleteUzbDispatch(deleteDispatchId);
      toast.success("O'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteDispatchId(null);
      await refresh();
    }
  };

  // ── UZB Transfer handler ──────────────────────────────
  const handleSaveTransfer = async () => {
    if (!selectedDispatchClientCode) { toast.error("Mijoz tanlang"); return; }
    if (!selectedTransferDestId) { toast.error("Manzil omborni tanlang"); return; }
    if (!validateDispatchSelection()) return;
    setTransferSaving(true);
    try {
      const dr = buildSelectedDispatchRatios();
      if (dr.recordIds.length === 0) { toast.error("Kamida bitta tovar tanlang"); return; }
      await addUzbTransfer({
        sourceWarehouseId: warehouse.id,
        destWarehouseId: selectedTransferDestId,
        clientCode: selectedDispatchClientCode,
        clientName: activeUzbClients[selectedDispatchClientCode]?.clientName || selectedDispatchClientCode,
        chiqimRecordIds: dr.recordIds,
        ratios: dr.ratios,
        productRatios: dr.productRatios,
        note: dispatchNote.trim() || undefined,
        transferredAt: todayTashkent(),
      });
      toast.success("Tovar boshqa omborga jo'natildi (yo'lda)");
      setSelectedDispatchClientCode(null);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy");
      setDispatchNote(""); setSelectedTransferDestId(null); resetPayment();
      setDispSelectedPids(new Set()); setProductModes({}); setPartialInputs({});
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
    } finally {
      setTransferSaving(false);
    }
  };

  // Manzil ombor kelgan o'tkazmani qabul qiladi: yo'lda → qabul qilindi
  const [receivingTransferId, setReceivingTransferId] = useState<string | null>(null);
  const handleReceiveTransfer = async (transferId: string) => {
    setReceivingTransferId(transferId);
    try {
      await receiveUzbTransfer(transferId);
      toast.success("O'tkazma qabul qilindi");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
    } finally {
      setReceivingTransferId(null);
    }
  };

  // ── UZB handlers ──────────────────────────────────────
  const handleUzbKirimSave = async () => {
    if (!uzbKirimProduct.trim()) { toast.error("Tovar nomini kiriting"); return; }
    if (!uzbKirimQty || parseFloat(uzbKirimQty) <= 0) { toast.error("Miqdorni kiriting"); return; }
    try {
      await addUzbKirimRecord({
        warehouseId: warehouse.id,
        date: uzbKirimDate,
        productName: uzbKirimProduct.trim(),
        quantity: parseFloat(uzbKirimQty),
        unit: uzbKirimUnit,
        weight: uzbKirimWeight ? parseFloat(uzbKirimWeight) : undefined,
        weightUnit: uzbKirimWeight ? uzbKirimWeightUnit : undefined,
        note: uzbKirimNote.trim() || undefined,
      });
      setUzbKirimProduct(""); setUzbKirimQty(""); setUzbKirimWeight(""); setUzbKirimNote("");
      toast.success("Kirim qo'shildi");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Saqlashda xatolik");
    }
  };

  const handleDeleteUzbKirim = async () => {
    if (!deleteUzbKirimId) return;
    try {
      await deleteUzbKirimRecord(deleteUzbKirimId);
      toast.success("O'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteUzbKirimId(null);
      await refresh();
    }
  };

  // ══════════════════════════════════════════════════════
  // ── KIRIM card ────────────────────────────────────────
  const renderKirimRecord = (record: KirimRecord) => {
    const dispatched = new Set(record.dispatchedProductIds ?? []);
    const activeProducts = record.products.filter(p => !dispatched.has(p.id));
    const isFullyDispatched = activeProducts.length === 0;
    const expanded = expandedKirim === record.id;

    return (
      <div key={record.id} className={`bg-card rounded-2xl border shadow-sm overflow-hidden ${isFullyDispatched ? "opacity-60" : ""}`}>
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors select-none"
          onClick={() => setExpandedKirim(expanded ? null : record.id)}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isFullyDispatched ? "bg-secondary" : "bg-blue-600/10 dark:bg-blue-900/30"
          }`}>
            <ArrowDownCircle className={`w-4.5 h-4.5 ${isFullyDispatched ? "text-muted-foreground" : "text-blue-600"}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-foreground">
                {record.products.length} ta tovar
              </span>
              {isFullyDispatched
                ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">Arxivlandi</span>
                : <KirimStatusBadge status={record.taskStatus} />
              }
              {!isFullyDispatched && dispatched.size > 0 && (
                <span className="text-[10px] font-bold text-slate-500">({dispatched.size} ta chiqarildi)</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{record.date}</span>
              {record.assignedEmployeeName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" />{record.assignedEmployeeName}
                </span>
              )}
              {record.taskDeadline && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{fmtDate(record.taskDeadline)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setDeleteKirimId(record.id); }}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3 bg-secondary/10">
            {record.taskDescription && (
              <div className="bg-card rounded-xl p-3 border border-border/50">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1.5">Topshiriq</p>
                <p className="text-sm text-foreground">{record.taskDescription}</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  {record.assignedEmployeeName && (
                    <p className="text-xs text-primary font-bold flex items-center gap-1"><User className="w-3 h-3" />{record.assignedEmployeeName}</p>
                  )}
                  {record.taskDeadline && (
                    <p className="text-xs text-slate-500 font-bold flex items-center gap-1"><Clock className="w-3 h-3" />Muddat: {fmtDate(record.taskDeadline)}</p>
                  )}
                  {record.taskApiId && (
                    <span className="text-xs text-blue-600 font-bold flex items-center gap-1"><ExternalLink className="w-3 h-3" />Topshiriq tizimida</span>
                  )}
                </div>
              </div>
            )}

            {(record.attachments ?? []).length > 0 && (
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1.5">Hujjatlar</p>
                <div className="space-y-1">
                  {record.attachments.map((f, i) => {
                    const content = (
                      <>
                        <FileText className="w-3 h-3 text-primary/60 shrink-0" />
                        <span className="truncate flex-1 font-medium">{f.name}</span>
                      </>
                    );
                    return f.dataUrl ? (
                      <a
                        key={i}
                        href={f.dataUrl}
                        download={f.name}
                        className="flex items-center gap-2 text-xs bg-card hover:bg-secondary/40 rounded-lg px-3 py-2 border border-border/50 hover:text-primary transition-colors cursor-pointer"
                      >
                        {content}
                      </a>
                    ) : (
                      <div key={i} className="flex items-center gap-2 text-xs bg-card rounded-lg px-3 py-2 border border-border/50 text-muted-foreground">
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2">
                Tovarlar ({(record.products ?? []).length} ta)
              </p>
              <div className="space-y-2">
                {record.products.map((p, i) => {
                  const isDispatched = dispatched.has(p.id);
                  const isEditing = editingProduct?.kirimId === record.id && editingProduct?.product.id === p.id;
                  const ep = isEditing ? editingProduct!.product : null;

                  return (
                    <div key={p.id} className={`bg-card rounded-xl border overflow-hidden ${isDispatched ? "border-blue-200 dark:border-blue-800 opacity-60" : "border-border/50"}`}>
                      {/* Header row */}
                      <div className="flex items-center justify-between px-3 pt-3 pb-1">
                        <p className="text-xs font-black text-foreground">Tovar {i + 1}</p>
                        <div className="flex items-center gap-1">
                          {isDispatched && (
                            <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                              <ArrowUpCircle className="w-3 h-3" /> Chiqarildi
                            </span>
                          )}
                          {!isEditing ? (
                            (() => {
                              if (!canEditArchive) return null; // faqat huquqi borlar tahrirlaydi
                              // QOIDA: birinchi chiqim sodir bo'lgach — tahrirlash butunlay yopiladi
                              const hasChiqim =
                                isDispatched ||
                                ((record.dispatchedPlaces ?? {})[p.id] ?? 0) > 0 ||
                                chiqimRecords.some(cr => cr.selectedProductIds.includes(p.id));
                              return (
                                <button
                                  onClick={() => !hasChiqim && startEditProduct(record.id, p)}
                                  disabled={hasChiqim}
                                  title={hasChiqim ? "Chiqim boshlangan — endi tahrirlab bo'lmaydi" : "Tahrirlash"}
                                  className={`p-1 rounded-lg transition-colors ${
                                    hasChiqim
                                      ? "text-muted-foreground/30 cursor-not-allowed"
                                      : "text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                                  }`}
                                >
                                  {hasChiqim ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                                </button>
                              );
                            })()
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={saveEditProduct}
                                disabled={savingEdit}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                <Check className="w-3 h-3" /> {savingEdit ? "Saqlanmoqda..." : "Saqlash"}
                              </button>
                              <button
                                onClick={() => setEditingProduct(null)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* View mode */}
                      {!isEditing && (
                        <div className="px-3 pb-3 space-y-1">
                          {p.measurements.some(m => m.value) && (
                            <p className="text-xs text-muted-foreground">Tovar: {p.measurements.filter(m => m.value).map(m => m.value).join(", ")}</p>
                          )}
                          {p.places.some(pl => pl.count) && (
                            <p className="text-xs text-muted-foreground">Joylar: {p.places.filter(pl => pl.count).map(pl => `${pl.count} ${pl.unit}`).join(", ")}</p>
                          )}
                          {p.quantity && <p className="text-xs text-muted-foreground">Soni: {p.quantity}</p>}
                          {p.brutto && <p className="text-xs text-muted-foreground">Brutto: <span className="font-bold">{p.brutto} {p.bruttoUnit}</span>{p.netto ? ` | Netto: ${p.netto} ${p.nettoUnit}` : ""}</p>}
                          {p.note && <p className="text-xs text-muted-foreground italic">{p.note}</p>}

                          {/* ── Chiqimlar tarixi: qachon, qancha, qaysi furada; qolgani ── */}
                          {(() => {
                            const h = productDispatchHistory(p);
                            if (h.events.length === 0) return null;
                            return (
                              <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/40 p-2 space-y-1">
                                <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider">Chiqimlar tarixi ({h.events.length})</p>
                                {h.events.map(ev => (
                                  <p key={ev.id} className="text-[10px] text-muted-foreground leading-relaxed">
                                    <span className="font-bold text-foreground">{ev.date}</span>
                                    {" — "}{ev.qty} dona · {ev.joys} joy · {ev.brutto} kg · {ev.vol} m³
                                    {" — fura "}<span className="font-mono font-bold text-foreground">{ev.vehicle}</span>
                                    {ev.destName ? <> → <span className="font-bold">{ev.destName}</span></> : null}
                                    {ev.share < 0.9995
                                      ? <span className="text-amber-600 font-bold"> ({Math.round(ev.share * 100)}%)</span>
                                      : <span className="text-blue-600 font-bold"> (to'liq)</span>}
                                  </p>
                                ))}
                                {h.remaining.share > 0.0005 ? (
                                  <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                                    Qolgan: {h.remaining.qty} dona · {h.remaining.joys} joy · {h.remaining.brutto} kg · {h.remaining.vol} m³
                                  </p>
                                ) : (
                                  <p className="text-[10px] font-bold text-blue-600">Tovar to'liq chiqib ketdi ✓</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Edit mode */}
                      {isEditing && ep && (
                        <div className="px-3 pb-3 pt-2 space-y-2 bg-blue-50/40 dark:bg-blue-950/10 border-t border-blue-100">
                          {/* Tovar nomi */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground mb-1">Tovar nomi</p>
                            <input
                              value={ep.measurements[0]?.value ?? ""}
                              onChange={e => updEP({ measurements: ep.measurements.map((m, idx) => idx === 0 ? { ...m, value: e.target.value } : m) })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              placeholder="Tovar nomi..."
                            />
                          </div>
                          {/* Joylar soni */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground mb-1">Joylar soni</p>
                            <div className="flex gap-1.5">
                              <input
                                type="number" onWheel={noWheel} min="0"
                                value={ep.places[0]?.count ?? ""}
                                onChange={e => updEP({ places: ep.places.map((pl, idx) => idx === 0 ? { ...pl, count: e.target.value } : pl) })}
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Soni"
                              />
                              <input
                                value={ep.places[0]?.unit ?? "joy"}
                                onChange={e => updEP({ places: ep.places.map((pl, idx) => idx === 0 ? { ...pl, unit: e.target.value } : pl) })}
                                className="w-20 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="joy"
                              />
                            </div>
                          </div>
                          {/* Tovar soni */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground mb-1">Tovar soni</p>
                            <input
                              type="number" onWheel={noWheel} min="0"
                              value={ep.quantity}
                              onChange={e => updEP({ quantity: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              placeholder="0"
                            />
                          </div>
                          {/* Brutto / Netto */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground mb-1">Brutto</p>
                              <div className="flex gap-1">
                                <input
                                  type="number" onWheel={noWheel} min="0"
                                  value={ep.brutto}
                                  onChange={e => updEP({ brutto: e.target.value })}
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  placeholder="0"
                                />
                                <select
                                  value={ep.bruttoUnit}
                                  onChange={e => updEP({ bruttoUnit: e.target.value })}
                                  className="w-12 px-1 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none"
                                >
                                  {["kg","g","tonna","pound"].map(u => <option key={u}>{u}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground mb-1">Netto</p>
                              <div className="flex gap-1">
                                <input
                                  type="number" onWheel={noWheel} min="0"
                                  value={ep.netto}
                                  onChange={e => updEP({ netto: e.target.value })}
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  placeholder="0"
                                />
                                <select
                                  value={ep.nettoUnit}
                                  onChange={e => updEP({ nettoUnit: e.target.value })}
                                  className="w-12 px-1 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none"
                                >
                                  {["kg","g","tonna","pound"].map(u => <option key={u}>{u}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                          {/* Izoh */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground mb-1">Izoh</p>
                            <input
                              value={ep.note}
                              onChange={e => updEP({ note: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              placeholder="Ixtiyoriy..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-right">{fmtDateTime(record.createdAt)}</p>
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════
  // ── UZB Warehouse view ────────────────────────────────
  if (warehouse.type === "uzbekistan" || warehouse.type === "ortaMijoz") {
    const isOrtaMijoz = warehouse.type === "ortaMijoz";
    // "Boshqa omborga o'tkazish" — FAQAT "O'rta mijoz" turida bo'ladi.
    // "Chiqaruvchi" (uzbekistan) omborda faqat "Mijoz bo'yicha" chiqim qilinadi —
    // o'tkazma tugmasi ham, funksiyasi ham ko'rsatilmaydi.
    const allowTransfer = isOrtaMijoz;
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Header — ombor turi rangida yumshoq gradient banner */}
          <div className="shrink-0 border-b border-border bg-card">
            <div className={`flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r ${isOrtaMijoz ? "from-teal-600/[0.07]" : "from-blue-600/[0.07]"} via-transparent to-transparent`}>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isOrtaMijoz ? "bg-teal-600/10" : "bg-blue-600/10"}`}>
                {isOrtaMijoz
                  ? <Users className="w-5.5 h-5.5 text-teal-600" />
                  : <Building2 className="w-5.5 h-5.5 text-blue-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-foreground truncate leading-tight">{warehouse.name}</h1>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isOrtaMijoz ? "bg-teal-600/10 text-teal-600" : "bg-blue-600/10 text-blue-600"}`}>
                    {isOrtaMijoz ? "O'rta mijoz" : "Chiqaruvchi"}
                  </span>
                </div>
                {warehouse.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{warehouse.address}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowHistoryPanel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-muted-foreground text-xs font-black hover:text-primary hover:border-primary/40 transition-colors shrink-0"
              >
                <Clock className="w-3.5 h-3.5" /> Tarix
              </button>
            </div>
          </div>

          {/* Tabs — segmentli kartalar: ikonka + sarlavha + izoh + son */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border bg-card shrink-0">
            <button
              onClick={() => setTab("kirim")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
                tab === "kirim"
                  ? "bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/25"
                  : "bg-card border-border hover:border-blue-300"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tab === "kirim" ? "bg-white/15" : "bg-blue-600/10"}`}>
                <ArrowDownCircle className={`w-4.5 h-4.5 ${tab === "kirim" ? "text-white" : "text-blue-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black leading-tight ${tab === "kirim" ? "text-white" : "text-foreground"}`}>Kirim</p>
                <p className={`text-[10px] font-medium mt-0.5 truncate ${tab === "kirim" ? "text-white/70" : "text-muted-foreground/70"}`}>
                  Fura qabul qilish
                </p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-black shrink-0 ${tab === "kirim" ? "bg-white/20 text-white" : "bg-blue-600/10 text-blue-600"}`}>
                {activeTruckList.length}
              </span>
            </button>
            <button
              onClick={() => setTab("chiqim")}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
                tab === "chiqim"
                  ? "bg-slate-800 border-slate-800 shadow-lg shadow-slate-800/25"
                  : "bg-card border-border hover:border-slate-400"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tab === "chiqim" ? "bg-white/15" : "bg-slate-500/10"}`}>
                <ArrowUpCircle className={`w-4.5 h-4.5 ${tab === "chiqim" ? "text-white" : "text-slate-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-black leading-tight ${tab === "chiqim" ? "text-white" : "text-foreground"}`}>Chiqim</p>
                <p className={`text-[10px] font-medium mt-0.5 truncate ${tab === "chiqim" ? "text-white/70" : "text-muted-foreground/70"}`}>
                  {isOrtaMijoz ? "Mijoz ID yoki omborga o'tkazish" : "Mijoz ID bo'yicha chiqim"}
                </p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-black shrink-0 ${tab === "chiqim" ? "bg-white/20 text-white" : "bg-slate-500/10 text-slate-600"}`}>
                {isOrtaMijoz ? activeUzbClientList.length : receivedStockProducts.length}
              </span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

            {/* ── UZB KIRIM tab ── */}
            {tab === "kirim" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#F5F6FA]">

                {/* Active trucks (full width) */}
                <div className="flex flex-col overflow-hidden flex-1 min-h-0 mt-4">

                  {/* ── Section header ── */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDE1EA] bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full transition-colors ${showUzbKirimPanel ? "bg-[#005AB5]" : "bg-[#D1D5DB]"}`} />
                      <span className="text-xs font-black uppercase tracking-widest text-[#374151]">Kutilayotgan furalar</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#005AB5] font-black border border-[#BFDBFE]">
                        {activeTruckList.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {showUzbKirimPanel ? (
                        <button
                          onClick={() => { setShowUzbKirimPanel(false); setSelectedVehicles(new Set()); setVehicleMode("full"); setSelectedClientIds(new Set()); setCrModes({}); setCrPartials({}); setCrProductPartials({}); setCrForwards({}); setDamageEnabled(false); setCrDamages({}); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE1EA] text-[#6B7280] text-xs font-bold hover:bg-[#F5F6FA] transition-colors"
                        >
                          Bekor qilish
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowUzbKirimPanel(true)}
                          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                            activeTruckList.length > 0
                              ? "bg-[#005AB5] text-white hover:bg-[#004A96] shadow-sm shadow-blue-200"
                              : "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
                          }`}
                          disabled={activeTruckList.length === 0}
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Kirim qilish
                        </button>
                      )}
                      <button
                        onClick={() => setShowArchive(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE1EA] bg-white text-[#6B7280] text-xs font-bold hover:bg-[#F5F6FA] transition-colors"
                      >
                        Arxiv ({uzbReceipts.length + incomingTransfers.filter(t => t.status === "received").length})
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {!showUzbKirimPanel ? (
                      <>
                        {/* Empty / Placeholder state */}
                        {activeTruckList.length === 0 ? (
                          <div className="py-16 text-center px-4">
                            <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
                              <Truck className="w-8 h-8 text-[#D1D5DB]" />
                            </div>
                            <p className="text-sm font-bold text-[#9CA3AF]">Kutilayotgan fura yo'q</p>
                            <p className="text-xs text-[#C4C9D4] mt-1">Xitoy omboridan chiqim qilinsin</p>
                          </div>
                        ) : (
                          <div className="p-4">
                            <p className="text-xs text-[#9CA3AF] font-medium mb-3">
                              {activeTruckList.length} ta fura qabul qilinishini kutmoqda — qabul qilish uchun furani bosing
                            </p>
                            <div className="space-y-2">
                              {activeTruckList.map(([vn, chiqims]) => {
                                const totalProd = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                                const hasPartial = chiqims.some(cr => (cumulativeReceivedRatios[cr.id] ?? 0) > 0);
                                const codes = chiqims.map(cr => cr.clientCode).filter(Boolean);
                                const prodNames = chiqims.flatMap(cr => productNamesOf(cr));
                                const tt = truckTotals(chiqims);
                                return (
                                  <button
                                    key={vn}
                                    onClick={() => { setShowUzbKirimPanel(true); handleSelectVehicle(vn); }}
                                    className="w-full text-left bg-white border border-[#DDE1EA] rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm hover:border-[#93C5FD] hover:shadow-md hover:shadow-blue-100/50 transition-all group/truck"
                                  >
                                    <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center shrink-0 group-hover/truck:bg-[#005AB5] transition-colors">
                                      <Truck className="w-5 h-5 text-[#005AB5] group-hover/truck:text-white transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-black text-[#111827] font-mono">{vn}</p>
                                        {hasPartial && (
                                          <span className="text-[10px] font-bold text-[#F59E0B] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-md shrink-0">
                                            Qisman qabul qilingan
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        {codes.slice(0, 4).map((c, i) => (
                                          <span key={i} className="text-[9px] font-black px-1.5 py-0.5 rounded font-mono text-[#005AB5] bg-[#EFF6FF]">{c}</span>
                                        ))}
                                        {codes.length > 4 && (
                                          <span className="text-[9px] font-bold text-[#9CA3AF]">+{codes.length - 4}</span>
                                        )}
                                        <span className="text-[10px] text-[#9CA3AF]">· {chiqims.length} mijoz · {totalProd} tovar · {chiqims[0]?.date}</span>
                                      </div>
                                      {prodNames.length > 0 && (
                                        <p className="text-[10px] text-[#374151] font-medium mt-1 flex items-center gap-1 min-w-0">
                                          <Package className="w-3 h-3 text-[#9CA3AF] shrink-0" />
                                          <span className="truncate">{prodNames.slice(0, 3).join(", ")}{prodNames.length > 3 ? ` +${prodNames.length - 3}` : ""}</span>
                                        </p>
                                      )}
                                    </div>
                                    <TruckTotalsBox t={tt} accent="blue" className="hidden sm:flex" />
                                    <ChevronDown className="w-4 h-4 text-[#D1D5DB] -rotate-90 shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => setShowUzbKirimPanel(true)}
                              className="mt-4 w-full py-3 rounded-xl bg-[#005AB5] text-white text-sm font-black hover:bg-[#004A96] transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                            >
                              <ArrowDownCircle className="w-4.5 h-4.5" /> Kirim qilish
                            </button>
                          </div>
                        )}

                        {/* ── Incoming transfers (YO'LDA — qabul kutilmoqda) ── */}
                        {pendingIncomingTransfers.length > 0 && (
                          <div className="mx-4 mb-4">
                            <div className="bg-white border border-[#DDE1EA] rounded-2xl overflow-hidden shadow-sm">
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A]">
                                <div className="w-[3px] h-4 rounded-full bg-[#F59E0B]" />
                                <span className="text-[11px] font-black uppercase tracking-widest text-[#92400E]">Yo'lda — qabul qilinishi kutilmoqda</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#D97706] font-black border border-[#FDE68A]">
                                  {pendingIncomingTransfers.length}
                                </span>
                              </div>
                              <div className="divide-y divide-[#F3F4F6]">
                                {pendingIncomingTransfers.map(t => {
                                  const srcWarehouse = allWarehouses.find(w => w.id === t.sourceWarehouseId);
                                  return (
                                    <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                                      <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] flex items-center justify-center shrink-0 mt-0.5">
                                        <Truck className="w-4 h-4 text-[#D97706]" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-black text-[#005AB5] bg-[#EFF6FF] px-1.5 py-0.5 rounded font-mono">
                                            {t.clientCode}
                                          </span>
                                          <span className="text-[11px] text-[#374151] font-medium">{t.clientName || t.clientCode}</span>
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] uppercase">Yo'lda</span>
                                        </div>
                                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                                          {srcWarehouse?.name ?? "Noma'lum ombor"} → {t.chiqimRecordIds.length} yetkazma · {t.transferredAt}
                                        </p>
                                        {t.note && <p className="text-[10px] italic text-[#9CA3AF] mt-0.5">{t.note}</p>}
                                      </div>
                                      <button
                                        onClick={() => handleReceiveTransfer(t.id)}
                                        disabled={receivingTransferId === t.id}
                                        className="shrink-0 self-center flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#059669] text-white text-[11px] font-black hover:bg-[#047857] disabled:opacity-50 transition-colors"
                                      >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        {receivingTransferId === t.id ? "..." : "Qabul qilish"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* "Boshqa omborga jo'natilgan" bo'limi olib tashlandi — u ma'lumot arxiv/tarixda saqlanadi.
                            Kirim ko'rinishida faqat kelayotgan furalar va "Kirim tovarlar — omborda" qoladi. */}
                      </>
                    ) : activeTruckList.length === 0 ? (
                      <div className="py-16 text-center px-4">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
                          <Truck className="w-8 h-8 text-[#D1D5DB]" />
                        </div>
                        <p className="text-sm font-black text-[#9CA3AF]">Kutilayotgan fura yo'q</p>
                        <p className="text-xs text-[#C4C9D4] mt-1">Xitoy omboridan chiqim qilinsin</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        <p className="text-[10px] text-[#9CA3AF] font-bold px-1">
                          Bir nechta furani birga tanlab qabul qilishingiz mumkin
                          {selectedVehicles.size > 0 ? ` · ${selectedVehicles.size} ta tanlandi` : ""}
                        </p>
                        {activeTruckList.map(([vehicleNumber, chiqims]) => {
                          const isSelected = selectedVehicles.has(vehicleNumber);
                          const totalProducts = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                          const firstDate = chiqims[0]?.date ?? "";
                          const allPhotos = dedupePhotos(chiqims.flatMap(cr => cr.photos ?? []));
                          return (
                            <div key={vehicleNumber}
                              className={`rounded-2xl border-2 transition-all overflow-hidden ${
                                isSelected
                                  ? "border-[#BFDBFE] bg-white shadow-md shadow-blue-50"
                                  : "border-[#DDE1EA] bg-white hover:border-[#93C5FD] hover:shadow-sm"
                              }`}
                            >
                              {/* Truck header row */}
                              <button
                                onClick={() => handleSelectVehicle(vehicleNumber)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                              >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected ? "bg-[#005AB5] text-white" : "bg-[#F0F4FF] text-[#6B7280]"
                                }`}>
                                  <Truck className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-black font-mono transition-colors ${isSelected ? "text-[#005AB5]" : "text-[#111827]"}`}>
                                    {vehicleNumber}
                                  </p>
                                  <p className="text-[10px] text-[#9CA3AF] font-medium mt-0.5">
                                    {chiqims.length} mijoz · {totalProducts} tovar · {firstDate}
                                  </p>
                                </div>
                                <TruckTotalsBox t={truckTotals(chiqims)} accent="blue" className="hidden sm:flex mr-1" />
                                {isSelected
                                  ? <CheckSquare className="w-5 h-5 text-[#005AB5] shrink-0" />
                                  : <Square className="w-5 h-5 text-[#D1D5DB] shrink-0" />
                                }
                              </button>

                              {/* Tovar nomlari — HAR DOIM ko'rinadi (tanlangan/tanlanmaganidan qat'i nazar) */}
                              <TruckProductNames chiqims={chiqims} productNamesOf={productNamesOf} accent="blue" />

                              {/* Expanded: photos + info + mode buttons + client list */}
                              {isSelected && (
                                <div className="border-t border-[#BFDBFE] bg-[#F0F7FF] px-4 pt-3 pb-4 space-y-3">

                                  {/* Vehicle info row */}
                                  <div className="flex items-center gap-3 bg-white rounded-xl border border-[#BFDBFE] px-3 py-2.5 shadow-sm">
                                    <Truck className="w-4 h-4 text-[#005AB5] shrink-0" />
                                    <div>
                                      <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-wider">Fura raqami</p>
                                      <p className="text-sm font-black text-[#111827] font-mono">{vehicleNumber}</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                      <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-wider">Sana</p>
                                      <p className="text-sm font-bold text-[#374151]">{firstDate}</p>
                                    </div>
                                  </div>

                                  {/* Photos */}
                                  {allPhotos.length > 0 ? (
                                    <div>
                                      <p className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" /> Rasmlar ({allPhotos.length} ta)
                                      </p>
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {allPhotos.map((photo, idx) => (
                                          <img
                                            key={idx}
                                            src={photo.dataUrl}
                                            alt={photo.name}
                                            className="w-20 h-20 rounded-xl object-cover shrink-0 border-2 border-[#BFDBFE] cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={e => { e.stopPropagation(); openPhotoUrl(photo.dataUrl); }}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-[#D1D5DB] bg-white rounded-xl border border-[#E5E7EB] px-3 py-2">
                                      <ImageIcon className="w-4 h-4" />
                                      <p className="text-[10px] font-bold">Rasm yuklanmagan</p>
                                    </div>
                                  )}

                                  {/* Barchasi / Bir qismi toggle */}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSetVehicleMode("full")}
                                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                                        vehicleMode === "full"
                                          ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#005AB5]"
                                          : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#93C5FD] hover:text-[#005AB5]"
                                      }`}
                                    >
                                      Barchasi
                                    </button>
                                    <button
                                      onClick={() => handleSetVehicleMode("partial")}
                                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                                        vehicleMode === "partial"
                                          ? "bg-[#005AB5] border-[#005AB5] text-white shadow-sm shadow-blue-200"
                                          : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#93C5FD] hover:text-[#005AB5]"
                                      }`}
                                    >
                                      Bir qismi
                                    </button>
                                  </div>

                                  {/* Client list with checkboxes (visible in partial mode) */}
                                  {vehicleMode === "partial" && (
                                    <div className="space-y-2">
                                      {chiqims.map(cr => {
                                        const isClientSelected = selectedClientIds.has(cr.id);
                                        const cMode = crModes[cr.id] ?? "full";
                                        const cPart = crPartials[cr.id];
                                        return (
                                          <div key={cr.id}
                                            className={`rounded-xl border transition-all overflow-hidden ${
                                              isClientSelected
                                                ? "border-[#BFDBFE] bg-white shadow-sm"
                                                : "border-[#DDE1EA] bg-[#F9FAFB] opacity-60"
                                            }`}
                                          >
                                            <button
                                              onClick={() => toggleClientId(cr.id)}
                                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                                            >
                                              {isClientSelected
                                                ? <CheckSquare className="w-4 h-4 text-[#005AB5] shrink-0" />
                                                : <Square className="w-4 h-4 text-[#D1D5DB] shrink-0" />
                                              }
                                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${
                                                isClientSelected ? "text-[#005AB5] bg-[#EFF6FF]" : "text-[#9CA3AF] bg-[#F3F4F6]"
                                              }`}>
                                                {cr.clientCode}
                                              </span>
                                              <span className="text-[10px] text-[#6B7280] font-medium flex-1 truncate">
                                                {cr.clientName || cr.clientCode}
                                              </span>
                                              <span className={`text-[10px] font-bold shrink-0 ${isClientSelected ? "text-[#005AB5]" : "text-[#D1D5DB]"}`}>
                                                {cr.selectedProductIds.length} tovar
                                              </span>
                                            </button>

                                            <ClientProductTable data={productRowsOf(cr)} accent="blue" />

                                            {isClientSelected && (
                                              <div className="border-t border-[#BFDBFE] px-3 py-2.5 space-y-2 bg-[#F0F7FF]">
                                                <div className="flex gap-1.5">
                                                  <button
                                                    onClick={() => setCrModes(m => ({ ...m, [cr.id]: "full" }))}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                                      cMode === "full"
                                                        ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#005AB5]"
                                                        : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#BFDBFE]"
                                                    }`}
                                                  >
                                                    Barchasi
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setCrModes(m => ({ ...m, [cr.id]: "partial" }));
                                                      setCrPartials(m => ({ ...m, [cr.id]: m[cr.id] ?? { qty: "", unit: "joy" } }));
                                                    }}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                                      cMode === "partial"
                                                        ? "bg-[#005AB5] border-[#005AB5] text-white"
                                                        : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#BFDBFE]"
                                                    }`}
                                                  >
                                                    Bir qismi
                                                  </button>
                                                </div>
                                                {cMode === "partial" && renderPartialProductRows(cr, "blue")}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Calculator */}
                    {selectedVehicles.size > 0 && (
                      <div className="mx-3 mb-3 bg-white border border-[#DDE1EA] rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-4 py-2.5 border-b border-[#EEF0F5] bg-[#F8F9FC] flex items-center gap-2">
                          <div className="w-[3px] h-4 rounded-full bg-[#005AB5]" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#374151]">
                            Jami hisob · {receiptTotals.clients} mijoz
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-px bg-[#EEF0F5]">
                          {[
                            { val: receiptTotals.products, label: "Tovar" },
                            { val: receiptTotals.qty,      label: "Soni" },
                            { val: receiptTotals.places,   label: "Joy" },
                            { val: receiptTotals.brutto,   label: "Brutto kg" },
                            { val: receiptTotals.volume,   label: "m³" },
                          ].map(({ val, label }) => (
                            <div key={label} className="text-center bg-white py-3">
                              <p className="text-base font-black text-[#005AB5]">{val || "—"}</p>
                              <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-wider mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Qabul qilinmaydigan tovarlar (ixtiyoriy) */}
                    {renderDamageSection()}

                    {/* Note + Save */}
                    {selectedVehicles.size > 0 && (
                      <div className="mx-3 mb-4 space-y-2">
                        <input
                          value={receiptNote}
                          onChange={e => setReceiptNote(e.target.value)}
                          placeholder="Izoh (ixtiyoriy)..."
                          className="w-full px-4 py-2.5 rounded-xl border border-[#DDE1EA] bg-white text-xs font-medium text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5] placeholder:text-[#C4C9D4]"
                        />
                        <button
                          onClick={handleSaveReceipt}
                          disabled={receiptSaving}
                          className="w-full py-3.5 rounded-xl bg-[#005AB5] text-white font-black text-sm hover:bg-[#004A96] disabled:opacity-50 transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                        >
                          <ArrowDownCircle className="w-4.5 h-4.5" />
                          {receiptSaving
                            ? "Saqlanmoqda..."
                            : selectedVehicles.size > 1
                              ? `${selectedVehicles.size} ta furani qabul qilish`
                              : "Furani qabul qilish"}
                        </button>
                      </div>
                    )}

                    {/* ── KIRIM TOVARLAR — omborda. Panel ochiq/yopiqligidan QAT'I NAZAR
                         doim ko'rinadi — tanlab bekor qilinganda ham yo'qolib qolmaydi ── */}
                    {receivedStockProducts.length > 0 && (
                      <div className="mx-4 mb-4 mt-1">
                        <div className="bg-white border border-[#DDE1EA] rounded-2xl overflow-hidden shadow-sm">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-[#F0FDF4] border-b border-[#D1FAE5]">
                            <div className="flex items-center gap-2">
                              <div className="w-[3px] h-4 rounded-full bg-[#059669]" />
                              <span className="text-[11px] font-black uppercase tracking-widest text-[#065F46]">Kirim tovarlar — omborda</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#D1FAE5] text-[#059669] font-black border border-[#A7F3D0]">
                                {receivedStockProducts.length}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#6EE7B7] font-bold">Chiqim tabidan jo'nating</span>
                          </div>
                          <div className="p-3 space-y-2 bg-[#F8FAF9]">
                            <GroupedStockList
                              items={receivedStockProducts}
                              accent="blue"
                              renderCard={(item, idx) => renderStockProductCard(item, idx, "blue")}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── QABUL QILINMAGAN — shu omborda. Qisman qabulda olib qolinmagan
                         (held) qism shu yerda turadi va chiqim qilsa bo'ladi. ── */}
                    {notAcceptedStockProducts.length > 0 && (
                      <div className="mx-4 mb-4">
                        <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                            <div className="flex items-center gap-2">
                              <div className="w-[3px] h-4 rounded-full bg-amber-500" />
                              <span className="text-[11px] font-black uppercase tracking-widest text-amber-700">Qabul qilinmagan — shu omborda</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-black border border-amber-200">
                                {notAcceptedStockProducts.length}
                              </span>
                            </div>
                            <button
                              onClick={toggleHeldSelectAll}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${allHeldSelected ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                              title="Hammasini tanlash / bekor qilish"
                            >
                              {allHeldSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {allHeldSelected ? "Bekor qilish" : "Hammasini tanlash"}
                            </button>
                          </div>
                          <p className="text-[10px] text-amber-700/80 px-4 py-1.5 border-b border-amber-100 bg-amber-50/60 leading-relaxed">
                            Tovarlarni belgilang, so'ng pastdagi <span className="font-black">«Stockка qabul qilib olish»</span> tugmasini bosing — tasdiqlashdan keyin tanlanganlar <span className="font-black">«Kirim tovarlar — omborda»</span>ga o'tadi va bu ro'yxatdan o'chadi. Bu amal <span className="font-black">qaytarilmaydi</span>.
                          </p>
                          <div className="p-3 space-y-2 bg-amber-50/30">
                            <GroupedStockList
                              items={notAcceptedStockProducts}
                              accent="blue"
                              renderCard={(item, idx) => {
                                const selected = isHeldSelected(item.source.id, item.pid);
                                return (
                                  <div
                                    key={`${item.source.id}:${item.pid}`}
                                    onClick={() => toggleHeldSelected(item.source.id, item.pid)}
                                    className={`relative cursor-pointer rounded-xl transition-all ${selected ? "ring-2 ring-emerald-500" : "hover:ring-1 hover:ring-emerald-300"}`}
                                  >
                                    <div className={`absolute top-2 right-2 z-10 w-5 h-5 flex items-center justify-center ${selected ? "text-emerald-600" : "text-muted-foreground/40"}`}>
                                      {selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                    </div>
                                    {renderStockProductCard(item, idx, "blue")}
                                  </div>
                                );
                              }}
                            />
                            {heldSelectedItems.length > 0 && (
                              <button
                                onClick={() => setConfirmReleaseHeld(true)}
                                disabled={releasingHeld}
                                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                              >
                                {releasingHeld ? "O'tkazilmoqda..." : `Stockка qabul qilib olish (${heldSelectedItems.length} ta tovar)`}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Archive slide-over */}
                {showArchive && (
                  <div className="absolute inset-0 z-10 flex">
                    <button
                      className="flex-1 bg-foreground/10"
                      onClick={() => setShowArchive(false)}
                    />
                    <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                            {uzbReceipts.length + incomingTransfers.filter(t => t.status === "received").length}
                          </span>
                        </div>
                        <button
                          onClick={() => setShowArchive(false)}
                          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {uzbReceipts.length === 0 && incomingTransfers.filter(t => t.status === "received").length === 0 ? (
                          <div className="py-14 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                              <ArrowDownCircle className="w-7 h-7 text-muted-foreground/20" />
                            </div>
                            <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                            <p className="text-xs text-muted-foreground/40 mt-1">Qabul qilingan furalar va o'tkazmalar bu yerda</p>
                          </div>
                        ) : (
                          <>
                          {[...uzbReceipts].reverse().map(receipt => {
                            const clientCount = Object.keys(receipt.receivedRatios).length;
                            return (
                              <div key={receipt.id} className="bg-card rounded-xl border border-border p-3 group">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                      <Truck className="w-4 h-4 text-blue-500" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-black text-foreground font-mono">{receipt.vehicleNumber}</p>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {clientCount} mijoz · {receipt.receivedAt}
                                      </p>
                                      {Object.entries(receipt.receivedRatios).map(([crId, ratio]) => {
                                        const cr = allChinaChiqim.find(c => c.id === crId);
                                        return cr ? (
                                          <div key={crId} className="flex items-center gap-1 mt-0.5">
                                            <span className="text-[9px] font-bold text-blue-600 font-mono">{cr.clientCode}</span>
                                            {ratio < 1 && (
                                              <span className="text-[9px] text-gray-400">({Math.round(ratio * 100)}%)</span>
                                            )}
                                          </div>
                                        ) : null;
                                      })}
                                      {receipt.note && (
                                        <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">{receipt.note}</p>
                                      )}
                                    </div>
                                  </div>
                                  <span title="Arxiv yozuvi o'chirilmaydi" className="shrink-0 p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                                </div>
                                <button
                                  onClick={() => toggleArchiveExpand(receipt.id)}
                                  className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                  {expandedArchiveIds.has(receipt.id)
                                    ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                    : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                                </button>
                                {expandedArchiveIds.has(receipt.id) && renderReceiptArchiveDetails(receipt)}
                              </div>
                            );
                          })}

                          {/* O'tkazma orqali qabul qilingan yuklar ham arxivda saqlanadi */}
                          {(() => {
                            const receivedIn = incomingTransfers.filter(t => t.status === "received");
                            if (receivedIn.length === 0) return null;
                            return (
                              <div className="pt-1">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                                  O'tkazma orqali qabul qilingan ({receivedIn.length})
                                </p>
                                <div className="space-y-2">
                                  {[...receivedIn]
                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                    .map(t => renderTransferArchiveCard(t, "in"))}
                                </div>
                              </div>
                            );
                          })()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CHIQARUVCHI: chiqim usuli tanlovi — faqat "uzbekistan" turida ikkalasi ham bo'lgan,
                 endi "Tovar / fura chiqimi" chiqarib tashlandi, shu tur uchun faqat mijoz bo'yicha qoladi ── */}
            {tab === "chiqim" && !isOrtaMijoz && warehouse.type !== "uzbekistan" && (
              <div className="flex gap-2 px-4 py-2.5 bg-white border-b border-[#EEF0F5] shrink-0">
                {([
                  { key: "truck",  label: "Tovar / fura chiqimi",  icon: <Truck className="w-3.5 h-3.5" /> },
                  { key: "client", label: "Mijoz bo'yicha chiqim", icon: <IdCard className="w-3.5 h-3.5" /> },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setUzbChiqimMode(key);
                      setShowChiqimPanel(false);
                      setSelectedProductIds(new Set());
                      setProductModes({});
                      setPartialInputs({});
                      setSelectedDispatchClientCode(null);
                      setChiqimType(key === "client" ? "client" : null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-all ${
                      uzbChiqimMode === key
                        ? "bg-[#005AB5] text-white border-[#005AB5] shadow-sm shadow-blue-200"
                        : "bg-white text-[#6B7280] border-[#DDE1EA] hover:border-[#93C5FD] hover:text-[#005AB5]"
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            )}

            {/* ── CHIQARUVCHI CHIQIM tab — tovar+fura chiqimi (o'rta ombordagidek).
                 "uzbekistan" (Chiqaruvchi) turi uchun bu panel endi umuman ko'rsatilmaydi ── */}
            {tab === "chiqim" && !isOrtaMijoz && warehouse.type !== "uzbekistan" && uzbChiqimMode === "truck" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#F5F6FA]">
                <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDE1EA] bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full transition-colors ${showChiqimPanel ? "bg-[#005AB5]" : "bg-[#D1D5DB]"}`} />
                      <span className="text-xs font-black uppercase tracking-widest text-[#374151]">Chiqim</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#005AB5] font-black border border-[#BFDBFE]">
                        {receivedStockProducts.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {showChiqimPanel && selectedProductIds.size > 0 && (
                        <span className="text-[10px] font-bold text-[#005AB5] bg-[#EFF6FF] px-2 py-0.5 rounded-md">
                          {selectedProductIds.size} tanlandi
                        </span>
                      )}
                      {showChiqimPanel ? (
                        <button
                          onClick={() => { setShowChiqimPanel(false); setSelectedProductIds(new Set()); setProductModes({}); setPartialInputs({}); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE1EA] text-[#6B7280] text-xs font-bold hover:bg-[#F5F6FA] transition-colors"
                        >
                          Bekor
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowChiqimPanel(true)}
                          disabled={receivedStockProducts.length === 0}
                          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                            receivedStockProducts.length > 0
                              ? "bg-[#005AB5] text-white hover:bg-[#004A96] shadow-sm shadow-blue-200"
                              : "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
                          }`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" /> Chiqim qilish
                        </button>
                      )}
                      <button
                        onClick={() => setShowArchive(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE1EA] bg-white text-[#6B7280] text-xs font-bold hover:bg-[#F5F6FA] transition-colors"
                      >
                        Arxiv ({chiqimRecords.length})
                      </button>
                    </div>
                  </div>

                  {/* Statistika paneli */}
                  <UzbWarehouseStatsPanel recordCount={allChinaChiqim.length} stats={uzbStats} />

                  <div className="flex-1 overflow-y-auto">
                    {!showChiqimPanel ? (
                      <div className="py-16 text-center px-4">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
                          <ArrowUpCircle className="w-8 h-8 text-[#D1D5DB]" />
                        </div>
                        <p className="text-sm font-bold text-[#374151] mb-1">
                          {receivedStockProducts.length > 0
                            ? `${receivedStockProducts.length} ta tovar chiqimga tayyor`
                            : "Chiqarilishi kerak bo'lgan tovar yo'q"}
                        </p>
                        {receivedStockProducts.length === 0 && (
                          <p className="text-xs text-[#9CA3AF]">Avval Kirim tabida fura qabul qiling</p>
                        )}
                        {receivedStockProducts.length > 0 && (
                          <button
                            onClick={() => setShowChiqimPanel(true)}
                            className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#005AB5] text-white text-sm font-black hover:bg-[#004A96] transition-colors shadow-md shadow-blue-200"
                          >
                            <ArrowUpCircle className="w-4 h-4" /> Chiqim qilish
                          </button>
                        )}
                      </div>
                    ) : receivedStockProducts.length === 0 ? (
                      <div className="py-14 text-center px-4">
                        <div className="w-14 h-14 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-3">
                          <Package className="w-7 h-7 text-[#D1D5DB]" />
                        </div>
                        <p className="text-sm font-bold text-[#9CA3AF]">Faol tovarlar yo'q</p>
                        <p className="text-xs text-[#C4C9D4] mt-1">Kirim tabida fura qabul qiling</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {receivedStockProducts.map(({ pid, product: p, source, available }, idx) => {
                          const isSelected = selectedProductIds.has(pid);
                          const mode = productModes[pid] ?? "full";
                          const partial = partialInputs[pid];
                          const totalJoys = p.places.reduce((s2, pl) => s2 + (parseFloat(pl.count) || 0), 0);
                          const isPartialStock = available < 0.9995;
                          return (
                            <div
                              key={pid}
                              className={`rounded-xl border transition-all bg-white ${
                                isSelected ? "border-[#005AB5] bg-[#EFF6FF]/40" : "border-[#DDE1EA] hover:border-[#93C5FD]"
                              }`}
                            >
                              <button
                                onClick={() => toggleProduct(pid)}
                                className="w-full flex items-start gap-2.5 p-3 text-left"
                              >
                                <div className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? "text-[#005AB5]" : "text-[#9CA3AF]"}`}>
                                  {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-black text-[#9CA3AF] uppercase">#{idx + 1}</span>
                                    <span className="text-[10px] font-bold text-[#005AB5] bg-[#EFF6FF] px-1.5 py-0.5 rounded font-mono">
                                      {source.clientCode}
                                    </span>
                                    <span className="text-[10px] text-[#9CA3AF] flex items-center gap-0.5">
                                      <Truck className="w-2.5 h-2.5" />{source.vehicleNumber}
                                    </span>
                                    {isPartialStock && (
                                      <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                        {Math.round(available * 100)}% mavjud
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-bold text-[#111827] mt-0.5">{productSummary(p)}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                    {p.quantity && (
                                      <span className="text-[10px] text-[#6B7280]">Soni: <strong>{p.quantity}</strong></span>
                                    )}
                                    {totalJoys > 0 && (
                                      <span className="text-[10px] text-[#6B7280]">Joy: <strong>{fmt2(totalJoys)}</strong></span>
                                    )}
                                    {p.brutto && (
                                      <span className="text-[10px] text-[#6B7280]">Vazn: <strong>{p.brutto} {p.bruttoUnit}</strong></span>
                                    )}
                                    {p.totalVolume && (
                                      <span className="text-[10px] text-[#6B7280]">Vol: <strong>{p.totalVolume} m³</strong></span>
                                    )}
                                  </div>
                                </div>
                              </button>

                              {/* Barchasi / Bir qismi */}
                              {isSelected && (
                                <div className="px-3 pb-3 space-y-2">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setProductMode(pid, "full")}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        mode === "full"
                                          ? "bg-[#EFF6FF] border-[#005AB5] text-[#005AB5]"
                                          : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#93C5FD] hover:text-[#005AB5]"
                                      }`}
                                    >
                                      Barchasi{isPartialStock ? ` (${Math.round(available * 100)}%)` : ""}
                                    </button>
                                    <button
                                      onClick={() => setProductMode(pid, "partial")}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        mode === "partial"
                                          ? "bg-[#005AB5] border-[#005AB5] text-white"
                                          : "bg-white border-[#DDE1EA] text-[#9CA3AF] hover:border-[#93C5FD] hover:text-[#005AB5]"
                                      }`}
                                    >
                                      Bir qismi
                                    </button>
                                  </div>
                                  {mode === "partial" && (() => {
                                    const basis = partial?.unit ?? "joy";
                                    const maxQty = Math.round(productBasisTotal(p, basis) * available * 100) / 100;
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number" onWheel={noWheel}
                                          min="0" step="any" max={maxQty}
                                          value={partial?.qty ?? ""}
                                          onChange={e => setPartialInputs(m => ({
                                            ...m,
                                            [pid]: { qty: clampToMax(e.target.value, maxQty), unit: m[pid]?.unit ?? "joy" }
                                          }))}
                                          placeholder={`Max ${maxQty}`}
                                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#DDE1EA] bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#005AB5]/30 focus:border-[#005AB5]"
                                        />
                                        <select
                                          value={basis}
                                          onChange={e => {
                                            const u = e.target.value;
                                            const newMax = Math.round(productBasisTotal(p, u) * available * 100) / 100;
                                            setPartialInputs(m => ({
                                              ...m,
                                              [pid]: { qty: clampToMax(m[pid]?.qty ?? "", newMax), unit: u }
                                            }));
                                          }}
                                          className="px-2 py-1.5 rounded-lg border border-[#DDE1EA] bg-white text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-[#005AB5]/30 focus:border-[#005AB5] max-w-[46%]"
                                        >
                                          {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                        </select>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Kalkulyator */}
                    {ortaSelectedIds.length > 0 && (
                      <div className="mx-3 mb-3 bg-white border border-[#DDE1EA] rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-4 py-2.5 border-b border-[#EEF0F5] bg-[#F8F9FC] flex items-center gap-2">
                          <div className="w-[3px] h-4 rounded-full bg-[#005AB5]" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#374151]">
                            Jami hisob · {ortaSelectedIds.length} ta tovar
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-px bg-[#EEF0F5]">
                          {[
                            { val: ortaTotals.qty,    label: "Soni" },
                            { val: ortaTotals.places, label: "Joy soni" },
                            { val: ortaTotals.weight, label: "Brutto (kg)" },
                            { val: ortaTotals.volume, label: "Kuba (m³)" },
                          ].map(({ val, label }) => (
                            <div key={label} className="text-center bg-white py-3">
                              <p className="text-base font-black text-[#005AB5]">{val || "—"}</p>
                              <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-wider mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chiqim ma'lumotlari: manzil ombor / fura / rasmlar / izoh / saqlash */}
                    {ortaSelectedIds.length > 0 && (
                      <div className="mx-3 mb-4 bg-white rounded-xl border border-[#BFDBFE] p-3 space-y-3 shadow-sm">
                        <p className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider">Chiqim ma'lumotlari</p>

                        <div>
                          <label className="text-[10px] font-bold text-[#6B7280] flex items-center gap-1 mb-1">
                            <Building2 className="w-3 h-3" /> Qabul qiluvchi ombor <span className="text-destructive">*</span>
                          </label>
                          <select
                            value={chiqimDestId}
                            onChange={e => setChiqimDestId(e.target.value)}
                            className={`w-full px-2.5 py-2 rounded-lg border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#005AB5]/30 focus:border-[#005AB5] ${chiqimDestId ? "border-[#DDE1EA]" : "border-amber-300"}`}
                          >
                            <option value="">— Omborni tanlang —</option>
                            {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-[#9CA3AF] mt-1">
                            Yuk tanlangan omborga «yo'lda» bo'lib boradi — o'sha ombor qabul qilishi kerak
                          </p>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[#6B7280] flex items-center gap-1 mb-1">
                            <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                          </label>
                          <input
                            value={vehicleNumber}
                            onChange={e => setVehicleNumber(e.target.value)}
                            placeholder="01 A 123 AA"
                            className="w-full px-2.5 py-2 rounded-lg border border-[#DDE1EA] bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#005AB5]/30 focus:border-[#005AB5] uppercase font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[#6B7280] flex items-center gap-1 mb-1">
                            <Camera className="w-3 h-3" /> Rasmlar
                            <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-[#F5F6FA] text-[#9CA3AF]">
                              {photos.length}/20
                            </span>
                          </label>
                          {photos.length < 20 && (
                            <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-[#BFDBFE] bg-[#EFF6FF]/50 hover:border-[#005AB5] text-xs text-[#005AB5] cursor-pointer transition-colors">
                              <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                              <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                            </label>
                          )}
                          {photos.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                              {photos.map((ph, i) => (
                                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#DDE1EA] group">
                                  <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                                    className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                                  >
                                    <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[#6B7280] block mb-1">Izoh</label>
                          <textarea
                            value={chiqimNote}
                            onChange={e => setChiqimNote(e.target.value)}
                            placeholder="Qo'shimcha..."
                            rows={2}
                            className="w-full px-2.5 py-2 rounded-lg border border-[#DDE1EA] bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#005AB5]/30 focus:border-[#005AB5] resize-none"
                          />
                        </div>

                        <button
                          onClick={handleSaveOrtaChiqim}
                          disabled={chiqimSaving}
                          className="w-full py-3 rounded-xl bg-[#005AB5] text-white font-black text-xs hover:bg-[#004A96] disabled:opacity-50 transition-colors shadow-md shadow-blue-200"
                        >
                          {chiqimSaving ? "Saqlanmoqda..." : `Chiqimni saqlash (${ortaSelectedIds.length} ta tovar)`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Arxiv slide-over — o'z chiqim yozuvlari */}
                {showArchive && (
                  <div className="absolute inset-0 z-10 flex">
                    <button
                      className="flex-1 bg-foreground/10"
                      onClick={() => setShowArchive(false)}
                    />
                    <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                            {chiqimRecords.length}
                          </span>
                        </div>
                        <button
                          onClick={() => setShowArchive(false)}
                          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {chiqimRecords.length === 0 ? (
                          <div className="py-14 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                              <ArrowUpCircle className="w-7 h-7 text-muted-foreground/20" />
                            </div>
                            <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                            <p className="text-xs text-muted-foreground/40 mt-1">Chiqarilgan tovarlar bu yerda</p>
                          </div>
                        ) : (
                          [...chiqimRecords].reverse().map(record => (
                            <div key={record.id} className="bg-card rounded-xl border border-border p-3 group">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center shrink-0">
                                    <ArrowUpCircle className="w-4 h-4 text-[#005AB5]" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-foreground truncate">
                                      {record.clientName || record.clientCode}
                                    </p>
                                    {(() => {
                                      const st = chiqimStatusOf(record);
                                      return (
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${
                                            st.key === "received" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                            : st.key === "partial" ? "bg-amber-50 text-amber-600 border-amber-200"
                                            : "bg-blue-50 text-blue-600 border-blue-200"
                                          }`}>
                                            {st.label}
                                          </span>
                                          {st.destName && (
                                            <span className="text-[9px] font-bold text-muted-foreground">→ {st.destName}</span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                      <span className="text-[10px] font-bold text-[#005AB5] flex items-center gap-0.5">
                                        <Truck className="w-2.5 h-2.5" />{record.vehicleNumber}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {record.selectedProductIds.length} tovar
                                      </span>
                                      {record.photos.length > 0 && (
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                          <Camera className="w-2.5 h-2.5" />{record.photos.length}
                                        </span>
                                      )}
                                    </div>
                                    {record.note && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5 italic truncate">{record.note}</p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground/40 mt-0.5">{fmtDateTime(record.createdAt)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center shrink-0">
                                  {canEditArchive && (
                                    <button
                                      onClick={() => openChiqimEdit(record)}
                                      title="Tahrirlash (faqat huquqi borlar)"
                                      className="p-1 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  <span title="Arxiv yozuvi o'chirilmaydi" className="p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                                </div>
                              </div>
                              <button
                                onClick={() => toggleArchiveExpand(record.id)}
                                className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors"
                              >
                                {expandedArchiveIds.has(record.id)
                                  ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                  : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                              </button>
                              {expandedArchiveIds.has(record.id) && renderChiqimArchiveDetails(record)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MIJOZ BO'YICHA CHIQIM — o'rta mijoz va chiqaruvchi (uzbekistan) uchun doim,
                 boshqa turlar uchun faqat "client" tanlanganda ── */}
            {tab === "chiqim" && (isOrtaMijoz || warehouse.type === "uzbekistan" || uzbChiqimMode === "client") && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#F5F6FA]">

                {/* Active clients (full width) */}
                <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDE1EA] bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-[#005AB5]" />
                      <span className="text-xs font-black uppercase tracking-widest text-[#374151]">Faol mijozlar</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#005AB5] font-black border border-[#BFDBFE]">
                        {activeUzbClientList.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {paymentsEnabled && (
                        <button
                          onClick={() => setShowPayments(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-black hover:bg-emerald-100 transition-colors"
                        >
                          To'lovlar ({uzbDispatches.filter(d => d.payment && d.payment.mode !== "none").length})
                        </button>
                      )}
                      <button
                        onClick={() => setShowArchive(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE1EA] bg-white text-[#6B7280] text-xs font-bold hover:bg-[#F5F6FA] transition-colors"
                      >
                        Arxiv ({uzbDispatches.length + outgoingTransfers.length})
                      </button>
                    </div>
                  </div>

                  {/* ── Statistics panel (my.gov.uz style) ── */}
                  <UzbWarehouseStatsPanel recordCount={allChinaChiqim.length} stats={uzbStats} />

                  {/* Chiqim type toggle — faqat o'tkazma ruxsat etilganda (O'rta mijoz).
                       Chiqaruvchi (uzbekistan) omborda faqat "Mijoz bo'yicha" bor — toggle kerak emas. */}
                  {allowTransfer && (
                  <div className="flex gap-2 px-4 py-3 bg-white border-b border-[#EEF0F5] shrink-0">
                    {([
                      { key: "client",    label: "Mijoz bo'yicha",        icon: <IdCard className="w-3.5 h-3.5" /> },
                      { key: "warehouse", label: "Boshqa omborga o'tkazish", icon: <Building2 className="w-3.5 h-3.5" /> },
                    ] as const).filter(o => allowTransfer || o.key !== "warehouse").map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setChiqimType(key);
                          setSelectedDispatchClientCode(null);
                          setDispatchMode("full"); setDispatchPartialQty(""); setDispatchNote("");
                          setSelectedTransferDestId(null); resetPayment();
                          setDispSelectedPids(new Set()); setProductModes({}); setPartialInputs({});
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-all ${
                          chiqimType === key
                            ? "bg-[#005AB5] text-white border-[#005AB5] shadow-sm shadow-blue-200"
                            : "bg-white text-[#6B7280] border-[#DDE1EA] hover:border-[#93C5FD] hover:text-[#005AB5]"
                        }`}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                  )}

                  <div className="flex-1 overflow-y-auto bg-[#F5F6FA]">
                    {chiqimType === null ? (
                      /* ── Placeholder: tur tanlanmagan ── */
                      <div className="py-20 text-center px-6">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-5 shadow-sm">
                          <ArrowUpCircle className="w-8 h-8 text-[#D1D5DB]" />
                        </div>
                        <p className="text-sm font-black text-[#374151] mb-1">Chiqim turini tanlang</p>
                        <p className="text-xs text-[#9CA3AF] mb-6">Quyidagi usullardan birini bosing</p>
                        <div className="flex flex-col gap-3 max-w-xs mx-auto">
                          {([
                            { key: "client" as const,    label: "Mijoz bo'yicha chiqim",   sub: "Mijoz ID bilan tovarni chiqarish",     icon: <IdCard className="w-5 h-5" />,    color: "bg-[#005AB5]" },
                            { key: "warehouse" as const, label: "Boshqa omborga o'tkazish", sub: "Tovarni boshqa omborga yo'naltirish", icon: <Building2 className="w-5 h-5" />, color: "bg-[#059669]" },
                          ]).filter(o => allowTransfer || o.key !== "warehouse").map(({ key, label, sub, icon, color }) => (
                            <button
                              key={key}
                              onClick={() => {
                                setChiqimType(key);
                                setSelectedDispatchClientCode(null);
                                setDispatchMode("full"); setDispatchPartialQty(""); setDispatchNote("");
                                setSelectedTransferDestId(null); resetPayment();
                                setDispSelectedPids(new Set()); setProductModes({}); setPartialInputs({});
                              }}
                              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-white border border-[#DDE1EA] hover:border-[#93C5FD] hover:shadow-sm transition-all text-left"
                            >
                              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white shrink-0`}>
                                {icon}
                              </div>
                              <div>
                                <p className="text-sm font-black text-[#111827]">{label}</p>
                                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{sub}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : chiqimType === "warehouse" ? (
                      /* ── O'rta ombor chiqimidek: qabul qilingan tovarlar ro'yxatidan
                         to'g'ridan-to'g'ri Chiqaruvchi omborga jo'natish ── */
                      receivedStockProducts.length === 0 ? (
                        <div className="py-16 text-center px-4">
                          <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
                            <Package className="w-8 h-8 text-[#D1D5DB]" />
                          </div>
                          <p className="text-sm font-bold text-[#9CA3AF]">Chiqarilishi kerak bo'lgan tovar yo'q</p>
                          <p className="text-xs text-[#C4C9D4] mt-1">Avval fura orqali tovar qabul qiling</p>
                        </div>
                      ) : (
                        <>
                    <div className="p-3 space-y-2">
                      {receivedStockProducts.map(({ pid, product: p, source, available }, idx) => {
                        const isSelected = selectedProductIds.has(pid);
                        const mode = productModes[pid] ?? "full";
                        const partial = partialInputs[pid];
                        const totalJoys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
                        const isPartialStock = available < 0.9995;
                        // Qolgan (chiqarilmagan) miqdorlar — mavjud ulush (available) bilan
                        const remQty = Math.floor(clean((parseFloat(p.quantity) || 0) * available));
                        const remBrutto = fmt2(bruttoKg(p) * available);
                        const remVol = fmt3((parseFloat(p.totalVolume || "0") || 0) * available);
                        return (
                          <div
                            key={pid}
                            className={`rounded-xl border transition-all ${
                              isSelected ? "border-amber-500 bg-amber-500/5" : "border-border bg-card hover:border-amber-300/60"
                            }`}
                          >
                            <button
                              onClick={() => toggleProduct(pid)}
                              className="w-full flex items-start gap-2.5 p-3 text-left"
                            >
                              <div className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? "text-amber-600" : "text-muted-foreground"}`}>
                                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-black text-muted-foreground uppercase">#{idx + 1}</span>
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                                    {source.clientCode}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                                    <Truck className="w-2.5 h-2.5" />{source.vehicleNumber}
                                  </span>
                                  {isPartialStock && (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-600/10 px-1.5 py-0.5 rounded">
                                      {Math.round(available * 100)}% mavjud
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-foreground mt-0.5">{productSummary(p)}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {p.quantity && (
                                    <span className="text-[10px] text-muted-foreground">Soni: <strong className={isPartialStock ? "text-amber-600" : ""}>{remQty}</strong> dona</span>
                                  )}
                                  {totalJoys > 0 && (
                                    <span className="text-[10px] text-muted-foreground">Joy: <strong className={isPartialStock ? "text-amber-600" : ""}>{fmt2(totalJoys * available)}</strong></span>
                                  )}
                                  {p.brutto && (
                                    <span className="text-[10px] text-muted-foreground">Vazn: <strong className={isPartialStock ? "text-amber-600" : ""}>{remBrutto}</strong> {p.bruttoUnit}</span>
                                  )}
                                  {p.totalVolume && (
                                    <span className="text-[10px] text-muted-foreground">Vol: <strong className={isPartialStock ? "text-amber-600" : ""}>{remVol}</strong> m³</span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Barchasi / Bir qismi — tanlanganida */}
                            {isSelected && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setProductMode(pid, "full")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "full"
                                        ? "bg-amber-500/10 border-amber-500 text-amber-700"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600"
                                    }`}
                                  >
                                    Barchasi{isPartialStock ? ` (${Math.round(available * 100)}%)` : ""}
                                  </button>
                                  <button
                                    onClick={() => setProductMode(pid, "partial")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "partial"
                                        ? "bg-amber-500 border-amber-500 text-white"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600"
                                    }`}
                                  >
                                    Bir qismi
                                  </button>
                                </div>
                                {mode === "partial" && (() => {
                                  const basis = partial?.unit ?? "joy";
                                  const maxQty = Math.round(productBasisTotal(p, basis) * available * 100) / 100;
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number" onWheel={noWheel}
                                        min="0" step="any" max={maxQty}
                                        value={partial?.qty ?? ""}
                                        onChange={e => setPartialInputs(m => ({
                                          ...m,
                                          [pid]: { qty: clampToMax(e.target.value, maxQty), unit: m[pid]?.unit ?? "joy" }
                                        }))}
                                        placeholder={`Max ${maxQty}`}
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500"
                                      />
                                      <select
                                        value={basis}
                                        onChange={e => {
                                          const u = e.target.value;
                                          const newMax = Math.round(productBasisTotal(p, u) * available * 100) / 100;
                                          setPartialInputs(m => ({
                                            ...m,
                                            [pid]: { qty: clampToMax(m[pid]?.qty ?? "", newMax), unit: u }
                                          }));
                                        }}
                                        className="px-2 py-1.5 rounded-lg border border-input bg-background text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 max-w-[46%]"
                                      >
                                        {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                      </select>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  {/* ── Calculator ── */}
                  {ortaSelectedIds.length > 0 && (
                    <div className="mx-3 mb-3 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-2">
                        Jami hisob · {ortaSelectedIds.length} ta tovar
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.qty || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.places || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Joy soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.volume || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Kuba (m³)</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.weight || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Og'irlik (kg)</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* ── Vehicle / Photos / Note / Save ── */}
                  {ortaSelectedIds.length > 0 && (
                    <div className="mx-3 mb-3 bg-white rounded-xl border border-amber-500/15 p-3 space-y-3">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Chiqim ma'lumotlari</p>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Building2 className="w-3 h-3" /> Qabul qiluvchi (chiqaruvchi) ombor <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={chiqimDestId}
                          onChange={e => setChiqimDestId(e.target.value)}
                          className={`w-full px-2.5 py-2 rounded-lg border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 ${chiqimDestId ? "border-input" : "border-amber-300"}`}
                        >
                          <option value="">— Omborni tanlang —</option>
                          {allWarehouses.filter(w => w.id !== warehouse.id && w.type === "uzbekistan").map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-muted-foreground/60 mt-1">
                          Yuk tanlangan omborga «yo'lda» bo'lib boradi — o'sha ombor qabul qilishi kerak
                        </p>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                        </label>
                        <input
                          value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value)}
                          placeholder="01 A 123 AA"
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 uppercase font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Camera className="w-3 h-3" /> Rasmlar
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-secondary text-muted-foreground">
                            {photos.length}/20
                          </span>
                        </label>
                        {photos.length < 20 && (
                          <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-amber-200 bg-amber-500/5 hover:border-amber-400 text-xs text-amber-500 hover:text-amber-600 cursor-pointer transition-colors">
                            <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                            <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                          </label>
                        )}
                        {photos.length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                            {photos.map((ph, i) => (
                              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                                <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                                  className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                                >
                                  <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-1">Izoh</label>
                        <textarea
                          value={chiqimNote}
                          onChange={e => setChiqimNote(e.target.value)}
                          placeholder="Qo'shimcha..."
                          rows={2}
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
                        />
                      </div>

                      <button
                        onClick={handleSaveOrtaChiqim}
                        disabled={chiqimSaving}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-black text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {chiqimSaving ? "Saqlanmoqda..." : `Chiqimni saqlash (${ortaSelectedIds.length} ta tovar)`}
                      </button>
                    </div>
                  )}
                        </>
                      )
                    ) : activeUzbClientList.length === 0 ? (
                      <div className="py-16 text-center px-4">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
                          <IdCard className="w-8 h-8 text-[#D1D5DB]" />
                        </div>
                        <p className="text-sm font-bold text-[#9CA3AF]">Chiqarilishi kerak bo'lgan tovar yo'q</p>
                        <p className="text-xs text-[#C4C9D4] mt-1">Avval fura orqali tovar qabul qiling</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {activeUzbClientList.map(([clientCode, { records, clientName }]) => {
                          const isSelected = selectedDispatchClientCode === clientCode;
                          const productCount = records.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                          // Mijoz yuklarining shu omborда QOLGAN (chiqarilmagan) jami ko'rsatkichlari —
                          // "qancha chiqara olaman"ni bir qarashda ko'rish uchun (kelgan emas, qolgan)
                          const ct = records.reduce(
                            (acc, cr) => {
                              const c = crRemaining(cr);
                              return {
                                joys: acc.joys + c.totals.joys,
                                qty: acc.qty + c.totals.qty,
                                brutto: acc.brutto + c.totals.brutto,
                                vol: acc.vol + c.totals.vol,
                              };
                            },
                            { joys: 0, qty: 0, brutto: 0, vol: 0 },
                          );
                          return (
                            <div key={clientCode}
                              className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all cursor-pointer select-none ${
                                isSelected ? "border-blue-500 shadow-blue-100" : "border-gray-100 hover:border-blue-200 hover:shadow-md"
                              }`}
                              onClick={() => handleSelectDispatchClient(clientCode)}
                            >
                              {/* Client card header */}
                              <div className="flex items-center gap-3 px-3.5 py-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  isSelected ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-600"
                                }`}>
                                  <IdCard className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-black text-gray-800 font-mono">{clientCode}</p>
                                    {clientName && clientName !== clientCode && (
                                      <p className="text-xs text-gray-500 font-medium truncate">{clientName}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                      {records.length} yuk · {productCount} tovar
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">
                                      {fmt2(ct.joys)} joy
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">
                                      {Math.round(ct.qty)} dona
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">
                                      {fmt2(ct.brutto)} kg
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">
                                      {fmt3(ct.vol)} m³
                                    </span>
                                  </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                  isSelected ? "border-blue-500 bg-blue-500" : "border-gray-200"
                                }`}>
                                  {isSelected && <CheckSquare className="w-3 h-3 text-white" />}
                                </div>
                              </div>

                              {/* Expanded panel */}
                              {isSelected && (
                                <div className="border-t-2 border-blue-50 bg-blue-50/30 px-3.5 py-3 space-y-3">

                                  {/* ── TOVARLAR — multiselect, O'rta ombor chiqim tizimi kabi:
                                       har tovar alohida tanlanadi, Barchasi/Bir qismi belgilanadi ── */}
                                  <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Tovarlarni tanlang</p>
                                      {clientStockProducts.length > 0 && (
                                        <button
                                          onClick={() => setDispSelectedPids(
                                            dispSelectedPids.size === clientStockProducts.length
                                              ? new Set()
                                              : new Set(clientStockProducts.map(x => x.pid))
                                          )}
                                          className="text-[10px] font-black text-blue-600 hover:text-blue-800 transition-colors"
                                        >
                                          {dispSelectedPids.size === clientStockProducts.length ? "Bekor qilish" : "Hammasini tanlash"}
                                        </button>
                                      )}
                                    </div>
                                    {clientStockProducts.length === 0 && (
                                      <p className="text-xs text-gray-400 text-center py-3 bg-white rounded-xl border border-gray-100">
                                        Bu mijozning omborda chiqarilishi mumkin bo'lgan tovari qolmagan
                                      </p>
                                    )}
                                    {clientStockProducts.map(({ pid, product: p, source, available }, pIdx) => {
                                      const isSel = dispSelectedPids.has(pid);
                                      const mode = productModes[pid] ?? "full";
                                      const partial = partialInputs[pid];
                                      const pName = p.measurements.filter(m => m.value).map(m => m.value).join(", ") || `Tovar ${pIdx + 1}`;
                                      return (
                                        <div key={pid} className={`rounded-xl border bg-white transition-all ${isSel ? "border-blue-600" : "border-gray-200 hover:border-blue-300"}`}>
                                          <button
                                            onClick={() => toggleDispProduct(pid)}
                                            className="w-full flex items-start gap-2.5 p-3 text-left"
                                          >
                                            <div className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center ${isSel ? "text-blue-600" : "text-gray-300"}`}>
                                              {isSel ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs font-black text-gray-800">{pName}</span>
                                                {available < 0.9995 && (
                                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                    {Math.round(available * 100)}% mavjud
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                                <span className="text-[10px] text-gray-500">Soni: <strong>{Math.round((parseFloat(p.quantity) || 0) * available)}</strong> dona</span>
                                                <span className="text-[10px] text-gray-500">Joy: <strong>{fmt2(p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * available)}</strong></span>
                                                <span className="text-[10px] text-gray-500">Brutto: <strong>{fmt2(bruttoKg(p) * available)}</strong> kg</span>
                                                <span className="text-[10px] text-gray-500">Hajm: <strong>{fmt3((parseFloat(p.totalVolume || "0") || 0) * available)}</strong> m³</span>
                                              </div>
                                            </div>
                                            <span className="text-[9px] text-gray-400 font-mono shrink-0 flex items-center gap-1">
                                              <Truck className="w-3 h-3" />{source.vehicleNumber}
                                            </span>
                                          </button>
                                          {isSel && (
                                            <div className="px-3 pb-3 space-y-2">
                                              <div className="flex gap-2">
                                                <button
                                                  onClick={() => setProductMode(pid, "full")}
                                                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                    mode === "full"
                                                      ? "bg-blue-600/10 border-blue-600 text-blue-700"
                                                      : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                                                  }`}
                                                >
                                                  Barchasi
                                                </button>
                                                <button
                                                  onClick={() => setProductMode(pid, "partial")}
                                                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                    mode === "partial"
                                                      ? "bg-blue-600 border-blue-600 text-white"
                                                      : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                                                  }`}
                                                >
                                                  Bir qismi
                                                </button>
                                              </div>
                                              {mode === "partial" && (() => {
                                                const basis = partial?.unit ?? "joy";
                                                const maxQty = Math.round(productBasisTotal(p, basis) * available * 100) / 100;
                                                return (
                                                  <div className="flex items-center gap-1.5">
                                                    <input
                                                      type="number" onWheel={noWheel}
                                                      min="0" step="any" max={maxQty}
                                                      value={partial?.qty ?? ""}
                                                      onChange={e => setPartialInputs(m => ({
                                                        ...m,
                                                        [pid]: { qty: clampToMax(e.target.value, maxQty), unit: m[pid]?.unit ?? "joy" }
                                                      }))}
                                                      placeholder={`Max ${maxQty}`}
                                                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600"
                                                    />
                                                    <select
                                                      value={basis}
                                                      onChange={e => {
                                                        const u = e.target.value;
                                                        const newMax = Math.round(productBasisTotal(p, u) * available * 100) / 100;
                                                        setPartialInputs(m => ({
                                                          ...m,
                                                          [pid]: { qty: clampToMax(m[pid]?.qty ?? "", newMax), unit: u }
                                                        }));
                                                      }}
                                                      className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold focus:outline-none max-w-[46%]"
                                                    >
                                                      {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                                    </select>
                                                  </div>
                                                );
                                              })()}
                                              {/* Tanlangan tovardan aynan qancha olinishi */}
                                              {(() => {
                                                const t = computeTake(p, available, mode === "partial" ? partial : null);
                                                return (
                                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-600/5 border border-blue-600/10 px-2.5 py-1.5">
                                                    <span className="text-[10px] font-black text-blue-700">Olinadi:</span>
                                                    <span className="text-[10px] text-gray-500">Soni: <strong className="text-gray-800">{t.qty} dona</strong></span>
                                                    <span className="text-[10px] text-gray-500">Joy: <strong className="text-gray-800">{fmt2(t.places)}</strong></span>
                                                    <span className="text-[10px] text-gray-500">Brutto: <strong className="text-gray-800">{fmt2(t.brutto)} kg</strong></span>
                                                    <span className="text-[10px] text-gray-500">Hajm: <strong className="text-gray-800">{fmt3(t.volume)} m³</strong></span>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Calculator — tanlanganlar bo'yicha jami */}
                                  {dispSelTotals.products > 0 && (
                                    <div className="bg-white rounded-xl border-2 border-blue-100 p-3" onClick={e => e.stopPropagation()}>
                                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-2">
                                        Jami hisob · {dispSelTotals.products} ta tovar
                                      </p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[
                                          { label: "Tovar", val: dispSelTotals.products },
                                          { label: "Miqdor (dona)", val: dispSelTotals.qty },
                                          { label: "Joy soni", val: dispSelTotals.places },
                                          { label: "Brutto (kg)", val: dispSelTotals.brutto },
                                          { label: "Kuba (m³)", val: dispSelTotals.volume },
                                        ].map(({ label, val }) => (
                                          <div key={label} className="bg-blue-50 rounded-lg p-2 text-center">
                                            <p className="text-[10px] text-gray-500 font-bold">{label}</p>
                                            <p className="text-base font-black text-blue-700">{val || "—"}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* ── SOTUV / TO'LOV — «Mijozlar» bo'limidagi TO'LIQ funksional
                                       sotuv bloki (ClientSalePanel). Sotuv mijoz kartasiga yoziladi
                                       → statistikaga avtomatik tushadi. ── */}
                                  {chiqimType === "client" && paymentsEnabled && (() => {
                                    const saleClient = selectedDispatchClientCode ? crmClientByCode(selectedDispatchClientCode) : null;
                                    if (saleClient) {
                                      return (
                                        <div onClick={e => e.stopPropagation()}>
                                          <ClientSalePanel client={saleClient} onRefresh={refresh} />
                                        </div>
                                      );
                                    }
                                    return (
                                      <div
                                        className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] font-bold text-amber-700"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        To'lov/sotuv qismi uchun bu mijoz «Mijozlar» bo'limida topilmadi
                                        {selectedDispatchClientCode ? ` (ID: ${selectedDispatchClientCode})` : ""}. Avval mijozga ID biriktiring.
                                      </div>
                                    );
                                  })()}

                                  {/* Fura raqami + rasm — mijozga chiqimda (boshqa omborlar chiqimidagi kabi) */}
                                  <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                    <div>
                                      <label className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider flex items-center gap-1">
                                        <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                                      </label>
                                      <input
                                        value={vehicleNumber}
                                        onChange={e => setVehicleNumber(e.target.value)}
                                        placeholder="01 A 123 AA"
                                        className="w-full mt-1 px-4 py-2.5 rounded-xl border border-[#BFDBFE] bg-white text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5]"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider flex items-center gap-1">
                                        <Camera className="w-3 h-3" /> Fura rasmlari
                                        <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-[#F5F6FA] text-[#9CA3AF]">{photos.length}/20</span>
                                      </label>
                                      {photos.length < 20 && (
                                        <label className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-dashed border-[#BFDBFE] bg-[#EFF6FF]/50 hover:border-[#005AB5] text-xs text-[#005AB5] cursor-pointer transition-colors">
                                          <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                                          <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                                        </label>
                                      )}
                                      {photos.length > 0 && (
                                        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                                          {photos.map((ph, i) => (
                                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#DDE1EA] group">
                                              <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                                              <button
                                                onClick={e => { e.stopPropagation(); setPhotos(prev => prev.filter((_, j) => j !== i)); }}
                                                className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                                              >
                                                <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Note */}
                                  <div onClick={e => e.stopPropagation()}>
                                    <label className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider">Izoh</label>
                                    <input
                                      value={dispatchNote}
                                      onChange={e => setDispatchNote(e.target.value)}
                                      placeholder="Ixtiyoriy..."
                                      className="w-full mt-1 px-4 py-2.5 rounded-xl border border-[#BFDBFE] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5]"
                                    />
                                  </div>

                                  {/* Save / Transfer button */}
                                  {chiqimType === "client" ? (() => {
                                    const sc = selectedDispatchClientCode ? crmClientByCode(selectedDispatchClientCode) : null;
                                    const saleDone = (sc?.sale?.status ?? "none") !== "none";
                                    const blockedByPayment = paymentsEnabled && !saleDone;
                                    return (
                                      <>
                                        {blockedByPayment && (
                                          <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mb-1" onClick={e => e.stopPropagation()}>
                                            ⚠ To'lovsiz chiqim mumkin emas — avval yuqoridagi «Sotuv» bo'limida to'lovni rasmiylashtiring.
                                          </p>
                                        )}
                                        <button
                                          onClick={e => { e.stopPropagation(); handleSaveDispatch(); }}
                                          disabled={dispatchSaving || blockedByPayment || !vehicleNumber.trim() || dispSelTotals.products === 0}
                                          className="w-full py-3 rounded-xl bg-[#005AB5] text-white text-sm font-black hover:bg-[#004A96] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                                        >
                                          <ArrowUpCircle className="w-4 h-4" />
                                          {dispatchSaving ? "Saqlanmoqda..." : "Chiqimni saqlash"}
                                        </button>
                                      </>
                                    );
                                  })() : (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleSaveTransfer(); }}
                                      disabled={transferSaving || !selectedTransferDestId || dispSelTotals.products === 0}
                                      className="w-full py-3 rounded-xl bg-[#059669] text-white text-sm font-black hover:bg-[#047857] disabled:opacity-40 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                                    >
                                      <Building2 className="w-4 h-4" />
                                      {transferSaving ? "O'tkazilmoqda..." : "Omborga o'tkazish"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Archive slide-over */}
                {showArchive && (
                  <div className="absolute inset-0 z-10 flex">
                    <button
                      className="flex-1 bg-foreground/10"
                      onClick={() => setShowArchive(false)}
                    />
                    <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                            {uzbDispatches.length + outgoingTransfers.length}
                          </span>
                        </div>
                        <button
                          onClick={() => setShowArchive(false)}
                          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {uzbDispatches.length === 0 && outgoingTransfers.length === 0 ? (
                          <div className="py-16 text-center px-4">
                            <div className="w-16 h-16 rounded-2xl bg-white border-2 border-gray-100 flex items-center justify-center mx-auto mb-4">
                              <ArrowUpCircle className="w-8 h-8 text-gray-200" />
                            </div>
                            <p className="text-sm font-bold text-gray-400">Chiqimlar yo'q</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[...uzbDispatches].reverse().map(d => {
                              const avgRatio = Object.values(d.ratios).length
                                ? Object.values(d.ratios).reduce((a, b) => a + b, 0) / Object.values(d.ratios).length
                                : 1;
                              const isPart = avgRatio < 0.99;
                              return (
                                <div key={d.id} className="bg-white rounded-2xl border-2 border-gray-100 p-3 shadow-sm">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <span className="text-xs font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg font-mono">
                                          {d.clientCode}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isPart ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}>
                                          {isPart ? "Bir qismi" : "Barchasi"}
                                        </span>
                                        {d.payment && d.payment.mode !== "none" && (
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                            d.payment.mode === "full"
                                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                              : "bg-amber-50 text-amber-600 border-amber-100"
                                          }`}>
                                            {d.payment.mode === "full" ? "To'liq to'langan" : "Qisman to'langan"}
                                          </span>
                                        )}
                                      </div>
                                      {d.clientName && d.clientName !== d.clientCode && (
                                        <p className="text-xs text-gray-500 font-medium mb-1">{d.clientName}</p>
                                      )}
                                      <p className="text-[10px] text-gray-400">{d.chiqimRecordIds.length} ta yuk</p>
                                      {d.note && <p className="text-xs text-gray-500 mt-1">{d.note}</p>}
                                      <p className="text-[10px] text-gray-300 mt-1">{fmtDate(d.dispatchedAt)} · {fmtDateTime(d.createdAt)}</p>
                                    </div>
                                    <span title="Arxiv yozuvi o'chirilmaydi" className="shrink-0 p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                                  </div>
                                  <button
                                    onClick={() => toggleArchiveExpand(d.id)}
                                    className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors"
                                  >
                                    {expandedArchiveIds.has(d.id)
                                      ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                      : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                                  </button>
                                  {expandedArchiveIds.has(d.id) && renderDispatchArchiveDetails(d)}
                                </div>
                              );
                            })}

                            {/* Boshqa omborga o'tkazmalar ham chiqim arxivida saqlanadi */}
                            {outgoingTransfers.length > 0 && (
                              <div className="pt-1">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                                  Boshqa omborga o'tkazmalar ({outgoingTransfers.length})
                                </p>
                                <div className="space-y-2">
                                  {[...outgoingTransfers]
                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                    .map(t => renderTransferArchiveCard(t, "out"))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TO'LOVLAR slide-over: har bir mijozga chiqim bo'yicha to'liq
                     to'lov holati — snapshot + jonli (Mijozlar bo'limidan). ── */}
                {paymentsEnabled && showPayments && (
                  <div className="absolute inset-0 z-10 flex">
                    <button className="flex-1 bg-foreground/10" onClick={() => setShowPayments(false)} />
                    <div className="w-[26rem] max-w-full bg-card border-l border-border flex flex-col shadow-2xl">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">To'lovlar</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                            {uzbDispatches.length}
                          </span>
                        </div>
                        <button onClick={() => setShowPayments(false)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {uzbDispatches.length === 0 ? (
                          <div className="py-16 text-center px-4">
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
                              <IdCard className="w-8 h-8 text-emerald-200" />
                            </div>
                            <p className="text-sm font-bold text-gray-400">Hali mijozga chiqim yo'q</p>
                            <p className="text-xs text-gray-300 mt-1">Chiqim qilinganda to'lov ma'lumotlari shu yerda</p>
                          </div>
                        ) : (
                          [...uzbDispatches]
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map(d => {
                              const snap = d.payment ?? null;
                              const mode = snap?.mode ?? "none";
                              const live = crmClientByCode(d.clientCode);
                              const liveSale = live?.sale;
                              const livePaid = liveSale
                                ? (liveSale.payments ?? []).reduce((s2: number, pp: any) => s2 + (Number(pp.amount) || 0), 0)
                                : 0;
                              const liveTotal = liveSale?.totalAmount ?? null;
                              const liveDebt = liveTotal != null ? Math.max(0, liveTotal - livePaid) : null;
                              return (
                                <div key={d.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
                                  {/* Sarlavha */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg font-mono">{d.clientCode}</span>
                                    {d.clientName && d.clientName !== d.clientCode && (
                                      <span className="text-[11px] text-muted-foreground font-medium">{d.clientName}</span>
                                    )}
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      mode === "full" ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                      : mode === "partial" ? "bg-amber-50 text-amber-600 border-amber-100"
                                      : "bg-gray-50 text-gray-500 border-gray-200"
                                    }`}>
                                      {mode === "full" ? "To'liq to'landi" : mode === "partial" ? "Qisman to'langan" : "To'lovsiz"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50 ml-auto shrink-0">{fmtDate(d.dispatchedAt)}</span>
                                  </div>

                                  {/* Chiqim paytidagi to'lov (snapshot — o'zgarmaydi) */}
                                  {snap && mode !== "none" && (
                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
                                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider mb-1">Chiqim paytidagi to'lov</p>
                                      <div className="grid grid-cols-3 gap-1">
                                        {[
                                          { label: "Jami", val: fmtSum(Number(snap.totalAmount) || 0) },
                                          { label: "To'langan", val: fmtSum(Number(snap.paidAmount) || 0) },
                                          { label: "Qarz", val: fmtSum(Math.max(0, (Number(snap.totalAmount) || 0) - (Number(snap.paidAmount) || 0))) },
                                        ].map(c => (
                                          <div key={c.label} className="text-center bg-white rounded-md border border-emerald-100 py-1.5">
                                            <p className="text-[11px] font-black text-emerald-700">{c.val}</p>
                                            <p className="text-[8px] text-muted-foreground font-bold uppercase">{c.label}</p>
                                          </div>
                                        ))}
                                      </div>
                                      {snap.nextPaymentAt && (
                                        <p className="text-[9px] text-amber-700 font-bold mt-1">
                                          Keyingi to'lov: {String(snap.nextPaymentAt).slice(0, 10)}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Joriy holat — Mijozlar bo'limidan (jonli, yagona manba) */}
                                  {liveSale && liveSale.status !== "none" ? (
                                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-[9px] font-black text-blue-700 uppercase tracking-wider">Joriy holat (Mijozlar bo'limi)</p>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                          liveSale.status === "full" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                        }`}>
                                          {liveSale.status === "full" ? "TO'LIQ TO'LANGAN" : "QISMAN TO'LANGAN"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1">
                                        {[
                                          { label: "Jami", val: liveTotal != null ? fmtSum(liveTotal) : "—" },
                                          { label: "To'langan", val: fmtSum(livePaid) },
                                          { label: "Qarz", val: liveDebt != null ? fmtSum(liveDebt) : "—" },
                                        ].map(c => (
                                          <div key={c.label} className="text-center bg-white rounded-md border border-blue-100 py-1.5">
                                            <p className={`text-[11px] font-black ${c.label === "Qarz" && liveDebt ? "text-amber-700" : "text-blue-700"}`}>{c.val}</p>
                                            <p className="text-[8px] text-muted-foreground font-bold uppercase">{c.label}</p>
                                          </div>
                                        ))}
                                      </div>
                                      {liveSale.nextPaymentAt && liveDebt != null && liveDebt > 0 && (
                                        <p className="text-[9px] text-amber-700 font-bold mt-1">
                                          Keyingi to'lov: {String(liveSale.nextPaymentAt).slice(0, 10)}
                                        </p>
                                      )}
                                      {(liveSale.payments ?? []).length > 0 && (
                                        <div className="mt-1.5 space-y-0.5 border-t border-blue-100 pt-1.5">
                                          <p className="text-[8px] font-black text-muted-foreground uppercase tracking-wider">To'lovlar tarixi</p>
                                          {[...(liveSale.payments ?? [])]
                                            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                            .slice(0, 6)
                                            .map((pp: any) => (
                                              <p key={pp.id} className="text-[9px] text-muted-foreground flex justify-between gap-2">
                                                <span className="truncate">{fmtDateTime(pp.createdAt)} · {pp.authorName}</span>
                                                <span className="font-black text-foreground shrink-0">{fmtSum(Number(pp.amount) || 0)} so'm</span>
                                              </p>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-[9px] text-muted-foreground/60 italic">
                                      Mijozlar bo'limida to'lov ma'lumoti topilmadi
                                    </p>
                                  )}

                                  {d.note && <p className="text-[9px] italic text-muted-foreground">{d.note}</p>}
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {renderChiqimEditModal()}

        {showHistoryPanel && (
          <WarehouseArchivePanel warehouse={warehouse} onClose={() => setShowHistoryPanel(false)} />
        )}

        <ConfirmModal isOpen={!!deleteUzbKirimId} onClose={() => setDeleteUzbKirimId(null)} onConfirm={handleDeleteUzbKirim}
          title="Kirimni o'chirish" description="Ushbu kirim yozuvini o'chirishni tasdiqlaysizmi?" confirmLabel="O'chirish" tone="destructive" />
        <ConfirmModal isOpen={!!deleteDispatchId} onClose={() => setDeleteDispatchId(null)} onConfirm={handleDeleteDispatch}
          title="Chiqimni o'chirish" description="Ushbu chiqim yozuvini o'chirishni tasdiqlaysizmi?" confirmLabel="O'chirish" tone="destructive" />
        <ConfirmModal isOpen={!!deleteReceiptId} onClose={() => setDeleteReceiptId(null)} onConfirm={handleDeleteReceipt}
          title="Qabul yozuvini o'chirish" description="Ushbu fura qabul yozuvini o'chirishni tasdiqlaysizmi?" confirmLabel="O'chirish" tone="destructive" />
        <ConfirmModal isOpen={confirmReleaseHeld} onClose={() => setConfirmReleaseHeld(false)} onConfirm={handleReleaseHeldSelected}
          title="Stockка qabul qilib olish"
          description={`${heldSelectedItems.length} ta tanlangan tovar «Kirim tovarlar — omborda»ga o'tkaziladi va «Qabul qilinmagan» ro'yxatidan o'chadi. Bu amalni qaytarib bo'lmaydi. Davom etasizmi?`}
          confirmLabel="Ha, o'tkazish" tone="warning" loading={releasingHeld} />
      </>
    );
  }

  // ══════════════════════════════════════════════════════
  // chegara / ortaOmbor: truck reception for kirim.
  // chegara's chiqim stays FIFO dispatch (same as china); ortaOmbor's chiqim re-forwards received goods by truck.
  const isChegara = warehouse.type === "chegara";
  const isOrtaOmbor = warehouse.type === "ortaOmbor";
  const isTransitKirim = isChegara || isOrtaOmbor;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* ── Header — ombor turi rangida yumshoq gradient banner ── */}
        <div className="shrink-0 border-b border-border bg-card">
          <div className={`flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r ${isOrtaOmbor ? "from-amber-500/[0.07]" : isChegara ? "from-violet-600/[0.07]" : "from-orange-500/[0.07]"} via-transparent to-transparent`}>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isOrtaOmbor ? "bg-amber-500/10" : isChegara ? "bg-violet-600/10" : "bg-orange-500/10"}`}>
              {isOrtaOmbor ? <WarehouseIcon className="w-5.5 h-5.5 text-amber-600" /> : isChegara ? <Shield className="w-5.5 h-5.5 text-violet-600" /> : <Globe className="w-5.5 h-5.5 text-orange-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-foreground truncate leading-tight">{warehouse.name}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isOrtaOmbor ? "bg-amber-500/10 text-amber-600" : isChegara ? "bg-violet-600/10 text-violet-600" : "bg-orange-500/10 text-orange-500"}`}>
                  {isOrtaOmbor ? "O'rta ombor" : isChegara ? "Chegara" : "Yaratuvchi"}
                </span>
              </div>
              {warehouse.address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{warehouse.address}</span>
                </p>
              )}
            </div>
            <button
              onClick={() => setShowHistoryPanel(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-muted-foreground text-xs font-black hover:text-primary hover:border-primary/40 transition-colors shrink-0"
            >
              <Clock className="w-3.5 h-3.5" /> Tarix
            </button>
          </div>
        </div>

        {/* ── Tabs — segmentli kartalar: ikonka + sarlavha + izoh + son ── */}
        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setTab("kirim")}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
              tab === "kirim"
                ? "bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/25"
                : "bg-card border-border hover:border-blue-300"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tab === "kirim" ? "bg-white/15" : "bg-blue-600/10"}`}>
              <ArrowDownCircle className={`w-4.5 h-4.5 ${tab === "kirim" ? "text-white" : "text-blue-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-black leading-tight ${tab === "kirim" ? "text-white" : "text-foreground"}`}>Kirim</p>
              <p className={`text-[10px] font-medium mt-0.5 truncate ${tab === "kirim" ? "text-white/70" : "text-muted-foreground/70"}`}>
                {isTransitKirim ? "Fura qabul qilish" : "Tovar kirim (wizard)"}
              </p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-black shrink-0 ${tab === "kirim" ? "bg-white/20 text-white" : "bg-blue-600/10 text-blue-600"}`}>
              {isTransitKirim ? activeTruckList.length : activeKirim.length}
            </span>
          </button>
          <button
            onClick={() => setTab("chiqim")}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
              tab === "chiqim"
                ? "bg-slate-800 border-slate-800 shadow-lg shadow-slate-800/25"
                : "bg-card border-border hover:border-slate-400"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tab === "chiqim" ? "bg-white/15" : "bg-slate-500/10"}`}>
              <ArrowUpCircle className={`w-4.5 h-4.5 ${tab === "chiqim" ? "text-white" : "text-slate-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-black leading-tight ${tab === "chiqim" ? "text-white" : "text-foreground"}`}>Chiqim</p>
              <p className={`text-[10px] font-medium mt-0.5 truncate ${tab === "chiqim" ? "text-white/70" : "text-muted-foreground/70"}`}>
                Fura bilan jo'natish
              </p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-black shrink-0 ${tab === "chiqim" ? "bg-white/20 text-white" : "bg-slate-500/10 text-slate-600"}`}>
              {chiqimRecords.length}
            </span>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

          {/* ════ KIRIM tab — chegara/ortaOmbor: truck reception (same as UZB) ════ */}
          {tab === "kirim" && isTransitKirim && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              {/* Active trucks (full width) */}
              <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gray-100 bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-700">Kelayotgan furalar</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 font-black border border-violet-100">
                      {activeTruckList.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowArchive(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                  >
                    Arxiv ({uzbReceipts.length})
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50/50">
                  {activeTruckList.length === 0 ? (
                    <div className="py-16 text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Truck className="w-8 h-8 text-gray-200" />
                      </div>
                      <p className="text-sm font-black text-gray-400">Kutilayotgan fura yo'q</p>
                      <p className="text-xs text-gray-300 mt-1">Xitoy omboridan chiqim qilinsin</p>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      <p className="text-[10px] text-gray-400 font-bold px-1">
                        Bir nechta furani birga tanlab qabul qilishingiz mumkin
                        {selectedVehicles.size > 0 ? ` · ${selectedVehicles.size} ta tanlandi` : ""}
                      </p>
                      {activeTruckList.map(([vehicleNumber, chiqims]) => {
                        const isSelected = selectedVehicles.has(vehicleNumber);
                        const totalProducts = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                        const firstDate = chiqims[0]?.date ?? "";
                        const allPhotos = dedupePhotos(chiqims.flatMap(cr => cr.photos ?? []));
                        return (
                          <div key={vehicleNumber}
                            className={`rounded-2xl border-2 transition-all overflow-hidden ${
                              isSelected ? "border-violet-300 bg-white shadow-md shadow-violet-50" : "border-gray-200 bg-white hover:border-violet-200 hover:shadow-sm"
                            }`}
                          >
                            <button onClick={() => handleSelectVehicle(vehicleNumber)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                                <Truck className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-black font-mono transition-colors ${isSelected ? "text-violet-600" : "text-gray-800"}`}>{vehicleNumber}</p>
                                <p className="text-[10px] text-gray-400 font-medium mt-0.5">{chiqims.length} mijoz · {totalProducts} tovar · {firstDate}</p>
                              </div>
                              <TruckTotalsBox t={truckTotals(chiqims)} accent="violet" className="hidden sm:flex mr-1" />
                              {isSelected ? <CheckSquare className="w-5 h-5 text-violet-400 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                            </button>
                            {/* Tovar nomlari — HAR DOIM ko'rinadi (tanlangan/tanlanmaganidan qat'i nazar) */}
                            <TruckProductNames chiqims={chiqims} productNamesOf={productNamesOf} accent="violet" />
                            {isSelected && (
                              <div className="border-t-2 border-violet-50 bg-violet-50/40 px-4 pt-3 pb-4 space-y-3">
                                <div className="flex items-center gap-2 bg-white rounded-xl border-2 border-violet-100 px-3 py-2">
                                  <Truck className="w-4 h-4 text-violet-400 shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Fura raqami</p>
                                    <p className="text-sm font-black text-gray-800 font-mono">{vehicleNumber}</p>
                                  </div>
                                  <div className="ml-auto text-right">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Sana</p>
                                    <p className="text-sm font-bold text-gray-700">{firstDate}</p>
                                  </div>
                                </div>
                                {allPhotos.length > 0 ? (
                                  <div>
                                    <p className="text-[10px] font-black text-violet-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <ImageIcon className="w-3 h-3" /> Rasmlar ({allPhotos.length} ta)
                                    </p>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                      {allPhotos.map((photo, idx) => (
                                        <img key={idx} src={photo.dataUrl} alt={photo.name}
                                          className="w-20 h-20 rounded-xl object-cover shrink-0 border-2 border-violet-100 cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={e => { e.stopPropagation(); openPhotoUrl(photo.dataUrl); }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-gray-300 bg-white rounded-xl border-2 border-gray-100 px-3 py-2">
                                    <ImageIcon className="w-4 h-4" />
                                    <p className="text-[10px] font-bold">Rasm yuklanmagan</p>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  {(["full", "partial"] as const).map(m => (
                                    <button key={m} onClick={() => handleSetVehicleMode(m)}
                                      className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${
                                        vehicleMode === m
                                          ? m === "full" ? "bg-violet-50 border-violet-300 text-violet-600" : "bg-violet-500 border-violet-500 text-white shadow-sm"
                                          : "bg-white border-gray-200 text-gray-500 hover:border-violet-200 hover:text-violet-500"
                                      }`}
                                    >{m === "full" ? "Barchasi" : "Bir qismi"}</button>
                                  ))}
                                </div>
                                {vehicleMode === "partial" && (
                                  <div className="space-y-2">
                                    {chiqims.map(cr => {
                                      const isClientSelected = selectedClientIds.has(cr.id);
                                      const cMode = crModes[cr.id] ?? "full";
                                      const cPart = crPartials[cr.id];
                                      return (
                                        <div key={cr.id} className={`rounded-xl border-2 transition-all overflow-hidden ${isClientSelected ? "border-violet-200 bg-white shadow-sm" : "border-gray-200 bg-gray-50/80 opacity-60"}`}>
                                          <button onClick={() => toggleClientId(cr.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                                            {isClientSelected ? <CheckSquare className="w-4.5 h-4.5 text-violet-400 shrink-0" /> : <Square className="w-4.5 h-4.5 text-gray-300 shrink-0" />}
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${isClientSelected ? "text-violet-600 bg-violet-50" : "text-gray-400 bg-gray-100"}`}>{cr.clientCode}</span>
                                            <span className="text-[10px] text-gray-500 font-medium flex-1 truncate">{cr.clientName || cr.clientCode}</span>
                                            <span className={`text-[10px] font-bold shrink-0 ${isClientSelected ? "text-violet-400" : "text-gray-300"}`}>{cr.selectedProductIds.length} tovar</span>
                                          </button>
                                          <ClientProductTable data={productRowsOf(cr)} accent="violet" />
                                          {isClientSelected && (
                                            <div className="border-t-2 border-violet-50 px-3 py-2.5 space-y-2 bg-violet-50/30">
                                              <div className="flex gap-1.5">
                                                {(["full", "partial"] as const).map(m => (
                                                  <button key={m}
                                                    onClick={() => { setCrModes(p => ({ ...p, [cr.id]: m })); if (m === "partial") setCrPartials(p => ({ ...p, [cr.id]: p[cr.id] ?? { qty: "", unit: "joy" } })); }}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${cMode === m ? m === "full" ? "bg-violet-50 border-violet-200 text-violet-600" : "bg-violet-500 border-violet-500 text-white" : "bg-white border-gray-200 text-gray-400 hover:border-violet-200"}`}
                                                  >{m === "full" ? "Barchasi" : "Bir qismi"}</button>
                                                ))}
                                              </div>
                                              {cMode === "partial" && renderPartialProductRows(cr, "violet")}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedVehicles.size > 0 && (
                    <div className="mx-3 mb-3 p-4 bg-white border-2 border-violet-100 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-3">Jami hisob · {receiptTotals.clients} mijoz</p>
                      <div className="grid grid-cols-5 gap-2">
                        {[{ val: receiptTotals.products, label: "Tovar" }, { val: receiptTotals.qty, label: "Soni" }, { val: receiptTotals.places, label: "Joy" }, { val: receiptTotals.brutto, label: "Brutto kg" }, { val: receiptTotals.volume, label: "m³" }]
                          .map(({ val, label }) => (
                            <div key={label} className="text-center bg-violet-50 rounded-xl py-2.5 border border-violet-100">
                              <p className="text-base font-black text-violet-700">{val || "—"}</p>
                              <p className="text-[9px] text-violet-400 font-bold uppercase tracking-wider mt-0.5">{label}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {/* Qabul qilinmaydigan tovarlar (ixtiyoriy) */}
                  {renderDamageSection()}
                  {selectedVehicles.size > 0 && (
                    <div className="mx-3 mb-4 space-y-2">
                      <input value={receiptNote} onChange={e => setReceiptNote(e.target.value)}
                        placeholder="Izoh (ixtiyoriy)..."
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:border-violet-300 placeholder:text-gray-300" />
                      <button onClick={handleSaveReceipt} disabled={receiptSaving}
                        className="w-full py-3 rounded-xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700 disabled:opacity-50 transition-all shadow-sm shadow-violet-100">
                        {receiptSaving
                          ? "Saqlanmoqda..."
                          : selectedVehicles.size > 1
                            ? `${selectedVehicles.size} ta furani qabul qilish`
                            : "Furani qabul qilish"}
                      </button>
                    </div>
                  )}

                  {/* ── KIRIM TOVARLAR — omborda. To'liq info bilan, tugaguncha turadi ── */}
                  {receivedStockProducts.length > 0 && (
                    <div className="mx-3 mb-4">
                      <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50/60 border-b border-violet-100">
                          <div className="flex items-center gap-2">
                            <div className="w-[3px] h-4 rounded-full bg-violet-500" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-violet-700">Kirim tovarlar — omborda</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-100 text-violet-600 font-black border border-violet-200">
                              {receivedStockProducts.length}
                            </span>
                          </div>
                          <span className="text-[10px] text-violet-300 font-bold">
                            {isOrtaOmbor ? "Chiqim tabidan jo'nating" : "Omborda saqlanmoqda"}
                          </span>
                        </div>
                        <div className="p-3 space-y-2 bg-violet-50/20">
                          <GroupedStockList
                            items={receivedStockProducts}
                            accent="violet"
                            renderCard={(item, idx) => renderStockProductCard(item, idx, "violet")}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── QABUL QILINMAGAN — shu omborda (held qism) ── */}
                  {notAcceptedStockProducts.length > 0 && (
                    <div className="mx-3 mb-4">
                      <div className="bg-white border-2 border-amber-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                          <div className="flex items-center gap-2">
                            <div className="w-[3px] h-4 rounded-full bg-amber-500" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-amber-700">Qabul qilinmagan — shu omborda</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-black border border-amber-200">
                              {notAcceptedStockProducts.length}
                            </span>
                          </div>
                          <button
                            onClick={toggleHeldSelectAll}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${allHeldSelected ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                            title="Hammasini tanlash / bekor qilish"
                          >
                            {allHeldSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            {allHeldSelected ? "Bekor qilish" : "Hammasini tanlash"}
                          </button>
                        </div>
                        <p className="text-[10px] text-amber-700/80 px-4 py-1.5 border-b border-amber-100 bg-amber-50/60 leading-relaxed">
                          Tovarlarni belgilang, so'ng pastdagi <span className="font-black">«Stockка qabul qilib olish»</span> tugmasini bosing — tasdiqlashdan keyin tanlanganlar <span className="font-black">«Kirim tovarlar — omborda»</span>ga o'tadi va bu ro'yxatdan o'chadi. Bu amal <span className="font-black">qaytarilmaydi</span>.
                        </p>
                        <div className="p-3 space-y-2 bg-amber-50/30">
                          <GroupedStockList
                            items={notAcceptedStockProducts}
                            accent="violet"
                            renderCard={(item, idx) => {
                              const selected = isHeldSelected(item.source.id, item.pid);
                              return (
                                <div
                                  key={`${item.source.id}:${item.pid}`}
                                  onClick={() => toggleHeldSelected(item.source.id, item.pid)}
                                  className={`relative cursor-pointer rounded-xl transition-all ${selected ? "ring-2 ring-emerald-500" : "hover:ring-1 hover:ring-emerald-300"}`}
                                >
                                  <div className={`absolute top-2 right-2 z-10 w-5 h-5 flex items-center justify-center ${selected ? "text-emerald-600" : "text-muted-foreground/40"}`}>
                                    {selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                  </div>
                                  {renderStockProductCard(item, idx, "violet")}
                                </div>
                              );
                            }}
                          />
                          {heldSelectedItems.length > 0 && (
                            <button
                              onClick={() => setConfirmReleaseHeld(true)}
                              disabled={releasingHeld}
                              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              {releasingHeld ? "O'tkazilmoqda..." : `Stockка qabul qilib olish (${heldSelectedItems.length} ta tovar)`}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Archive slide-over */}
              {showArchive && (
                <div className="absolute inset-0 z-10 flex">
                  <button
                    className="flex-1 bg-foreground/10"
                    onClick={() => setShowArchive(false)}
                  />
                  <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                          {uzbReceipts.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowArchive(false)}
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {uzbReceipts.length === 0 ? (
                        <div className="py-14 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                            <ArrowDownCircle className="w-7 h-7 text-muted-foreground/20" />
                          </div>
                          <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                        </div>
                      ) : (
                        [...uzbReceipts].reverse().map(receipt => {
                          const clientCount = Object.keys(receipt.receivedRatios).length;
                          return (
                            <div key={receipt.id} className="bg-white rounded-2xl border-2 border-gray-100 p-3 shadow-sm group">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                                    <Truck className="w-4 h-4 text-violet-500" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-foreground font-mono">{receipt.vehicleNumber}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{clientCount} mijoz · {receipt.receivedAt}</p>
                                    {Object.entries(receipt.receivedRatios).map(([crId, ratio]) => {
                                      const cr = allChinaChiqim.find(c => c.id === crId);
                                      return cr ? (
                                        <div key={crId} className="flex items-center gap-1 mt-0.5">
                                          <span className="text-[9px] font-bold text-violet-600 font-mono">{cr.clientCode}</span>
                                          {ratio < 1 && <span className="text-[9px] text-gray-400">({Math.round(ratio * 100)}%)</span>}
                                        </div>
                                      ) : null;
                                    })}
                                    {receipt.note && <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">{receipt.note}</p>}
                                  </div>
                                </div>
                                <span title="Arxiv yozuvi o'chirilmaydi" className="shrink-0 p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                              </div>
                              <button
                                onClick={() => toggleArchiveExpand(receipt.id)}
                                className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-violet-600 hover:text-violet-700 transition-colors"
                              >
                                {expandedArchiveIds.has(receipt.id)
                                  ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                  : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                              </button>
                              {expandedArchiveIds.has(receipt.id) && renderReceiptArchiveDetails(receipt, "violet")}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ KIRIM tab — single column + archive slide-over ════ */}
          {tab === "kirim" && !isTransitKirim && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

              {/* Active kirim (full width) */}
              <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">Faol</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-600 font-bold">
                      {activeKirim.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowKirimWizard(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Yangi kirim
                    </button>
                    <button
                      onClick={() => setShowArchive(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                    >
                      Arxiv ({archivedKirim.length})
                    </button>
                  </div>
                </div>

                {/* Active kirim content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {activeKirim.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-blue-600/5 border border-blue-600/10 flex items-center justify-center mx-auto mb-3">
                        <ArrowDownCircle className="w-7 h-7 text-blue-600/30" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground">Faol kirimlar yo'q</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Yangi kirim qo'shing</p>
                    </div>
                  ) : (
                    [...activeKirim].reverse().map(renderKirimRecord)
                  )}
                </div>
              </div>

              {/* Archive slide-over */}
              {showArchive && (
                <div className="absolute inset-0 z-10 flex">
                  <button
                    className="flex-1 bg-foreground/10"
                    onClick={() => setShowArchive(false)}
                  />
                  <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                          {archivedKirim.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowArchive(false)}
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {archivedKirim.length === 0 ? (
                        <div className="py-12 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                            <ArrowUpCircle className="w-7 h-7 text-muted-foreground/20" />
                          </div>
                          <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                          <p className="text-xs text-muted-foreground/40 mt-1">Chiqarilgan tovarlar bu yerda</p>
                        </div>
                      ) : (
                        [...archivedKirim].reverse().map(renderKirimRecord)
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ CHIQIM tab — single column + archive slide-over ════ */}
          {tab === "chiqim" && !isOrtaOmbor && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

              {/* Active products (full width) */}
              <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${showChiqimPanel ? "bg-blue-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">Chiqim</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-600 font-bold">
                      {allUndispatched.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {showChiqimPanel && selectedProductIds.size > 0 && (
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-600/10 px-2 py-0.5 rounded-md">
                        {selectedProductIds.size} tanlandi
                      </span>
                    )}
                    {showChiqimPanel ? (
                      <button
                        onClick={() => { setShowChiqimPanel(false); setSelectedProductIds(new Set()); setProductModes({}); setPartialInputs({}); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-muted-foreground text-xs font-bold hover:bg-secondary transition-colors"
                      >
                        Bekor
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowChiqimPanel(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                        disabled={allUndispatched.length === 0}
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" /> Chiqim qilish
                      </button>
                    )}
                    <button
                      onClick={() => setShowArchive(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                    >
                      Arxiv ({chiqimRecords.length})
                    </button>
                  </div>
                </div>

                {/* Statistics panel */}
                <ChinaWarehouseStatsPanel recordCount={kirimRecords.length} stats={warehouseStats} />

                <div className="flex-1 overflow-y-auto">
                  {!showChiqimPanel ? (
                    <div className="py-20 text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600/5 border-2 border-blue-600/10 flex items-center justify-center mx-auto mb-4">
                        <ArrowUpCircle className="w-8 h-8 text-blue-600/30" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground mb-1">
                        {allUndispatched.length > 0 ? `${allUndispatched.length} ta tovar chiqimga tayyor` : "Chiqarilishi kerak bo'lgan tovar yo'q"}
                      </p>
                      {allUndispatched.length > 0 && (
                        <button
                          onClick={() => setShowChiqimPanel(true)}
                          className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20"
                        >
                          <ArrowUpCircle className="w-4 h-4" /> Chiqim qilish
                        </button>
                      )}
                    </div>
                  ) : allUndispatched.length === 0 ? (
                    <div className="py-14 text-center px-4">
                      <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                        <Package className="w-7 h-7 text-muted-foreground/20" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground">Faol tovarlar yo'q</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Kirim qo'shing</p>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {allUndispatched.map(({ product: p, kirimRecord: kr }, idx) => {
                        const isSelected = selectedProductIds.has(p.id);
                        const mode = productModes[p.id] ?? "full";
                        const partial = partialInputs[p.id];
                        // Joysiz tovar uchun pseudo-joy = 1 — saqlash (handleSaveChiqim)
                        // bilan BIR XIL model, aks holda qisman chiqimdan keyin mavjud
                        // ulush noto'g'ri (doim 100%) ko'rinadi.
                        const realJoys = clean(p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0));
                        const totalJoys = realJoys > 0 ? realJoys : 1;
                        const alreadyDispatched = clean((kr.dispatchedPlaces ?? {})[p.id] ?? 0);
                        const remainingJoys = clean(Math.max(0, totalJoys - alreadyDispatched));
                        const isPartiallyDispatched = alreadyDispatched > 0;
                        // Qolgan (chiqarilmagan) miqdorlar — joy ulushiga proporsional.
                        // "Qancha chiqara olaman"ni ko'rsatish uchun (yaratilgan/kelgan emas).
                        const remRatio = totalJoys > 0 ? remainingJoys / totalJoys : 0;
                        const remQty = Math.round((parseFloat(p.quantity) || 0) * remRatio);
                        const remBrutto = fmt2(bruttoKg(p) * remRatio);
                        const remVol = fmt3((parseFloat(p.totalVolume || "0") || 0) * remRatio);
                        const partlyOut = remainingJoys < totalJoys;
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border transition-all ${
                              isSelected
                                ? "border-blue-600 bg-blue-600/5"
                                : "border-border bg-card hover:border-slate-400/40"
                            }`}
                          >
                            {/* Product header row */}
                            <button
                              onClick={() => toggleProduct(p.id)}
                              className="w-full flex items-start gap-2.5 p-3 text-left"
                            >
                              <div className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? "text-blue-600" : "text-muted-foreground"}`}>
                                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-black text-muted-foreground uppercase">#{idx + 1}</span>
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-600/10 px-1.5 py-0.5 rounded font-mono">
                                    {kr.clientCode}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/60">{kr.date}</span>
                                  {isPartiallyDispatched && (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-600/10 px-1.5 py-0.5 rounded">
                                      {realJoys > 0
                                        ? `${fmt2(alreadyDispatched)}/${fmt2(totalJoys)} joy chiqarilgan`
                                        : `${Math.round((alreadyDispatched / totalJoys) * 100)}% chiqarilgan`}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-foreground mt-0.5">{productSummary(p)}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {p.quantity && (
                                    <span className="text-[10px] text-muted-foreground">Soni: <strong className={partlyOut ? "text-amber-600" : ""}>{remQty}</strong> dona</span>
                                  )}
                                  {realJoys > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Joy: <strong className={partlyOut ? "text-amber-600" : ""}>{fmt2(remainingJoys)}</strong> qolgan
                                    </span>
                                  )}
                                  {p.brutto && (
                                    <span className="text-[10px] text-muted-foreground">Vazn: <strong className={partlyOut ? "text-amber-600" : ""}>{remBrutto}</strong> {p.bruttoUnit}</span>
                                  )}
                                  {p.totalVolume && (
                                    <span className="text-[10px] text-muted-foreground">Vol: <strong className={partlyOut ? "text-amber-600" : ""}>{remVol}</strong> m³</span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Selection mode buttons (shown when selected) */}
                            {isSelected && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setProductMode(p.id, "full")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "full"
                                        ? "bg-blue-600/10 border-blue-600 text-blue-700"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                                    }`}
                                  >
                                    Barchasi ({realJoys > 0 ? `${fmt2(remainingJoys)} joy` : `${Math.round((remainingJoys / totalJoys) * 100)}%`})
                                  </button>
                                  <button
                                    onClick={() => setProductMode(p.id, "partial")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "partial"
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                                    }`}
                                  >
                                    Bir qismi
                                  </button>
                                </div>
                                {mode === "partial" && (() => {
                                  const basis = partial?.unit ?? "joy";
                                  const fullBasis = productBasisTotal(p, basis);
                                  const remBasis = fullBasis * (remainingJoys / totalJoys);
                                  const maxQty = Math.round(remBasis * 100) / 100;
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number" onWheel={noWheel}
                                        min="0" step="any" max={maxQty}
                                        value={partial?.qty ?? ""}
                                        onChange={e => setPartialInputs(m => ({
                                          ...m,
                                          [p.id]: { qty: clampToMax(e.target.value, maxQty), unit: m[p.id]?.unit ?? "joy" }
                                        }))}
                                        placeholder={`Max ${maxQty}`}
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600"
                                      />
                                      <select
                                        value={basis}
                                        onChange={e => {
                                          const u = e.target.value;
                                          const fb = productBasisTotal(p, u);
                                          const newMax = Math.round(fb * (remainingJoys / totalJoys) * 100) / 100;
                                          setPartialInputs(m => ({
                                            ...m,
                                            [p.id]: { qty: clampToMax(m[p.id]?.qty ?? "", newMax), unit: u }
                                          }));
                                        }}
                                        className="px-2 py-1.5 rounded-lg border border-input bg-background text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600 max-w-[46%]"
                                      >
                                        {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                      </select>
                                    </div>
                                  );
                                })()}
                                {/* Tanlangan tovardan aynan qancha olinishi — vazn (kg) bilan to'liq */}
                                {(() => {
                                  const availableRatio = remainingJoys / totalJoys;
                                  const t = computeTake(p, availableRatio, mode === "partial" ? partial : null);
                                  return (
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-600/5 border border-blue-600/10 px-2.5 py-1.5">
                                      <span className="text-[10px] font-black text-blue-700">Olinadi:</span>
                                      <span className="text-[10px] text-muted-foreground">Soni: <strong className="text-foreground">{t.qty} dona</strong></span>
                                      <span className="text-[10px] text-muted-foreground">Joy: <strong className="text-foreground">{fmt2(t.places)}</strong></span>
                                      <span className="text-[10px] text-muted-foreground">Brutto: <strong className="text-foreground">{fmt2(t.brutto)} kg</strong></span>
                                      <span className="text-[10px] text-muted-foreground">Hajm: <strong className="text-foreground">{fmt3(t.volume)} m³</strong></span>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Calculator ── */}
                  {selectedProductIds.size > 0 && (
                    <div className="mx-3 mb-3 p-3 bg-blue-600/8 border border-blue-600/20 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 mb-2">
                        Jami hisob · {selectedProductIds.size} ta tovar
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center bg-white rounded-lg py-2 border border-blue-600/10">
                          <p className="text-lg font-black text-blue-700">{chiqimTotals.qty || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-blue-600/10">
                          <p className="text-lg font-black text-blue-700">{chiqimTotals.places || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Joy soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-blue-600/10">
                          <p className="text-lg font-black text-blue-700">{chiqimTotals.volume || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Kuba (m³)</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-blue-600/10">
                          <p className="text-lg font-black text-blue-700">{chiqimTotals.brutto || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Brutto (kg)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Vehicle / Photos / Note / Save ── */}
                  {hasSelectedProducts && (
                    <div className="mx-3 mb-3 bg-white rounded-xl border border-blue-600/15 p-3 space-y-3">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Chiqim ma'lumotlari</p>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Building2 className="w-3 h-3" /> Qabul qiluvchi ombor <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={chiqimDestId}
                          onChange={e => setChiqimDestId(e.target.value)}
                          className={`w-full px-2.5 py-2 rounded-lg border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600 ${chiqimDestId ? "border-input" : "border-amber-300"}`}
                        >
                          <option value="">— Omborni tanlang —</option>
                          {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-muted-foreground/60 mt-1">
                          Yuk tanlangan omborga «yo'lda» bo'lib boradi — o'sha ombor qabul qilishi kerak
                        </p>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                        </label>
                        <input
                          value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value)}
                          placeholder="01 A 123 AA"
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600 uppercase font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Camera className="w-3 h-3" /> Rasmlar
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-secondary text-muted-foreground">
                            {photos.length}/20
                          </span>
                        </label>
                        {photos.length < 20 && (
                          <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-blue-200 bg-blue-600/5 hover:border-blue-400 text-xs text-blue-500 hover:text-blue-600 cursor-pointer transition-colors">
                            <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                            <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                          </label>
                        )}
                        {photos.length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                            {photos.map((ph, i) => (
                              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                                <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                                  className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                                >
                                  <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-1">Izoh</label>
                        <textarea
                          value={chiqimNote}
                          onChange={e => setChiqimNote(e.target.value)}
                          placeholder="Qo'shimcha..."
                          rows={2}
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-blue-600/30 focus:border-blue-600 resize-none"
                        />
                      </div>

                      <button
                        onClick={handleSaveChiqim}
                        disabled={chiqimSaving}
                        className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {chiqimSaving ? "Saqlanmoqda..." : `Chiqimni saqlash (${selectedProductIds.size} ta tovar)`}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Archive slide-over */}
              {showArchive && (
                <div className="absolute inset-0 z-10 flex">
                  <button
                    className="flex-1 bg-foreground/10"
                    onClick={() => setShowArchive(false)}
                  />
                  <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                          {chiqimRecords.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowArchive(false)}
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {chiqimRecords.length === 0 ? (
                        <div className="py-14 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                            <ArrowUpCircle className="w-7 h-7 text-muted-foreground/20" />
                          </div>
                          <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                          <p className="text-xs text-muted-foreground/40 mt-1">Chiqarilgan tovarlar bu yerda</p>
                        </div>
                      ) : (
                        [...chiqimRecords].reverse().map(record => (
                          <div key={record.id} className="bg-card rounded-xl border border-border p-3 group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <ArrowUpCircle className="w-4 h-4 text-slate-600" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-foreground truncate">
                                    {record.clientName || record.clientCode}
                                  </p>
                                  {(() => {
                                    const st = chiqimStatusOf(record);
                                    return (
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${
                                          st.key === "received" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                          : st.key === "partial" ? "bg-amber-50 text-amber-600 border-amber-200"
                                          : "bg-blue-50 text-blue-600 border-blue-200"
                                        }`}>
                                          {st.label}
                                        </span>
                                        {st.destName && (
                                          <span className="text-[9px] font-bold text-muted-foreground">→ {st.destName}</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                    <span className="text-[10px] font-bold text-slate-600 flex items-center gap-0.5">
                                      <Truck className="w-2.5 h-2.5" />{record.vehicleNumber}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {record.selectedProductIds.length} tovar
                                    </span>
                                    {record.photos.length > 0 && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <Camera className="w-2.5 h-2.5" />{record.photos.length}
                                      </span>
                                    )}
                                  </div>
                                  {record.note && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 italic truncate">{record.note}</p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{fmtDateTime(record.createdAt)}</p>
                                  {record.photos.length > 0 && (
                                    <div className="flex gap-1 mt-1.5 flex-wrap">
                                      {record.photos.slice(0, 4).map((ph, i) => (
                                        <img key={i} src={ph.dataUrl} alt={ph.name}
                                          className="w-8 h-8 rounded-md object-cover border border-border" />
                                      ))}
                                      {record.photos.length > 4 && (
                                        <div className="w-8 h-8 rounded-md border border-border bg-secondary flex items-center justify-center text-[9px] font-black text-muted-foreground">
                                          +{record.photos.length - 4}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center shrink-0">
                                {canEditArchive && (
                                  <button
                                    onClick={() => openChiqimEdit(record)}
                                    title="Tahrirlash (faqat huquqi borlar)"
                                    className="p-1 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                                <span title="Arxiv yozuvi o'chirilmaydi" className="p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                              </div>
                            </div>
                            <button
                              onClick={() => toggleArchiveExpand(record.id)}
                              className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              {expandedArchiveIds.has(record.id)
                                ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                            </button>
                            {expandedArchiveIds.has(record.id) && renderChiqimArchiveDetails(record)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ CHIQIM tab — O'rta ombor: re-forward received goods by a new truck ════ */}
          {tab === "chiqim" && isOrtaOmbor && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex flex-col overflow-hidden flex-1 min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${showChiqimPanel ? "bg-amber-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">Chiqim</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-bold">
                      {receivedStockProducts.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {showChiqimPanel && selectedProductIds.size > 0 && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md">
                        {selectedProductIds.size} tanlandi
                      </span>
                    )}
                    {showChiqimPanel ? (
                      <button
                        onClick={() => { setShowChiqimPanel(false); setSelectedProductIds(new Set()); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-muted-foreground text-xs font-bold hover:bg-secondary transition-colors"
                      >
                        Bekor
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowChiqimPanel(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                        disabled={receivedStockProducts.length === 0}
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" /> Chiqim qilish
                      </button>
                    )}
                    <button
                      onClick={() => setShowArchive(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                    >
                      Arxiv ({chiqimRecords.length})
                    </button>
                  </div>
                </div>

                {/* Ombor holati paneli — boshqa omborlar chiqim bo'limidagi kabi */}
                <UzbWarehouseStatsPanel recordCount={allChinaChiqim.length} stats={uzbStats} />

                <div className="flex-1 overflow-y-auto">
                  {!showChiqimPanel ? (
                    <div className="py-20 text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/5 border-2 border-amber-500/10 flex items-center justify-center mx-auto mb-4">
                        <ArrowUpCircle className="w-8 h-8 text-amber-500/30" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground mb-1">
                        {receivedStockProducts.length > 0 ? `${receivedStockProducts.length} ta tovar chiqimga tayyor` : "Chiqarilishi kerak bo'lgan tovar yo'q"}
                      </p>
                      {receivedStockProducts.length > 0 && (
                        <button
                          onClick={() => setShowChiqimPanel(true)}
                          className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20"
                        >
                          <ArrowUpCircle className="w-4 h-4" /> Chiqim qilish
                        </button>
                      )}
                    </div>
                  ) : receivedStockProducts.length === 0 ? (
                    <div className="py-14 text-center px-4">
                      <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                        <Package className="w-7 h-7 text-muted-foreground/20" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground">Faol tovarlar yo'q</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Kirim tabida fura qabul qiling</p>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {receivedStockProducts.map(({ pid, product: p, source, available }, idx) => {
                        const isSelected = selectedProductIds.has(pid);
                        const mode = productModes[pid] ?? "full";
                        const partial = partialInputs[pid];
                        const totalJoys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
                        const isPartialStock = available < 0.9995;
                        // Qolgan (chiqarilmagan) miqdorlar — mavjud ulush (available) bilan
                        const remQty = Math.floor(clean((parseFloat(p.quantity) || 0) * available));
                        const remBrutto = fmt2(bruttoKg(p) * available);
                        const remVol = fmt3((parseFloat(p.totalVolume || "0") || 0) * available);
                        return (
                          <div
                            key={pid}
                            className={`rounded-xl border transition-all ${
                              isSelected ? "border-amber-500 bg-amber-500/5" : "border-border bg-card hover:border-amber-300/60"
                            }`}
                          >
                            <button
                              onClick={() => toggleProduct(pid)}
                              className="w-full flex items-start gap-2.5 p-3 text-left"
                            >
                              <div className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? "text-amber-600" : "text-muted-foreground"}`}>
                                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-black text-muted-foreground uppercase">#{idx + 1}</span>
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                                    {source.clientCode}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                                    <Truck className="w-2.5 h-2.5" />{source.vehicleNumber}
                                  </span>
                                  {isPartialStock && (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-600/10 px-1.5 py-0.5 rounded">
                                      {Math.round(available * 100)}% mavjud
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-foreground mt-0.5">{productSummary(p)}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {p.quantity && (
                                    <span className="text-[10px] text-muted-foreground">Soni: <strong className={isPartialStock ? "text-amber-600" : ""}>{remQty}</strong> dona</span>
                                  )}
                                  {totalJoys > 0 && (
                                    <span className="text-[10px] text-muted-foreground">Joy: <strong className={isPartialStock ? "text-amber-600" : ""}>{fmt2(totalJoys * available)}</strong></span>
                                  )}
                                  {p.brutto && (
                                    <span className="text-[10px] text-muted-foreground">Vazn: <strong className={isPartialStock ? "text-amber-600" : ""}>{remBrutto}</strong> {p.bruttoUnit}</span>
                                  )}
                                  {p.totalVolume && (
                                    <span className="text-[10px] text-muted-foreground">Vol: <strong className={isPartialStock ? "text-amber-600" : ""}>{remVol}</strong> m³</span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Barchasi / Bir qismi — tanlanganida */}
                            {isSelected && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setProductMode(pid, "full")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "full"
                                        ? "bg-amber-500/10 border-amber-500 text-amber-700"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600"
                                    }`}
                                  >
                                    Barchasi{isPartialStock ? ` (${Math.round(available * 100)}%)` : ""}
                                  </button>
                                  <button
                                    onClick={() => setProductMode(pid, "partial")}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                      mode === "partial"
                                        ? "bg-amber-500 border-amber-500 text-white"
                                        : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600"
                                    }`}
                                  >
                                    Bir qismi
                                  </button>
                                </div>
                                {mode === "partial" && (() => {
                                  const basis = partial?.unit ?? "joy";
                                  const maxQty = Math.round(productBasisTotal(p, basis) * available * 100) / 100;
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number" onWheel={noWheel}
                                        min="0" step="any" max={maxQty}
                                        value={partial?.qty ?? ""}
                                        onChange={e => setPartialInputs(m => ({
                                          ...m,
                                          [pid]: { qty: clampToMax(e.target.value, maxQty), unit: m[pid]?.unit ?? "joy" }
                                        }))}
                                        placeholder={`Max ${maxQty}`}
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500"
                                      />
                                      <select
                                        value={basis}
                                        onChange={e => {
                                          const u = e.target.value;
                                          const newMax = Math.round(productBasisTotal(p, u) * available * 100) / 100;
                                          setPartialInputs(m => ({
                                            ...m,
                                            [pid]: { qty: clampToMax(m[pid]?.qty ?? "", newMax), unit: u }
                                          }));
                                        }}
                                        className="px-2 py-1.5 rounded-lg border border-input bg-background text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 max-w-[46%]"
                                      >
                                        {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                      </select>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Calculator ── */}
                  {ortaSelectedIds.length > 0 && (
                    <div className="mx-3 mb-3 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-2">
                        Jami hisob · {ortaSelectedIds.length} ta tovar
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.qty || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.places || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Joy soni</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.volume || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Kuba (m³)</p>
                        </div>
                        <div className="text-center bg-white rounded-lg py-2 border border-amber-500/10">
                          <p className="text-lg font-black text-amber-700">{ortaTotals.weight || "—"}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Og'irlik (kg)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Vehicle / Photos / Note / Save ── */}
                  {ortaSelectedIds.length > 0 && (
                    <div className="mx-3 mb-3 bg-white rounded-xl border border-amber-500/15 p-3 space-y-3">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Chiqim ma'lumotlari</p>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Building2 className="w-3 h-3" /> Qabul qiluvchi ombor <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={chiqimDestId}
                          onChange={e => setChiqimDestId(e.target.value)}
                          className={`w-full px-2.5 py-2 rounded-lg border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 ${chiqimDestId ? "border-input" : "border-amber-300"}`}
                        >
                          <option value="">— Omborni tanlang —</option>
                          {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-muted-foreground/60 mt-1">
                          Yuk tanlangan omborga «yo'lda» bo'lib boradi — o'sha ombor qabul qilishi kerak
                        </p>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Truck className="w-3 h-3" /> Avtomobil raqami <span className="text-destructive">*</span>
                        </label>
                        <input
                          value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value)}
                          placeholder="01 A 123 AA"
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 uppercase font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                          <Camera className="w-3 h-3" /> Rasmlar
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-bold bg-secondary text-muted-foreground">
                            {photos.length}/20
                          </span>
                        </label>
                        {photos.length < 20 && (
                          <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-amber-200 bg-amber-500/5 hover:border-amber-400 text-xs text-amber-500 hover:text-amber-600 cursor-pointer transition-colors">
                            <Camera className="w-3.5 h-3.5" /> Rasm qo'shish
                            <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                          </label>
                        )}
                        {photos.length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                            {photos.map((ph, i) => (
                              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                                <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                                  className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 flex items-center justify-center transition-colors"
                                >
                                  <XIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-1">Izoh</label>
                        <textarea
                          value={chiqimNote}
                          onChange={e => setChiqimNote(e.target.value)}
                          placeholder="Qo'shimcha..."
                          rows={2}
                          className="w-full px-2.5 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
                        />
                      </div>

                      <button
                        onClick={handleSaveOrtaChiqim}
                        disabled={chiqimSaving}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-black text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {chiqimSaving ? "Saqlanmoqda..." : `Chiqimni saqlash (${ortaSelectedIds.length} ta tovar)`}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Archive slide-over */}
              {showArchive && (
                <div className="absolute inset-0 z-10 flex">
                  <button
                    className="flex-1 bg-foreground/10"
                    onClick={() => setShowArchive(false)}
                  />
                  <div className="w-80 bg-card border-l border-border flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">Arxiv</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                          {chiqimRecords.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowArchive(false)}
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {chiqimRecords.length === 0 ? (
                        <div className="py-14 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
                            <ArrowUpCircle className="w-7 h-7 text-muted-foreground/20" />
                          </div>
                          <p className="text-sm font-bold text-muted-foreground/50">Arxiv bo'sh</p>
                          <p className="text-xs text-muted-foreground/40 mt-1">Chiqarilgan tovarlar bu yerda</p>
                        </div>
                      ) : (
                        [...chiqimRecords].reverse().map(record => (
                          <div key={record.id} className="bg-card rounded-xl border border-border p-3 group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                                  <ArrowUpCircle className="w-4 h-4 text-amber-600" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-foreground truncate">
                                    {record.clientName || record.clientCode}
                                  </p>
                                  {(() => {
                                    const st = chiqimStatusOf(record);
                                    return (
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${
                                          st.key === "received" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                          : st.key === "partial" ? "bg-amber-50 text-amber-600 border-amber-200"
                                          : "bg-blue-50 text-blue-600 border-blue-200"
                                        }`}>
                                          {st.label}
                                        </span>
                                        {st.destName && (
                                          <span className="text-[9px] font-bold text-muted-foreground">→ {st.destName}</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                    <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5">
                                      <Truck className="w-2.5 h-2.5" />{record.vehicleNumber}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {record.selectedProductIds.length} tovar
                                    </span>
                                    {record.photos.length > 0 && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <Camera className="w-2.5 h-2.5" />{record.photos.length}
                                      </span>
                                    )}
                                  </div>
                                  {record.note && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 italic truncate">{record.note}</p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{fmtDateTime(record.createdAt)}</p>
                                </div>
                              </div>
                              <div className="flex items-center shrink-0">
                                {canEditArchive && (
                                  <button
                                    onClick={() => openChiqimEdit(record)}
                                    title="Tahrirlash (faqat huquqi borlar)"
                                    className="p-1 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                                <span title="Arxiv yozuvi o'chirilmaydi" className="p-1"><Lock className="w-3 h-3 text-muted-foreground/30" /></span>
                              </div>
                            </div>
                            <button
                              onClick={() => toggleArchiveExpand(record.id)}
                              className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-amber-600 hover:text-amber-700 transition-colors"
                            >
                              {expandedArchiveIds.has(record.id)
                                ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                                : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                            </button>
                            {expandedArchiveIds.has(record.id) && renderChiqimArchiveDetails(record, "amber")}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {renderChiqimEditModal()}

      {showHistoryPanel && (
        <WarehouseArchivePanel warehouse={warehouse} onClose={() => setShowHistoryPanel(false)} />
      )}

      <ConfirmModal
        isOpen={!!deleteKirimId}
        onClose={() => setDeleteKirimId(null)}
        onConfirm={handleDeleteKirim}
        title="Kirimni o'chirish"
        description="Ushbu kirim yozuvini o'chirishni tasdiqlaysizmi?"
        confirmLabel="O'chirish"
        tone="destructive"
      />
      <ConfirmModal
        isOpen={!!deleteChiqimId}
        onClose={() => setDeleteChiqimId(null)}
        onConfirm={handleDeleteChiqim}
        title="Chiqimni o'chirish"
        description="Ushbu chiqim yozuvini o'chirishni tasdiqlaysizmi?"
        confirmLabel="O'chirish"
        tone="destructive"
      />
      <ConfirmModal
        isOpen={confirmReleaseHeld}
        onClose={() => setConfirmReleaseHeld(false)}
        onConfirm={handleReleaseHeldSelected}
        title="Stockка qabul qilib olish"
        description={`${heldSelectedItems.length} ta tanlangan tovar «Kirim tovarlar — omborda»ga o'tkaziladi va «Qabul qilinmagan» ro'yxatidan o'chadi. Bu amalni qaytarib bo'lmaydi. Davom etasizmi?`}
        confirmLabel="Ha, o'tkazish"
        tone="warning"
        loading={releasingHeld}
      />

      {isTransitKirim && (
        <ConfirmModal isOpen={!!deleteReceiptId} onClose={() => setDeleteReceiptId(null)} onConfirm={handleDeleteReceipt}
          title="Qabul yozuvini o'chirish" description="Ushbu fura qabul yozuvini o'chirishni tasdiqlaysizmi?" confirmLabel="O'chirish" tone="destructive" />
      )}

      {!isTransitKirim && showKirimWizard && (
        <WarehouseKirimWizard
          warehouseId={warehouse.id}
          onClose={() => setShowKirimWizard(false)}
          onSaved={() => { setShowKirimWizard(false); refresh(); }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Fura kartochkasidagi TOVAR NOMLARI — HAR DOIM ko'rinadi.
// Fura tanlangan yoki tanlanmaganidan (select/deselect) qat'i nazar
// tovar nomlari doim ko'rinib turadi. Standart holatda qisqa (dastlabki
// bir nechta nom + "+N ta"), bosilganda mijoz bo'yicha guruhlangan to'liq
// ro'yxat ochiladi — 20-30 ta tovar bo'lsa ham chalkashmaydi.
// ─────────────────────────────────────────────────────────────
function TruckProductNames({
  chiqims,
  productNamesOf,
  accent = "blue",
}: {
  chiqims: ChiqimRecord[];
  productNamesOf: (cr: ChiqimRecord) => string[];
  accent?: "blue" | "violet";
}) {
  const [open, setOpen] = useState(false);

  // Mijoz bo'yicha guruhlar — bitta furada bir nechta mijozning yuki bo'lishi mumkin
  const groups = chiqims
    .map(cr => ({
      id: cr.id,
      code: cr.clientCode,
      name: cr.clientName,
      products: productNamesOf(cr),
    }))
    .filter(g => g.products.length > 0);

  if (groups.length === 0) return null;

  const allNames = groups.flatMap(g => g.products);
  const total = allNames.length;
  const PREVIEW = 5;
  const preview = allNames.slice(0, PREVIEW);
  const rest = total - preview.length;

  const c =
    accent === "violet"
      ? { icon: "text-violet-400", code: "text-violet-700 bg-violet-50", hover: "hover:bg-violet-50/70", name: "text-gray-700", plus: "text-violet-600" }
      : { icon: "text-[#9CA3AF]", code: "text-[#005AB5] bg-[#EFF6FF]", hover: "hover:bg-[#F0F7FF]", name: "text-[#374151]", plus: "text-[#005AB5]" };

  return (
    <div className="px-4 pb-2.5 -mt-1" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-1.5 text-left rounded-lg px-1.5 py-1 transition-colors ${c.hover}`}
        title={open ? "Yig'ish" : "Barcha tovar nomlarini ko'rish"}
      >
        <Package className={`w-3.5 h-3.5 shrink-0 ${c.icon}`} />
        {open ? (
          <span className={`flex-1 text-[10px] font-black uppercase tracking-wider ${c.icon}`}>
            Tovarlar ({total})
          </span>
        ) : (
          <>
            <span className={`flex-1 min-w-0 truncate text-[10px] font-medium ${c.name}`}>
              {preview.join(", ")}
            </span>
            {rest > 0 && (
              <span className={`shrink-0 text-[10px] font-black ${c.plus}`}>+{rest} ta</span>
            )}
          </>
        )}
        {open
          ? <ChevronUp className={`w-3.5 h-3.5 shrink-0 ${c.icon}`} />
          : <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${c.icon}`} />}
      </button>

      {open && (
        <div className="mt-1 space-y-1 pl-1">
          {groups.map(g => (
            <div key={g.id} className="flex items-start gap-2">
              <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded font-mono ${c.code}`}>
                {g.code || "—"}
              </span>
              <span className={`min-w-0 text-[10px] leading-relaxed ${c.name}`}>
                {g.name && g.name !== g.code && <span className="font-bold">{g.name}: </span>}
                {g.products.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
