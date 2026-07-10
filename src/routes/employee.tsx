import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { CrmSidebar } from "@/components/CrmSidebar";
import { MobileNav } from "@/components/MobileNav";
import { useSession, saveSession, loadSession } from "@/lib/store";
import { Users, Archive, User as UserIcon, ClipboardCheck, ListChecks, Layers, Bell, BarChart3, Package } from "lucide-react";
import { API } from "@/lib/api/client";
import { useNotifications } from "@/hooks/use-notifications";

export const Route = createFileRoute("/employee")({
  component: EmployeeLayout,
});

function EmployeeLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useNotifications();

  const fetchSessionSync = async () => {
    if (!session || session.role !== "employee") return;
    try {
      const user = await API.me();
      const currentSession = loadSession();
      if (!currentSession) return;
      if (
        currentSession.isActive !== user.isActive ||
        currentSession.canAccessDepartments !== user.canAccessDepartments ||
        currentSession.canAccessForms !== user.canAccessForms
      ) {
        saveSession({
          ...currentSession,
          isActive: user.isActive,
          canAccessDepartments: user.canAccessDepartments,
          canAccessForms: user.canAccessForms
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!session || session.role !== "employee") return;
    const unsub = API.initSocket((event: string) => {
      if (event === "userUpdated") fetchSessionSync();
    });
    return unsub;
  }, [session?.id]);

  useEffect(() => {
    if (!session || session.role !== "employee") {
      navigate({ to: "/login" });
      return;
    }
    // Fetch immediately on path change and mount
    fetchSessionSync();
  }, [session?.id, navigate, location.pathname]);

  // Sync user permissions on interval (Real-time update fallback)
  useEffect(() => {
    if (!session || session.role !== "employee") return;
    const interval = setInterval(fetchSessionSync, 5000);
    return () => clearInterval(interval);
  }, [session?.id]);

  if (!session || session.role !== "employee") return null;

  const navItems = [
    { to: "/employee", label: "Mijozlar", icon: Users },
    { to: "/employee/stats", label: "Statistika", icon: BarChart3 },
    { to: "/employee/departments", label: "Bo'limlar", icon: Layers },
    { to: "/employee/forms", label: "Formalar", icon: ClipboardCheck },
    { to: "/employee/tasks", label: "Topshiriqlar", icon: ListChecks },
    { to: "/employee/warehouse", label: "Ombor", icon: Package },
    { to: "/employee/attendance", label: "Davomat", icon: ClipboardCheck },
    { to: "/employee/archive", label: "Arxiv", icon: Archive },
    { to: "/employee/notifications", label: "Bildirishnomalar", icon: Bell, badge: unreadCount },
    { to: "/employee/profile", label: "Profil", icon: UserIcon },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <MobileNav title={session.name} subtitle="Hodim kabineti" items={navItems} />
      <CrmSidebar
        title={session.name}
        subtitle="Hodim kabineti"
        items={navItems}
        footer={
          <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-secondary/30 border border-border/50">
            <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0 shadow-sm">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{session.name}</p>
              <p className="text-[10px] text-muted-foreground font-medium truncate uppercase tracking-widest leading-none mt-1">Onlayn</p>
            </div>
          </div>
        }
      />
      <main className="flex-1 min-w-0 pb-10 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
