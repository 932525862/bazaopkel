import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Package,
  MapPin,
  ChevronRight,
  Globe,
  Building2,
  Shield,
  Warehouse as WarehouseIcon,
  Users,
  Truck,
  AlertTriangle,
  Search,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { WarehouseDetailModal } from "@/components/WarehouseDetailModal";
import { InTransitCargoPanel } from "@/components/InTransitCargoPanel";
import { DamagedCargoPanel } from "@/components/DamagedCargoPanel";
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getAllWarehouseDamages,
  type Warehouse,
  type WarehouseType,
} from "@/lib/warehouse";
import { getInTransitCargo } from "@/lib/warehouse-transit";

// ─────────────────────────────────────────────────────────────
// Ombor turlari meta — LOGISTIKA ZANJIRI tartibida (order):
// Yaratuvchi → Chegara → O'rta ombor → O'rta mijoz → Chiqaruvchi.
// Ranglar loyihaning mavjud palitrasidan o'zgarishsiz saqlangan.
// ─────────────────────────────────────────────────────────────
const WAREHOUSE_TYPE_META: Record<
  WarehouseType,
  {
    badge: string;
    icon: typeof Globe;
    wrap: string;
    text: string;
    accent: string; // karta chap chizig'i
    dot: string;
    order: number;
    sub: string;
  }
> = {
  china:      { badge: "Yaratuvchi",  icon: Globe,         wrap: "bg-orange-500/10 text-orange-500", text: "bg-orange-500/10 text-orange-500", accent: "border-l-orange-400", dot: "bg-orange-400", order: 1, sub: "Tovar kirim wizardi, fura chiqim" },
  chegara:    { badge: "Chegara",     icon: Shield,        wrap: "bg-violet-600/10 text-violet-600", text: "bg-violet-600/10 text-violet-600", accent: "border-l-violet-500", dot: "bg-violet-500", order: 2, sub: "Fura qabul va uzatish" },
  ortaOmbor:  { badge: "O'rta ombor", icon: WarehouseIcon, wrap: "bg-amber-500/10 text-amber-600",   text: "bg-amber-500/10 text-amber-600",   accent: "border-l-amber-500",  dot: "bg-amber-500",  order: 3, sub: "Fura qabul, fura chiqim" },
  ortaMijoz:  { badge: "O'rta mijoz", icon: Users,         wrap: "bg-teal-600/10 text-teal-600",     text: "bg-teal-600/10 text-teal-600",     accent: "border-l-teal-500",   dot: "bg-teal-500",   order: 4, sub: "Fura qabul, mijoz ID yoki omborga o'tkazish" },
  uzbekistan: { badge: "Chiqaruvchi", icon: Building2,     wrap: "bg-blue-600/10 text-blue-600",     text: "bg-blue-600/10 text-blue-600",     accent: "border-l-blue-500",   dot: "bg-blue-500",   order: 5, sub: "Fura qabul, mijoz ID bo'yicha chiqim" },
};

const TYPE_ORDER = (Object.entries(WAREHOUSE_TYPE_META) as [WarehouseType, (typeof WAREHOUSE_TYPE_META)[WarehouseType]][])
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

