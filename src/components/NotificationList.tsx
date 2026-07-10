import {
  Bell,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ClipboardList,
  User,
  Clock,
  Check,
  ChevronRight,
  DollarSign,
  UserCheck,
  BellRing,
  Layers,
  FileText,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTashkentDayjs, formatUzDateTime, tashkentInputToIso } from "@/lib/date-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "@/lib/store";
import { ReminderModal } from "@/components/ReminderModal";
import { API } from "@/lib/api/client";
import { toast } from "sonner";
import { PhoneOff } from "lucide-react";

interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  type: string;
  data?: {
    taskId?: string;
    clientId?: string;
    departmentId?: string;
  };
  createdAt: string | Date;
}

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  unreadCount: number;
  onRefresh: (page: number, limit?: number) => void;
  currentPage: number;
  totalPages: number;
}

const typeConfig: Record<string, { icon: any; color: string; label: string; bg: string; gradient: string }> = {
  task_created: { 
    icon: ClipboardList, 
    color: "text-blue-500", 
    bg: "bg-blue-500/10", 
    label: "Yangi topshiriq",
    gradient: "from-blue-500/10 via-blue-500/5 to-transparent"
  },
  task_status_changed: { 
    icon: Clock, 
    color: "text-amber-500", 
    bg: "bg-amber-500/10", 
    label: "Holat o'zgardi",
    gradient: "from-amber-500/10 via-amber-500/5 to-transparent"
  },
  task_verified: { 
    icon: CheckCircle2, 
    color: "text-emerald-500", 
    bg: "bg-emerald-500/10", 
    label: "Tasdiqlandi",
    gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent"
  },
  task_rejected: { 
    icon: XCircle, 
    color: "text-rose-500", 
    bg: "bg-rose-500/10", 
    label: "Rad etildi",
    gradient: "from-rose-500/10 via-rose-500/5 to-transparent"
  },
  task_incomplete: { 
    icon: AlertCircle, 
    color: "text-orange-500", 
    bg: "bg-orange-500/10", 
    label: "Bajarilmadi",
    gradient: "from-orange-500/10 via-orange-500/5 to-transparent"
  },
  client_reminder: { 
    icon: BellRing, 
    color: "text-indigo-500", 
    bg: "bg-indigo-500/10", 
    label: "Mijoz eslatmasi",
    gradient: "from-indigo-500/10 via-indigo-500/5 to-transparent"
  },
  client_payment: { 
    icon: DollarSign, 
    color: "text-green-500", 
    bg: "bg-green-500/10", 
    label: "To'lov eslatmasi",
    gradient: "from-green-500/10 via-green-500/5 to-transparent"
  },
  attendance_update: { 
    icon: UserCheck, 
    color: "text-purple-500", 
    bg: "bg-purple-500/10", 
    label: "Davomat",
    gradient: "from-purple-500/10 via-purple-500/5 to-transparent"
  },
  department_update: {
    icon: Layers,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    label: "Bo'lim yangilandi",
    gradient: "from-cyan-500/10 via-cyan-500/5 to-transparent"
  },
  client_created: {
    icon: User,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    label: "Yangi mijoz",
    gradient: "from-teal-500/10 via-teal-500/5 to-transparent"
  },
  form_update: { 
    icon: FileText, 
    color: "text-violet-500", 
    bg: "bg-violet-500/10", 
    label: "Yangi ariza",
    gradient: "from-violet-500/10 via-violet-500/5 to-transparent"
  },
  default: { 
    icon: Bell, 
    color: "text-primary", 
    bg: "bg-primary/10", 
    label: "Bildirishnoma",
    gradient: "from-primary/10 via-primary/5 to-transparent"
  },
};

