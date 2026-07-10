import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Briefcase, User, LayoutDashboard } from "lucide-react";
import { saveSession, clearSensitiveState } from "@/lib/store";
import { setToken, disconnectSocket } from "@/lib/api/client";
import { toast } from "sonner";
interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface SidebarProps {
  title: string;
  subtitle?: string;
  items: NavItem[];
  footer?: React.ReactNode;
}

export function CrmSidebar({ title, subtitle, items, footer }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    setToken(null);
    saveSession(null);
    clearSensitiveState();
    disconnectSocket();
    toast.success("Tizimdan chiqdingiz");
    navigate({ to: "/login" });
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--gradient-primary)] flex items-center justify-center text-primary-foreground shadow-[var(--shadow-md)]">
            <User className="w-5 h-5 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-sm truncate">{title}</p>
            {subtitle && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: false }}
              activeProps={{
                className: "bg-primary-soft text-primary",
              }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-secondary hover:text-foreground",
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {footer && <div className="p-3 border-t border-border">{footer}</div>}

      <div className="p-3 border-t border-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Chiqish
        </button>
      </div>
    </aside>
  );
}
