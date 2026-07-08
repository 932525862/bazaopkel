import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { CheckCircle2, Briefcase, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api/client";
import { formatUzbekPhone } from "@/lib/utils";
import type { FormTemplate } from "@/lib/types";
import logo from "../logo.png";
import bgimg from "../bg.jpg";
export const Route = createFileRoute("/f/$formId")({
  head: () => ({ meta: [{ title: "Forma" }] }),
  component: PublicForm,
});



function PublicForm() {
  const { formId } = Route.useParams();
  const [form, setForm] = useState<FormTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    API.publicForm(formId)
      .then(setForm)
      .catch(() => toast.error("Forma topilmadi"))
      .finally(() => setLoading(false));
  }, [formId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    for (const f of form.fields) {
      if (f.required) {
        const val = values[f.label];
        if (Array.isArray(val) ? val.length === 0 : !val?.trim()) {
          toast.error(`"${f.label}" maydonini to'ldiring`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await API.publicSubmit(form.id, values);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
        <div className="max-w-md text-center bg-card rounded-2xl border border-border p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-foreground">Forma topilmadi</h1>
          <p className="text-muted-foreground mt-2">Havola noto'g'ri yoki forma arxivlangan bo'lishi mumkin.</p>
          <Link to="/login" className="inline-block mt-6 text-primary hover:underline">Bosh sahifaga</Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
        <div className="max-w-md text-center bg-card rounded-2xl border border-border p-8 shadow-lg">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center text-success mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl text-[#04df3b] font-bold ">TOURLAND.UZ</h1>
           <h1 className="text-2xl font-bold text-foreground">Rahmat!</h1>
          <p className="text-muted-foreground mt-2">Ma'lumotlaringiz qabul qilindi. Tez orada siz bilan bog'lanamiz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative py-10 px-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-70"
        style={{ backgroundImage: `url(${bgimg})` }}
      />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex w-20 h-20 rounded-xl items-center justify-center text-primary-foreground shadow-md">
            {/* <Briefcase className="w-6 h-6" /> */}
            <img src={logo} alt="Logo" className="w-14 h-14" />
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-foreground">{form.title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Quyidagi formani to'ldiring</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {form.fields.map((field) => (
              <div key={field.id}>
                <label className="text-sm font-bold text-foreground block mb-2">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </label>
                
                {field.type === "textarea" ? (
                  <textarea
                    rows={4}
                    value={values[field.label] ?? ""}
                    onChange={(e) => setValues((p) => ({ ...p, [field.label]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    placeholder={`${field.label} haqida batafsil ma'lumot qoldiring...`}
                    disabled={submitting}
                  />
                ) : field.type === "select" ? (
                  <select
                    value={values[field.label] ?? ""}
                    onChange={(e) => setValues((p) => ({ ...p, [field.label]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium appearance-none"
                    disabled={submitting}
                  >
                    <option value="">— {field.label}ni tanlang —</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === "radio" ? (
                  <div className="space-y-2">
                    {(field.options ?? []).map((opt) => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="radio"
                            name={field.label}
                            value={opt}
                            checked={values[field.label] === opt}
                            onChange={(e) => setValues((p) => ({ ...p, [field.label]: e.target.value }))}
                            className="sr-only"
                            disabled={submitting}
                          />
                          <div className={`w-5 h-5 rounded-full border-2 transition-all ${values[field.label] === opt ? 'border-primary bg-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'}`}>
                             {values[field.label] === opt && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-1" />}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field.type === "checkbox" ? (
                  <div className="space-y-2">
                    {(field.options ?? []).map((opt) => {
                      const currentValues = Array.isArray(values[field.label]) ? values[field.label] : [];
                      const isChecked = currentValues.includes(opt);
                      
                      return (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative flex items-center justify-center">
                            <input
                              type="checkbox"
                              name={field.label}
                              value={opt}
                              checked={isChecked}
                              onChange={(e) => {
                                const newValues = e.target.checked
                                  ? [...currentValues, opt]
                                  : currentValues.filter((v: string) => v !== opt);
                                setValues((p) => ({ ...p, [field.label]: newValues }));
                              }}
                              className="sr-only"
                              disabled={submitting}
                            />
                            <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${isChecked ? 'border-primary bg-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'}`}>
                               {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </div>
                          <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : field.type === "multi_select" ? (
                  <select
                    multiple
                    value={Array.isArray(values[field.label]) ? values[field.label] : []}
                    onChange={(e) => {
                      const options = Array.from(e.target.selectedOptions, option => option.value);
                      setValues((p) => ({ ...p, [field.label]: options }));
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium custom-scrollbar h-32"
                    disabled={submitting}
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt} className="py-1 px-2 rounded-lg hover:bg-secondary/50">{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "phone" ? "tel" : "text"}
                    value={values[field.label] ?? ""}
                    onChange={(e) => {
                      const val = field.type === "phone" ? formatUzbekPhone(e.target.value) : e.target.value;
                      setValues((p) => ({ ...p, [field.label]: val }));
                    }}
                    placeholder={
                      field.type === "phone"
                        ? `${field.label} (masalan: +998 90 123 45 67)`
                        : field.label.toLowerCase().includes("ism") || field.label.toLowerCase().includes("familiya")
                        ? "Ism va familiyangizni kiriting"
                        : field.label.toLowerCase().includes("email") || field.label.toLowerCase().includes("pochta")
                        ? "example@mail.com"
                        : `${field.label}ni kiriting`
                    }
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    disabled={submitting}
                  />
                )}
              </div>
            ))}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitting ? "Yuborilmoqda..." : "Yuborish"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
