import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAppState } from "@/lib/store";
import { toast } from "sonner";
import type { Employee } from "@/lib/types";
import { API } from "@/lib/api/client";
import { formatUzbekPhone } from "@/lib/utils";
import { UserPlus, Pencil, X, Phone, User as UserIcon, Check } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { formatUzDate } from "@/lib/date-utils";

export const Route = createFileRoute("/director/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { state, update } = useAppState();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEmployees = async () => {
    try {
      const list = await API.employees();
      update(s => ({ ...s, employees: list }));
    } catch {
      toast.error("Ma'lumotlarni yuklashda xatolik");
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleToggleStatus = async () => {
    if (!confirmingStatus) return;
    setLoading(true);
    const emp = confirmingStatus;
    const newStatus = !emp.isActive;
    const action = newStatus ? "faollashtirish" : "deaktivatsiya";
    try {
      await API.updateEmployee(emp.id, {
        firstName: emp.firstName,
        lastName: emp.lastName,
        phone: emp.phone,
        isActive: newStatus
      });
      
      toast.success(`Hodim ${action} qilindi`);
      await fetchEmployees();
      setConfirmingStatus(null);
    } catch (err) {
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <header className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Hodimlar</h1>
          <p className="text-muted-foreground mt-1">
            Jami: {state.employees.length} ta hodim
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg hover:shadow-glow hover:scale-[1.02] transition-all active:scale-[0.98]"
        >
          <UserPlus className="w-5 h-5" /> Yangi hodim
        </button>
      </header>

      {state.employees.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-16 text-center text-muted-foreground">
          <div className="w-20 h-20 bg-secondary rounded-3xl flex items-center justify-center mx-auto mb-4 text-muted-foreground/40">
            <UserIcon className="w-10 h-10" />
          </div>
          <p className="text-lg font-medium">Hali hodim qo'shilmagan</p>
          <button 
             onClick={() => setShowForm(true)}
             className="mt-4 text-primary hover:underline font-medium"
          >
            Birinchi hodimni qo'shish
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {state.employees.map((emp) => (
            <div
              key={emp.id}
              className={`bg-card border rounded-[28px] p-6 flex flex-wrap lg:flex-nowrap items-center gap-6 transition-all hover:shadow-glow hover:border-primary/20 group ${!emp.isActive ? 'opacity-70 grayscale-[0.3] border-dashed' : 'border-border'}`}
            >
              <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 ${emp.isActive ? 'bg-primary-soft text-primary' : 'bg-secondary text-muted-foreground'}`}>
                <UserIcon className="w-8 h-8" />
              </div>

              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-3 mb-1.5 text-balance">
                  <h3 className="text-xl font-bold text-foreground">
                    {emp.firstName} {emp.lastName}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${emp.isActive ? 'bg-success/15 text-success border border-success/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                    {emp.isActive ? 'Faol' : 'Nofaol'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-foreground/70">
                    <Phone className="w-4 h-4 text-primary" /> {emp.phone}
                  </p>
                  <p className="text-muted-foreground">Log: <span className="font-mono text-foreground/60">{emp.login}</span></p>
                  <p className="text-muted-foreground">Sana: {formatUzDate(emp.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full lg:w-auto lg:ml-auto">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card shadow-sm h-[46px]">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Hisob:</span>
                  <button
                    onClick={async () => {
                      const newStatus = !emp.isActive;
                      try {
                        await API.updateEmployee(emp.id, {
                          firstName: emp.firstName,
                          lastName: emp.lastName,
                          phone: emp.phone,
                          isActive: newStatus
                        });
                        await fetchEmployees();
                        toast.success(newStatus ? "Hodim faollashtirildi" : "Hodim bloklandi");
                      } catch (err) {
                        toast.error("Xatolik yuz berdi");
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${emp.isActive ? 'bg-success' : 'bg-destructive'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emp.isActive ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>

                {/* Permissions Toggles */}
                <div className="flex items-center gap-4 px-4 py-2 rounded-xl border border-border bg-card shadow-sm h-[46px]">
                  <div className="flex items-center gap-3 pr-3 border-r border-border">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Bo'lim:</span>
                    <button
                      onClick={async () => {
                        try {
                          await API.updateEmployee(emp.id, { canAccessDepartments: !emp.canAccessDepartments });
                          await fetchEmployees();
                          toast.success("Ruxsat o'zgartirildi");
                        } catch { toast.error("Xatolik"); }
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${emp.canAccessDepartments ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${emp.canAccessDepartments ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 pr-3 border-r border-border">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Forma:</span>
                    <button
                      onClick={async () => {
                        try {
                          await API.updateEmployee(emp.id, { canAccessForms: !emp.canAccessForms });
                          await fetchEmployees();
                          toast.success("Ruxsat o'zgartirildi");
                        } catch { toast.error("Xatolik"); }
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${emp.canAccessForms ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${emp.canAccessForms ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3" title="Ombor arxivi yozuvlarini tahrirlash huquqi (o'chirish hech kimga berilmaydi)">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Arxiv:</span>
                    <button
                      onClick={async () => {
                        try {
                          await API.updateEmployee(emp.id, { canEditWarehouseArchive: !emp.canEditWarehouseArchive });
                          await fetchEmployees();
                          toast.success("Arxiv huquqi o'zgartirildi");
                        } catch { toast.error("Xatolik"); }
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${emp.canEditWarehouseArchive ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${emp.canEditWarehouseArchive ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-1 lg:flex-initial">
                  <button
                    onClick={() => { setEditing(emp); setShowForm(true); }}
                    className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl border border-border bg-card text-foreground hover:bg-secondary hover:border-primary/30 transition-all text-sm font-bold shadow-sm"
                  >
                    <Pencil className="w-4 h-4 text-primary" /> Tahrir
                  </button>
                  <button
                    onClick={() => setConfirmingStatus(emp)}
                    className={`flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl transition-all text-sm font-bold shadow-sm ${emp.isActive ? 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border border-destructive/10' : 'bg-success/10 text-success hover:bg-success hover:text-white border border-success/10'}`}
                  >
                    {emp.isActive ? (
                      <><X className="w-4 h-4" /> Deaktivatsiya</>
                    ) : (
                      <><Check className="w-4 h-4" /> Faollashtirish</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <EmployeeFormDialog
          employee={editing}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            try {
              if (editing) {
                await API.updateEmployee(editing.id, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phoneNumber: data.phone,
                  password: data.password ? data.password : undefined,
                  isActive: data.isActive,
                  canAccessDepartments: data.canAccessDepartments,
                  canAccessForms: data.canAccessForms
                });
                toast.success("Hodim ma'lumotlari yangilandi");
              } else {
                await API.createEmployee({
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phoneNumber: data.phone,
                  password: data.password,
                  canAccessDepartments: data.canAccessDepartments,
                  canAccessForms: data.canAccessForms
                });
                toast.success("Yangi hodim qo'shildi");
              }
              await fetchEmployees();
              setShowForm(false);
            } catch (err: any) {
              toast.error(err.message || "Xatolik yuz berdi");
            }
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmingStatus}
        onClose={() => setConfirmingStatus(null)}
        onConfirm={handleToggleStatus}
        title={confirmingStatus?.isActive ? "Deaktivatsiya qilish" : "Faollashtirish"}
        description={`${confirmingStatus?.firstName} ${confirmingStatus?.lastName}ni ${confirmingStatus?.isActive ? "tizimdan vaqtinchalik o'chirmoqchimisiz?" : "qayta faollashtirmoqchimisiz?"}`}
        confirmLabel={confirmingStatus?.isActive ? "Deaktivatsiya" : "Faollashtirish"}
        tone={confirmingStatus?.isActive ? "destructive" : "success"}
        loading={loading}
      />
    </div>
  );
}

function EmployeeFormDialog({
  employee,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSave: (data: Omit<Employee, "id" | "createdAt">) => void;
}) {
  const [firstName, setFirstName] = useState(employee?.firstName ?? "");
  const [lastName, setLastName] = useState(employee?.lastName ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [password, setPassword] = useState(employee?.password ?? "");
  const [canAccessDepartments, setCanAccessDepartments] = useState(employee?.canAccessDepartments ?? true);
  const [canAccessForms, setCanAccessForms] = useState(employee?.canAccessForms ?? true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || (!employee && !password.trim())) {
      toast.error("Barcha maydonlarni to'ldiring");
      return;
    }
    setLoading(true);
    try {
      await onSave({ 
        firstName: firstName.trim(), 
        lastName: lastName.trim(), 
        phone: phone.trim(), 
        login: phone.trim(), 
        password,
        isActive: employee?.isActive ?? true,
        canAccessDepartments,
        canAccessForms
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-[32px] border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/20">
          <h2 className="text-xl font-bold text-foreground">
            {employee ? "Hodimni tahrirlash" : "Yangi hodim qo'shish"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground/70 ml-1">Ism</label>
              <input
                type="text"
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground/70 ml-1">Familya</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/70 ml-1">Tel raqam</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatUzbekPhone(e.target.value))}
              placeholder="+998 90 123 45 67"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground/70 ml-1">Login</label>
              <input
                type="text"
                value={phone}
                readOnly
                className="w-full px-4 py-3 rounded-xl border border-input bg-secondary/50 text-muted-foreground focus:outline-none transition-all font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground/70 ml-1">Parol</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={employee ? "O'zgartirish uchun yozing" : "****"}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-secondary/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground/70">Bo'limlar va Mijozlar</span>
              <button
                type="button"
                onClick={() => setCanAccessDepartments(!canAccessDepartments)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${canAccessDepartments ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${canAccessDepartments ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between pl-4 border-l border-border">
              <span className="text-sm font-bold text-foreground/70">Formalar (Lidlar)</span>
              <button
                type="button"
                onClick={() => setCanAccessForms(!canAccessForms)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${canAccessForms ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${canAccessForms ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-3 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Bekor qilish
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Yuklanmoqda..." : (employee ? "Saqlash" : "Qo'shish")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
