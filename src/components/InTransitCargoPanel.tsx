import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, Truck, Search, Package, MapPin, ArrowRight, RefreshCw,
  Building2, IdCard, Camera, Clock, Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { getInTransitCargo, type TransitCargo, type TransitData } from "@/lib/warehouse-transit";

interface Props {
  onClose: () => void;
}

const STATUS_FILTERS = [
  { key: "all", label: "Barchasi" },
  { key: "transit", label: "To'liq yo'lda" },
  { key: "partial", label: "Qisman qabul" },
] as const;

export function InTransitCargoPanel({ onClose }: Props) {
  const [data, setData] = useState<TransitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [destId, setDestId] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      setData(await getInTransitCargo());
    } catch (err: any) {
      toast.error(err?.message || "Yo'ldagi yuklarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cargos = data?.cargos ?? [];

  // Manzil ombor bo'yicha filtr uchun — yo'ldagi yuklarda uchraydigan omborlar
  const destOptions = useMemo(() => {
    const map = new Map<string, string>();
    cargos.forEach(c => { if (c.destWarehouseId) map.set(c.destWarehouseId, c.destWarehouseName || "Ombor"); });
    return Array.from(map.entries());
  }, [cargos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cargos.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (destId !== "all" && c.destWarehouseId !== destId) return false;
      if (!q) return true;
      return (
        c.vehicleNumber.toLowerCase().includes(q) ||
        c.clientCode.toLowerCase().includes(q) ||
        (c.clientName || "").toLowerCase().includes(q) ||
        c.sourceWarehouseName.toLowerCase().includes(q) ||
        (c.destWarehouseName || "").toLowerCase().includes(q) ||
        c.products.some(p => p.name.toLowerCase().includes(q))
      );
    });
  }, [cargos, query, status, destId]);

  const filteredTotals = useMemo(() => {
    return filtered.reduce(
      (a, c) => ({
        trucks: a.trucks + 1,
        soni: a.soni + c.inTransitTotals.soni,
        joys: Math.round((a.joys + c.inTransitTotals.joys) * 100) / 100,
        brutto: Math.round((a.brutto + c.inTransitTotals.brutto) * 100) / 100,
        vol: Math.round((a.vol + c.inTransitTotals.vol) * 1000) / 1000,
      }),
      { trucks: 0, soni: 0, joys: 0, brutto: 0, vol: 0 },
    );
  }, [filtered]);

  const fmtDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#F5F6FA] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#DDE1EA] bg-white shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-11 h-11 rounded-2xl bg-violet-600/10 flex items-center justify-center shrink-0">
          <Truck className="w-6 h-6 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black text-foreground truncate">Yo'ldagi yuklar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Omborlararo harakatlanayotgan — hali to'liq qabul qilinmagan yuklar
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Yangilash
        </button>
      </div>

      {/* Totals bar */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: "Yo'ldagi furalar", val: filteredTotals.trucks, icon: Truck, accent: "text-violet-600" },
            { label: "Soni (dona)", val: filteredTotals.soni, icon: Boxes, accent: "text-blue-600" },
            { label: "Joy", val: filteredTotals.joys, icon: Package, accent: "text-blue-600" },
            { label: "Brutto (kg)", val: filteredTotals.brutto, icon: Package, accent: "text-blue-600" },
            { label: "Hajm (m³)", val: filteredTotals.vol, icon: Package, accent: "text-blue-600" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border/60 bg-slate-50/70 px-3.5 py-2.5">
              <p className={`text-2xl font-black leading-none ${c.accent}`}>{c.val || "—"}</p>
              <p className="text-[11px] text-muted-foreground font-bold mt-1.5">{c.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2">
          * Raqamlar hali yo'lda qolgan (qabul qilinmagan) qismni ko'rsatadi.
        </p>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5] flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Fura, mijoz, ombor yoki tovar bo'yicha qidirish..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-[#F8F9FC] text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${
                status === f.key
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-[#6B7280] border-[#DDE1EA] hover:border-violet-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {destOptions.length > 0 && (
          <select
            value={destId}
            onChange={e => setDestId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-white text-sm font-bold text-[#374151] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          >
            <option value="all">Barcha manzillar</option>
            {destOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="py-24 text-center text-sm font-bold text-[#9CA3AF]">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Truck className="w-8 h-8 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-bold text-[#9CA3AF]">
              {cargos.length === 0 ? "Hozircha yo'lda yuk yo'q" : "Filtrga mos yuk topilmadi"}
            </p>
            <p className="text-xs text-[#C4C9D4] mt-1">Chiqim qilingan, ammo hali qabul qilinmagan yuklar shu yerda ko'rinadi</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-[1400px] mx-auto">
            {filtered.map(c => <CargoCard key={c.id} c={c} fmtDateTime={fmtDateTime} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CargoCard({ c, fmtDateTime }: { c: TransitCargo; fmtDateTime: (s: string) => string }) {
  const isPartial = c.status === "partial";
  return (
    <div className="bg-white rounded-2xl border border-[#DDE1EA] shadow-sm overflow-hidden">
      {/* Top: route + status */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-violet-50/50 border-b border-violet-100">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-black text-[#374151] min-w-0">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{c.sourceWarehouseName}</span>
          </span>
          <ArrowRight className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="flex items-center gap-1 text-xs font-black text-violet-700 min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{c.destWarehouseName || "Manzil ko'rsatilmagan"}</span>
          </span>
        </div>
        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
          isPartial
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-blue-50 text-blue-600 border-blue-200"
        }`}>
          {isPartial ? `Qisman qabul ${c.receivedPercent}%` : "Yo'lda"}
        </span>
      </div>

      {/* Meta */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Truck className="w-3.5 h-3.5" /> Fura: <strong className="font-mono text-foreground">{c.vehicleNumber}</strong>
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <IdCard className="w-3.5 h-3.5" /> Mijoz: <strong className="font-mono text-violet-700">{c.clientCode}</strong>
            {c.clientName ? <span className="text-foreground"> — {c.clientName}</span> : null}
          </span>
          {c.clientPhone && (
            <span className="text-xs text-muted-foreground">Tel: <strong className="text-foreground">{c.clientPhone}</strong></span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {c.date}
          </span>
          {c.photoCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> {c.photoCount}
            </span>
          )}
        </div>
        {c.note && <p className="text-[11px] italic text-muted-foreground">Izoh: {c.note}</p>}

        {/* Products */}
        {c.products.length > 0 && (
          <div className="mt-1.5 rounded-xl border border-border/60 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
              <span>Tovar</span><span className="text-right">Soni</span><span className="text-right">Joy</span><span className="text-right">Brutto</span><span className="text-right">Hajm</span>
            </div>
            {c.products.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[11px] border-t border-border/40 items-center">
                <span className="font-bold text-foreground truncate">
                  {p.name}
                  {p.sharePercent < 100 && <span className="text-amber-600 font-medium"> · {p.sharePercent}%</span>}
                </span>
                <span className="text-right text-foreground font-medium">{p.soni}</span>
                <span className="text-right text-muted-foreground">{p.joys}</span>
                <span className="text-right text-muted-foreground">{p.brutto} kg</span>
                <span className="text-right text-muted-foreground">{p.vol} m³</span>
              </div>
            ))}
          </div>
        )}

        {/* Totals: dispatched vs still in transit */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl border border-border/60 bg-slate-50/70 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1">Jo'natilgan (jami)</p>
            <p className="text-[11px] text-foreground font-bold">
              {c.totals.soni} dona · {c.totals.joys} joy · {c.totals.brutto} kg · {c.totals.vol} m³
            </p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-1">Hozir yo'lda</p>
            <p className="text-[11px] text-violet-700 font-bold">
              {c.inTransitTotals.soni} dona · {c.inTransitTotals.joys} joy · {c.inTransitTotals.brutto} kg · {c.inTransitTotals.vol} m³
            </p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/50 mt-1">Chiqim vaqti: {fmtDateTime(c.createdAt)}</p>
      </div>
    </div>
  );
}
