import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User, Phone, LogOut } from "lucide-react";
import { useSession, saveSession } from "@/lib/store";
import { setToken } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/profile")({
  head: () => ({ meta: [{ title: "Profil" }] }),
  component: EmployeeProfilePage,
});

function EmployeeProfilePage() {
  const session = useSession();
  const navigate = useNavigate();

  const handleLogout = () => {
    setToken(null);
    saveSession(null);
    toast.success("Tizimdan chiqdingiz");
    navigate({ to: "/login" });
  };

  if (!session) return null;

  return (
    <div className="p-6 md:p-10">
      <header className="mb-10">
        <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3 text-balance">
          Profilingiz
        </h1>
        <p className="text-muted-foreground mt-1.5 font-medium">Shaxsiy ma'lumotlaringiz</p>
      </header>

      <div className="max-w-2xl bg-card border border-border rounded-[28px] overflow-hidden shadow-lg relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -mr-24 -mt-24 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full -ml-16 -mb-16 pointer-events-none" />

        <div className="p-8 md:p-10 relative z-10 flex flex-col md:flex-row items-center gap-8 border-b border-border/50">
          <div className="w-24 h-24 rounded-[32px] bg-primary/10 flex items-center justify-center shrink-0 shadow-inner">
            <User className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-black text-foreground">{session.name}</h2>
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-secondary rounded-full">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Lavozimi:</span>
              <span className="text-sm font-black text-foreground capitalize">{session.role}</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-10 relative z-10">
          <div className="grid gap-6">
            <div className="bg-secondary/40 rounded-2xl p-5 border border-border/50 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm shrink-0">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">To'liq ism</p>
                <p className="text-lg font-bold text-foreground">{session.name}</p>
              </div>
            </div>

            <div className="bg-secondary/40 rounded-2xl p-5 border border-border/50 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm shrink-0">
                <Phone className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Telefon raqam / Login</p>
                <p className="text-lg font-bold text-foreground">{session.login}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center bg-secondary/20 p-4 rounded-xl border border-dashed border-border/70">
            <p className="text-sm text-muted-foreground/80 font-medium font-mono">
              Sizning ma'lumotlaringiz faqat o'qish uchun ochiq. O'zgartirish kerak bo'lsa, direktoringizga murojaat qiling.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-8 flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-destructive text-destructive-foreground font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <LogOut className="w-5 h-5" /> Tizimdan chiqish
          </button>
        </div>
      </div>
    </div>
  );
}
