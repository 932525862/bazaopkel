import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CrmSidebar } from "@/components/CrmSidebar";
import { MobileNav } from "@/components/MobileNav";
import { useSession, useAppState } from "@/lib/store";
import { User, Users, FileText, UserPlus, ClipboardCheck, ListChecks, BarChart3, Layers, Archive, Bell, Globe, Package } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";

export const Route = createFileRoute("/director")({
  component: DirectorLayout,
});

function DirectorLayout() {
  const session = useSession();
  const { state } = useAppState();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (!session || session.role !== "director") {
      navigate({ to: "/login" });
    }
  }, [session, navigate]);

  if (!session || session.role !== "director") return null;

  // Notif: tasks marked done by employees but not yet seen by director
  const taskBadge = (state.tasks ?? []).filter(
    (t) => t.status === "done" && !t.seenByDirector
  ).length;

  const navItems = [
    { to: "/director", label: "Profil", icon: User },
    { to: "/director/employees", label: "Hodimlar", icon: Users },
    { to: "/director/departments", label: "Bo'limlar", icon: Layers },
    { to: "/director/clients", label: "Mijozlar", icon: UserPlus },
    { to: "/director/forms", label: "Formalar", icon: FileText },
    { to: "/director/attendance", label: "Davomat", icon: ClipboardCheck },
    { to: "/director/tours", label: "Turlar", icon: Globe },
    { to: "/director/warehouse", label: "Ombor", icon: Package },
    { to: "/director/tasks", label: "Topshiriqlar", icon: ListChecks, badge: taskBadge },
    { to: "/director/stats", label: "Statistika", icon: BarChart3 },
    { to: "/director/notifications", label: "Bildirishnomalar", icon: Bell, badge: unreadCount },
    { to: "/director/archive", label: "Arxiv", icon: Archive },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <MobileNav title="Direktor kabineti" subtitle="Boshqaruv paneli" items={navItems} />
      <CrmSidebar
        title="Direktor kabineti"
        subtitle="Boshqaruv paneli"
        items={navItems}
      />
      <main className="flex-1 min-w-0 pb-10 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
