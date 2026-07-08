import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAppState } from "@/lib/store";
import { Plus, ListChecks, Check, Clock, CheckCheck, X, RotateCcw, ExternalLink, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { playNotificationSound, showBrowserNotification } from "@/lib/notify";
import { API } from "@/lib/api/client";
import { formatUzDate, formatUzStatus, formatUzDateTime, getTashkentDayjs } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Task, TaskStatus } from "@/lib/types";

export const Route = createFileRoute("/director/tasks")({
  component: DirectorTasks,
});

const tabs: { id: "active" | "done"; label: string }[] = [
  { id: "active", label: "Faol" },
  { id: "done", label: "Bajarilganlar" },
];

function statusBadge(status: TaskStatus) {
  switch (status) {
    case "todo":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-secondary text-muted-foreground border border-border transition-all">Yangi</span>;
    case "in_progress":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 border border-amber-200 transition-all">Jarayonda</span>;
    case "pending":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 border border-blue-200 transition-all">Tekshiruvda</span>;
    case "done":
    case "approved":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-success/15 text-success border border-success/20 transition-all">Bajarildi</span>;
    case "rejected":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-destructive/15 text-destructive border border-destructive/20 transition-all">Rad etildi</span>;
    case "incomplete":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-destructive/10 text-destructive grayscale opacity-70 transition-all">Bajarilmadi</span>;
    default:
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-muted text-muted-foreground border border-border">{status}</span>;
  }
}

