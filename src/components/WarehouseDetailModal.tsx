import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft, Plus, Trash2, Package, ArrowDownCircle, ArrowUpCircle,
  MapPin, User, FileText, ChevronDown, ChevronUp, ExternalLink, Clock,
  Search, Truck, Camera, X as XIcon, CheckSquare, Square, Scale, IdCard,
  Building2, Globe, ImageIcon, Shield, Pencil, Check, Warehouse as WarehouseIcon,
  Lock,
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

interface Props {
  warehouse: Warehouse;
  onClose: () => void;
}

type Tab = "kirim" | "chiqim";

// Compress image to max 800px, JPEG 72%
async function compressImage(file: File): Promise<ChiqimPhoto> {
  return new Promise(resolve => {
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
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
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

  // 2) Dona butun songa yaxlitlanadi (mavjud butun zaxiradan oshmaydi),
  //    so'ng effektiv ulush shu butun donadan qayta hisoblanadi.
  let effRatio = ratio;
  let qty = fullQty * ratio;
  if (fullQty > 0) {
    const availPieces = Math.round(fullQty * avail);
    const pieces = Math.max(0, Math.min(availPieces, Math.round(fullQty * ratio)));
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
  const [uzbKirimDate, setUzbKirimDate] = useState(new Date().toISOString().slice(0, 10));

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

  // ── TO'LOV — Mijozlar modulidagi tayyor to'lov tizimiga ulanadi.
  // "O'rta mijoz" va "Chiqaruvchi" turidagi omborlarning MIJOZ BO'YICHA
  // chiqim formasida ishlaydi.
  // "To'liq to'ladi" → setSale(status: full), "Qisman to'ladi" → setSale(status: partial)
  // paidAmount backend tomonidan avtomatik payment yozuvi sifatida saqlanadi. ──
  const paymentsEnabled = warehouse.type === "ortaMijoz" || warehouse.type === "uzbekistan";
  const [payMode, setPayMode] = useState<"none" | "full" | "partial">("none");
  const [payTotal, setPayTotal] = useState("");
  const [payPaid, setPayPaid] = useState("");
  const [payNextDate, setPayNextDate] = useState("");
  const resetPayment = () => { setPayMode("none"); setPayTotal(""); setPayPaid(""); setPayNextDate(""); };

  // ── TO'LOVLAR paneli: chiqimlardan keyingi to'liq to'lov holati.
  // Snapshot dispatch.payment da, jonli holat Mijozlar bo'limidan olinadi. ──
  const [showPayments, setShowPayments] = useState(false);
  const [crmClients, setCrmClients] = useState<any[]>([]);

  /** Mijozlar bo'limidagi jonli mijoz ma'lumoti (kod bo'yicha) */
  const crmClientByCode = (code: string): any | null => {
    const uuid = clientUuidByCode(code);
    return uuid ? (crmClients.find((c: any) => c.id === uuid) ?? null) : null;
  };

  const fmtSum = (v: number) => (Math.round(v * 100) / 100).toLocaleString("ru-RU");

  /** Ombor mijoz kodi (OK/8001) → Mijozlar bo'limidagi mijoz UUID si */
  const clientUuidByCode = (code: string | null): string | null => {
    if (!code) return null;
    const found = Object.entries(storedIds).find(([, v]) => v === code);
    return found ? found[0] : null;
  };

  // ── UZB Transfer (ombor→ombor) state ─────────────────
  const [chiqimType, setChiqimType] = useState<"client" | "warehouse" | null>(null);
  // Chiqaruvchi ombor: chiqim usuli — "truck" (tovar/fura) yoki "client" (mijoz bo'yicha).
  // FAQAT chiqaruvchi turida ikkala tizim ham mavjud.
  const [uzbChiqimMode, setUzbChiqimMode] = useState<"truck" | "client">("truck");
  const [outgoingTransfers, setOutgoingTransfers] = useState<UzbTransfer[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<UzbTransfer[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [selectedTransferDestId, setSelectedTransferDestId] = useState<string | null>(null);
  const [transferSaving, setTransferSaving] = useState(false);

  // ── UZB Truck Reception state ─────────────────────────
  const [allChinaChiqim, setAllChinaChiqim] = useState<ChiqimRecord[]>([]);
  const [allChinaKirim, setAllChinaKirim] = useState<KirimRecord[]>([]);
  const [uzbReceipts, setUzbReceipts] = useState<ChiqimReceipt[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehicleMode, setVehicleMode] = useState<"full" | "partial">("full");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [crModes, setCrModes] = useState<Record<string, "full" | "partial">>({});
  const [crPartials, setCrPartials] = useState<Record<string, { qty: string; unit: string }>>({});
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [deleteReceiptId, setDeleteReceiptId] = useState<string | null>(null);

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
    const compressed = await Promise.all(files.slice(0, left).map(compressImage));
    setEcPhotos(prev => [...prev, ...compressed]);
    e.target.value = "";
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

  const refresh = async () => {
    const [kirim, chiqim, uzbKirim, whs, receiptsAll] = await Promise.all([
      getKirimRecords(warehouse.id),
      getChiqimRecordsV2(warehouse.id),
      getUzbKirimRecords(warehouse.id),
      getWarehouses(),
      getAllReceiptsGlobal(),
    ]);
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
      setAllChinaChiqim(chiqAll);
      setAllChinaKirim(kirimAll);
      setUzbReceipts(receipts);
      setUzbDispatches(dispatches);
      setOutgoingTransfers(outgoing);
      setIncomingTransfers(incoming);
      // Mijozlar bo'limidan jonli to'lov holati — mijozga chiqim qiladigan omborlarda
      if (warehouse.type === "ortaMijoz" || warehouse.type === "uzbekistan") {
        API.clients().then((cl: any[]) => setCrmClients(cl ?? [])).catch(() => {});
      }
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
        const pDispatched = doneSet.has(p.id)
          ? pJoys
          : (r.dispatchedPlaces ?? {})[p.id] ?? 0;
        totalProducts++;
        totalJoys += pJoys;
        totalVolume += pVolume;
        totalWeight += pWeight;
        dispatchedJoys += pDispatched;
        dispatchedVolume += pJoys > 0 ? pVolume * (pDispatched / pJoys) : 0;
        dispatchedWeight += pJoys > 0 ? pWeight * (pDispatched / pJoys) : 0;
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

  // Only fully received (ratio >= 1) go to archive — partial stays in active
  const receivedChiqimIds = useMemo(
    () => new Set(Object.entries(cumulativeReceivedRatios).filter(([, v]) => v >= 1).map(([k]) => k)),
    [cumulativeReceivedRatios]
  );

  // Group active (unreceived or partially received) chiqim records by vehicle, FIFO
  const activeTrucks = useMemo(() => {
    const byVehicle: Record<string, ChiqimRecord[]> = {};
    [...allChinaChiqim]
      .filter(cr => !receivedChiqimIds.has(cr.id))
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
  }, [allChinaChiqim, receivedChiqimIds, currentDestMap, warehouse.id]);

  const activeTruckList = useMemo(
    () => Object.entries(activeTrucks).sort(
      (a, b) => new Date(a[1][0]?.createdAt ?? "").getTime() - new Date(b[1][0]?.createdAt ?? "").getTime()
    ),
    [activeTrucks]
  );

  const selectedTruckChiqims = useMemo(
    () => selectedVehicle ? (activeTrucks[selectedVehicle] ?? []) : [],
    [selectedVehicle, activeTrucks]
  );

  // Product lookup map from all china kirim records
  const globalProductMap = useMemo(() => {
    const map: Record<string, KirimProduct> = {};
    allChinaKirim.forEach(r => r.products.forEach(p => { map[p.id] = p; }));
    return map;
  }, [allChinaKirim]);

  // Qisman qabul asosi bo'yicha yukning jami qiymati
  // (brutto og'irligi kg da / joy soni / tovar soni / hajmi m³ da)
  const basisTotalOf = (cr: ChiqimRecord, basis: string): number => {
    let joy = 0, soni = 0, brutto = 0, hajm = 0;
    for (const pid of cr.selectedProductIds) {
      const p = globalProductMap[pid];
      if (!p) continue;
      // Qisman chiqim bo'lsa — furadagi real ulush bilan hisoblanadi
      const share = cr.productRatios?.[pid] ?? 1;
      joy    += p.places.reduce((sum, pl) => sum + (parseFloat(pl.count) || 0), 0) * share;
      soni   += (parseFloat(p.quantity) || 0) * share;
      brutto += bruttoKg(p) * share;
      hajm   += (parseFloat(p.totalVolume || "0") || 0) * share;
    }
    const v = basis === "joy" ? joy : basis === "soni" ? soni : basis === "brutto" ? brutto : basis === "hajm" ? hajm : 0;
    return v || soni || joy || cr.selectedProductIds.length || 1;
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
      items.push({ name: productSummary(p), share, joys: pj, qty: pq, brutto: pb, vol: pv });
    }
    return { items, totals: { joys: fmt2(joys), qty: fmt2(qty), brutto: fmt2(brutto), vol: fmt3(vol) } };
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
          qty: fmt2(qty * share),
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
        qty: fmt2(qty * remainingShare),
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
    return (
      <div key={pid} className="bg-card rounded-xl border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <p className="text-xs font-black text-foreground">Tovar {idx + 1}</p>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${chip}`}>{source.clientCode}</span>
            {isPartial && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                {Math.round(available * 100)}% mavjud
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0 font-mono">
            <Truck className="w-2.5 h-2.5" />{source.vehicleNumber}
          </span>
        </div>
        <div className="px-3 pb-3 space-y-1">
          {p.measurements.some(m => m.value) && (
            <p className="text-xs text-muted-foreground">Tovar: {p.measurements.filter(m => m.value).map(m => m.value).join(", ")}</p>
          )}
          {p.places.some(pl => pl.count) && (
            <p className="text-xs text-muted-foreground">Joylar: {p.places.filter(pl => pl.count).map(pl => `${pl.count} ${pl.unit}`).join(", ")}</p>
          )}
          {p.quantity && <p className="text-xs text-muted-foreground">Soni: {p.quantity}</p>}
          {p.brutto && (
            <p className="text-xs text-muted-foreground">
              Brutto: <span className="font-bold">{p.brutto} {p.bruttoUnit}</span>
              {p.netto ? ` | Netto: ${p.netto} ${p.nettoUnit}` : ""}
            </p>
          )}
          {p.totalVolume && <p className="text-xs text-muted-foreground">Hajm: {p.totalVolume} m³</p>}
          {p.note && <p className="text-xs text-muted-foreground italic">{p.note}</p>}
          <p className="text-[10px] text-muted-foreground/60">
            Kelgan sana: {String(source.date).slice(0, 10)} · Mijoz: {source.clientName || source.clientCode}
          </p>
          {hasDispatched && (
            <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">
              Chiqib ketgan: {Math.round(fullQty * dispatchedShare)} dona · {fmt2(totalJoys * dispatchedShare)} joy · {fmt2(bruttoKg(p) * dispatchedShare)} kg · {fmt3(fullVol * dispatchedShare)} m³
            </p>
          )}
          {(isPartial || hasDispatched) && (
            <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
              Omborda qolgan: {Math.round(fullQty * available)} dona · {fmt2(totalJoys * available)} joy · {fmt2(bruttoKg(p) * available)} kg · {fmt3(fullVol * available)} m³
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
              <img key={i} src={ph.dataUrl} alt={ph.name} onClick={() => window.open(ph.dataUrl, "_blank")}
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
      {d.chiqimRecordIds.map(crId => {
        const cr = allChinaChiqim.find(c => c.id === crId);
        if (!cr) return <p key={crId} className="text-[9px] text-muted-foreground italic">Yuk ma'lumoti topilmadi</p>;
        const cargo = crCargo(cr);
        const ratio = d.ratios[crId] ?? 1;
        return (
          <div key={crId} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black text-blue-600 font-mono bg-blue-50 px-1 py-0.5 rounded">{cr.clientCode}</span>
              {cr.clientName && <span className="text-[9px] text-muted-foreground">{cr.clientName}</span>}
              <span className={`text-[9px] font-bold ${ratio < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                {Math.round(ratio * 100)}% chiqarildi
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {cr.selectedProductIds.length} tovar · {fmt2(cargo.totals.joys)} joy · {fmt2(cargo.totals.qty)} dona · {fmt2(cargo.totals.brutto)} kg · {cargo.totals.vol} m³
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
        const cargo = crCargo(cr);
        const ratio = t.ratios[crId] ?? 1;
        return (
          <div key={crId} className="bg-card rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black text-blue-600 font-mono bg-blue-50 px-1 py-0.5 rounded">{cr.clientCode}</span>
              {cr.clientName && <span className="text-[9px] text-muted-foreground">{cr.clientName}</span>}
              <span className={`text-[9px] font-bold ${ratio < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                {Math.round(ratio * 100)}% o'tkazildi
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {cr.selectedProductIds.length} tovar · {fmt2(cargo.totals.joys)} joy · {fmt2(cargo.totals.qty)} dona · {fmt2(cargo.totals.brutto)} kg · {cargo.totals.vol} m³
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
      const already = cumulativeReceivedRatios[cr.id] ?? 0;
      const remaining = Math.max(0, 1 - already);
      const mode = vehicleMode === "full" ? "full" : (crModes[cr.id] ?? "full");
      let ratio = remaining; // "Barchasi" — qolgan qismini to'liq olish
      if (mode === "partial") {
        const inp = crPartials[cr.id];
        const entered = parseFloat(inp?.qty || "0");
        const basisTotal = basisTotalOf(cr, inp?.unit ?? "joy");
        ratio = entered > 0 ? Math.min(remaining, entered / basisTotal) : 0;
      }
      clients += 1;
      products += Math.round(cr.selectedProductIds.length * ratio);
      for (const pid of cr.selectedProductIds) {
        const p = globalProductMap[pid];
        if (p) {
          // Furadagi real ulush (qisman chiqim) ham hisobga olinadi
          const share = cr.productRatios?.[pid] ?? 1;
          qty    += (parseFloat(p.quantity)    || 0) * share * ratio;
          places += p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share * ratio;
          volume += (parseFloat(p.totalVolume) || 0) * share * ratio;
          brutto += bruttoKg(p) * share * ratio;
        }
      }
    }
    return {
      clients,
      products,
      qty:    Math.round(qty    * 100) / 100,
      places: Math.round(places * 100) / 100,
      volume: Math.round(volume * 1000) / 1000,
      brutto: Math.round(brutto * 100) / 100,
    };
  }, [selectedTruckChiqims, vehicleMode, selectedClientIds, crModes, crPartials, globalProductMap, cumulativeReceivedRatios]);

  // ── UZB Dispatch + Transfer computed ─────────────────
  const uzbDispatchedIds = useMemo(
    () => new Set(uzbDispatches.flatMap(d => d.chiqimRecordIds)),
    [uzbDispatches]
  );

  // IDs that were transferred OUT of this warehouse (yo'lda YOKI qabul qilingan —
  // ikkalasida ham tovar manba ombordan chiqib ketgan).
  const uzbTransferredOutIds = useMemo(
    () => new Set(outgoingTransfers.flatMap(t => t.chiqimRecordIds)),
    [outgoingTransfers]
  );

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

  // Clients who have received products not yet dispatched/transferred from this UZB warehouse
  const activeUzbClients = useMemo(() => {
    const byClient: Record<string, { records: ChiqimRecord[]; clientName: string }> = {};
    allChinaChiqim
      .filter(cr => effectiveReceivedIds.has(cr.id) && !uzbGoneIds.has(cr.id))
      .forEach(cr => {
        if (!byClient[cr.clientCode]) byClient[cr.clientCode] = { records: [], clientName: cr.clientName || "" };
        byClient[cr.clientCode].records.push(cr);
      });
    return byClient;
  }, [allChinaChiqim, effectiveReceivedIds, uzbGoneIds]);

  const activeUzbClientList = useMemo(() => Object.entries(activeUzbClients), [activeUzbClients]);

  const selectedClientActiveRecords = useMemo(
    () => selectedDispatchClientCode ? (activeUzbClients[selectedDispatchClientCode]?.records ?? []) : [],
    [selectedDispatchClientCode, activeUzbClients]
  );

  // Tanlangan mijoz yuklarining tanlangan asos bo'yicha jami qiymati
  // (brutto kg / joy / tovar soni / m³) — qisman chiqim shu asosda hisoblanadi
  const dispatchBasisTotal = useMemo(() => {
    let total = 0;
    for (const cr of selectedClientActiveRecords) total += basisTotalOf(cr, dispatchPartialUnit);
    return total || 1;
  }, [selectedClientActiveRecords, dispatchPartialUnit, globalProductMap]);

  const dispatchRatio = useMemo(() => {
    if (dispatchMode === "full") return 1;
    const entered = parseFloat(dispatchPartialQty || "0");
    return entered > 0 ? Math.min(1, entered / dispatchBasisTotal) : 0;
  }, [dispatchMode, dispatchPartialQty, dispatchBasisTotal]);

  const dispatchTotals = useMemo(() => {
    let products = 0, qty = 0, places = 0, volume = 0, brutto = 0;
    for (const cr of selectedClientActiveRecords) {
      products += cr.selectedProductIds.length;
      for (const pid of cr.selectedProductIds) {
        const p = globalProductMap[pid];
        if (p) {
          const share = cr.productRatios?.[pid] ?? 1;
          qty    += (parseFloat(p.quantity)    || 0) * share;
          places += p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0) * share;
          volume += (parseFloat(p.totalVolume) || 0) * share;
          brutto += bruttoKg(p) * share;
        }
      }
    }
    return {
      products: Math.round(products * dispatchRatio),
      qty:    Math.round(qty    * dispatchRatio * 100) / 100,
      places: Math.round(places * dispatchRatio * 100) / 100,
      volume: Math.round(volume * dispatchRatio * 1000) / 1000,
      brutto: Math.round(brutto * dispatchRatio * 100) / 100,
    };
  }, [selectedClientActiveRecords, dispatchRatio, globalProductMap]);

  // Received (via truck or transfer) but not yet dispatched/transferred from this UZB warehouse
  const receivedInWarehouseList = useMemo(() => {
    return allChinaChiqim.filter(cr => effectiveReceivedIds.has(cr.id) && !uzbGoneIds.has(cr.id));
  }, [allChinaChiqim, effectiveReceivedIds, uzbGoneIds]);

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

  // Qabul qilingan va hali (to'liq) jo'natilmagan tovarlar — mavjud ulush bilan.
  // available: tovarning shu omborda qolgan qismi (0..1]
  const receivedStockProducts = useMemo(() => {
    return receivedInWarehouseList.flatMap(cr => {
      // Fura qisman qabul qilingan bo'lsa — shu ulush ham hisobga olinadi
      const accepted = ownReceivedRatios[cr.id] ?? 0;
      const acceptedShare = accepted > 0 ? Math.min(1, accepted) : 1; // o'tkazma orqali kelgan bo'lsa to'liq
      return cr.selectedProductIds
        .map(pid => {
          const incoming = (cr.productRatios?.[pid] ?? 1) * acceptedShare; // omborga real kelgan ulush
          const gone = ortaDispatchedRatios[pid] ?? 0;
          const available = Math.max(0, incoming - gone);
          return { pid, product: globalProductMap[pid], source: cr, available, incoming };
        })
        .filter(x => x.available > 0.0005);
    }).filter((x): x is { pid: string; product: KirimProduct; source: ChiqimRecord; available: number; incoming: number } => !!x.product);
  }, [receivedInWarehouseList, ortaDispatchedRatios, globalProductMap, ownReceivedRatios]);

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
    const inTransitIds = new Set(
      relevantChiqim.filter(cr => !effectiveReceivedIds.has(cr.id)).map(cr => cr.id)
    );
    let inTransitProducts = 0, inTransitJoys = 0, inTransitVol = 0, inTransitWeight = 0;
    let receivedProducts = 0, receivedJoys = 0, receivedVol = 0, receivedWeight = 0;
    let dispatchedProducts = 0, dispatchedJoys = 0, dispatchedVol = 0, dispatchedWeight = 0;
    for (const cr of relevantChiqim) {
      let prods = 0, joys = 0, vol = 0, weight = 0;
      for (const pid of cr.selectedProductIds) {
        const p = globalProductMap[pid];
        if (p) {
          prods += 1;
          joys  += p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
          vol   += parseFloat(p.totalVolume || "0") || 0;
          weight += bruttoKg(p);
        }
      }
      if (inTransitIds.has(cr.id)) {
        inTransitProducts += prods; inTransitJoys += joys; inTransitVol += vol; inTransitWeight += weight;
      } else if (uzbGoneIds.has(cr.id)) {
        dispatchedProducts += prods; dispatchedJoys += joys; dispatchedVol += vol; dispatchedWeight += weight;
      } else {
        receivedProducts += prods; receivedJoys += joys; receivedVol += vol; receivedWeight += weight;
      }
    }
    return {
      inTransitProducts, inTransitJoys,      inTransitVol:    Math.round(inTransitVol    * 1000) / 1000, inTransitWeight: Math.round(inTransitWeight * 100) / 100,
      receivedProducts,  receivedJoys,       receivedVol:     Math.round(receivedVol     * 1000) / 1000, receivedWeight: Math.round(receivedWeight * 100) / 100,
      dispatchedProducts, dispatchedJoys,    dispatchedVol:   Math.round(dispatchedVol   * 1000) / 1000, dispatchedWeight: Math.round(dispatchedWeight * 100) / 100,
    };
  }, [allChinaChiqim, effectiveReceivedIds, uzbGoneIds, globalProductMap, currentDestMap, warehouse.id]);

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
    const compressed = await Promise.all(toProcess.map(compressImage));
    setPhotos(prev => [...prev, ...compressed]);
    e.target.value = "";
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

      for (const [kirimRecordId, productIds] of Object.entries(groups)) {
        const kr = allProductMap[productIds[0]]?.kirimRecord;

        // Har bir tovar uchun: qancha joy olinadi (asos bo'yicha kiritilgan
        // qiymat joyga aylantiriladi) va furadagi ulush (productRatios)
        const fullIds: string[] = [];
        const partialTakes: { pid: string; joysTaken: number; totalJoys: number }[] = [];
        const productRatios: Record<string, number> = {};

        for (const pid of productIds) {
          const product = allProductMap[pid]?.product;
          if (!product) { fullIds.push(pid); continue; }
          const totalJoys = product.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
          const alreadyDispatched = (kr?.dispatchedPlaces ?? {})[pid] ?? 0;
          const remainingJoys = Math.max(0, totalJoys - alreadyDispatched);
          const mode = productModes[pid] ?? "full";
          const availableRatio = totalJoys > 0 ? remainingJoys / totalJoys : 1;

          // Ekranda ko'rsatilgan hisob bilan bir xil bo'lishi uchun aynan
          // computeTake ishlatiladi (dona butun → effektiv ulush shundan).
          let effRatio = availableRatio;
          let joysTaken = remainingJoys;
          if (mode === "partial") {
            const t = computeTake(product, availableRatio, partialInputs[pid]);
            effRatio = t.ratio;
            joysTaken = Math.round(totalJoys * effRatio * 100) / 100;
          }

          productRatios[pid] = totalJoys > 0
            ? Math.round(effRatio * 10000) / 10000
            : 1;

          if (joysTaken >= remainingJoys - 0.005) {
            fullIds.push(pid);
          } else {
            partialTakes.push({ pid, joysTaken, totalJoys });
          }
        }

        await addChiqimRecordV2({
          warehouseId: warehouse.id,
          date: new Date().toISOString().slice(0, 10),
          clientCode: kr?.clientCode ?? "",
          clientName: kr?.clientName ?? "",
          clientPhone: kr?.clientPhone ?? "",
          kirimRecordId,
          selectedProductIds: productIds,
          productRatios,
          vehicleNumber: vehicleNumber.trim(),
          photos,
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

      for (const [kirimRecordId, { productIds, ratios, source }] of Object.entries(groups)) {
        await addChiqimRecordV2({
          warehouseId: warehouse.id,
          date: new Date().toISOString().slice(0, 10),
          clientCode: source.clientCode,
          clientName: source.clientName,
          clientPhone: source.clientPhone,
          kirimRecordId,
          selectedProductIds: productIds,
          productRatios: ratios,
          vehicleNumber: vehicleNumber.trim(),
          photos,
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
    await deleteKirimRecord(deleteKirimId);
    toast.success("Kirim yozuvi o'chirildi");
    setDeleteKirimId(null);
    refresh();
  };

  const handleDeleteChiqim = async () => {
    if (!deleteChiqimId) return;
    await deleteChiqimRecordV2(deleteChiqimId);
    toast.success("O'chirildi");
    setDeleteChiqimId(null);
    refresh();
  };

  // ── UZB Truck Reception handlers ──────────────────────
  const handleSelectVehicle = (v: string) => {
    const reset = () => { setVehicleMode("full"); setSelectedClientIds(new Set()); setCrModes({}); setCrPartials({}); setCrForwards({}); };
    if (selectedVehicle === v) { setSelectedVehicle(null); reset(); }
    else { setSelectedVehicle(v); reset(); }
  };

  const handleSetVehicleMode = (mode: "full" | "partial") => {
    setVehicleMode(mode);
    if (mode === "partial") {
      setSelectedClientIds(new Set(selectedTruckChiqims.map(cr => cr.id)));
    } else {
      setSelectedClientIds(new Set());
    }
    setCrModes({}); setCrPartials({}); setCrForwards({});
  };

  const toggleClientId = (id: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setCrModes(m => { const n = { ...m }; delete n[id]; return n; });
        setCrPartials(m => { const n = { ...m }; delete n[id]; return n; });
        setCrForwards(m => { const n = { ...m }; delete n[id]; return n; });
      }
      else next.add(id);
      return next;
    });
  };

  const handleSaveReceipt = async () => {
    if (!selectedVehicle) { toast.error("Fura tanlang"); return; }
    const eligible = vehicleMode === "full"
      ? selectedTruckChiqims
      : selectedTruckChiqims.filter(cr => selectedClientIds.has(cr.id));
    if (vehicleMode === "partial" && eligible.length === 0) { toast.error("Kamida bir mijozni tanlang"); return; }
    if (vehicleMode === "partial") {
      for (const cr of eligible) {
        if ((crModes[cr.id] ?? "full") === "partial") {
          const inp = crPartials[cr.id];
          if (!inp?.qty || parseFloat(inp.qty) <= 0) {
            toast.error(`${cr.clientName || cr.clientCode} uchun miqdor kiriting`);
            return;
          }
        }
      }
    }
    setReceiptSaving(true);
    try {
      const receivedRatios: Record<string, number> = {};
      const forwards: Record<string, string> = {};
      for (const cr of eligible) {
        const already = cumulativeReceivedRatios[cr.id] ?? 0;
        const remaining = Math.max(0, 1 - already);
        const mode = vehicleMode === "full" ? "full" : (crModes[cr.id] ?? "full");
        let taken = remaining; // "Barchasi" — qolganini to'liq qabul qilish
        if (mode === "partial") {
          const inp = crPartials[cr.id];
          const entered = parseFloat(inp?.qty || "0");
          const basisTotal = basisTotalOf(cr, inp?.unit ?? "joy");
          taken = Math.min(remaining, entered / basisTotal);
        }
        receivedRatios[cr.id] = Math.round(taken * 10000) / 10000;

        // Qolgan qismi bo'lsa — boshqa qabul qiluvchi ombor tanlash MAJBURIY
        const left = remaining - taken;
        if (left > 0.0005) {
          const fwd = crForwards[cr.id];
          if (!fwd) {
            toast.error(`${cr.clientName || cr.clientCode}: qolgan qismi uchun qabul qiluvchi omborni tanlang`);
            setReceiptSaving(false);
            return;
          }
          forwards[cr.id] = fwd;
        }
      }
      await addChiqimReceipt({
        uzbWarehouseId: warehouse.id,
        vehicleNumber: selectedVehicle,
        receivedRatios,
        forwards,
        note: receiptNote.trim() || undefined,
        receivedAt: new Date().toISOString().slice(0, 10),
      });
      toast.success("Fura qabul qilindi");
      setSelectedVehicle(null); setVehicleMode("full"); setSelectedClientIds(new Set()); setCrModes({}); setCrPartials({}); setCrForwards({}); setReceiptNote("");
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
    await deleteChiqimReceipt(deleteReceiptId);
    toast.success("O'chirildi");
    setDeleteReceiptId(null);
    await refresh();
  };

  // ── UZB Dispatch handlers ─────────────────────────────
  const handleSelectDispatchClient = (clientCode: string) => {
    if (selectedDispatchClientCode === clientCode) {
      setSelectedDispatchClientCode(null);
    } else {
      setSelectedDispatchClientCode(clientCode);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy");
    }
    resetPayment();
  };

  const handleSaveDispatch = async () => {
    if (!selectedDispatchClientCode) { toast.error("Mijoz tanlang"); return; }
    if (dispatchMode === "partial" && parseFloat(dispatchPartialQty || "0") <= 0) {
      toast.error("Miqdor kiriting"); return;
    }

    // ── To'lov validatsiyasi — faqat O'rta mijoz omborida (Mijozlar modul qoidalari) ──
    const payActive = paymentsEnabled && payMode !== "none";
    const total = parseFloat(payTotal || "0");
    const paid = parseFloat(payPaid || "0");
    if (payActive && payMode === "full" && total <= 0) { toast.error("To'lov summasini kiriting"); return; }
    if (payActive && payMode === "partial") {
      if (total <= 0 || paid <= 0) { toast.error("To'liq summa va to'langan summani kiriting"); return; }
      if (paid >= total) { toast.error("To'langan summa to'liq summadan kichik bo'lishi kerak"); return; }
      if (!payNextDate) { toast.error("Keyingi to'lov sanasini kiriting"); return; }
    }

    setDispatchSaving(true);
    try {
      // Izohga to'lov ma'lumoti ham qo'shiladi — chiqim arxivida to'liq ko'rinadi
      const payNote = !payActive
        ? ""
        : payMode === "full"
          ? `To'lov: ${fmtSum(total)} so'm — to'liq to'landi`
          : `To'lov: ${fmtSum(paid)} / ${fmtSum(total)} so'm — qisman to'landi · keyingi to'lov: ${payNextDate}`;
      const fullNote = [dispatchNote.trim(), payNote].filter(Boolean).join(" | ");

      const ratios: Record<string, number> = {};
      for (const cr of selectedClientActiveRecords) ratios[cr.id] = dispatchRatio;
      await addUzbDispatch({
        uzbWarehouseId: warehouse.id,
        clientCode: selectedDispatchClientCode,
        clientName: activeUzbClients[selectedDispatchClientCode]?.clientName || selectedDispatchClientCode,
        chiqimRecordIds: selectedClientActiveRecords.map(cr => cr.id),
        ratios,
        note: fullNote || undefined,
        payment: !payActive
          ? { mode: "none" }
          : {
              mode: payMode,
              totalAmount: total,
              paidAmount: payMode === "full" ? total : paid,
              nextPaymentAt: payMode === "partial" && payNextDate ? new Date(payNextDate).toISOString() : undefined,
            },
        dispatchedAt: new Date().toISOString().slice(0, 10),
      });

      // ── Mijozlar modulidagi TAYYOR to'lov tizimiga yozish (faqat O'rta mijoz) ──
      if (payActive) {
        const clientUuid = clientUuidByCode(selectedDispatchClientCode);
        if (!clientUuid) {
          toast.warning("Chiqim saqlandi, lekin mijoz «Mijozlar» bo'limida topilmadi — to'lov yozilmadi");
        } else {
          try {
            if (payMode === "full") {
              // Sotildi (to'liq): jami summa = to'langan summa
              await API.setSale(clientUuid, { status: "full", totalAmount: total, paidAmount: total });
            } else {
              // Sotildi (qisman): to'langan qismi payment sifatida yoziladi,
              // qolgani uchun keyingi to'lov sanasi eslatma tizimiga tushadi
              await API.setSale(clientUuid, {
                status: "partial",
                totalAmount: total,
                paidAmount: paid,
                nextPaymentAt: new Date(payNextDate).toISOString(),
              });
            }
            toast.success(payMode === "full" ? "To'lov qayd etildi — to'liq to'landi" : "To'lov qayd etildi — qisman to'landi");
          } catch (payErr: any) {
            toast.warning("Chiqim saqlandi, lekin to'lovni yozishda xatolik: " + (payErr?.message || ""));
          }
        }
      }

      toast.success("Chiqim saqlandi");
      setSelectedDispatchClientCode(null);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy"); setDispatchNote("");
      resetPayment();
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Xatolik");
    } finally {
      setDispatchSaving(false);
    }
  };

  const handleDeleteDispatch = async () => {
    if (!deleteDispatchId) return;
    await deleteUzbDispatch(deleteDispatchId);
    toast.success("O'chirildi");
    setDeleteDispatchId(null);
    await refresh();
  };

  // ── UZB Transfer handler ──────────────────────────────
  const handleSaveTransfer = async () => {
    if (!selectedDispatchClientCode) { toast.error("Mijoz tanlang"); return; }
    if (!selectedTransferDestId) { toast.error("Manzil omborni tanlang"); return; }
    if (dispatchMode === "partial" && parseFloat(dispatchPartialQty || "0") <= 0) {
      toast.error("Miqdor kiriting"); return;
    }
    setTransferSaving(true);
    try {
      const ratios: Record<string, number> = {};
      for (const cr of selectedClientActiveRecords) ratios[cr.id] = dispatchRatio;
      await addUzbTransfer({
        sourceWarehouseId: warehouse.id,
        destWarehouseId: selectedTransferDestId,
        clientCode: selectedDispatchClientCode,
        clientName: activeUzbClients[selectedDispatchClientCode]?.clientName || selectedDispatchClientCode,
        chiqimRecordIds: selectedClientActiveRecords.map(cr => cr.id),
        ratios,
        note: dispatchNote.trim() || undefined,
        transferredAt: new Date().toISOString().slice(0, 10),
      });
      toast.success("Tovar boshqa omborga jo'natildi (yo'lda)");
      setSelectedDispatchClientCode(null);
      setDispatchMode("full"); setDispatchPartialQty(""); setDispatchPartialUnit("joy");
      setDispatchNote(""); setSelectedTransferDestId(null); resetPayment();
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
  };

  const handleDeleteUzbKirim = async () => {
    if (!deleteUzbKirimId) return;
    await deleteUzbKirimRecord(deleteUzbKirimId);
    toast.success("O'chirildi");
    setDeleteUzbKirimId(null);
    await refresh();
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
    const allowTransfer = isOrtaMijoz; // "Chiqaruvchi ombor"dan omborga o'tkazish olib tashlangan
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOrtaMijoz ? "bg-teal-600/10" : "bg-blue-600/10"}`}>
              <Building2 className={`w-5 h-5 ${isOrtaMijoz ? "text-teal-600" : "text-blue-600"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-foreground truncate">{warehouse.name}</h1>
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDE1EA] bg-white text-[#6B7280] text-xs font-black hover:text-[#005AB5] hover:border-[#93C5FD] transition-colors shrink-0"
            >
              <Clock className="w-3.5 h-3.5" /> Tarix
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 px-4 py-3 border-b border-border bg-card shrink-0">
            <button
              onClick={() => setTab("kirim")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all ${
                tab === "kirim" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25" : "bg-secondary/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" /> Kirim
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tab === "kirim" ? "bg-white/20" : "bg-blue-600/10 text-blue-600"}`}>
                {activeTruckList.length}
              </span>
            </button>
            <button
              onClick={() => setTab("chiqim")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all ${
                tab === "chiqim" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25" : "bg-secondary/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" /> Chiqim
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tab === "chiqim" ? "bg-white/20" : "bg-blue-600/10 text-blue-600"}`}>
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
                          onClick={() => { setShowUzbKirimPanel(false); setSelectedVehicle(null); setVehicleMode("full"); setSelectedClientIds(new Set()); setCrModes({}); setCrPartials({}); setCrForwards({}); }}
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
                              {activeTruckList.length} ta fura qabul qilinishini kutmoqda
                            </p>
                            <div className="space-y-2">
                              {activeTruckList.map(([vn, chiqims]) => {
                                const totalProd = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                                const hasPartial = chiqims.some(cr => (cumulativeReceivedRatios[cr.id] ?? 0) > 0);
                                return (
                                  <div key={vn} className="bg-white border border-[#DDE1EA] rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                                    <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center shrink-0">
                                      <Truck className="w-4.5 h-4.5 text-[#005AB5]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-black text-[#111827] font-mono">{vn}</p>
                                      <p className="text-[11px] text-[#6B7280] mt-0.5">{chiqims.length} mijoz · {totalProd} tovar · {chiqims[0]?.date}</p>
                                    </div>
                                    {hasPartial && (
                                      <span className="text-[10px] font-bold text-[#F59E0B] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-md shrink-0">
                                        Qisman
                                      </span>
                                    )}
                                  </div>
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

                        {/* ── KIRIM TOVARLAR — omborda. Yaratuvchi ombordagi kabi to'liq
                             info bilan, tovar tugaguncha shu yerda turadi ── */}
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
                                {receivedStockProducts.map((item, idx) => renderStockProductCard(item, idx, "blue"))}
                              </div>
                            </div>
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

                        {/* ── Outgoing transfers (SIZ jo'natgan — yo'lda / qabul qilindi) ── */}
                        {(outgoingInTransit.length > 0 || outgoingReceived.length > 0) && (
                          <div className="mx-4 mb-4">
                            <div className="bg-white border border-[#DDE1EA] rounded-2xl overflow-hidden shadow-sm">
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#EFF6FF] border-b border-[#BFDBFE]">
                                <div className="w-[3px] h-4 rounded-full bg-[#005AB5]" />
                                <span className="text-[11px] font-black uppercase tracking-widest text-[#1E40AF]">Boshqa omborga jo'natilgan</span>
                              </div>
                              <div className="divide-y divide-[#F3F4F6]">
                                {[...outgoingInTransit, ...outgoingReceived].map(t => {
                                  const destWh = allWarehouses.find(w => w.id === t.destWarehouseId);
                                  const received = t.status === "received";
                                  return (
                                    <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${received ? "bg-[#ECFDF5] border border-[#A7F3D0]" : "bg-[#FFFBEB] border border-[#FDE68A]"}`}>
                                        {received ? <CheckSquare className="w-4 h-4 text-[#059669]" /> : <Truck className="w-4 h-4 text-[#D97706]" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-black text-[#005AB5] bg-[#EFF6FF] px-1.5 py-0.5 rounded font-mono">{t.clientCode}</span>
                                          <span className="text-[11px] text-[#374151] font-medium">{t.clientName || t.clientCode}</span>
                                          {received
                                            ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D1FAE5] text-[#047857] uppercase">Qabul qilindi</span>
                                            : <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] uppercase">Yo'lda</span>}
                                        </div>
                                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                                          → {destWh?.name ?? "Noma'lum ombor"} · {t.chiqimRecordIds.length} yetkazma · {t.transferredAt}
                                          {received && t.receivedAt ? ` · qabul: ${String(t.receivedAt).slice(0, 10)}` : ""}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
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
                        {activeTruckList.map(([vehicleNumber, chiqims]) => {
                          const isSelected = selectedVehicle === vehicleNumber;
                          const totalProducts = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                          const firstDate = chiqims[0]?.date ?? "";
                          const allPhotos = chiqims.flatMap(cr => cr.photos ?? []);
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
                                {isSelected
                                  ? <CheckSquare className="w-5 h-5 text-[#005AB5] shrink-0" />
                                  : <Square className="w-5 h-5 text-[#D1D5DB] shrink-0" />
                                }
                              </button>

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
                                            onClick={e => { e.stopPropagation(); window.open(photo.dataUrl, "_blank"); }}
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
                                                {cMode === "partial" && (() => {
                                                  const already = cumulativeReceivedRatios[cr.id] ?? 0;
                                                  const remaining = Math.max(0, 1 - already);
                                                  const basis = cPart?.unit ?? "joy";
                                                  const maxQty = Math.round(basisTotalOf(cr, basis) * remaining * 100) / 100;
                                                  const entered = parseFloat(cPart?.qty || "0");
                                                  const willRemain = entered > 0 && entered < maxQty - 1e-9;
                                                  return (
                                                    <div className="space-y-2">
                                                      <div className="flex gap-1.5">
                                                        <input
                                                          type="number" onWheel={noWheel} min="0" step="any" max={maxQty}
                                                          value={cPart?.qty ?? ""}
                                                          onChange={e => setCrPartials(m => ({
                                                            ...m,
                                                            [cr.id]: { qty: clampToMax(e.target.value, maxQty), unit: m[cr.id]?.unit ?? "joy" }
                                                          }))}
                                                          placeholder={`Max ${maxQty}`}
                                                          className="flex-1 px-3 py-2 rounded-lg border border-[#BFDBFE] bg-white text-xs font-bold text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5]"
                                                        />
                                                        <select
                                                          value={basis}
                                                          onChange={e => {
                                                            const u = e.target.value;
                                                            const newMax = Math.round(basisTotalOf(cr, u) * remaining * 100) / 100;
                                                            setCrPartials(m => ({
                                                              ...m,
                                                              [cr.id]: { qty: clampToMax(m[cr.id]?.qty ?? "", newMax), unit: u }
                                                            }));
                                                          }}
                                                          className="px-2 py-2 rounded-lg border border-[#BFDBFE] bg-white text-[11px] font-bold text-[#374151] focus:outline-none max-w-[46%]"
                                                        >
                                                          {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                                        </select>
                                                      </div>
                                                      {willRemain && (
                                                        <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-2">
                                                          <p className="text-[10px] font-black text-violet-700 uppercase tracking-wider mb-1">
                                                            Qolgan qismi uchun ombor <span className="text-destructive">*</span>
                                                          </p>
                                                          <select
                                                            value={crForwards[cr.id] ?? ""}
                                                            onChange={e => setCrForwards(m => ({ ...m, [cr.id]: e.target.value }))}
                                                            className={`w-full px-3 py-2 rounded-lg border bg-white text-xs font-bold text-[#374151] focus:outline-none ${crForwards[cr.id] ? "border-violet-300" : "border-red-300"}`}
                                                          >
                                                            <option value="">— Omborni tanlang —</option>
                                                            {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                                                              <option key={w.id} value={w.id}>{w.name}</option>
                                                            ))}
                                                          </select>
                                                          <p className="text-[9px] text-[#9CA3AF] mt-1">
                                                            Qabul qilinmagan qism tanlangan omborga «yo'lda» bo'lib o'tadi
                                                          </p>
                                                        </div>
                                                      )}
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
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Calculator */}
                    {selectedVehicle && (
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

                    {/* Note + Save */}
                    {selectedVehicle && (
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
                          {receiptSaving ? "Saqlanmoqda..." : "Furani qabul qilish"}
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

            {/* ── CHIQARUVCHI: chiqim usuli tanlovi — ikkala tizim ham bor ── */}
            {tab === "chiqim" && !isOrtaMijoz && (
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

            {/* ── CHIQARUVCHI CHIQIM tab — tovar+fura chiqimi (o'rta ombordagidek) ── */}
            {tab === "chiqim" && !isOrtaMijoz && uzbChiqimMode === "truck" && (
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

            {/* ── MIJOZ BO'YICHA CHIQIM — o'rta mijoz (doim) yoki chiqaruvchi (tanlovda) ── */}
            {tab === "chiqim" && (isOrtaMijoz || uzbChiqimMode === "client") && (
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

                  {/* Chiqim type toggle */}
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
                          return (
                            <div key={clientCode}
                              className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all cursor-pointer select-none ${
                                isSelected ? "border-blue-500 shadow-blue-100" : "border-gray-100 hover:border-blue-200"
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
                                  <p className="text-sm font-black text-gray-800 font-mono">{clientCode}</p>
                                  {clientName && clientName !== clientCode && (
                                    <p className="text-xs text-gray-400 truncate">{clientName}</p>
                                  )}
                                  <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                                    {records.length} ta yuk · {productCount} ta tovar
                                  </p>
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

                                  {/* Mode buttons */}
                                  <div className="flex gap-2">
                                    {(["full", "partial"] as const).map(m => (
                                      <button key={m}
                                        onClick={e => { e.stopPropagation(); setDispatchMode(m); if (m === "full") setDispatchPartialQty(""); }}
                                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                                          dispatchMode === m
                                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                                            : "bg-white border-2 border-gray-100 text-gray-600 hover:border-blue-200"
                                        }`}
                                      >
                                        {m === "full" ? "Barchasi" : "Bir qismi"}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Partial qty input */}
                                  {dispatchMode === "partial" && (
                                    <div onClick={e => e.stopPropagation()}>
                                      <label className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Miqdor</label>
                                      <div className="flex gap-2 mt-1">
                                        <input
                                          type="number" onWheel={noWheel}
                                          min="0" step="any" max={Math.round(dispatchBasisTotal * 100) / 100}
                                          value={dispatchPartialQty}
                                          onChange={e => setDispatchPartialQty(clampToMax(e.target.value, Math.round(dispatchBasisTotal * 100) / 100))}
                                          placeholder={`Max ${Math.round(dispatchBasisTotal * 100) / 100}`}
                                          className="flex-1 px-3 py-2 rounded-xl border-2 border-blue-100 bg-white text-sm font-bold focus:outline-none focus:border-blue-400"
                                        />
                                        <select
                                          value={dispatchPartialUnit}
                                          onChange={e => {
                                            const u = e.target.value;
                                            setDispatchPartialUnit(u);
                                            const newMax = Math.round(selectedClientActiveRecords.reduce((sum, cr2) => sum + basisTotalOf(cr2, u), 0) * 100) / 100;
                                            setDispatchPartialQty(q => clampToMax(q, newMax));
                                          }}
                                          onClick={e => e.stopPropagation()}
                                          className="px-2 py-2 rounded-xl border-2 border-blue-100 bg-white text-[12px] font-bold focus:outline-none max-w-[46%]"
                                        >
                                          {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                  )}

                                  {/* Calculator */}
                                  {(dispatchMode === "full" || parseFloat(dispatchPartialQty || "0") > 0) && (
                                    <div className="bg-white rounded-xl border-2 border-blue-100 p-3" onClick={e => e.stopPropagation()}>
                                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-2">Hisob-kitob</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[
                                          { label: "Tovar", val: dispatchTotals.products },
                                          { label: "Miqdor", val: dispatchTotals.qty },
                                          { label: "Joy soni", val: dispatchTotals.places },
                                          { label: "Brutto (kg)", val: dispatchTotals.brutto },
                                          { label: "Kuba (m³)", val: dispatchTotals.volume },
                                        ].map(({ label, val }) => (
                                          <div key={label} className="bg-blue-50 rounded-lg p-2 text-center">
                                            <p className="text-[10px] text-gray-500 font-bold">{label}</p>
                                            <p className="text-base font-black text-blue-700">{val}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* ── TO'LOV MA'LUMOTLARI — «Mijozlar» bo'limidagi tayyor to'lov
                                       tizimiga yoziladi (Sotildi to'liq / qisman to'ladi) ── */}
                                  {chiqimType === "client" && paymentsEnabled && (
                                    <div className="bg-white rounded-xl border-2 border-emerald-100 p-3 space-y-2" onClick={e => e.stopPropagation()}>
                                      <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">To'lov ma'lumotlari</p>
                                      <div className="flex gap-1.5">
                                        {([
                                          { key: "none",    label: "To'lovsiz" },
                                          { key: "full",    label: "To'liq to'ladi" },
                                          { key: "partial", label: "Qisman to'ladi" },
                                        ] as const).map(opt => (
                                          <button
                                            key={opt.key}
                                            onClick={() => setPayMode(opt.key)}
                                            className={`flex-1 py-2 rounded-lg text-[11px] font-black border transition-all ${
                                              payMode === opt.key
                                                ? opt.key === "none"
                                                  ? "bg-gray-500 border-gray-500 text-white"
                                                  : "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200"
                                                : "bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600"
                                            }`}
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>

                                      {payMode !== "none" && (
                                        <div className="space-y-2">
                                          <div>
                                            <label className="text-[10px] font-bold text-gray-500">Jami summa (so'm) <span className="text-destructive">*</span></label>
                                            <input
                                              type="number" onWheel={noWheel} min="0" step="any"
                                              value={payTotal}
                                              onChange={e => setPayTotal(e.target.value)}
                                              placeholder="0"
                                              className="w-full mt-1 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-sm font-bold focus:outline-none focus:border-emerald-400"
                                            />
                                          </div>
                                          {payMode === "partial" && (
                                            <>
                                              <div>
                                                <label className="text-[10px] font-bold text-gray-500">To'langan summa (so'm) <span className="text-destructive">*</span></label>
                                                <input
                                                  type="number" onWheel={noWheel} min="0" step="any"
                                                  value={payPaid}
                                                  onChange={e => setPayPaid(e.target.value)}
                                                  placeholder="0"
                                                  className="w-full mt-1 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-sm font-bold focus:outline-none focus:border-emerald-400"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-[10px] font-bold text-gray-500">Keyingi to'lov sanasi <span className="text-destructive">*</span></label>
                                                <input
                                                  type="date"
                                                  value={payNextDate}
                                                  onChange={e => setPayNextDate(e.target.value)}
                                                  min={new Date().toISOString().slice(0, 10)}
                                                  className="w-full mt-1 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-sm focus:outline-none focus:border-emerald-400"
                                                />
                                              </div>
                                              {parseFloat(payTotal || "0") > 0 && parseFloat(payPaid || "0") > 0 && parseFloat(payPaid) < parseFloat(payTotal) && (
                                                <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                                                  Qarz: {fmtSum(parseFloat(payTotal) - parseFloat(payPaid))} so'm
                                                </p>
                                              )}
                                            </>
                                          )}
                                          <p className="text-[9px] text-gray-400">
                                            To'lov «Mijozlar» bo'limidagi mijoz kartasiga yoziladi — Sotildi{payMode === "partial" ? " (qisman to'ladi), eslatma tizimi ishga tushadi" : " (to'liq)"}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}

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

                                  {/* Warehouse selector (only for "Boshqa omborga") */}
                                  {chiqimType === "warehouse" && (
                                    <div onClick={e => e.stopPropagation()}>
                                      <label className="text-[10px] font-black text-[#005AB5] uppercase tracking-wider">Manzil ombor</label>
                                      <div className="mt-1 space-y-1.5">
                                        {allWarehouses
                                          .filter(w => (w.type === "uzbekistan" || w.type === "ortaMijoz") && w.id !== warehouse.id)
                                          .map(w => (
                                            <button
                                              key={w.id}
                                              onClick={e => { e.stopPropagation(); setSelectedTransferDestId(w.id); }}
                                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                                                selectedTransferDestId === w.id
                                                  ? "border-[#005AB5] bg-[#EFF6FF]"
                                                  : "border-[#DDE1EA] bg-white hover:border-[#93C5FD]"
                                              }`}
                                            >
                                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                                selectedTransferDestId === w.id ? "bg-[#005AB5]" : "bg-[#F0F4FF]"
                                              }`}>
                                                <Building2 className={`w-3.5 h-3.5 ${selectedTransferDestId === w.id ? "text-white" : "text-[#6B7280]"}`} />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className={`text-xs font-black truncate ${selectedTransferDestId === w.id ? "text-[#005AB5]" : "text-[#374151]"}`}>{w.name}</p>
                                                {w.address && <p className="text-[10px] text-[#9CA3AF] truncate">{w.address}</p>}
                                              </div>
                                              {selectedTransferDestId === w.id && (
                                                <div className="w-4 h-4 rounded-full bg-[#005AB5] flex items-center justify-center shrink-0">
                                                  <Check className="w-2.5 h-2.5 text-white" />
                                                </div>
                                              )}
                                            </button>
                                          ))
                                        }
                                        {allWarehouses.filter(w => (w.type === "uzbekistan" || w.type === "ortaMijoz") && w.id !== warehouse.id).length === 0 && (
                                          <p className="text-xs text-[#9CA3AF] text-center py-3">Boshqa ombor yo'q</p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Save / Transfer button */}
                                  {chiqimType === "client" ? (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleSaveDispatch(); }}
                                      disabled={dispatchSaving || (dispatchMode === "partial" && parseFloat(dispatchPartialQty || "0") <= 0)}
                                      className="w-full py-3 rounded-xl bg-[#005AB5] text-white text-sm font-black hover:bg-[#004A96] disabled:opacity-40 transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                                    >
                                      <ArrowUpCircle className="w-4 h-4" />
                                      {dispatchSaving ? "Saqlanmoqda..." : "Chiqimni saqlash"}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleSaveTransfer(); }}
                                      disabled={transferSaving || !selectedTransferDestId || (dispatchMode === "partial" && parseFloat(dispatchPartialQty || "0") <= 0)}
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
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-card shrink-0">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOrtaOmbor ? "bg-amber-500/10" : isChegara ? "bg-violet-600/10" : "bg-orange-500/10"}`}>
            {isOrtaOmbor ? <WarehouseIcon className="w-5 h-5 text-amber-600" /> : isChegara ? <Shield className="w-5 h-5 text-violet-600" /> : <Globe className="w-5 h-5 text-orange-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-foreground truncate">{warehouse.name}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isOrtaOmbor ? "bg-amber-500/10 text-amber-600" : isChegara ? "bg-violet-600/10 text-violet-600" : "bg-orange-500/10 text-orange-500"}`}>
                {isOrtaOmbor ? "O'rta ombor" : isChegara ? "Chegara" : "Xitoy"}
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

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setTab("kirim")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm transition-all ${
              tab === "kirim"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <ArrowDownCircle className="w-4 h-4" />
            Kirim
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-bold ${
              tab === "kirim" ? "bg-white/20 text-white" : "bg-blue-600/10 text-blue-600"
            }`}>
              {isTransitKirim ? activeTruckList.length : activeKirim.length}
            </span>
          </button>
          <button
            onClick={() => setTab("chiqim")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm transition-all ${
              tab === "chiqim"
                ? "bg-slate-800 text-white shadow-md shadow-slate-800/20"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            Chiqim
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-bold ${
              tab === "chiqim" ? "bg-white/20 text-white" : "bg-slate-500/10 text-slate-600"
            }`}>
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
                      {activeTruckList.map(([vehicleNumber, chiqims]) => {
                        const isSelected = selectedVehicle === vehicleNumber;
                        const totalProducts = chiqims.reduce((s, cr) => s + cr.selectedProductIds.length, 0);
                        const firstDate = chiqims[0]?.date ?? "";
                        const allPhotos = chiqims.flatMap(cr => cr.photos ?? []);
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
                              {isSelected ? <CheckSquare className="w-5 h-5 text-violet-400 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                            </button>
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
                                          onClick={e => { e.stopPropagation(); window.open(photo.dataUrl, "_blank"); }}
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
                                              {cMode === "partial" && (() => {
                                                const already = cumulativeReceivedRatios[cr.id] ?? 0;
                                                const remaining = Math.max(0, 1 - already);
                                                const basis = cPart?.unit ?? "joy";
                                                const maxQty = Math.round(basisTotalOf(cr, basis) * remaining * 100) / 100;
                                                const entered = parseFloat(cPart?.qty || "0");
                                                const willRemain = entered > 0 && entered < maxQty - 1e-9;
                                                return (
                                                  <div className="space-y-2">
                                                    <div className="flex gap-1.5">
                                                      <input type="number" onWheel={noWheel} min="0" step="any" max={maxQty} value={cPart?.qty ?? ""} placeholder={`Max ${maxQty}`}
                                                        onChange={e => setCrPartials(p => ({ ...p, [cr.id]: { qty: clampToMax(e.target.value, maxQty), unit: p[cr.id]?.unit ?? "joy" } }))}
                                                        className="flex-1 px-2.5 py-1.5 rounded-lg border-2 border-gray-200 bg-white text-xs font-bold text-gray-700 focus:outline-none focus:border-violet-200" />
                                                      <select value={basis}
                                                        onChange={e => {
                                                          const u = e.target.value;
                                                          const newMax = Math.round(basisTotalOf(cr, u) * remaining * 100) / 100;
                                                          setCrPartials(pp => ({ ...pp, [cr.id]: { qty: clampToMax(pp[cr.id]?.qty ?? "", newMax), unit: u } }));
                                                        }}
                                                        className="px-2 py-1.5 rounded-lg border-2 border-gray-200 bg-white text-[11px] font-bold text-gray-700 focus:outline-none focus:border-violet-200 max-w-[46%]">
                                                        {PARTIAL_BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                                                      </select>
                                                    </div>
                                                    {willRemain && (
                                                      <div className="bg-violet-50/60 border border-violet-200 rounded-lg p-2">
                                                        <p className="text-[10px] font-black text-violet-700 uppercase tracking-wider mb-1">
                                                          Qolgan qismi uchun ombor <span className="text-destructive">*</span>
                                                        </p>
                                                        <select
                                                          value={crForwards[cr.id] ?? ""}
                                                          onChange={e => setCrForwards(m => ({ ...m, [cr.id]: e.target.value }))}
                                                          className={`w-full px-2.5 py-1.5 rounded-lg border-2 bg-white text-xs font-bold text-gray-700 focus:outline-none ${crForwards[cr.id] ? "border-violet-200" : "border-red-200"}`}
                                                        >
                                                          <option value="">— Omborni tanlang —</option>
                                                          {allWarehouses.filter(w => w.id !== warehouse.id && w.type !== "china").map(w => (
                                                            <option key={w.id} value={w.id}>{w.name}</option>
                                                          ))}
                                                        </select>
                                                        <p className="text-[9px] text-gray-400 mt-1">
                                                          Qabul qilinmagan qism tanlangan omborga «yo'lda» bo'lib o'tadi
                                                        </p>
                                                      </div>
                                                    )}
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
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedVehicle && (
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
                  {selectedVehicle && (
                    <div className="mx-3 mb-4 space-y-2">
                      <input value={receiptNote} onChange={e => setReceiptNote(e.target.value)}
                        placeholder="Izoh (ixtiyoriy)..."
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:border-violet-300 placeholder:text-gray-300" />
                      <button onClick={handleSaveReceipt} disabled={receiptSaving}
                        className="w-full py-3 rounded-xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700 disabled:opacity-50 transition-all shadow-sm shadow-violet-100">
                        {receiptSaving ? "Saqlanmoqda..." : "Furani qabul qilish"}
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
                          {receivedStockProducts.map((item, idx) => renderStockProductCard(item, idx, "violet"))}
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
                        const totalJoys = p.places.reduce((s, pl) => s + (parseFloat(pl.count) || 0), 0);
                        const alreadyDispatched = (kr.dispatchedPlaces ?? {})[p.id] ?? 0;
                        const remainingJoys = Math.max(0, totalJoys - alreadyDispatched);
                        const isPartiallyDispatched = alreadyDispatched > 0;
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
                                      {fmt2(alreadyDispatched)}/{fmt2(totalJoys)} joy chiqarilgan
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-foreground mt-0.5">{productSummary(p)}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {p.quantity && (
                                    <span className="text-[10px] text-muted-foreground">Soni: <strong>{p.quantity}</strong></span>
                                  )}
                                  {totalJoys > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Joy: <strong className={remainingJoys < totalJoys ? "text-amber-600" : ""}>{fmt2(remainingJoys)} ta qolgan</strong>
                                    </span>
                                  )}
                                  {p.brutto && (
                                    <span className="text-[10px] text-muted-foreground">Vazn: <strong>{p.brutto} {p.bruttoUnit}</strong></span>
                                  )}
                                  {p.totalVolume && (
                                    <span className="text-[10px] text-muted-foreground">Vol: <strong>{p.totalVolume} m³</strong></span>
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
                                    Barchasi ({remainingJoys} joy)
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
                                  const remBasis = totalJoys > 0 ? fullBasis * (remainingJoys / totalJoys) : fullBasis;
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
                                          const newMax = Math.round((totalJoys > 0 ? fb * (remainingJoys / totalJoys) : fb) * 100) / 100;
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
                                  const availableRatio = totalJoys > 0 ? remainingJoys / totalJoys : 1;
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
                                    <span className="text-[10px] text-muted-foreground">Soni: <strong>{p.quantity}</strong></span>
                                  )}
                                  {totalJoys > 0 && (
                                    <span className="text-[10px] text-muted-foreground">Joy: <strong>{fmt2(totalJoys)}</strong></span>
                                  )}
                                  {p.brutto && (
                                    <span className="text-[10px] text-muted-foreground">Vazn: <strong>{p.brutto} {p.bruttoUnit}</strong></span>
                                  )}
                                  {p.totalVolume && (
                                    <span className="text-[10px] text-muted-foreground">Vol: <strong>{p.totalVolume} m³</strong></span>
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
