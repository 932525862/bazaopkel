import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAppState, useSession } from "@/lib/store";
import { FolderPlus, Pencil, Trash2, Archive, ArchiveRestore, X, Folder } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { ClientCategory } from "@/lib/types";

export const Route = createFileRoute("/director/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const { update } = useAppState();
  const session = useSession();
  const [departments, setDepartments] = useState<ClientCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editing, setEditing] = useState<ClientCategory | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [name, setName] = useState("");
  
  const [confirmingDelete, setConfirmingDelete] = useState<ClientCategory | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState<ClientCategory | null>(null);

  const fetchDeps = async () => {
    try {
      const list = await API.categories();
      setDepartments(list);
      update(s => ({ ...s, categories: list }));
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

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground animate-pulse">Yuklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <header className="flex items-start justify-between mb-10 flex-wrap gap-4 text-balance">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bo'limlar</h1>
          <p className="text-muted-foreground mt-1">Mijozlar toifalarini va lidlar oqimini boshqarish</p>
        </div>
        {session?.isActive !== false && (
          <button
            onClick={() => { setEditing(null); setName(""); setShowDialog(true); }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <FolderPlus className="w-5 h-5" /> Yangi bo'lim
          </button>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {departments.map((dep) => (
          <div
            key={dep.id}
            className={`group bg-card border rounded-[32px] p-6 hover:shadow-glow transition-all relative overflow-hidden ${dep.isArchive ? 'opacity-70 grayscale-[0.4] border-dashed' : 'border-border'}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${dep.isArchive ? 'bg-secondary text-muted-foreground' : 'bg-primary-soft text-primary'}`}>
                <Folder className="w-6 h-6" />
              </div>
              {session?.isActive !== false && (
                <div className="flex items-center gap-1 transition-opacity">
                  <button
                    onClick={() => { setEditing(dep); setName(dep.name); setShowDialog(true); }}
                    className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                    title="Tahrirlash"
                  >
                    <Pencil className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => setConfirmingArchive(dep)}
                    className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                    title={dep.isArchive ? "Aktivlashtirish" : "Arxivlash"}
                  >
                    {dep.isArchive ? <ArchiveRestore className="w-4.5 h-4.5" /> : <Archive className="w-4.5 h-4.5" />}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(dep)}
                    className="p-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title="O'chirish"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              )}
            </div>
            
            <h3 className="text-xl font-bold text-foreground mb-4 truncate">{dep.name}</h3>
            
            <div className="flex items-center justify-between mt-auto">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${dep.isArchive ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success border border-success/20'}`}>
                {dep.isArchive ? 'Arxivda' : 'Faol'}
              </span>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">ID: {dep.id.slice(0, 8)}...</p>
            </div>
          </div>
        ))}
      </div>

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
