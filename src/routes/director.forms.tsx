import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAppState, useSession } from "@/lib/store";
import { FilePlus, Pencil, Trash2, X, ExternalLink, Plus, Minus, MoveUp, MoveDown } from "lucide-react";
import { toast } from "sonner";
import { formatUzDate } from "@/lib/date-utils";
import { API } from "@/lib/api/client";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { FormTemplate } from "@/lib/types";

export const Route = createFileRoute("/director/forms")({
  component: FormsPage,
});

function FormsPage() {
  const { state, update } = useAppState();
  const session = useSession();
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<FormTemplate | null>(null);

  const fetchForms = async () => {
    try {
      const list = await API.forms();
      setForms(list);
      update(s => ({ ...s, forms: list }));
    } catch {
      toast.error("Formalarni yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleDelete = async () => {
    if (!confirmingDelete) return;
    setActionLoading(true);
    try {
      await API.deleteForm(confirmingDelete.id);
      toast.success("Forma o'chirildi");
      await fetchForms();
      setConfirmingDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
     return (
       <div className="p-10 text-center">
         <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
         <p className="text-muted-foreground animate-pulse font-medium">Yuklanmoqda...</p>
       </div>
     );
  }

  return (
    <div className="p-6 md:p-10">
      <header className="flex items-start justify-between mb-10 flex-wrap gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Formalar</h1>
          <p className="text-muted-foreground mt-1.5 font-medium">Lidlar yig'ish uchuun ochiq formalar</p>
        </div>
        {session?.isActive !== false && (
          <button
            onClick={() => { setEditing(null); setShowDialog(true); }}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <FilePlus className="w-5 h-5" /> Yangi forma
          </button>
        )}
      </header>

      {forms.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[40px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-6 text-muted-foreground/30">
            <FilePlus className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Formalar hali yo'q</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-6">Mijozlardan ma'lumot yig'ish uchun birinchi formangizni yarating.</p>
          <button 
             onClick={() => setShowDialog(true)}
             className="text-primary hover:underline font-bold"
          >
            Forma yaratish
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <div
              key={form.id}
              className="group bg-card border border-border rounded-[32px] p-6 hover:shadow-glow transition-all relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-sm">
                  <FilePlus className="w-6 h-6" />
                </div>
                {session?.isActive !== false && (
                  <div className="flex items-center gap-1 transition-opacity">
                    <a
                      href={`/f/${form.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-primary transition-all"
                      title="Ko'rish"
                    >
                      <ExternalLink className="w-4.5 h-4.5" />
                    </a>
                    <button
                      onClick={() => { setEditing(form); setShowDialog(true); }}
                      className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                      title="Tahrirlash"
                    >
                      <Pencil className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(form)}
                      className="p-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      title="O'chirish"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold text-foreground mb-2 truncate group-hover:text-primary transition-colors">{form.title}</h3>
              <p className="text-sm text-muted-foreground font-medium mb-5">
                {form.fields.length} ta maydon &bull; {state.categories.find(c => c.id === form.targetCategoryId)?.name || "Noma'lum bo'lim"}
              </p>
              
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest bg-secondary px-2.5 py-1 rounded-full">
                  {formatUzDate(form.createdAt)}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/f/${form.id}`);
                    toast.success("Havola nusxalandi");
                  }}
                  className="text-[10px] text-primary hover:underline font-black uppercase tracking-widest"
                >
                  Havolani nusxalash
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <FormEditDialog
          form={editing}
          categories={state.categories.filter(c => !c.isArchive)}
          onClose={() => setShowDialog(false)}
          onSave={async (data) => {
            try {
              if (editing) {
                await API.updateForm(editing.id, data);
                toast.success("Forma yangilandi");
              } else {
                await API.createForm(data);
                toast.success("Yangi forma yaratildi");
              }
              await fetchForms();
              setShowDialog(false);
            } catch (err: any) {
              toast.error(err.message || "Xatolik yuz berdi");
            }
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmingDelete}
        onClose={() => setConfirmingDelete(null)}
        onConfirm={handleDelete}
        title="Formani o'chirish"
        description={`"${confirmingDelete?.title}" formasini o'chirishga aminmisiz? Bu ushbu forma orqali yuborilgan lidlarga ta'sir qilmaydi, lekin yangi lidlar yuborib bo'lmaydi.`}
        confirmLabel="O'chirish"
        tone="destructive"
        loading={actionLoading}
      />
    </div>
  );
}

function FormEditDialog({
  form,
  categories,
  onClose,
  onSave,
}: {
  form: FormTemplate | null;
  categories: any[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [title, setTitle] = useState(form?.title ?? "");
  const [categoryId, setCategoryId] = useState(form?.targetCategoryId ?? "");
  const [fields, setFields] = useState<any[]>(form?.fields?.map(f => ({
    ...f,
    optionsList: f.options || [],
    optionInput: ""
  })) ?? [
    { label: "Ism familya", type: "text", required: true, optionsList: [], optionInput: "" },
    { label: "Tel raqam", type: "phone", required: true, optionsList: [], optionInput: "" }
  ]);
  const [loading, setLoading] = useState(false);

  const addField = () => setFields([...fields, { label: "", type: "text", required: true, optionsList: [], optionInput: "" }]);
  const updateField = (idx: number, patch: any) => setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f));
  const removeField = (idx: number) => setFields(fields.filter((_, i) => i !== idx));
  const moveField = (idx: number, dir: number) => {
    const next = [...fields];
    const [item] = next.splice(idx, 1);
    next.splice(idx + dir, 0, item);
    setFields(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !categoryId || fields.some(f => !f.label.trim())) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    setLoading(true);
    try {
      const mappedFields = fields.map(f => {
        const result = { label: f.label, type: f.type, required: f.required, options: undefined as string[] | undefined };
        if (["select", "radio", "checkbox", "multi_select"].includes(f.type) && f.optionsList?.length > 0) {
          result.options = f.optionsList;
        }
        return result;
      });
      await onSave({ title: title.trim(), targetCategoryId: categoryId, fields: mappedFields });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/10">
          <h2 className="text-xl font-bold text-foreground">
            {form ? "Formani tahrirlash" : "Yangi forma yaratish"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground/70 ml-1">Forma nomi</label>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Masalan: Sayyohlik so'rovi"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                />
             </div>
             <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground/70 ml-1">Lidlar bo'limi</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                >
                  <option value="">Tanlang...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
             </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-bold text-foreground/70">Forma maydonlari</label>
              <button 
                type="button" 
                onClick={addField}
                className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1.5 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Qo'shish
              </button>
            </div>
            
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={idx} className="flex flex-col gap-2 bg-secondary/20 p-3 rounded-2xl border border-border/50 group">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                       <button type="button" disabled={idx === 0} onClick={() => moveField(idx, -1)} className="p-1 rounded bg-card hover:text-primary disabled:opacity-30">
                          <MoveUp className="w-3 h-3" />
                       </button>
                       <button type="button" disabled={idx === fields.length - 1} onClick={() => moveField(idx, 1)} className="p-1 rounded bg-card hover:text-primary disabled:opacity-30">
                          <MoveDown className="w-3 h-3" />
                       </button>
                    </div>
                    <input
                      value={field.label}
                      onChange={e => updateField(idx, { label: e.target.value })}
                      placeholder="Maydon nomi (Masalan: Ism familya)"
                      className="flex-1 px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium"
                    />
                    <select
                      value={field.type}
                      onChange={e => updateField(idx, { type: e.target.value })}
                      className="w-32 px-2 py-2 rounded-xl bg-background border border-border text-xs font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="text">Matn</option>
                      <option value="phone">Tel raqam</option>
                      <option value="select">Tanlov (Select)</option>
                      <option value="textarea">Uzunroq matn</option>
                      <option value="radio">Radio</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="multi_select">Ko'p tanlovli (Multi-select)</option>
                    </select>
                    <button 
                      type="button" 
                      onClick={() => removeField(idx)}
                      className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Options Input Builder */}
                  {["select", "radio", "checkbox", "multi_select"].includes(field.type) && (
                    <div className="ml-8 mt-2 p-3 rounded-2xl border border-primary/20 bg-background/30 flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        {field.optionsList?.map((opt: string, oIdx: number) => (
                           <div key={oIdx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold border border-primary/20 animate-in fade-in zoom-in duration-200">
                             {opt}
                             <button type="button" onClick={() => {
                               const newList = [...field.optionsList];
                               newList.splice(oIdx, 1);
                               updateField(idx, { optionsList: newList });
                             }} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
                           </div>
                        ))}
                        {(!field.optionsList || field.optionsList.length === 0) && (
                          <span className="text-xs text-muted-foreground italic py-1.5 px-1 bg-transparent">Variantlar yo'q...</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                           value={field.optionInput || ""}
                           onChange={e => updateField(idx, { optionInput: e.target.value })}
                           onKeyDown={e => {
                             if (e.key === 'Enter') {
                               e.preventDefault();
                               if (field.optionInput?.trim()) {
                                  updateField(idx, { 
                                     optionsList: [...(field.optionsList || []), field.optionInput.trim()],
                                     optionInput: ""
                                  });
                               }
                             }
                           }}
                           placeholder="Yangi variant qo'shing va Enter bosing"
                           className="flex-1 px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium"
                        />
                        <button
                           type="button"
                           onClick={() => {
                             if (field.optionInput?.trim()) {
                                updateField(idx, { 
                                   optionsList: [...(field.optionsList || []), field.optionInput.trim()],
                                   optionInput: ""
                                });
                             }
                           }}
                           disabled={!field.optionInput?.trim()}
                           className="p-2 rounded-xl bg-primary text-primary-foreground hover:scale-[1.05] active:scale-95 transition-all outline-none shadow-md disabled:opacity-50 disabled:scale-100"
                        >
                           <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 sticky bottom-0 bg-card/80 backdrop-blur-sm -mx-6 px-6 pb-2">
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
              {loading ? "Saqlanmoqda..." : (form ? "Saqlash" : "Yaratish")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
