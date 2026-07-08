import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Archive, RefreshCw, Search, CheckSquare, Users, FileText, CalendarCheck, User, Clock, ExternalLink, X, ListChecks, CheckCheck, Calendar, Layers } from "lucide-react";
import { API } from "@/lib/api/client";
import { formatUzStatus, formatUzDateTime, formatUzDate, getTashkentDayjs } from "@/lib/date-utils";
import { toast } from "sonner";
import dayjs from "dayjs";
import "dayjs/locale/uz-latn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/director/archive")({
  component: DirectorArchive,
});

interface ActivityLog {
  id: string;
  actionType: string;
  details?: any;
  user?: { id?: string; firstName: string; lastName: string };
  createdAt: string;
}

const CATEGORIES = [
  { label: "Barchasi", value: "ALL", icon: Archive },
  { label: "Vazifalar", value: "TASK", icon: CheckSquare },
  { label: "Mijozlar", value: "CLIENT", icon: Users },
  { label: "Formalar", value: "FORM", icon: FileText },
  { label: "Davomat", value: "ATTENDANCE", icon: CalendarCheck },
];

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: "Yangi vazifa yaratildi",
  TASK_STATUS_CHANGED: "Vazifa holati o'zgardi",
  TASK_VERIFIED: "Vazifa tasdiqlandi",
  TASK_REJECTED: "Vazifa rad etildi",
  TASK_INCOMPLETE: "Vazifa yakunlanmadi",
  TASK_DAILY_INSTANCE_CREATED: "Kunlik vazifa nusxasi yaratildi",
  PROFILE_UPDATED: "Profil ma'lumotlari yangilandi",
  CLIENT_CREATED: "Yangi mijoz qo'shildi",
  CLIENT_UPDATED: "Mijoz ma'lumotlari tahrirlandi",
  CLIENT_DELETED: "Mijoz tizimdan o'chirildi",
  CLIENT_NOTE_ADDED: "Mijozga izoh qo'shildi",
  CLIENT_PAYMENT_ADDED: "To'lov qabul qilindi",
  CLIENT_PAYMENT_DELETED: "To'lov o'chirildi",
  CLIENT_SALE_UPDATED: "Sotuv shartlari o'zgartirildi",
  FORM_CREATED: "Yangi forma yaratildi",
  FORM_UPDATED: "Forma tahrirlandi",
  DEPARTMENT_CREATED: "Yangi bo'lim qo'shildi",
  DEPARTMENT_UPDATED: "Bo'lim nomi o'zgartirildi",
  ATTENDANCE_CHECK_IN: "Ishga kelganligi qayd etildi",
  ATTENDANCE_CHECK_OUT: "Ishdan ketganligi qayd etildi",
};

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  TASK: { bg: "bg-primary/10", text: "text-primary", icon: CheckSquare },
  CLIENT: { bg: "bg-emerald-500/10", text: "text-emerald-500", icon: Users },
  FORM: { bg: "bg-violet-500/10", text: "text-violet-500", icon: FileText },
  ATTENDANCE: { bg: "bg-amber-500/10", text: "text-amber-500", icon: CalendarCheck },
  SYSTEM: { bg: "bg-blue-500/10", text: "text-blue-500", icon: Layers },
  DEFAULT: { bg: "bg-secondary", text: "text-muted-foreground", icon: Clock },
};

function getCategory(actionType: string) {
  if (actionType.startsWith("TASK")) return "TASK";
  if (actionType.startsWith("CLIENT")) return "CLIENT";
  if (actionType.startsWith("FORM")) return "FORM";
  if (actionType.startsWith("ATTENDANCE")) return "ATTENDANCE";
  if (actionType.startsWith("DEPARTMENT") || actionType.startsWith("PROFILE")) return "SYSTEM";
  return "DEFAULT";
}