export function WarehousePage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<WarehouseType>("china");

  const [showTransit, setShowTransit] = useState(false);
  const [showDamaged, setShowDamaged] = useState(false);
  const [transitCount, setTransitCount] = useState<number | null>(null);
  const [damagedCount, setDamagedCount] = useState<number | null>(null);

  // Qidiruv va tur filtri — omborlar ko'payganda tez topish uchun
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<WarehouseType | "all">("all");

  const refresh = async () => {
    try {
      setWarehouses(await getWarehouses());
    } catch (err: any) {
      toast.error(err?.message || "Omborlarni yuklashda xatolik");
    }
  };

  const refreshCounts = async () => {
    try {
      const data = await getInTransitCargo();
      setTransitCount(data.totals.trucks);
    } catch {
      /* jimgina — sanoq bo'lmasa tugma baribir ishlaydi */
    }
    try {
      const damages = await getAllWarehouseDamages();
      setDamagedCount(damages.length);
    } catch {
      /* jimgina */
    }
  };

  useEffect(() => {
    refresh();
    refreshCounts();
  }, []);

  const openCreate = () => {
    setEditingWarehouse(null);
    setFormName("");
    setFormAddress("");
    setFormDescription("");
    setFormType("china");
    setShowForm(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingWarehouse(w);
    setFormName(w.name);
    setFormAddress(w.address || "");
    setFormDescription(w.description || "");
    setFormType(w.type ?? "china");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast.error("Ombor nomini kiriting");
      return;
    }
    try {
      if (editingWarehouse) {
        await updateWarehouse(editingWarehouse.id, {
          name: formName.trim(),
          address: formAddress.trim() || undefined,
          description: formDescription.trim() || undefined,
          type: formType,
        });
        toast.success("Ombor yangilandi");
      } else {
        await createWarehouse({
          name: formName.trim(),
          address: formAddress.trim() || undefined,
          description: formDescription.trim() || undefined,
          type: formType,
        });
        toast.success("Ombor yaratildi");
      }
      setShowForm(false);
      refresh();
    } catch (err: any) {
      // Xato bo'lsa forma OCHIQ qoladi — kiritilgan ma'lumot yo'qolmaydi
      toast.error(err?.message || "Saqlashda xatolik");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteWarehouse(deleteId);
      toast.success("Ombor o'chirildi");
    } catch (err: any) {
      toast.error(err?.message || "O'chirishda xatolik");
    } finally {
      setDeleteId(null);
      refresh();
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  // Qidiruv + filtr qo'llangan ro'yxat
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return warehouses.filter(w => {
      if (typeFilter !== "all" && (w.type ?? "china") !== typeFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        (w.address || "").toLowerCase().includes(q) ||
        (w.description || "").toLowerCase().includes(q)
      );
    });
  }, [warehouses, query, typeFilter]);

  // Logistika zanjiri tartibida guruhlash — jarayon oqimi ko'rinib turadi
  const groups = useMemo(() => {
    return TYPE_ORDER
      .map(type => ({
        type,
        meta: WAREHOUSE_TYPE_META[type],
        items: filtered.filter(w => (w.type ?? "china") === type),
      }))
      .filter(g => g.items.length > 0);
  }, [filtered]);

  // Faqat mavjud ombor turlarini filtr chip sifatida ko'rsatamiz
  const presentTypes = useMemo(() => {
    const s = new Set<WarehouseType>();
    warehouses.forEach(w => s.add(w.type ?? "china"));
    return TYPE_ORDER.filter(t => s.has(t));
  }, [warehouses]);

  const isSearchingOrFiltered = query.trim().length > 0 || typeFilter !== "all";

  return (
    <div className="p-5 md:p-8">
      {/* ── Sarlavha + asosiy amallar ── */}
      <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">Ombor</h1>
          <p className="text-muted-foreground mt-1.5 font-medium text-sm">
            Logistika zanjiri: yaratuvchidan chiqaruvchigacha — barcha omborlar bir joyda
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => { refresh(); refreshCounts(); }}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 hover:shadow-sm transition-all active:scale-95"
            title="Yangilash"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5" /> Yangi ombor
          </button>
        </div>
      </header>

      {/* ── Statistika kartalari — bosilganda tegishli bo'lim ochiladi ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <WarehouseIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-foreground leading-none">{warehouses.length || "—"}</p>
            <p className="text-[11px] text-muted-foreground font-bold mt-1.5">Jami omborlar</p>
          </div>
        </div>

        <button
          onClick={() => setShowTransit(true)}
          className="rounded-2xl border border-violet-200 bg-violet-50/60 px-5 py-4 flex items-center gap-4 text-left hover:bg-violet-50 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100 transition-all active:scale-[0.99] group"
        >
          <div className="w-12 h-12 rounded-2xl bg-violet-600/10 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-violet-700 leading-none">{transitCount ?? "—"}</p>
            <p className="text-[11px] text-violet-600/70 font-bold mt-1.5">Yo'ldagi furalar</p>
          </div>
          <ChevronRight className="w-4 h-4 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>

        <button
          onClick={() => setShowDamaged(true)}
          className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4 flex items-center gap-4 text-left hover:bg-amber-50 hover:border-amber-300 hover:shadow-md hover:shadow-amber-100 transition-all active:scale-[0.99] group"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-amber-700 leading-none">{damagedCount ?? "—"}</p>
            <p className="text-[11px] text-amber-600/70 font-bold mt-1.5">Qabul qilinmagan yuklar</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </div>

      {/* ── Qidiruv + tur filtri ── */}
      {warehouses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-muted-foreground/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ombor nomi, manzil bo'yicha qidirish..."
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
                typeFilter === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              Barchasi ({warehouses.length})
            </button>
            {presentTypes.map(t => {
              const m = WAREHOUSE_TYPE_META[t];
              const count = warehouses.filter(w => (w.type ?? "china") === t).length;
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(active ? "all" : t)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
                    active
                      ? `${m.text} border-current`
                      : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${m.dot}`} />
                  {m.badge} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Ro'yxat ── */}
      {warehouses.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-[32px] p-16 md:p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-8 text-muted-foreground/30">
            <Package className="w-12 h-12" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">Omborlar mavjud emas</h3>
          <p className="text-muted-foreground max-w-sm mx-auto font-medium">
            Hali birorta ham ombor qo'shilmagan.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-16 text-center">
          <Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-sm font-bold text-muted-foreground">Qidiruvga mos ombor topilmadi</p>
          <button
            onClick={() => { setQuery(""); setTypeFilter("all"); }}
            className="mt-3 text-xs font-black text-primary hover:underline"
          >
            Filtrlarni tozalash
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g, gi) => (
            <section key={g.type}>
              {/* Guruh sarlavhasi — zanjir bosqichi sifatida */}
              <div className="flex items-center gap-2.5 mb-3.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${g.meta.wrap}`}>
                  <g.meta.icon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                  {g.meta.badge}
                </h2>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${g.meta.text}`}>
                  {g.items.length}
                </span>
                <span className="hidden md:inline text-[11px] text-muted-foreground/60 font-medium">
                  · {g.meta.sub}
                </span>
                {!isSearchingOrFiltered && gi < groups.length - 1 && (
                  <span className="hidden lg:flex items-center gap-1 ml-auto text-[10px] font-bold text-muted-foreground/40">
                    keyingi bosqich <ArrowRight className="w-3 h-3" />
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map(w => (
                  <div
                    key={w.id}
                    onClick={() => setSelectedWarehouse(w)}
                    className={`bg-card rounded-2xl border border-border/60 border-l-4 ${g.meta.accent} p-5 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 cursor-pointer group`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${g.meta.wrap}`}>
                        <g.meta.icon className="w-5.5 h-5.5" />
                      </div>
                      <div className="flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(w); }}
                          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                          title="Tahrirlash"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteId(w.id); }}
                          className="p-2 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-black text-foreground leading-tight group-hover:text-primary transition-colors truncate">
                        {w.name}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${g.meta.text}`}>
                        {g.meta.badge}
                      </span>
                    </div>

                    {w.address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground mb-1.5">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/50" />
                        <span className="truncate">{w.address}</span>
                      </div>
                    )}

                    {w.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{w.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-border/40">
                      <p className="text-[11px] text-muted-foreground/50 font-medium">
                        {formatDate(w.createdAt)}
                      </p>
                      <div className="flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Ochish <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-lg font-black text-foreground">
                {editingWarehouse ? "Omborni tahrirlash" : "Yangi ombor"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Ombor nomi <span className="text-destructive">*</span>
                </label>
                <input
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Masalan: Asosiy ombor"
                  className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Manzil
                </label>
                <input
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Shahar, ko'cha, uy raqami..."
                  className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Tavsif
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Qo'shimcha ma'lumot..."
                  rows={2}
                  className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Warehouse type selector — zanjir tartibida */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Ombor turi <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
                  {TYPE_ORDER.filter(t => t !== "chegara").map(value => {
                    const m = WAREHOUSE_TYPE_META[value];
                    const active = formType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormType(value)}
                        className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          active ? "bg-primary/5" : "bg-background hover:bg-secondary/50"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot} ${active ? "opacity-100" : "opacity-30"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold leading-tight ${active ? "text-foreground" : "text-muted-foreground"}`}>
                            {m.badge === "Yaratuvchi" ? "Yaratuvchi ombor" : m.badge === "Chiqaruvchi" ? "Chiqaruvchi ombor" : m.badge === "O'rta mijoz" ? "O'rta mijoz ombori" : m.badge}
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-medium">
                            {m.sub}
                          </p>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            active ? "border-primary bg-primary" : "border-muted-foreground/30"
                          }`}
                        >
                          {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border">
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-black hover:bg-primary/90 transition-colors"
              >
                {editingWarehouse ? "Saqlash" : "Yaratish"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Bekor
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Omborni o'chirish"
        description="Ushbu omborni o'chirishni tasdiqlaysizmi? Bu harakatni ortga qaytarib bo'lmaydi."
        confirmLabel="O'chirish"
        tone="destructive"
      />

      {selectedWarehouse && (
        <WarehouseDetailModal
          warehouse={selectedWarehouse}
          onClose={() => {
            setSelectedWarehouse(null);
            refreshCounts();
          }}
        />
      )}

      {showTransit && (
        <InTransitCargoPanel
          onClose={() => {
            setShowTransit(false);
            refreshCounts();
          }}
        />
      )}

      {showDamaged && (
        <DamagedCargoPanel
          onClose={() => {
            setShowDamaged(false);
            refreshCounts();
          }}
        />
      )}
    </div>
  );
}
