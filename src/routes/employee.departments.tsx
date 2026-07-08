import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAppState, useSession } from "@/lib/store";
import { FolderPlus, Pencil, Trash2, Archive, ArchiveRestore, X, Folder, Layers, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { ClientCategory } from "@/lib/types";

export const Route = createFileRoute("/employee/departments")({
  component: EmployeeDepartments,
});

function EmployeeDepartments() {
  const { state, update } = useAppState();
  const session = useSession();
  const [departments, setDepartments] = useState<ClientCategory[]>(state.categories || []);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editing, setEditing] = useState<ClientCategory | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  
  const [confirmingDelete, setConfirmingDelete] = useState<ClientCategory | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState<ClientCategory | null>(null);

  const fetchDeps = async () => {
    setLoading(true);
    try {
      const catsP = API.categories().catch((err) => {
        console.warn("Categories fetch failed:", err);
        return state.categories;
      });
      const clientsP = API.clients().catch((err) => {
        console.warn("Clients fetch failed:", err);
        return state.clients;
      });
      const [cats, clients] = await Promise.all([catsP, clientsP]);
      setDepartments(cats);
      update(s => ({ ...s, categories: cats, clients }));
    } catch (err) {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeps();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setActionLoading(true);
    try {
      if (editing) {
        await API.updateCategory(editing.id, name.trim());
        toast.success("Bo'lim yangilandi");
      } else {
        await API.createCategory({ name: name.trim() });
        toast.success("Yangi bo'lim qo'shildi");
      }
      setShowDialog(false);
      setName("");
      setEditing(null);
      await fetchDeps();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!confirmingArchive) return;
    setActionLoading(true);
    try {
      await API.toggleArchiveCategory(confirmingArchive.id);
      toast.success(confirmingArchive.isArchive ? "Bo'lim aktivlashtirildi" : "Bo'lim arxivlandi");
      await fetchDeps();
      setConfirmingArchive(null);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) return;
    setActionLoading(true);
    try {
      await API.deleteCategory(confirmingDelete.id);
      toast.success("Bo'lim o'chirildi");
      await fetchDeps();
      setConfirmingDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi. Bo'limda mijozlar bo'lishi mumkin.");
    } finally {
      setActionLoading(false);
    }
  };

  const visibleCats = departments.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  
  const departmentsWithStats = visibleCats.map(cat => {
    const inCat = state.clients.filter(c => c.categoryId === cat.id);
    return {
      ...cat,
      clientCount: inCat.length,
      soldCount: inCat.filter(c => c.sale?.status === "full").length,
    };
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-10 flex items-start justify-between flex-wrap gap-6 text-balance">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
             <Layers className="w-10 h-10 text-primary" /> Bo'limlar
          </h1>
          <p className="text-muted-foreground mt-1.5 font-medium">Lidlar oqimi va bo'limlar boshqaruvi</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDeps}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {session?.isActive !== false && session?.canAccessDepartments !== false && (
            <button
              onClick={() => { setEditing(null); setName(""); setShowDialog(true); }}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <FolderPlus className="w-5 h-5" /> Yangi bo'lim
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-6 mb-10">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Bo'lim nomini kiriting..."
            className="w-full pl-12 pr-4 py-4 rounded-[20px] border border-border bg-card focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all font-medium text-lg"
          />
        </div>
      </div>

      {loading && departments.length === 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-44 rounded-[28px] bg-secondary/40 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : departmentsWithStats.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[40px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-6 text-muted-foreground/30">
            <Folder className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Bo'limlar topilmadi</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">Siz qidirgan nom bo'yicha hech qanday bo'lim aniqlanmadi.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {departmentsWithStats.map((cat) => (
            <div
              key={cat.id}
              className={`bg-card border rounded-[28px] p-6 transition-all group relative overflow-hidden flex flex-col h-full ${cat.isArchive ? 'opacity-70 grayscale-[0.3] border-dashed border-border' : 'border-border hover:shadow-glow hover:border-primary/30'}`}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125" />
              
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm ${cat.isArchive ? 'bg-secondary text-muted-foreground' : 'bg-primary-soft text-primary'}`}>
                  <Folder className="w-7 h-7" />
                </div>
                
                {session?.isActive !== false && session?.canAccessDepartments !== false && (
                  <div className="flex items-center gap-1 transition-opacity">
                    <button
                      onClick={() => { setEditing(cat); setName(cat.name); setShowDialog(true); }}
                      className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                    >
                      <Pencil className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => setConfirmingArchive(cat)}
                      className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                    >
                      {cat.isArchive ? <ArchiveRestore className="w-4.5 h-4.5" /> : <Archive className="w-4.5 h-4.5" />}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(cat)}
                      className="p-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold text-foreground mb-4 truncate group-hover:text-primary transition-colors relative z-10">{cat.name}</h3>
              
              <div className="grid grid-cols-2 gap-3 relative z-10 mt-auto">
                <div className="bg-secondary/40 p-3 rounded-2xl border border-border/50 text-center">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Mijozlar</p>
                  <p className="text-lg font-black text-foreground">{cat.clientCount}</p>
                </div>
                <div className="bg-success/10 p-3 rounded-2xl border border-success/20 text-center">
                  <p className="text-[10px] font-black text-success uppercase tracking-widest mb-1">Sotuvlar</p>
                  <p className="text-lg font-black text-success">{cat.soldCount}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/10">
              <h2 className="text-xl font-bold text-foreground">
                {editing ? "Bo'limni tahrirlash" : "Yangi bo'lim qo'shish"}
              </h2>
              <button onClick={() => setShowDialog(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground/70 ml-1">Bo'lim nomi</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masalan: Xitoy sayohati"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowDialog(false)} 
                  className="flex-1 py-3 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  disabled={actionLoading}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {actionLoading ? "Saqlash..." : (editing ? "Saqlash" : "Qo'shish")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmingDelete}
        onClose={() => setConfirmingDelete(null)}
        onConfirm={handleDelete}
        title="Bo'limni o'chirish"
        description={`"${confirmingDelete?.name}" bo'limini o'chirishga aminmisiz? Bo'limda mijozlar bo'lsa o'chirib bo'lmasligi mumkin.`}
        confirmLabel="O'chirish"
        tone="destructive"
        loading={actionLoading}
      />

      <ConfirmModal
        isOpen={!!confirmingArchive}
        onClose={() => setConfirmingArchive(null)}
        onConfirm={handleToggleArchive}
        title={confirmingArchive?.isArchive ? "Bo'limni aktivlashtirish" : "Bo'limni arxivlash"}
        description={`"${confirmingArchive?.name}" bo'limi holatini o'zgartirishni tasdiqlaysizmi?`}
        confirmLabel={confirmingArchive?.isArchive ? "Aktivlashtirish" : "Arxivlash"}
        tone={confirmingArchive?.isArchive ? "success" : "warning"}
        loading={actionLoading}
      />
    </div>
  );
}
