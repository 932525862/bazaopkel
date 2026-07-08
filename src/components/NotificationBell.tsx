import { Bell, Check, Clock, ExternalLink, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useNotifications } from "@/hooks/use-notifications";
import { useSession } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getTashkentDayjs } from "@/lib/date-utils";

export function NotificationBell() {
  const session = useSession();
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const role = session?.role === "director" ? "director" : "employee";
  const to = `/${role}/notifications` as any;

  const recentNotifications = notifications.slice(0, 5);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-xl transition-all active:scale-95 group",
          isOpen ? "bg-secondary" : "hover:bg-secondary"
        )}
      >
        <Bell className={cn(
          "w-5 h-5 transition-colors",
          isOpen ? "text-primary" : "text-muted-foreground group-hover:text-primary"
        )} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-in zoom-in duration-300">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[320px] md:w-[380px] bg-card border border-border rounded-[1.5rem] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-border/60 bg-secondary/20 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Bildirishnomalar</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-2 py-0.5 rounded-md">
              {unreadCount} yangi
            </span>
          </div>

          <div className="max-h-[350px] overflow-y-auto overflow-x-hidden p-2 space-y-1">
            {recentNotifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Hali bildirishnomalar yo'q</p>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) markRead(n.id);
                    setIsOpen(false);
                    if (n.data?.taskId) navigate({ to: `/${role}/tasks` as any });
                    else if (n.data?.clientId) navigate({ to: (role === "director" ? "/director/clients" : "/employee") as any });
                    else navigate({ to });
                  }}
                  className={cn(
                    "flex gap-3 p-3 rounded-2xl transition-all cursor-pointer group/item relative",
                    !n.isRead ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/60"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-transform group-hover/item:scale-105",
                    !n.isRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className={cn(
                      "text-xs leading-tight mb-1 line-clamp-2",
                      !n.isRead ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                    )}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/60">
                      <Clock className="w-2.5 h-2.5" />
                      {getTashkentDayjs(n.createdAt).fromNow()}
                    </div>
                  </div>
                  {!n.isRead && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-2 bg-secondary/10 border-t border-border/60">
            <Link
              to={to}
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-black text-primary hover:bg-primary/10 transition-colors"
            >
              Barchasini ko'rish
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
