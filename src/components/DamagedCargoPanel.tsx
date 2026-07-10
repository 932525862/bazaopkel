// ─────────────────────────────────────────────────────────────
// ZARARLANGAN YUKLAR — fura qabul qilishda qayd etilgan zarar tarixi.
// "Yo'ldagi yuklar" bo'limi ichidan ochiladi. Yozuvlar o'chirilmaydi —
// to'liq ma'lumot (fura, mijoz, manba/qabul ombori, tovarlar, sabab, kim
// qayd etgani) saqlanadi. Arxivdagidek belgilash (select) bilan Excel eksport.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronDown, Search, RefreshCw, AlertTriangle, Truck,
  Building2, MapPin, Clock, Boxes, Download, CheckSquare, Square, User,
} from "lucide-react";
import { toast } from "sonner";
import { getAllWarehouseDamages, type WarehouseDamageEntry } from "@/lib/warehouse";
import { exportDamagesExcel } from "@/lib/warehouse-excel";

interface Props {
  onClose: () => void;
}

export function DamagedCargoPanel({ onClose }: Props) {
  const [entries, setEntries] = useState<WarehouseDamageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Excelga faqat tanlangan yozuvlarni yuklab olish uchun belgilash (arxivdagidek)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await getAllWarehouseDamages());
    } catch (err: any) {
      toast.error(err?.message || "Zararlangan yuklarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Qabul qilgan ombor bo'yicha filtr variantlari
  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach(e => map.set(e.warehouseId, e.warehouseName || "Ombor"));
    return Array.from(map.entries());
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (warehouseId !== "all" && e.warehouseId !== warehouseId) return false;
      if (!q) return true;
      return (
        (e.vehicleNumber || "").toLowerCase().includes(q) ||
        (e.clientCode || "").toLowerCase().includes(q) ||
        (e.clientName || "").toLowerCase().includes(q) ||
        (e.warehouseName || "").toLowerCase().includes(q) ||
        (e.sourceWarehouseName || "").toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q) ||
        (e.products ?? []).some(p => (p.name || "").toLowerCase().includes(q))
      );
    });
  }, [entries, query, warehouseId]);

  const totals = useMemo(() => {
    const vehicles = new Set<string>();
    const clients = new Set<string>();
    let qty = 0;
    for (const e of filtered) {
      vehicles.add(e.vehicleNumber);
      if (e.clientCode) clients.add(e.clientCode);
      qty += Number(e.quantity) || 0;
    }
    return {
      records: filtered.length,
      qty: Math.round(qty * 100) / 100,
      vehicles: vehicles.size,
      clients: clients.size,
    };
  }, [filtered]);

  const allSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map(e => e.id)));
  };

  const handleExportAll = () => {
    if (filtered.length === 0) { toast.error("Eksport uchun yozuv yo'q"); return; }
    try {
      const n = exportDamagesExcel(filtered, "zararlangan_yuklar");
      toast.success(`Excel yuklab olindi (${n} ta yozuv)`);
    } catch (err: any) {
      toast.error(err?.message || "Excel yaratishda xatolik");
    }
  };

  const handleExportSelected = () => {
    const selected = filtered.filter(e => selectedIds.has(e.id));
    if (selected.length === 0) { toast.error("Avval yozuvlarni belgilang"); return; }
    try {
      const n = exportDamagesExcel(selected, "zararlangan_tanlangan");
      toast.success(`${n} ta tanlangan yozuv Excelga yuklandi`);
    } catch (err: any) {
      toast.error(err?.message || "Excel yaratishda xatolik");
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return String(iso ?? "").slice(0, 10); }
  };
  const fmtDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#F5F6FA] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#DDE1EA] bg-white shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black text-foreground truncate">Zararlangan yuklar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fura qabul qilishda aniqlangan zararlar — to'liq ma'lumot bilan, o'chirilmaydigan tarix
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-bold text-muted-foreground hover:text-amber-700 hover:border-amber-400 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Yangilash
        </button>
      </div>

      {/* Totals bar */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "Zarar yozuvlari", val: totals.records, accent: "text-amber-600" },
            { label: "Jami zarar (dona)", val: totals.qty, accent: "text-red-600" },
            { label: "Furalar", val: totals.vehicles, accent: "text-blue-600" },
            { label: "Mijozlar", val: totals.clients, accent: "text-blue-600" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border/60 bg-slate-50/70 px-3.5 py-2.5">
              <p className={`text-2xl font-black leading-none ${c.accent}`}>{c.val || "—"}</p>
              <p className="text-[11px] text-muted-foreground font-bold mt-1.5">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + Excel */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-[#EEF0F5] flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Fura, mijoz, ombor, tovar yoki sabab bo'yicha qidirish..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-[#F8F9FC] text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        {warehouseOptions.length > 0 && (
          <select
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-white text-sm font-bold text-[#374151] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="all">Barcha omborlar</option>
            {warehouseOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDE1EA] bg-white text-xs font-bold text-[#6B7280] hover:border-amber-400 hover:text-amber-700 transition-colors"
        >
          {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {allSelected ? "Belgilashni olish" : "Hammasini belgilash"}
        </button>
        {selectedIds.size > 0 ? (
          <button
            onClick={handleExportSelected}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Tanlanganlar Excel ({selectedIds.size})
          </button>
        ) : (
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-xs font-black hover:bg-amber-100 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Excel yuklab olish
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="py-24 text-center text-sm font-bold text-[#9CA3AF]">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <AlertTriangle className="w-8 h-8 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-bold text-[#9CA3AF]">
              {entries.length === 0 ? "Hozircha zarar yozuvlari yo'q" : "Filtrga mos yozuv topilmadi"}
            </p>
            <p className="text-xs text-[#C4C9D4] mt-1">
              Fura qabul qilishda «Zararlangan tovar bor» orqali kiritilgan zararlar shu yerda ko'rinadi
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto rounded-2xl border border-[#DDE1EA] bg-white shadow-sm divide-y divide-[#F1F2F6] overflow-hidden">
            {filtered.map(e => {
              const isOpen = expanded.has(e.id);
              const isSelected = selectedIds.has(e.id);
              return (
                <div key={e.id}>
                  <div className={`w-full flex items-center gap-2.5 px-4 py-2.5 ${isSelected ? "bg-amber-50/60" : ""}`}>
                    <button onClick={() => toggleSelect(e.id)} title="Excelga yuklab olish uchun belgilash" className="shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-amber-600" />
                        : <Square className="w-4 h-4 text-[#D1D5DB] hover:text-amber-400" />}
                    </button>
                    <button
                      onClick={() => toggleExpand(e.id)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                    >
                      <span className="text-xs font-black font-mono text-foreground shrink-0 w-23 truncate">{e.vehicleNumber}</span>
                      <span className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 w-32 truncate">
                        <Building2 className="w-3 h-3 shrink-0" /> {e.sourceWarehouseName || "—"}
                      </span>
                      <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                        <strong className="font-mono text-amber-700">{e.clientCode || "—"}</strong>
                        {e.clientName ? <span className="text-foreground"> — {e.clientName}</span> : null}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shrink-0">
                        {Number(e.quantity)} {e.unit || "dona"}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{fmtDate(e.receivedAt)}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-3.5 -mt-0.5">
                      <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 px-3.5 py-3 space-y-2">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" /> Manba: <strong className="text-foreground">{e.sourceWarehouseName || "—"}</strong>
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> Qabul ombori: <strong className="text-foreground">{e.warehouseName}</strong>
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" /> {e.vehicleNumber}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Qabul: {fmtDate(e.receivedAt)}
                          </span>
                        </div>

                        {/* Zarar sababi — to'liq ma'lumot */}
                        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-red-500 mb-1">
                            Zarar: {Number(e.quantity)} {e.unit || "dona"}
                          </p>
                          <p className="text-[11px] text-red-800 font-medium">{e.note}</p>
                        </div>

                        {/* Yukdagi tovarlar snapshoti */}
                        {(e.products ?? []).length > 0 && (
                          <div className="rounded-xl border border-border/60 bg-white overflow-hidden">
                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                              <span>Tovar</span><span className="text-right">Soni</span><span className="text-right">Joy</span><span className="text-right">Brutto</span><span className="text-right">Hajm</span>
                            </div>
                            {(e.products ?? []).map((p, i) => (
                              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[11px] border-t border-border/40 items-center">
                                <span className="font-bold text-foreground truncate">
                                  {p.name}
                                  {typeof p.sharePercent === "number" && p.sharePercent < 100 && (
                                    <span className="text-amber-600 font-medium"> · {p.sharePercent}%</span>
                                  )}
                                </span>
                                <span className="text-right text-foreground font-medium">{p.quantity ?? "—"}</span>
                                <span className="text-right text-muted-foreground">{p.joys ?? "—"}</span>
                                <span className="text-right text-muted-foreground">{p.bruttoKg ?? "—"} kg</span>
                                <span className="text-right text-muted-foreground">{p.volumeM3 ?? "—"} m³</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Yuk jami / zarar nisbati */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-border/60 bg-white px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1">Yukdagi jami</p>
                            <p className="text-[11px] text-foreground font-bold">
                              {e.cargoTotals?.quantity ?? "—"} dona · {e.cargoTotals?.joys ?? "—"} joy · {e.cargoTotals?.bruttoKg ?? "—"} kg · {e.cargoTotals?.volumeM3 ?? "—"} m³
                            </p>
                          </div>
                          <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-red-500 mb-1">Zararlangan</p>
                            <p className="text-[11px] text-red-700 font-bold">
                              {Number(e.quantity)} {e.unit || "dona"}
                              {e.cargoTotals?.quantity ? (
                                <span className="text-red-500/70"> · yukning {Math.round((Number(e.quantity) / Number(e.cargoTotals.quantity)) * 100)}%</span>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                          {e.createdByName && (
                            <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                              <User className="w-3 h-3" /> Qayd etdi: <strong>{e.createdByName}</strong>
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                            <Boxes className="w-3 h-3" /> Yozilgan vaqt: {fmtDateTime(e.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
