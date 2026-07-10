import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X, LogOut, Briefcase, User, LayoutDashboard } from "lucide-react";
import { Drawer } from "vaul";
import { saveSession } from "@/lib/store";
import { setToken, disconnectSocket } from "@/lib/api/client";
import { toast } from "sonner";
interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface MobileNavProps {
  title: string;
  subtitle?: string;
  items: NavItem[];
}

export function MobileNav({ title, subtitle, items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    setToken(null);
    saveSession(null);
    disconnectSocket();
    toast.success("Tizimdan chiqdingiz");
    navigate({ to: "/login" });
    setOpen(false);
  };

  return (
    <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--gradient-primary)] flex items-center justify-center text-primary-foreground shadow-sm">
          <User className="w-4 h-4 text-blue-500" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{title}</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger asChild>
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <Menu className="w-6 h-6" />
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
            <Drawer.Content className="bg-card flex flex-col rounded-t-[10px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-50">
              <div className="p-4 bg-card rounded-t-[10px] flex-1">
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 appearance-none rounded-full bg-border mb-8" />

                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold">{title}</h2>
                    {subtitle && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                      </div>
                    )}
                  </div>
                  <Drawer.Close asChild>
                    <button className="p-2 rounded-lg hover:bg-secondary">
                      <X className="w-5 h-5" />
                    </button>
                  </Drawer.Close>
                </div>

                <nav className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        activeProps={{
                          className: "bg-primary-soft text-primary",
                        }}
                        inactiveProps={{
                          className: "text-muted-foreground hover:bg-secondary",
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium transition-colors"
                      >
                        <Icon className="w-5 h-5" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && item.badge > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-auto py-8">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-4 rounded-xl text-lg font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Chiqish
                  </button>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </div>
  );
}
