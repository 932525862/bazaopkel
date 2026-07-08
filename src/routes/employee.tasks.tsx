import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useSession } from "@/lib/store";
import { Clock, CheckCheck, ListChecks, X, Calendar, AlertCircle, Play, Send, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { playNotificationSound, showBrowserNotification } from "@/lib/notify";
import { API } from "@/lib/api/client";
import { formatUzDate, formatUzStatus, getTashkentDayjs, formatUzDateTime } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Task, TaskStatus } from "@/lib/types";

export const Route = createFileRoute("/employee/tasks")({
  component: EmployeeTasks,
});

function statusBadge(status: TaskStatus) {
  switch (status) {
    case "todo":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-secondary text-muted-foreground border border-border">Yangi</span>;
    case "in_progress":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 border border-amber-500/20">Jarayonda</span>;
    case "pending":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 border border-blue-500/20">Tekshiruvda</span>;
    case "done":
    case "approved":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-success/15 text-success border border-success/20">Bajarildi</span>;
    case "rejected":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-destructive/15 text-destructive border border-destructive/20">Rad etildi</span>;
    case "incomplete":
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-destructive/10 text-destructive grayscale opacity-70">Bajarilmadi</span>;
    default:
      return <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-muted text-muted-foreground border border-border">{status}</span>;
  }
}

const tabs: { id: "active" | "done"; label: string }[] = [
  { id: "active", label: "Faol topshiriqlar" },
  { id: "done", label: "Bajarilganlar" },
];