function DirectorTasks() {
  const { state } = useAppState();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "done">("active");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [empId, setEmpId] = useState<string>("");
  const [notifyAt, setNotifyAt] = useState("09:00");
  const [startDate, setStartDate] = useState(getTashkentDayjs().format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState(getTashkentDayjs().add(90, "day").format("YYYY-MM-DD"));
  const [view, setView] = useState<Task | null>(null);
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const [rReason, setRReason] = useState("");

  const fetchTasks = async () => {
    try {
      const data = await API.tasks("director");
      setTasks(data);
    } catch (err: any) {
      toast.error("Topshiriqlarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    const unsub = API.initSocket((event, data) => {
      console.log("WS Event in DirectorTasks:", event, data);
      if (event === "taskCreated" || event === "taskStatusChanged" || event === "taskVerified" || event === "taskIncomplete" || event === "taskRejected") {
        fetchTasks();
        
        const newStatus = data?.newStatus?.toUpperCase() || (event === "taskVerified" ? "APPROVED" : event === "taskIncomplete" ? "INCOMPLETE" : "");

        if (event === "taskStatusChanged" && newStatus === "PENDING") {
          playNotificationSound();
          toast.info("Hodim topshiriqni tugatdi, tasdiqlash kerak");
          showBrowserNotification("Tasdiqlash kerak", { body: "Hodim topshiriqni tugatdi va tekshirishingizni kutmoqda." });
        } else if ((event === "taskStatusChanged" && newStatus === "REJECTED") || event === "taskRejected") {
          playNotificationSound();
          toast.error("Topshiriq rad etildi");
          showBrowserNotification("Rad etildi", { body: "Topshiriq rad etildi." });
        } else if (event === "taskVerified" || newStatus === "APPROVED" || newStatus === "DONE") {
          playNotificationSound();
          toast.success("Topshiriq tasdiqlandi");
          showBrowserNotification("Tasdiqlandi", { body: "Topshiriq muvaffaqiyatli tasdiqlandi." });
        } else if (event === "taskIncomplete" || newStatus === "INCOMPLETE") {
          playNotificationSound();
          toast.warning("Topshiriq muddati o'tdi");
          showBrowserNotification("Bajarilmadi", { body: "Topshiriqning muddati o'tdi va bajarilmadi." });
        }
      }
    });

    return () => {
      unsub?.();
    };
  }, []);

  const list = useMemo(() => {
    return tab === "done"
      ? tasks.filter((t) => t.status === "done")
      : tasks.filter((t) => t.status !== "done" && t.status !== "incomplete");
  }, [tasks, tab]);

  const empName = (id: string) => {
    const e = state.employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "—";
  };

  const handleCreate = async () => {
    if (!title.trim() || !empId) {
      toast.error("Topshiriq va hodimni tanlang");
      return;
    }
    try {
      await API.createTask({ 
        title: title.trim(), 
        description: desc.trim(), 
        assignedTo: empId,
        notifyAt,
        startDate,
        endDate
      });
      toast.success("Topshiriq biriktirildi");
      setTitle("");
      setDesc("");
      setEmpId("");
      setOpen(false);
      fetchTasks();
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const approve = async (t: Task) => {
    try {
      await API.verifyTask(t.id);
      toast.success("Topshiriq tasdiqlandi");
      setView(null);
      fetchTasks();
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const reject = async () => {
    if (!rejecting || !rReason.trim()) {
      toast.error("Rad etish sababini kiriting");
      return;
    }
    try {
      await API.rejectTask(rejecting.id, rReason.trim());
      toast.error("Topshiriq rad etildi");
      setRejecting(null);
      setView(null);
      setRReason("");
      fetchTasks();
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Topshiriqlar</h1>
          <p className="text-muted-foreground mt-1">Hodimlarga topshiriq biriktiring va nazorat qiling</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg hover:shadow-glow transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" /> Topshiriq biriktirish
        </button>
      </header>

      <div className="flex gap-2 mb-6 p-1 bg-secondary/50 rounded-2xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-2 text-sm font-bold rounded-xl transition-all ${
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card/50 animate-pulse rounded-2xl border border-border/50" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="bg-card rounded-[32px] border border-dashed border-border p-20 text-center text-muted-foreground">
          <ListChecks className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">Topshiriqlar topilmadi</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t)}
              className="group text-left bg-card rounded-2xl border border-border p-5 hover:border-primary/30 hover:shadow-md transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:bg-primary-soft group-hover:text-primary transition-colors">
                  <ListChecks className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground leading-tight truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hodim: <span className="text-foreground font-medium">{empName(t.assignedTo)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(t.status)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-[32px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Yangi topshiriq</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold px-1">Sarlavha</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Topshiriq sarlavhasi"
                className="rounded-xl h-12"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold px-1">Topshiriq matni</label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Bajarilishi kerak bo'lgan ish..."
                rows={4}
                className="rounded-xl resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold px-1">Hodimga biriktirish</label>
              <Select value={empId} onValueChange={setEmpId}>
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue placeholder="Hodimni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {state.employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold px-1">Boshlanish sanasi</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl h-12"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold px-1">Tugash sanasi</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl h-12"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold px-1">Eslatma vaqti (notifyAt)</label>
              <Input
                type="time"
                value={notifyAt}
                onChange={(e) => setNotifyAt(e.target.value)}
                className="rounded-xl h-12"
              />
            </div>
          </div>
          <DialogFooter className="pt-6">
            <button
              onClick={() => setOpen(false)}
              className="px-6 py-3 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleCreate}
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black shadow-lg hover:shadow-glow transition-all active:scale-95"
            >
              Biriktirish
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="rounded-[40px] max-w-xl max-h-[85vh] overflow-y-auto">
          {view && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
                    <ListChecks className="w-6 h-6" />
                  </div>
                  {statusBadge(view.status)}
                </div>
                <DialogTitle className="text-3xl font-black">{view.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <div className="p-5 rounded-2xl bg-secondary/30 border border-border/50">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Topshiriq</p>
                  <p className="font-medium whitespace-pre-wrap leading-relaxed text-foreground">
                    {view.description || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border border-border/50 bg-secondary/10">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Hodim</p>
                    <p className="font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      {empName(view.assignedTo)}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl border border-border/50 bg-secondary/10">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Sana</p>
                    <p className="font-bold">{formatUzDate(view.createdAt, { includeYear: true })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="p-4 rounded-2xl border border-border/50 bg-secondary/10">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Muddat</p>
                    <p className="text-xs font-bold text-foreground">
                      {formatUzDate(view.startDate)} — {formatUzDate(view.endDate)}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl border border-border/50 bg-secondary/10">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Eslatma</p>
                    <p className="text-xs font-bold text-foreground">{view.notifyAt}</p>
                  </div>
                </div>

                <div className="p-5 rounded-[28px] border border-border/50 bg-secondary/5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 px-2">Kunlik ijro tarixi</p>
                  <TaskHistory templateId={view.templateId} currentInstanceId={view.id} />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setView(null)}
                  className="flex-1 py-4 rounded-2xl border border-border font-bold text-muted-foreground hover:bg-secondary transition-all"
                >
                  Yopish
                </button>
                {view.status === "pending" && (
                  <>
                    <button
                      onClick={() => setRejecting(view)}
                      className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-destructive text-destructive-foreground font-black shadow-lg hover:shadow-glow transition-all"
                    >
                      <RotateCcw className="w-5 h-5" /> Rad etish
                    </button>
                    <button
                      onClick={() => approve(view)}
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 text-white font-black shadow-lg hover:shadow-glow transition-all"
                    >
                      <CheckCheck className="w-5 h-5" /> Tasdiqlash
                    </button>
                  </>
                )}
              </div>

              <RejectDialog 
                open={!!rejecting}
                onOpenChange={(o: boolean) => !o && setRejecting(null)}
                reason={rReason}
                setReason={setRReason}
                onConfirm={reject}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskHistory({ templateId, currentInstanceId }: { templateId: string, currentInstanceId?: string }) {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    API.templateInstances(templateId).then(data => {
      setInstances(data);
      if (currentInstanceId) {
        const curr = data.find((x: any) => x.id === currentInstanceId);
        if (curr) setSelected(curr);
      } else if (data.length > 0) {
        setSelected(data[data.length - 1]);
      }
    }).finally(() => setLoading(false));
  }, [templateId, currentInstanceId]);

  if (loading) return <div className="animate-pulse h-12 bg-secondary/30 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 pb-2">
        {instances.map((inst) => {
          const s = (inst.status || "TODO").toUpperCase();
          const isDone = s === "DONE" || s === "APPROVED";
          const isIncomplete = s === "INCOMPLETE" || s === "REJECTED";
          const isSelected = selected?.id === inst.id;
          
          return (
            <button 
              key={inst.id} 
              onClick={() => setSelected(inst)}
              className="flex flex-col items-center gap-1.5 group relative px-1 transition-all"
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all transform hover:scale-110 shadow-sm ${
                 isSelected ? 'scale-115 ring-4 ring-primary/10' : ''
              } ${
                 isDone ? (isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-600') :
                 isIncomplete ? (isSelected ? 'bg-destructive border-destructive text-white' : 'bg-destructive/5 border-destructive/10 text-destructive') :
                 (isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-blue-50 border-blue-100 text-blue-500')
              }`}>
                 {isDone ? <Check className="w-5 h-5" /> : 
                  isIncomplete ? <X className="w-5 h-5" /> : 
                  <Clock className="w-5 h-5" />}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-tighter ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                {getTashkentDayjs(inst.dueDate).format("DD MMM")}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-primary" />
                <span className="text-xs font-black text-foreground">{formatUzDate(selected.dueDate)}</span>
             </div>
             <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${
                selected.status === 'done' || selected.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                selected.status === 'incomplete' || selected.status === 'rejected' ? 'bg-destructive/5 text-destructive border-destructive/10' :
                'bg-blue-50 text-blue-600 border-blue-100'
             }`}>
                {formatUzStatus(selected.status)}
             </span>
          </div>

          {(selected.completionDescription || selected.rejectionReason) ? (
            <div className="space-y-3">
              {selected.completionDescription && (
                <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
                  <p className="text-[10px] font-black text-muted-foreground uppercase mb-2">Hodim hisoboti</p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">{selected.completionDescription}</p>
                  <div className="mt-3 flex items-center justify-between">
                    {selected.completionLink && (
                      <a href={selected.completionLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> Havola
                      </a>
                    )}
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {selected.completedAt ? formatUzDateTime(selected.completedAt) : ''}
                    </span>
                  </div>
                </div>
              )}
              {selected.rejectionReason && (
                <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20">
                  <p className="text-[10px] font-black text-destructive uppercase mb-2">Rad etish sababi</p>
                  <p className="text-sm font-medium text-foreground">{selected.rejectionReason}</p>
                  <div className="mt-2 text-right">
                    <span className="text-[10px] font-medium text-destructive/60">
                      {selected.approvedAt ? formatUzDateTime(selected.approvedAt) : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center rounded-2xl border border-dashed border-border/50 text-muted-foreground italic text-xs">
              Ushbu kun uchun ma'lumotlar mavjud emas
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RejectDialog({ open, onOpenChange, reason, setReason, onConfirm }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[32px] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Topshiriqni rad etish</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold px-1 text-destructive">Rad etish sababi (majburiy)</label>
            <Textarea 
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Nima uchun rad etilayotganini tushuntiring..."
              className="rounded-xl border-destructive/50 focus-visible:ring-destructive resize-none"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="pt-6">
          <button 
            onClick={() => onOpenChange(false)}
            className="px-6 py-2.5 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary transition-all"
          >
            Bekor qilish
          </button>
          <button 
            onClick={onConfirm}
            disabled={!reason.trim()}
            className="px-8 py-2.5 rounded-xl bg-destructive text-white font-black shadow-lg hover:shadow-glow transition-all active:scale-95 disabled:opacity-50"
          >
            Rad etish
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
