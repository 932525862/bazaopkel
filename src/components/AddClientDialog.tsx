import { useState } from "react";
import { X, UserPlus, User, Phone, MessageSquare, Layers } from "lucide-react";
import type { AppState, ClientCategory } from "@/lib/types";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { formatUzbekPhone } from "@/lib/utils";

interface Props {
  state: AppState;
  defaultCategoryId?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddClientDialog({ state, defaultCategoryId, onClose, onCreated }: Props) {
  const visibleCats: ClientCategory[] = state.categories.filter((c) => !c.isArchive);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId && visibleCats.find((c) => c.id === defaultCategoryId)
      ? defaultCategoryId
      : visibleCats[0]?.id ?? ""
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !categoryId) {
      toast.error("Iltimos, barcha majburiy maydonlarni to'ldiring");
      return;
    }
    
    setLoading(true);
    try {
      await API.createClient({
        name: name.trim(),
        phone: phone.trim(),
        categoryId,
        description: note.trim()
      });
      toast.success("Yangi mijoz muvaffaqiyatli qo'shildi");
      onCreated?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/10">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <UserPlus className="w-6 h-6" />
            </div>
            Yangi mijoz qo'shish
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5 text-balance">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-primary" /> Ism familya
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Ali Valiyev"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-primary" /> Tel raqam
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatUzbekPhone(e.target.value))}
              placeholder="+998 90 123 45 67"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            />
          </div>

          <div className="space-y-1.5 text-balance">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-primary" /> Izoh (ixtiyoriy)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mijoz haqida qo'shimcha ma'lumot..."
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" /> Bo'lim
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-black uppercase tracking-widest text-xs"
            >
              {visibleCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Bekor qilish
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Yuklanmoqda..." : "Yuborish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