export function NotificationList({
  notifications,
  onMarkRead,
  onMarkAllRead,
  unreadCount,
  onRefresh,
  currentPage,
  totalPages,
}: NotificationListProps) {
  const navigate = useNavigate();
  const session = useSession();
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleItemClick = (n: Notification) => {
    if (!n.isRead) {
      onMarkRead(n.id);
    }

    const role = session?.role || "employee";

    if (n.data?.taskId) {
      navigate({ to: `/${role}/tasks` as any });
    } else if (n.data?.clientId) {
      navigate({ to: (role === "director" ? "/director/clients" : "/employee") as any });
    } else if (n.data?.departmentId) {
      navigate({ to: `/${role}/departments` as any });
    } else if (n.type === "attendance_update") {
      navigate({ to: `/${role}/attendance` as any });
    } else if (n.type === "form_update") {
      navigate({ to: `/${role}/forms` as any });
    }
  };

  /**
   * Helps bold the task title or quoted strings in the message
   */
  const renderMessage = (msg: string) => {
    const parts = msg.split(/("(?:[^"\\]|\\.)*")/g);
    return parts.map((part, i) => {
      if (part.startsWith('"') && part.endsWith('"')) {
        return <span key={i} className="font-extrabold text-foreground underline decoration-primary/20">{part}</span>;
      }
      return part;
    });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-background/50 backdrop-blur-xl max-w-5xl mx-auto p-4 md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-border/40">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/30 ring-4 ring-primary/10 transform -rotate-3 transition-transform hover:rotate-0 duration-300">
                <BellRing className="w-8 h-8 animate-pulse" />
              </div>
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-6 w-6 bg-primary text-[10px] items-center justify-center text-white font-black border-2 border-background">
                    {unreadCount}
                  </span>
                </span>
              )}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">Bildirishnomalar</h1>
              <p className="text-base font-bold text-muted-foreground/60 mt-1">
                {unreadCount > 0
                  ? `Sizda ${unreadCount} ta o'qilmagan xabar bor`
                  : "Barcha bildirishnomalar o'qilgan"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="group relative overflow-hidden flex items-center justify-center gap-2.5 px-8 py-3.5 text-sm font-black text-white bg-primary hover:bg-primary-hover rounded-2xl transition-all shadow-xl shadow-primary/25 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Check className="w-5 h-5 group-hover:scale-125 transition-transform" />
              <span>Barchasini o'qildi deb belgilash</span>
            </button>
          )}
        </div>

        <Card className="flex-1 overflow-hidden border-none shadow-none bg-transparent">
          <ScrollArea className="h-[calc(100vh-220px)] pr-4 -mr-4">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center bg-card/50 rounded-[2rem] border-2 border-dashed border-border/40">
                <div className="w-24 h-24 rounded-full bg-secondary/50 flex items-center justify-center mb-6 animate-pulse">
                  <Bell className="w-12 h-12 text-muted-foreground/20" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Hali hech narsa yo'q</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Tizimdagi yangiliklar va bildirishnomalar shu yerda paydo bo'ladi.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pb-12">
                {notifications.map((n) => {
                  const config = typeConfig[n.type] || typeConfig.default;
                  const Icon = config.icon;

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "group relative flex items-start gap-6 p-6 md:p-8 rounded-[2.5rem] transition-all duration-500 border overflow-hidden",
                        !n.isRead
                          ? "bg-white dark:bg-zinc-900 border-primary/40 shadow-2xl shadow-primary/10 ring-1 ring-primary/5"
                          : "bg-white/40 dark:bg-zinc-900/40 border-border/40 hover:border-primary/20 hover:bg-white dark:hover:bg-zinc-910 shadow-md hover:shadow-xl"
                      )}
                      onClick={() => handleItemClick(n)}
                    >
                      {/* Gradient Ambient Background */}
                      <div className={cn(
                        "absolute top-0 right-0 w-64 h-64 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-3xl -z-10 pointer-events-none translate-x-32 -translate-y-32",
                        config.gradient
                      )} />

                      <div className={cn(
                        "w-14 h-14 md:w-20 md:h-20 rounded-[1.75rem] flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-2xl relative z-10",
                        config.bg, config.color
                      )}>
                        <div className="absolute inset-0 rounded-[1.75rem] border-2 border-white/20 dark:border-white/5" />
                        <Icon className="w-7 h-7 md:w-10 md:h-10 transform group-hover:scale-110 transition-transform duration-500" />
                      </div>
 
                      <div className="flex-1 min-w-0 pt-1 relative z-10">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border border-current/10 shadow-sm transition-colors duration-300",
                              config.bg, config.color
                            )}>
                              {config.label}
                            </span>
                            {!n.isRead && (
                              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-tighter animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                Yangi
                              </span>
                            )}
                          </div>
 
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60 font-black bg-secondary/40 backdrop-blur-sm px-3.5 py-1.5 rounded-xl border border-border/20 transition-all group-hover:bg-background shadow-sm">
                                <Clock className="w-3.5 h-3.5" />
                                {getTashkentDayjs(n.createdAt).fromNow()}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-popover text-popover-foreground border-border font-bold">
                              <p className="text-xs">
                                {formatUzDateTime(n.createdAt)}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
 
                        <div className={cn(
                          "text-base md:text-xl leading-[1.6] tracking-tight mb-5 transition-colors duration-300",
                          !n.isRead ? "font-bold text-foreground" : "font-medium text-muted-foreground/80"
                        )}>
                          {renderMessage(n.message)}
                        </div>
 
                        <div className="flex flex-wrap items-center gap-4">
                          <div className={cn(
                            "group/btn flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-background border border-border/40 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 transition-all hover:bg-primary-soft hover:text-primary hover:border-primary/20",
                            !n.isRead && "border-primary/20"
                          )}>
                            <ExternalLink className="w-4 h-4 transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                            Batafsil ko'rish
                          </div>
                          
                          {n.data?.clientId && (n.type === 'client_reminder' || n.type === 'client_payment') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClientId(n.data!.clientId!);
                                setShowReminderModal(true);
                              }}
                              className="group/remind flex items-center gap-2.5 px-6 py-2.5 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[11px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-lg shadow-amber-500/5 active:scale-95"
                            >
                              <PhoneOff className="w-4 h-4 transform group-hover/remind:scale-125 transition-transform" />
                              Qayta eslatma
                            </button>
                          )}
                        </div>
                      </div>
 
                      <div className="flex flex-col items-center justify-center self-stretch pl-4">
                        {!n.isRead ? (
                          <div className="relative group/check">
                            <div className="w-4 h-4 rounded-full bg-primary animate-pulse shadow-[0_0_20px_rgba(var(--primary-rgb),0.6)]" />
                            <div className="absolute inset-0 rounded-full bg-primary opacity-20 scale-150 animate-ping" />
                          </div>
                        ) : (
                          <ChevronRight className="w-8 h-8 text-muted-foreground/10 group-hover:text-primary/40 transition-all duration-500 transform group-hover:translate-x-2 group-hover:scale-110" />
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {totalPages > 1 && (
                  <div className="pt-8 flex items-center justify-center gap-4">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => onRefresh(currentPage - 1)}
                      className="px-4 py-2 rounded-xl bg-secondary text-foreground font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80 transition-all active:scale-95 border border-border/40"
                    >
                      Oldingi
                    </button>
                    <div className="text-sm font-bold text-muted-foreground bg-secondary/50 px-4 py-2 rounded-xl border border-border/20">
                      {currentPage} / {totalPages}
                    </div>
                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => onRefresh(currentPage + 1)}
                      className="px-4 py-2 rounded-xl bg-secondary text-foreground font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80 transition-all active:scale-95 border border-border/40"
                    >
                      Keyingi
                    </button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {showReminderModal && (
        <ReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedClientId(null);
          }}
          onConfirm={async (time) => {
            if (!selectedClientId) return;
            setLoading(true);
            try {
              await API.addNote(selectedClientId, "Qayta eslatma (ogohlantirish) yuborildi");
              await API.warnClient(selectedClientId, tashkentInputToIso(time));
              toast.success("Ogohlantirish yuborildi");
              setShowReminderModal(false);
              setSelectedClientId(null);
              // Mark notification as read if not already
              const n = notifications.find(notif => notif.data?.clientId === selectedClientId);
              if (n && !n.isRead) {
                onMarkRead(n.id);
              }
            } catch (err: any) {
              toast.error(err.message || "Xatolik yuz berdi");
            } finally {
              setLoading(false);
            }
          }}
          loading={loading}
        />
      )}
    </TooltipProvider>
  );
}