function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "todo":
    case "new":
      return "bg-secondary text-secondary-foreground border-border";
    case "in_progress":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "done":
    case "approved":
    case "sold":
      return "bg-success/15 text-success border-success/20";
    case "rejected":
      return "bg-destructive/15 text-destructive border-destructive/20";
    case "incomplete":
      return "bg-destructive/10 text-destructive grayscale opacity-70";
    case "no_answer":
      return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    case "talked":
      return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadge(status: string) {
  switch (status?.toLowerCase()) {
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

function DirectorArchive() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [selectedEmployee, setSelectedEmployee] = useState("ALL");
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskDetail, setTaskDetail] = useState<any | null>(null);
  const [loadingTask, setLoadingTask] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await API.directorArchive();
      setLogs(data);
    } catch {
      toast.error("Arxiv ma'lumotlarini yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  // Extract unique employees from logs  
  const employees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const log of logs) {
      if (log.user?.id) {
        map.set(log.user.id, {
          id: log.user.id,
          name: `${log.user.firstName} ${log.user.lastName}`.trim(),
        });
      }
    }
    return Array.from(map.values());
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchesCategory = category === "ALL" || getCategory(l.actionType) === category;
      const matchesEmployee = selectedEmployee === "ALL" || l.user?.id === selectedEmployee;
      const matchesSearch =
        !search ||
        ACTION_LABELS[l.actionType]?.toLowerCase().includes(search.toLowerCase()) ||
        l.details?.title?.toLowerCase().includes(search.toLowerCase()) ||
        l.details?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        `${l.user?.firstName} ${l.user?.lastName}`.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesEmployee && matchesSearch;
    });
  }, [logs, category, selectedEmployee, search]);


  const openTaskDetail = async (log: ActivityLog) => {
    const taskId = log.details?.taskId || log.details?.id;
    if (!taskId) return;
    setLoadingTask(true);
    setSelectedTask({ id: taskId });
    try {
      const data = await API.taskDetail(taskId);
      const template = data.template || data;
      setTaskDetail({
        id: data.id,
        title: template.title || "Nomsiz",
        description: template.description || "",
        notifyAt: template.notifyAt || "—",
        startDate: template.startDate || "",
        endDate: template.endDate || "",
        status: (data.status || "TODO").toLowerCase(),
        templateId: data.templateId,
        completionDescription: data.completionDescription,
        completionLink: data.completionLink,
        completedAt: data.completedAt,
        rejectionReason: data.rejectionReason,
        approvedAt: data.approvedAt,
      });
    } catch {
      toast.error("Vazifa ma'lumotlarini yuklashda xatolik");
      setSelectedTask(null);
    } finally {
      setLoadingTask(false);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex items-start justify-between flex-wrap gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
            <Archive className="w-10 h-10 text-primary" /> Arxiv
          </h1>
          <p className="text-muted-foreground mt-1.5 font-medium">
            Tizimdagi barcha harakatlar tarixi
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Employee Filter */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="pl-9 pr-8 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer hover:border-primary/40 transition-colors min-w-[160px]"
            >
              <option value="ALL">Barcha xodimlar</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
            />
          </div>
          <button
            onClick={fetchLogs}
            className="p-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {CATEGORIES.map(({ label, value, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setCategory(value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              category === value
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-secondary/40 animate-pulse border border-border/50" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[40px] p-24 text-center">
          <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center mx-auto mb-6 text-muted-foreground/30">
            <Archive className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Harakatlar topilmadi</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Arxivda hozircha hech qanday ma'lumot yo'q.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const cat = getCategory(log.actionType);
            const style = ACTION_COLORS[cat] ?? ACTION_COLORS.DEFAULT;
            const IconComponent = style.icon;
            return (
              <div
                key={log.id}
                onClick={() => cat === "TASK" && openTaskDetail(log)}
                className={`group bg-card border border-border/50 rounded-2xl p-4 transition-all flex items-center gap-4 ${cat === "TASK" ? "hover:border-primary/30 hover:shadow-sm cursor-pointer active:scale-[0.99]" : "cursor-default"}`}
              >
                <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center ${style.text} shrink-0`}>
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-foreground">
                      {ACTION_LABELS[log.actionType] ?? log.actionType.replace(/_/g, " ")}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                      {CATEGORIES.find(c => c.value === cat)?.label ?? cat}
                    </span>
                  </div>

                  {log.details?.title && (
                    <p className="text-sm font-medium text-foreground/80 mb-1">
                      <span className="text-muted-foreground font-normal">Sarlavha:</span> "{log.details.title}"
                    </p>
                  )}
                  {log.details?.fullName && (
                    <p className="text-sm font-medium text-foreground/80 mb-1">
                      <span className="text-muted-foreground font-normal">Mijoz:</span> {log.details.fullName}
                    </p>
                  )}
                  {log.details?.amount !== undefined && (
                    <p className="text-sm text-emerald-600 font-bold mb-1">
                      <span className="text-muted-foreground font-normal">Summa:</span> +{log.details.amount.toLocaleString()} so'm
                    </p>
                  )}
                  {log.details?.text && (
                    <p className="text-sm italic text-foreground/70 mb-1 border-l-2 border-border pl-2">
                       "{log.details.text.length > 60 ? log.details.text.slice(0, 60) + "..." : log.details.text}"
                    </p>
                  )}


                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {log.details?.oldStage && (
                      <>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusColor(log.details.oldStage)}`}>
                           {formatUzStatus(log.details.oldStage)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">→</span>
                      </>
                    )}
                    {log.details?.newStage && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusColor(log.details.newStage)}`}>
                         {formatUzStatus(log.details.newStage)}
                      </span>
                    )}

                    {log.details?.oldStatus && (
                      <>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusColor(log.details.oldStatus)}`}>
                          {formatUzStatus(log.details.oldStatus)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">→</span>
                      </>
                    )}
                    {log.details?.newStatus && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusColor(log.details.newStatus)}`}>
                        {formatUzStatus(log.details.newStatus)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  {log.user && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <User className="w-3 h-3 text-muted-foreground" />
                      {log.user.firstName} {log.user.lastName}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {formatUzDateTime(log.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDetailModal 
        open={!!selectedTask} 
        onOpenChange={(o: boolean) => !o && (setSelectedTask(null), setTaskDetail(null))}
        task={taskDetail}
        loading={loadingTask}
      />
    </div>
  );
}
function TaskDetailModal({ task, open, onOpenChange, loading }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[40px] border-border bg-card p-0 overflow-hidden max-h-[85vh] overflow-y-auto">
        {loading || !task ? (
          <div className="p-12 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-8 border-b border-border bg-secondary/10 relative">
              <DialogHeader className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
                     <ListChecks className="w-6 h-6" />
                  </div>
                  {statusBadge(task.status)}
                </div>
                <DialogTitle className="text-2xl font-black text-foreground">{task.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Topshiriq tavsifi</h4>
                  <div className="p-5 rounded-2xl bg-background/50 border border-border font-medium text-foreground whitespace-pre-wrap leading-relaxed shadow-inner">
                    {task.description || "Ushbu topshiriq uchun qo'shimcha tavsif berilmagan."}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-border/50">
                  <div className="flex items-center gap-3">
                     <Calendar className="w-5 h-5 text-primary" />
                     <div>
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Muddat</p>
                        <p className="text-xs font-bold text-foreground">
                          {formatUzDate(task.startDate)} — {formatUzDate(task.endDate)}
                        </p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <Clock className="w-5 h-5 text-primary" />
                     <div>
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Eslatma</p>
                       <p className="text-xs font-bold text-foreground">{task.notifyAt}</p>
                     </div>
                  </div>
              </div>

              <div className="mt-8 p-6 rounded-[32px] border border-border/50 bg-secondary/5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-5 px-2">Kunlik bajarilish tarixi</p>
                <TaskHistory templateId={task.templateId} currentInstanceId={task.id} />
              </div>
            </div>

            <div className="p-8 flex gap-4 justify-end">
              <button
                onClick={() => onOpenChange(false)}
                className="px-8 py-4 rounded-2xl border border-border font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
              >
                Yopish
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
                       <FileText className="w-3.5 h-3.5" /> Hodim hisoboti
                    </p>
                    <p className="text-sm font-medium text-foreground leading-relaxed italic">"{selected.completionDescription}"</p>
                    {selected.completionLink && (
                       <a href={selected.completionLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mt-4">
                         <ExternalLink className="w-3.5 h-3.5" /> Havola
                       </a>
                    )}
                    {selected.completedAt && (
                      <div className="mt-3 text-right">
                        <span className="text-[10px] font-medium text-muted-foreground">{formatUzDateTime(selected.completedAt)}</span>
                      </div>
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
                )}
             </div>
           ) : (
             <p className="text-xs text-muted-foreground text-center py-4 italic">Ma'lumot topilmadi</p>
           )}
        </div>
      )}
    </div>
  );
}
