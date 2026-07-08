import { useState, useRef } from "react";
import { X, FileUp, Layers, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import type { AppState, ClientCategory } from "@/lib/types";
import { toast } from "sonner";
import { API } from "@/lib/api/client";

interface Props {
  state: AppState;
  defaultCategoryId?: string;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportExcelDialog({ state, defaultCategoryId, onClose, onImported }: Props) {
  const visibleCats: ClientCategory[] = state.categories.filter((c) => !c.isArchive);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId && visibleCats.find((c) => c.id === defaultCategoryId)
      ? defaultCategoryId
      : visibleCats[0]?.id ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".xlsx") && !selectedFile.name.endsWith(".xls")) {
        toast.error("Faqat Excel (.xlsx, .xls) fayllari ruxsat etiladi");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !categoryId) {
      toast.error("Iltimos, faylni tanlang va bo'limni belgilang");
      return;
    }

    setLoading(true);
    try {
      const res = await API.importExcel(file, categoryId);
      setResult(res);
      toast.success("Excel import muvaffaqiyatli yakunlandi");
      onImported?.();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-foreground mb-2">Import yakunlandi</h2>
            <p className="text-muted-foreground mb-8">Ma'lumotlar muvaffaqiyatli qayta ishlandi</p>
            
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="p-4 bg-secondary/30 rounded-2xl border border-border/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Jami</div>
                <div className="text-xl font-black text-foreground">{result.total}</div>
              </div>
              <div className="p-4 bg-green-500/10 rounded-2xl border border-green-500/20">
                <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Yangi</div>
                <div className="text-xl font-black text-green-600">{result.imported}</div>
              </div>
              <div className="p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20">
                <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Mavjud</div>
                <div className="text-xl font-black text-orange-600">{result.skipped}</div>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Yopish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/10">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <FileUp className="w-6 h-6" />
            </div>
            Excel import
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" /> Bo'limni tanlang
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

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/70 ml-1 flex items-center gap-2">
              <Upload className="w-3.5 h-3.5 text-primary" /> Excel fayli (.xlsx)
            </label>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                file 
                  ? "border-green-500/50 bg-green-500/5" 
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <FileUp className={`w-12 h-12 mx-auto mb-4 ${file ? "text-green-500" : "text-muted-foreground/30"}`} />
              {file ? (
                <div>
                  <div className="font-bold text-foreground truncate max-w-[250px] mx-auto">{file.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-foreground">Faylni tanlash uchun bosing</div>
                  <div className="text-xs text-muted-foreground mt-1">Faqat .xlsx yoki .xls formatda</div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex flex-col gap-2">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed font-bold">
                Excel faylida kamida Ism va Telefon ustunlari bo'lishi kerak.
              </p>
            </div>
            
            <div className="space-y-2 ml-8 border-l-2 border-blue-500/20 pl-3">
              <div className="text-[11px] text-blue-800/70">
                <span className="font-bold">Ism:</span> full_name, ism, name, f.i.o, fish
              </div>
              <div className="text-[11px] text-blue-800/70">
                <span className="font-bold">Telefon:</span> phone, telefon, raqam, number
              </div>
              <div className="text-[11px] text-blue-800/70">
                <span className="font-bold">Izoh (ixtiyoriy):</span> description, izoh, note, malumot
              </div>
            </div>

            <p className="text-[10px] text-blue-600/70 mt-1 ml-8 italic">
              Mavjud telefon raqamlari avtomatik ravishda tashlab ketiladi.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-4 rounded-2xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Bekor qilish
            </button>
            <button 
              type="submit" 
              disabled={loading || !file}
              className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
            >
              {loading ? "Yuklanmoqda..." : "Import qilish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
