import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft, ChevronDown, ChevronUp, Search, Pencil, Check, X as XIcon, Lock,
  ArrowDownCircle, ArrowUpCircle, Truck, CheckSquare, Building2,
  IdCard, Trash2, Share2, Archive as ArchiveIcon, Download,
} from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import {
  getWarehouseArchive,
  updateWarehouseArchiveEntry,
  type Warehouse,
  type WarehouseArchiveEntry,
} from "@/lib/warehouse";
import { exportWarehouseKirim, exportWarehouseChiqim, exportWarehouseSelected } from "@/lib/warehouse-excel";

/**
 * OMBOR ARXIVI PANELI — o'chirib bo'lmaydigan tarix.
 * - Har bir ombor uchun serverda saqlanadigan hodisalar jurnali
 * - O'chirish YO'Q (hech kimga, direktor uchun ham)
 * - Tahrirlash (izoh): faqat direktor yoki "arxivni tahrirlash" huquqi bor hodim
 */

const EVENT_META: Record<string, { label: string; icon: typeof Truck; cls: string }> = {
  KIRIM_CREATED:          { label: "Kirim",               icon: ArrowDownCircle, cls: "bg-blue-50 text-blue-600 border-blue-200" },
  CHIQIM_SENT:            { label: "Yo'lga chiqdi",       icon: Truck,           cls: "bg-amber-50 text-amber-600 border-amber-200" },
  TRUCK_RECEIVED:         { label: "Fura qabul qilindi",  icon: CheckSquare,     cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  TRUCK_PARTIAL_RECEIVED: { label: "Qisman qabul",        icon: CheckSquare,     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  CHIQIM_DELIVERED:       { label: "Yetkazildi",          icon: CheckSquare,     cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  REMAINDER_FORWARDED:    { label: "Qoldiq yo'naltirildi", icon: Share2,         cls: "bg-violet-50 text-violet-600 border-violet-200" },
  TRANSFER_SENT:          { label: "O'tkazma",            icon: Building2,       cls: "bg-blue-50 text-blue-600 border-blue-200" },
  TRANSFER_RECEIVED:      { label: "O'tkazma qabul",      icon: CheckSquare,     cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  DISPATCH_TO_CLIENT:     { label: "Mijozga chiqim",      icon: IdCard,          cls: "bg-teal-50 text-teal-600 border-teal-200" },
  RECORD_DELETED:         { label: "Yozuv o'chirildi",    icon: Trash2,          cls: "bg-red-50 text-red-600 border-red-200" },
  RECORD_EDITED:          { label: "Tahrirlandi",         icon: Pencil,          cls: "bg-sky-50 text-sky-600 border-sky-200" },
};

const FILTERS: { key: string; label: string; events: string[] }[] = [
  { key: "all",      label: "Barchasi",   events: [] },
  { key: "kirim",    label: "Kirim",      events: ["KIRIM_CREATED", "TRUCK_RECEIVED", "TRUCK_PARTIAL_RECEIVED", "TRANSFER_RECEIVED"] },
  { key: "chiqim",   label: "Chiqim",     events: ["CHIQIM_SENT", "DISPATCH_TO_CLIENT", "TRANSFER_SENT", "REMAINDER_FORWARDED"] },
  { key: "delivered", label: "Yetkazildi", events: ["CHIQIM_DELIVERED"] },
  { key: "deleted",  label: "O'chirilgan", events: ["RECORD_DELETED"] },
];

// ── "Batafsil" bo'limi uchun yordamchi bloklar ──

function TotalsGrid({ totals }: { totals: any }) {
  if (!totals) return null;
  const cells = [
    { label: "Joy", val: totals.joys },
    { label: "Soni", val: totals.quantity ?? totals.qty },
    { label: "Brutto (kg)", val: totals.bruttoKg },
    { label: "Hajm (m³)", val: totals.volumeM3 ?? totals.vol },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 mt-1.5">
      {cells.map(c => (
        <div key={c.label} className="text-center bg-[#F8F9FC] border border-[#EEF0F5] rounded-lg py-1.5">
          <p className="text-xs font-black text-[#005AB5]">{(c.val ?? 0) || "—"}</p>
          <p className="text-[8px] text-[#9CA3AF] font-bold uppercase tracking-wider mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Bitta yukning to'liq snapshoti: mijoz, fura, tovarlar ro'yxati, jami */
function CargoBlock({ cargo, ratio }: { cargo: any; ratio?: number }) {
  if (!cargo) return null;
  return (
    <div className="bg-white border border-[#EEF0F5] rounded-lg p-2 mt-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {cargo.clientCode && (
          <span className="text-[10px] text-[#6B7280]">
            Mijoz: <strong className="font-mono text-[#005AB5]">{cargo.clientCode}</strong>
            {cargo.clientName ? <span className="text-[#374151]"> — {cargo.clientName}</span> : null}
          </span>
        )}
        {cargo.clientPhone && <span className="text-[10px] text-[#6B7280]">Tel: <strong className="text-[#374151]">{cargo.clientPhone}</strong></span>}
        {cargo.vehicleNumber && <span className="text-[10px] text-[#6B7280]">Fura: <strong className="font-mono text-[#374151]">{cargo.vehicleNumber}</strong></span>}
        {cargo.date && <span className="text-[10px] text-[#6B7280]">Sana: <strong className="text-[#374151]">{String(cargo.date).slice(0, 10)}</strong></span>}
        {typeof ratio === "number" && ratio < 0.9995 && (
          <span className="text-[10px] font-bold text-amber-600">{Math.round(ratio * 100)}% ulush</span>
        )}
      </div>
      {Array.isArray(cargo.products) && cargo.products.length > 0 && (
        <div className="mt-1.5 space-y-1">
          <p className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-wider">Tovarlar ({cargo.products.length} ta)</p>
          {cargo.products.map((pr: any, i: number) => (
            <div key={i} className="bg-[#F8F9FC] rounded-md px-2 py-1.5">
              <p className="text-[10px] font-bold text-[#374151] leading-snug">
                {i + 1}. {pr.name}
                {typeof pr.sharePercent === "number" && pr.sharePercent < 100 && (
                  <span className="text-amber-600"> · {pr.sharePercent}% qismi</span>
                )}
              </p>
              <p className="text-[9px] text-[#9CA3AF] mt-0.5">
                {pr.joys ?? 0} joy · {pr.quantity ?? 0} dona · {pr.bruttoKg ?? 0} kg · {pr.volumeM3 ?? 0} m³
              </p>
              {pr.note && <p className="text-[9px] italic text-[#9CA3AF]">{pr.note}</p>}
            </div>
          ))}
        </div>
      )}
      <TotalsGrid totals={cargo.totals} />
      {cargo.note && <p className="text-[9px] italic text-[#9CA3AF] mt-1">Izoh: {cargo.note}</p>}
    </div>
  );
}

interface Props {
  warehouse: Warehouse;
  onClose: () => void;
}

export function WarehouseArchivePanel({ warehouse, onClose }: Props) {
  const [entries, setEntries] = useState<WarehouseArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  // "Batafsil" ochiq yozuvlar
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Excelga faqat tanlangan yozuvlarni yuklab olish uchun belgilash
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const clearSelection = () => setSelectedIds(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const list = await getWarehouseArchive(warehouse.id);
      setEntries(list);
    } catch (err: any) {
      toast.error(err?.message || "Arxivni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    API.me()
      .then((me: any) => {
        const isDirector = String(me?.role || "").toUpperCase() === "DIRECTOR";
        setCanEdit(isDirector || !!me?.canEditWarehouseArchive);
      })
      .catch(() => setCanEdit(false));
  }, [warehouse.id]);

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter);
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (f && f.events.length > 0 && !f.events.includes(e.eventType)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q) ||
        (e.createdByName ?? "").toLowerCase().includes(q) ||
        JSON.stringify(e.details ?? {}).toLowerCase().includes(q)
      );
    });
  }, [entries, filter, query]);

  const startEdit = (e: WarehouseArchiveEntry) => {
    setEditingId(e.id);
    setEditNote(e.note ?? "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateWarehouseArchiveEntry(editingId, { note: editNote.trim() || null });
      toast.success("Izoh saqlandi");
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Saqlashda xatolik (huquqingiz bo'lmasligi mumkin)");
    } finally {
      setSaving(false);
    }
  };

  const fmtDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const handleExportKirim = () => {
    try {
      const n = exportWarehouseKirim(warehouse.name, entries);
      if (n === 0) toast.info("Kirim yozuvlari topilmadi");
      else toast.success(`Kirim Excel yuklab olindi (${n} ta yozuv)`);
    } catch (err: any) {
      toast.error(err?.message || "Excel yaratishda xatolik");
    }
  };

  const handleExportChiqim = () => {
    try {
      const n = exportWarehouseChiqim(warehouse.name, entries);
      if (n === 0) toast.info("Chiqim yozuvlari topilmadi");
      else toast.success(`Chiqim Excel yuklab olindi (${n} ta yozuv)`);
    } catch (err: any) {
      toast.error(err?.message || "Excel yaratishda xatolik");
    }
  };

  const handleExportSelected = () => {
    // `entries`dan olamiz (`filtered`dan emas) — qidiruv/filtr keyinroq o'zgarsa ham,
    // avval belgilangan yozuv tanlovdan chiqib qolmasin
    const selected = entries.filter(e => selectedIds.has(e.id));
    if (selected.length === 0) {
      toast.info("Hech narsa tanlanmagan");
      return;
    }
    try {
      const n = exportWarehouseSelected(warehouse.name, selected);
      toast.success(`${n} ta tanlangan yozuv Excelga yuklandi`);
      clearSelection();
    } catch (err: any) {
      toast.error(err?.message || "Excel yaratishda xatolik");
    }
  };

  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map(e => e.id)));

  return (
    <div className="fixed inset-0 z-[70] bg-[#F5F6FA] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#DDE1EA] bg-white shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
          <ArchiveIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-black text-foreground truncate">Ombor arxivi — {warehouse.name}</h1>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Lock className="w-3 h-3 shrink-0" />
            O'chirib bo'lmaydigan tarix · {canEdit ? "Tahrirlash huquqingiz bor" : "Faqat ko'rish"}
          </p>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-black shrink-0">
          {entries.length} ta yozuv
        </span>
      </div>

      {/* Search + filters */}
      <div className="px-4 py-3 bg-white border-b border-[#EEF0F5] shrink-0 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Mijoz, fura, izoh bo'yicha qidirish..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDE1EA] bg-[#F8F9FC] text-sm focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5]"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap border transition-all ${
                filter === f.key
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-[#6B7280] border-[#DDE1EA] hover:border-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Excel yuklab olish — hammasi (kirim/chiqim) yoki faqat belgilangan yozuvlar */}
        <div className="flex gap-2">
          <button
            onClick={handleExportKirim}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Hammasi — Kirim Excel
          </button>
          <button
            onClick={handleExportChiqim}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Hammasi — Chiqim Excel
          </button>
        </div>

        {/* Belgilash orqali faqat kerakli yozuvlarni (masalan 3-4 ta fura) yuklab olish */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={selectAllFiltered}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-[#DDE1EA] bg-white text-[#6B7280] hover:bg-[#F5F6FA] disabled:opacity-50 transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Ko'rinayotganlarni tanlash ({filtered.length})
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-[11px] font-black text-[#005AB5]">{selectedIds.size} ta tanlandi</span>
                <button
                  onClick={handleExportSelected}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Tanlanganlarni yuklab olish
                </button>
                <button
                  onClick={clearSelection}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  <XIcon className="w-3 h-3" /> Bekor qilish
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="py-20 text-center text-sm font-bold text-[#9CA3AF]">Yuklanmoqda...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDE1EA] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <ArchiveIcon className="w-8 h-8 text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-bold text-[#9CA3AF]">
              {entries.length === 0 ? "Arxiv hali bo'sh" : "Qidiruvga mos yozuv topilmadi"}
            </p>
            <p className="text-xs text-[#C4C9D4] mt-1">Ombor hodisalari shu yerda saqlanadi</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {filtered.map(e => {
              const meta = EVENT_META[e.eventType] ?? { label: e.eventType, icon: ArrowUpCircle, cls: "bg-slate-50 text-slate-600 border-slate-200" };
              const Icon = meta.icon;
              const isEditing = editingId === e.id;
              const d = e.details ?? {};
              const hasMore = !!(
                d.cargo ||
                (Array.isArray(d.cargos) && d.cargos.length) ||
                (Array.isArray(d.items) && d.items.length) ||
                (Array.isArray(d.products) && d.products.length)
              );
              const expanded = expandedIds.has(e.id);
              const isSelected = selectedIds.has(e.id);
              return (
                <div key={e.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isSelected ? "border-[#005AB5] ring-1 ring-[#005AB5]/30" : "border-[#DDE1EA]"}`}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(e.id)}
                      title="Excelga yuklab olish uchun tanlash"
                      className="mt-2.5 w-4 h-4 shrink-0 accent-[#005AB5] cursor-pointer"
                    />
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${meta.cls}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-[#9CA3AF] font-medium">{fmtDateTime(e.createdAt)}</span>
                        {e.createdByName && (
                          <span className="text-[10px] text-[#6B7280] font-bold">· {e.createdByName}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-[#111827] mt-1 leading-snug">{e.title}</p>

                      {/* Muhim detallar */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {d.clientCode && (
                          <span className="text-[10px] text-[#6B7280]">Mijoz: <strong className="font-mono text-[#005AB5]">{d.clientCode}</strong></span>
                        )}
                        {d.vehicleNumber && (
                          <span className="text-[10px] text-[#6B7280]">Fura: <strong className="font-mono">{d.vehicleNumber}</strong></span>
                        )}
                        {typeof d.productCount === "number" && d.productCount > 0 && (
                          <span className="text-[10px] text-[#6B7280]">Tovar: <strong>{d.productCount} ta</strong></span>
                        )}
                        {typeof d.ratio === "number" && d.ratio < 1 && (
                          <span className="text-[10px] text-amber-600 font-bold">{Math.round(d.ratio * 100)}% qabul qilingan</span>
                        )}
                        {d.destWarehouseName && (
                          <span className="text-[10px] text-[#6B7280]">→ <strong>{d.destWarehouseName}</strong></span>
                        )}
                        {d.sourceWarehouseName && (
                          <span className="text-[10px] text-[#6B7280]">Manba: <strong>{d.sourceWarehouseName}</strong></span>
                        )}
                        {d.forwardWarehouseName && (
                          <span className="text-[10px] text-violet-600 font-bold">Qoldiq → {d.forwardWarehouseName}</span>
                        )}
                      </div>

                      {/* Batafsil (show more) — yukning to'liq ma'lumoti */}
                      {hasMore && (
                        <button
                          onClick={() => toggleExpand(e.id)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-[#005AB5] hover:text-[#004A96] transition-colors"
                        >
                          {expanded
                            ? <><ChevronUp className="w-3 h-3" /> Yopish</>
                            : <><ChevronDown className="w-3 h-3" /> Batafsil ma'lumot</>}
                        </button>
                      )}
                      {expanded && (
                        <div className="mt-0.5">
                          {d.cargo && <CargoBlock cargo={d.cargo} ratio={typeof d.ratio === "number" ? d.ratio : undefined} />}
                          {Array.isArray(d.cargos) && d.cargos.map((c: any, i: number) => (
                            <CargoBlock key={i} cargo={c} ratio={typeof c.ratio === "number" ? c.ratio : undefined} />
                          ))}
                          {Array.isArray(d.items) && d.items.map((it: any, i: number) => (
                            <div key={i}>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {it.clientCode && (
                                  <span className="text-[10px] font-black font-mono text-[#005AB5] bg-[#EFF6FF] px-1.5 py-0.5 rounded">{it.clientCode}</span>
                                )}
                                {it.clientName && <span className="text-[10px] text-[#6B7280]">{it.clientName}</span>}
                                {typeof it.ratio === "number" && (
                                  <span className={`text-[10px] font-bold ${it.ratio < 0.9995 ? "text-amber-600" : "text-emerald-600"}`}>
                                    {Math.round(it.ratio * 100)}% qabul qilindi
                                  </span>
                                )}
                                {it.forwardWarehouseName && (
                                  <span className="text-[10px] font-bold text-violet-600">qoldiq → {it.forwardWarehouseName}</span>
                                )}
                              </div>
                              {it.cargo && <CargoBlock cargo={it.cargo} ratio={typeof it.ratio === "number" ? it.ratio : undefined} />}
                            </div>
                          ))}
                          {Array.isArray(d.products) && d.products.length > 0 && !d.cargo && (
                            <CargoBlock cargo={{
                              products: d.products,
                              totals: d.totals,
                              clientCode: d.clientCode,
                              clientName: d.clientName,
                              clientPhone: d.clientPhone,
                              date: d.date,
                            }} />
                          )}
                        </div>
                      )}

                      {/* Izoh */}
                      {isEditing ? (
                        <div className="mt-2 space-y-1.5">
                          <textarea
                            value={editNote}
                            onChange={ev => setEditNote(ev.target.value)}
                            rows={2}
                            placeholder="Izoh..."
                            autoFocus
                            className="w-full px-3 py-2 rounded-lg border border-[#BFDBFE] bg-[#F8FAFF] text-xs focus:outline-none focus:ring-2 focus:ring-[#005AB5]/20 focus:border-[#005AB5] resize-none"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#005AB5] text-white text-[11px] font-black hover:bg-[#004A96] disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3 h-3" /> {saving ? "..." : "Saqlash"}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DDE1EA] text-[#6B7280] text-[11px] font-bold hover:bg-[#F5F6FA] transition-colors"
                            >
                              <XIcon className="w-3 h-3" /> Bekor
                            </button>
                          </div>
                        </div>
                      ) : e.note ? (
                        <p className="text-[11px] text-[#6B7280] italic mt-1.5 bg-[#F8F9FC] border border-[#EEF0F5] rounded-lg px-2.5 py-1.5">
                          {e.note}
                        </p>
                      ) : null}

                      {e.editedByName && e.editedAt && !isEditing && (
                        <p className="text-[9px] text-[#C4C9D4] mt-1">
                          Tahrirlangan: {e.editedByName} · {fmtDateTime(e.editedAt)}
                        </p>
                      )}
                    </div>

                    {/* Edit tugmasi — faqat huquqi borlarga. O'chirish tugmasi YO'Q. */}
                    {canEdit && !isEditing && (
                      <button
                        onClick={() => startEdit(e)}
                        title="Izohni tahrirlash"
                        className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#005AB5] hover:bg-[#EFF6FF] transition-colors shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
