import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { WarehouseDetailModal } from "@/components/WarehouseDetailModal";
import { InTransitCargoPanel } from "@/components/InTransitCargoPanel";
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  type Warehouse,
  type WarehouseType,
} from "@/lib/warehouse";
import { getInTransitCargo } from "@/lib/warehouse-transit";


const WAREHOUSE_TYPE_META: Record<WarehouseType, { badge: string; icon: typeof Globe; wrap: string; text: string }> = {
  china:      { badge: "Yaratuvchi",  icon: Globe,        wrap: "bg-orange-500/10 text-orange-500", text: "bg-orange-500/10 text-orange-500" },
  uzbekistan: { badge: "Chiqaruvchi", icon: Building2,    wrap: "bg-blue-600/10 text-blue-600",      text: "bg-blue-600/10 text-blue-600" },
  chegara:    { badge: "Chegara",     icon: Shield,       wrap: "bg-violet-600/10 text-violet-600",  text: "bg-violet-600/10 text-violet-600" },
  ortaOmbor:  { badge: "O'rta ombor", icon: WarehouseIcon, wrap: "bg-amber-500/10 text-amber-600",   text: "bg-amber-500/10 text-amber-600" },
  ortaMijoz:  { badge: "O'rta mijoz", icon: Users,        wrap: "bg-teal-600/10 text-teal-600",      text: "bg-teal-600/10 text-teal-600" },
};

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
  const [transitCount, setTransitCount] = useState<number | null>(null);

  const refresh = async () => setWarehouses(await getWarehouses());

  const refreshTransitCount = async () => {
    try {
      const data = await getInTransitCargo();
      setTransitCount(data.totals.trucks);
    } catch {
      /* jimgina — sanoq bo'lmasa tugma baribir ishlaydi */
    }
  };

  useEffect(() => {
    refresh();
    refreshTransitCount();
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
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteWarehouse(deleteId);
    toast.success("Ombor o'chirildi");
    setDeleteId(null);
    refresh();
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

  return (
    <div className="p-6 md:p-10">
      <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Ombor</h1>
          <p className="text-muted-foreground mt-2 font-medium">Omborlarni boshqarish</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={refresh}
            className="p-4 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 hover:shadow-sm transition-all active:scale-95"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowTransit(true)}
            className="relative inline-flex items-center gap-2.5 px-6 py-4 rounded-2xl border border-violet-300 bg-violet-50 text-violet-700 font-black hover:bg-violet-100 hover:border-violet-400 active:scale-[0.98] transition-all"
          >
            <Truck className="w-6 h-6" /> Yo'ldagi yuklar
            {transitCount !== null && transitCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-violet-600 text-white text-xs font-black">
                {transitCount}
              </span>
            )}
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-6 h-6" /> Yangi ombor
          </button>
        </div>
      </header>

      {warehouses.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-[48px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-8 text-muted-foreground/30">
            <Package className="w-12 h-12" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">Omborlar mavjud emas</h3>
          <p className="text-muted-foreground max-w-sm mx-auto font-medium">
            Hali birorta ham ombor qo'shilmagan.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((w) => {
            const meta = WAREHOUSE_TYPE_META[w.type ?? "china"];
            return (
            <div
              key={w.id}
              onClick={() => setSelectedWarehouse(w)}
              className="bg-card rounded-[28px] border border-border/60 p-6 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${meta.wrap}`}>
                  <meta.icon className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(w);
                    }}
                    className="p-2 rounded-xl border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(w.id);
                    }}
                    className="p-2 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xl font-black text-foreground leading-tight group-hover:text-primary transition-colors">
                  {w.name}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.text}`}>
                  {meta.badge}
                </span>
              </div>

              {w.address && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/50" />
                  <span>{w.address}</span>
                </div>
              )}

              {w.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{w.description}</p>
              )}

              <div className="flex items-center justify-between mt-4">
                <p className="text-[11px] text-muted-foreground/50 font-medium">
                  {formatDate(w.createdAt)}
                </p>
                <div className="flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Ochish <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border">
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

              {/* Warehouse type selector */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Ombor turi <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
                  {(
                    [
                      {
                        value: "china" as WarehouseType,
                        label: "Yaratuvchi ombor",
                        sub: "Tovar kirim wizardi, fura chiqim",
                        dot: "bg-orange-400",
                      },
                      {
                        value: "ortaOmbor" as WarehouseType,
                        label: "O'rta ombor",
                        sub: "Fura qabul, fura chiqim",
                        dot: "bg-amber-500",
                      },
                      {
                        value: "uzbekistan" as WarehouseType,
                        label: "Chiqaruvchi ombor",
                        sub: "Fura qabul, mijoz ID bo'yicha chiqim",
                        dot: "bg-blue-500",
                      },
                      {
                        value: "ortaMijoz" as WarehouseType,
                        label: "O'rta mijoz ombori",
                        sub: "Fura qabul, mijoz ID yoki omborga o'tkazish",
                        dot: "bg-teal-500",
                      },
                    ] as const
                  ).map(({ value, label, sub, dot }) => {
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
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot} ${active ? "opacity-100" : "opacity-30"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-bold leading-tight ${active ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {label}
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-medium">
                            {sub}
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
            refreshTransitCount();
          }}
        />
      )}

      {showTransit && (
        <InTransitCargoPanel
          onClose={() => {
            setShowTransit(false);
            refreshTransitCount();
          }}
        />
      )}
    </div>
  );
}