function EmployeeTasks() {
  const session = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "done">("active");
  const [view, setView] = useState<Task | null>(null);
  const [finishing, setFinishing] = useState<Task | null>(null);
  const [cDesc, setCDesc] = useState("");
  const [cLink, setCLink] = useState("");

  const fetchTasks = async () => {
    try {
      const data = await API.tasks("employee");
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
      console.log("WS Event in EmployeeTasks:", event, data);
      if (event === "taskCreated" || event === "taskStatusChanged" || event === "taskVerified" || event === "taskIncomplete" || event === "taskRejected") {
        fetchTasks();

        const newStatus = data?.newStatus?.toUpperCase() || (event === "taskVerified" ? "APPROVED" : event === "taskIncomplete" ? "INCOMPLETE" : "");

        if (event === "taskCreated") {
          playNotificationSound();
          toast.info("Sizga yangi topshiriq biriktirildi");
          showBrowserNotification("Yangi topshiriq", { body: "Sizga direktor tomonidan yangi topshiriq biriktirildi." });
        } else if (event === "taskVerified" || newStatus === "APPROVED" || newStatus === "DONE") {
          playNotificationSound();
          toast.success("Topshiriq tasdiqlandi!");
          showBrowserNotification("Tasdiqlandi", { body: "Topshiriq direktor tomonidan muvaffaqiyatli tasdiqlandi!" });
        } else if ((event === "taskStatusChanged" && newStatus === "REJECTED") || event === "taskRejected") {
          playNotificationSound();
          toast.error("Topshiriq rad etildi");
          showBrowserNotification("Topshiriq rad etildi", { body: "Siz bajargan ish direktor tomonidan rad etildi." });
        } else if (event === "taskIncomplete" || newStatus === "INCOMPLETE") {
          playNotificationSound();
          toast.warning("Topshiriq bajarilmadi");
          showBrowserNotification("Bajarilmadi", { body: "Topshiriqning muddati o'tdi va bajarilmagan deb belgilandi." });
        }
      }
    });

    return () => {
      unsub?.();
    };
  }, []);

  const list = useMemo(
    () =>
      tab === "done"
        ? tasks.filter((t) => t.status === "done").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        : tasks.filter((t) => t.status !== "done" && t.status !== "incomplete").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [tasks, tab]
  );

  const start = async (t: Task) => {
    try {
      await API.updateTask(t.id, { status: "in_progress" });
      toast.success("Topshiriq boshlandi");
      fetchTasks();
      setView({ ...t, status: "in_progress" });
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const finish = async () => {
    if (!finishing) return;
    try {
      await API.updateTask(finishing.id, { 
        status: "pending",
        completionDescription: cDesc.trim(),
        completionLink: cLink.trim()
      });
      toast.success("Direktorga tasdiqlash uchun yuborildi");
      fetchTasks();
      setFinishing(null);
      setView(null);
      setCDesc("");
      setCLink("");
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-10 text-balance">
        <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
           <ListChecks className="w-10 h-10 text-primary" /> Topshiriqlar
        </h1>
        <p className="text-muted-foreground mt-1.5 font-medium">Sizga biriktirilgan vazifalar va ularning ijrosi</p>
        {session?.isActive === false && (
           <div className="mt-4 p-4 rounded-2xl bg-destructive/5 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              Sizning hisobingiz vaqtincha faolsizlantirilgan. Iltimos, direktor bilan bog'laning.
           </div>
        )}
      </header>

      <div className="flex gap-2 mb-8 p-1.5 bg-secondary/50 rounded-[22px] w-fit border border-border/40">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-2.5 rounded-[16px] text-sm font-black uppercase tracking-widest transition-all ${
              tab === t.id 
                ? "bg-card text-foreground shadow-sm scale-[1.02]" 
                : "text-muted-foreground hover:text-foreground hover:bg-card/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-card/50 animate-pulse rounded-[28px] border border-border/50" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[40px] p-24 text-center">
           <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-6 text-muted-foreground/30">
             <AlertCircle className="w-12 h-12" />
           </div>
           <h3 className="text-xl font-bold text-foreground mb-2">Topshiriqlar yo'q</h3>
           <p className="text-muted-foreground max-w-sm mx-auto">Sizda hozircha ushbu bo'limda hech qanday topshiriq mavjud emas.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t)}
              className="text-left bg-card rounded-[28px] border border-border p-6 hover:shadow-glow hover:border-primary/30 transition-all group relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125" />
              
              <div className="flex items-center gap-5 relative z-10">
                <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${t.status === 'approved' ? 'bg-success/10 text-success' : 'bg-primary-soft text-primary'}`}>
                  <ListChecks className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors truncate">{t.title}</h3>
                  <p className="text-sm font-medium text-muted-foreground mt-0.5 line-clamp-1">{t.description || "Tavsifsiz"}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-6 shrink-0 relative z-10 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right flex flex-col items-end">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Status</p>
                   {statusBadge(t.status)}
                </div>
                <div className="text-right flex flex-col items-end border-l border-border pl-6 hidden sm:flex">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Sana</p>
                   <p className="text-xs font-bold text-foreground">{formatUzDate(t.createdAt, { includeYear: true })}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-xl rounded-[40px] border-border bg-card p-0 overflow-hidden max-h-[85vh] overflow-y-auto">
          {view && (
            <div className="flex flex-col">
              <div className="p-8 border-b border-border bg-secondary/10 relative">
                <DialogHeader className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
                       <ListChecks className="w-6 h-6" />
                    </div>
                    {statusBadge(view.status)}
                  </div>
                  <DialogTitle className="text-2xl font-black text-foreground">{view.title}</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Topshiriq tavsifi</h4>
                    <div className="p-5 rounded-2xl bg-background/50 border border-border font-medium text-foreground whitespace-pre-wrap leading-relaxed shadow-inner">
                      {view.description || "Ushbu topshiriq uchun qo'shimcha tavsif berilmagan."}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-border/50">
                    <div className="flex items-center gap-3">
                       <Calendar className="w-5 h-5 text-primary" />
                       <div>
                         <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Muddat</p>
                          <p className="text-xs font-bold text-foreground">
                            {formatUzDate(view.startDate)} — {formatUzDate(view.endDate)}
                          </p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <Clock className="w-5 h-5 text-primary" />
                       <div>
                         <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Eslatma</p>
                         <p className="text-xs font-bold text-foreground">{view.notifyAt}</p>
                       </div>
                    </div>
                </div>

                <div className="mt-8 p-6 rounded-[32px] border border-border/50 bg-secondary/5">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-5 px-2">Kunlik bajarilish tarixi</p>
                  <TaskHistory templateId={view.templateId} currentInstanceId={view.id} />
                </div>
              </div>

              <div className="p-8 flex gap-4">
                <>
                  {(view.status === "todo" || view.status === "rejected") && (
                    <button
                      onClick={() => start(view)}
                      className="flex-1 inline-flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-amber-500 text-white font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Play className="w-5 h-5" /> Boshlash
                    </button>
                  )}
                  {view.status === "in_progress" && (
                    <button
                      onClick={() => setFinishing(view)}
                      className="flex-1 inline-flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Send className="w-5 h-5" /> Tugatish
                    </button>
                  )}
                </>
                <button
                  onClick={() => setView(null)}
                  className="px-8 py-4 rounded-2xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Yopish
                </button>
              </div>

              <FinishDialog 
                task={finishing}
                open={!!finishing}
                onOpenChange={(o: boolean) => !o && setFinishing(null)}
                onConfirm={finish}
                cDesc={cDesc}
                setCDesc={setCDesc}
                cLink={cLink}
                setCLink={setCLink}
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

  if (loading) return <div className="h-10 bg-secondary/30 animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2.5">
        {instances.map((inst) => {
          const s = (inst.status || "TODO").toUpperCase();
          const isDone = s === "DONE" || s === "APPROVED";
          const isIncomplete = s === "INCOMPLETE" || s === "REJECTED";
          const isSelected = selected?.id === inst.id;
          
          return (
            <button 
              key={inst.id} 
              onClick={() => setSelected(inst)}
              className="flex flex-col items-center gap-2 group relative transition-all"
            >
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border-2 transition-all transform hover:scale-110 shadow-sm ${
                 isSelected ? 'scale-110 ring-4 ring-primary/20' : ''
              } ${
                 isDone ? (isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-600') :
                 isIncomplete ? (isSelected ? 'bg-destructive border-destructive text-white' : 'bg-destructive/5 border-destructive/10 text-destructive') :
                 (isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-blue-50 border-blue-100 text-blue-500')
              }`}>
                 {isDone ? <CheckCheck className="w-6 h-6" /> : 
                  isIncomplete ? <X className="w-6 h-6" /> : 
                  <Clock className="w-6 h-6" />}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-tight ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                {getTashkentDayjs(inst.dueDate).format("DD MMM")}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                 <Calendar className="w-4 h-4 text-primary" />
                 <span className="text-sm font-black text-foreground">{formatUzDate(selected.dueDate)}</span>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                selected.status === 'done' || selected.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                selected.status === 'incomplete' || selected.status === 'rejected' ? 'bg-destructive/5 text-destructive border-destructive/10' :
                'bg-blue-50 text-blue-600 border-blue-100'
             }`}>
                {formatUzStatus(selected.status)}
             </span>
           </div>

           {(selected.completionDescription || selected.rejectionReason) ? (
             <div className="space-y-4">
                {selected.completionDescription && (
                  <div className="p-5 rounded-3xl bg-secondary/10 border border-border/50">
                    <p className="text-[10px] font-black text-muted-foreground uppercase mb-2.5 flex items-center gap-2">
                       <FileText className="w-3.5 h-3.5" /> Hisobot
                    </p>
                    <p className="text-sm font-medium text-foreground leading-relaxed italic">"{selected.completionDescription}"</p>
                    {selected.completionLink && (
                       <a href={selected.completionLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mt-4">
                         <ExternalLink className="w-3.5 h-3.5" /> Havola
                       </a>
                    )}
                  </div>
                )}
                {selected.rejectionReason && (
                   <div className="p-5 rounded-3xl bg-destructive/5 border border-destructive/20">
                      <p className="text-[10px] font-black text-destructive uppercase mb-2.5 flex items-center gap-2">
                         <X className="w-4 h-4 text-destructive" /> Rad etish sababi
                      </p>
                      <p className="text-sm font-bold text-foreground">{selected.rejectionReason}</p>
                   </div>
                ) }
             </div>
           ) : (
             <p className="text-xs text-muted-foreground text-center py-4 italic">Ma'lumot topilmadi</p>
           )}
        </div>
      )}
    </div>
  );
}

function FinishDialog({
  task,
  open,
  onOpenChange,
  onConfirm,
  cDesc,
  setCDesc,
  cLink,
  setCLink
}: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[32px] max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Topshiriqni tugatish</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold px-1">Qisqacha hisobot (ixtiyoriy)</label>
            <Textarea 
              value={cDesc}
              onChange={e => setCDesc(e.target.value)}
              placeholder="Nimalar qilingani haqida..."
              className="rounded-xl resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold px-1">Havola (ixtiyoriy)</label>
            <Input 
              value={cLink}
              onChange={e => setCLink(e.target.value)}
              placeholder="https://..."
              className="rounded-xl"
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
            className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:shadow-glow transition-all active:scale-95"
          >
            Tugatish
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
